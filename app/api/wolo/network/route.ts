import { readFile } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";

import {
  WOLO_ADDRESS_PREFIX,
  WOLO_BASE_DENOM,
  WOLO_COIN_DECIMALS,
  WOLO_DISPLAY_DENOM,
  WOLO_MAINNET_CHAIN_ID,
} from "@/lib/woloChain";
import {
  WOLO_MAINNET_NETWORK_ACCOUNTS,
  isWoloNetworkModuleAccount,
  isWoloNetworkRetiredAccount,
  isWoloNetworkUserFacingAccount,
  type WoloMainnetNetworkAccount,
} from "@/lib/woloMainnetNetworkAccounts";
import { fetchWoloSupplyAmount } from "@/lib/woloRuntime";
import { loadMainnetStakingPositions } from "@/lib/mainnetStakingPositions";
import { getPrisma } from "@/lib/prisma";
import { WOLO_MAINNET_WALLET_ALIAS_BY_ADDRESS } from "@/lib/woloMainnetWallets";
import { isValidBech32AccountAddress } from "@/lib/woloBalanceRead";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};


const MAX_NETWORK_ADDRESSES = 5_000;
const DENOM_OWNER_PAGE_SIZE = 500;
const MAX_DENOM_OWNER_PAGES =
  Math.ceil(MAX_NETWORK_ADDRESSES / DENOM_OWNER_PAGE_SIZE) + 1;

const WOLO_REST_REQUEST_TIMEOUT_MS = 5_000;
const WOLO_REST_TOTAL_TIMEOUT_MS = 15_000;
const MAX_WOLO_REST_RESPONSE_BYTES = 2 * 1024 * 1024;

const MAX_WALLET_ALIAS_FILE_BYTES = 256 * 1024;
const MAX_PUBLIC_ALIAS_LENGTH = 96;

/*
 * Operational USE semantics preserved from the historical public
 * Wolo network ledger. Newer addresses fall back to their canonical
 * registry use rather than receiving invented semantics.
 */
const LEGACY_USE_BY_ADDRESS: Record<string, string> = {
  "wolo1r8kvt7me33rsv9ldaczj03xjrld4yumx0c0jkg":
    "NEVER_USER_FACING",

  "wolo1hlfvzuv4dc46ngvh3zlteuegx0xga20hj20zd2":
    "TREASURY_PUBLIC_BUT_DO_NOT_USE_FOR_RANDOM_USERS",

  "wolo1kwsmr9nzujwul6wmu4hqr90lel4ca4uy3l06en":
    "RESERVE_NOT_USER_FACING",

  "wolo12c009ektp58rr0gkjz3nk8f4kgvfpfzwfk86l3":
    "RESERVE_NOT_USER_FACING",

  "wolo1xamdfayrjy8eauyy65uuvkepuvvcdtqlq6q39k":
    "PLAYER_DO_NOT_SHOW_BALANCE",

  "wolo1nalsh7y0hzp33j996c90yxqgerxxvgpqtumfjt":
    "OPS_NOT_USER_FACING",

  "wolo1wue7vyque2pssskgdrww0fcadlq9ps6mtn605e":
    "PUBLIC_RECEIVE_OK",

  "wolo1dmj5dnm7g9hmj005yzy5e5xcygudyt7wxzpxjq":
    "BOUNTIES_PUBLIC_OK",

  "wolo18v9ugfdrnz2ll2ah5z2yqzm5kzlg3e7l7jy6rn":
    "STAKING_OPERATIONAL_NOT_GENERAL_RECEIVE",

  "wolo1dshyzxffd0jj39k7gj9tq9hgsx96ylxamyp5g0":
    "FAUCET_OPERATIONAL",

  "wolo1tg04m57e52evgzjkn9ruwwkz626pfv9qfv27wy":
    "APP_SIGNER_NOT_USER_FACING",

  "wolo1n0yg6ltqxl05ljaqftvvtgec5qavf9a3uh090h":
    "USER",

  "wolo1a53udazy8ayufvy0s434pfwjcedzqv347h8lzn":
    "MODULE_ESCROW_DO_NOT_SEND_DIRECTLY",

  "wolo10zspyrrphzctrpysh6l9dsqj4wcwmj3tk660sz":
    "USER",

  "wolo1zygwt232ymc4h2g52yvkntffhmd5alx2kglw7p":
    "BET_DEPOSIT_ADDRESS_IF_MANUAL",

  "wolo1zfa9ssu2gpgqg7yzvhmjt4w66mza07qr2a4rwu":
    "APP_SIGNER_NOT_USER_FACING",

  "wolo1fl48vsnmsdzcv85q5d2q4z5ajdha8yu3aqv4s2":
    "MODULE_DO_NOT_USE",

  "wolo1mcmckkr360n47wyc408xmlsv4tzw95kkczvfp9":
    "USER",

  "wolo1yyuu097eppte7qya48r3dth86smdl3sjyxg284":
    "USER",

  "wolo1m8qzq92hkktgqp47aewzylkatk6c22vc8c4vgj":
    "RELAYER_GAS_DO_NOT_USE",

  "wolo1t4jq7wd4x030t9f0yfqfq74pt4pmaep5nu67y4":
    "RETIRED_DO_NOT_USE",

  "wolo1jv65s3grqf6v6jl3dp4t6c9t9rk99cd80ypxqz":
    "MODULE_DO_NOT_USE",

  "wolo1ntal93v8c5wryq2d9puhks8l25zedhepyv8n5k":
    "PLAYER_DO_NOT_SHOW_BALANCE",

  "wolo17xpfvakm2amg962yls6f84z3kell8c5lczx6zq":
    "MODULE_DO_NOT_USE",

  "wolo10d07y265gmmuvt4z0w9aw880jnsr700jjekllw":
    "MODULE_DO_NOT_USE",

  "wolo1vlthgax23ca9syk7xgaz347xmf4nunef0nnd9d":
    "MODULE_DO_NOT_USE",

  "wolo1m3h30wlvsf8llruxtpukdvsy0km2kum8q2zzwa":
    "MODULE_DO_NOT_USE",

  "wolo1hr93qzcjspaa32px0qqywlh9hf9a8plg8rrvw6":
    "MODULE_DO_NOT_USE",

  "wolo1tygms3xhhs3yv487phx3dw4a95jn7t7lfqsyx7":
    "MODULE_DO_NOT_USE",

  "wolo1yl6hdjhmkf37639730gffanpzndzdpmhxynn77":
    "MODULE_DO_NOT_USE",

  "wolo1rmr39nd5gnnv5y5f66qtq367xfwvx9jt5w7ucr":
    "RETIRED_DO_NOT_USE",

  "wolo198ajhn5atpw65u6z89z5hwfer2vx90u4ydxe7z":
    "PLAYER_DO_NOT_SHOW_BALANCE",

  "wolo1cy04t5af0mr9d8n6rrzgr8e9j4vuf42nfg02q5":
    "RETIRED_DO_NOT_USE",
};

type WoloNetworkAccountRow = {
  label: string;
  address: string;
  use: string;
  role: string;

  amountUwolo: string;
  amountWolo: string;
  amountWoloFormatted: string;

  directAmountUwolo: string;
  directAmountWoloFormatted: string;

  stakedAmountUwolo: string;
  stakedAmountWoloFormatted: string;

  rankingAmountUwolo: string;
  rankingAmountWoloFormatted: string;

  hideBalance: false;

  isModule: boolean;
  isRetired: boolean;
  isUserFacing: boolean;

  sources: string[];
};

type DenomOwner = {
  address?: unknown;
  balance?: {
    amount?: unknown;
    denom?: unknown;
  };
};

type DenomOwnersResponse = {
  denom_owners?: DenomOwner[];
  pagination?: {
    next_key?: unknown;
  };
};

type RestNodeInfoResponse = {
  default_node_info?: {
    network?: unknown;
  };
};

type UserWalletRow = {
  id: number;
  uid: string;
  address: string;
  in_game_name: string | null;
  steam_persona_name: string | null;
  verified: boolean;
  verification_level: number;
  active_staker: boolean;
  historical_staking_binding: boolean;
};

function normalizeAddress(value: string | null | undefined) {
  return (value || "").trim().toLowerCase();
}

function normalizeAmount(value: unknown): string {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return "0";
  return value.replace(/^0+(?=\d)/, "");
}

function compareAmountStrings(left: string, right: string): number {
  const cleanLeft = normalizeAmount(left);
  const cleanRight = normalizeAmount(right);

  if (cleanLeft.length !== cleanRight.length) {
    return cleanLeft.length > cleanRight.length ? 1 : -1;
  }

  return cleanLeft.localeCompare(cleanRight);
}

function addAmountStrings(left: string, right: string): string {
  let carry = 0;
  let result = "";
  let leftIndex = left.length - 1;
  let rightIndex = right.length - 1;

  while (leftIndex >= 0 || rightIndex >= 0 || carry > 0) {
    const leftDigit = leftIndex >= 0 ? Number(left[leftIndex]) : 0;
    const rightDigit = rightIndex >= 0 ? Number(right[rightIndex]) : 0;
    const sum = leftDigit + rightDigit + carry;

    result = String(sum % 10) + result;
    carry = Math.floor(sum / 10);
    leftIndex -= 1;
    rightIndex -= 1;
  }

  return result.replace(/^0+(?=\d)/, "");
}

function subtractAmountStrings(left: string, right: string): string {
  if (compareAmountStrings(left, right) <= 0) {
    return "0";
  }

  let borrow = 0;
  let result = "";
  let leftIndex = left.length - 1;
  let rightIndex = right.length - 1;

  while (leftIndex >= 0) {
    let digit = Number(left[leftIndex]) - borrow;
    const rightDigit = rightIndex >= 0 ? Number(right[rightIndex]) : 0;

    if (digit < rightDigit) {
      digit += 10;
      borrow = 1;
    } else {
      borrow = 0;
    }

    result = String(digit - rightDigit) + result;
    leftIndex -= 1;
    rightIndex -= 1;
  }

  return result.replace(/^0+(?=\d)/, "");
}

function woloNumberToUwoloString(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "0";
  }

  return String(Math.max(0, Math.round(value * 10 ** WOLO_COIN_DECIMALS)));
}

async function loadStakedUwoloByAddress() {
  const stakedUwoloByAddress = new Map<string, string>();

  try {
    const prisma = getPrisma();
    const positions = await loadMainnetStakingPositions(prisma, { take: 10_000 });

    for (const position of positions) {
      const walletAddress = normalizeAddress(position.walletAddress);
      const stakedAmountUwolo = normalizeAmount(
        woloNumberToUwoloString(position.currentStakedWolo || 0),
      );

      if (!walletAddress || stakedAmountUwolo === "0") {
        continue;
      }

      stakedUwoloByAddress.set(
        walletAddress,
        addAmountStrings(stakedUwoloByAddress.get(walletAddress) || "0", stakedAmountUwolo),
      );
    }
  } catch (error) {
    console.error("Failed to load staked WOLO for holder ranking:", error);
  }

  return stakedUwoloByAddress;
}

function groupWholeNumber(value: string): string {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function formatWolo(amountUwolo: string, grouped = false): string {
  const normalized = normalizeAmount(amountUwolo);
  const padded = normalized.padStart(WOLO_COIN_DECIMALS + 1, "0");
  const whole = padded.slice(0, -WOLO_COIN_DECIMALS) || "0";
  const fraction = padded.slice(-WOLO_COIN_DECIMALS);
  const wholeText = grouped ? groupWholeNumber(whole) : whole;

  return `${wholeText}.${fraction}`;
}


function getRestUrl() {
  return (
    process.env.WOLO_REST_URL ||
    process.env.WOLO_SETTLEMENT_PUBLIC_REST_URL ||
    process.env.NEXT_PUBLIC_WOLO_REST_URL ||
    process.env.WOLO_SETTLEMENT_REST_URL ||
    "https://rest-mainnet.aoe2war.com"
  ).replace(/\/+$/, "");
}

async function fetchRestJson<T>(
  url: string,
  deadlineAt: number,
): Promise<T> {
  const remainingMs = deadlineAt - Date.now();

  if (remainingMs <= 0) {
    throw new Error(
      "WoloChain network ledger REST budget expired.",
    );
  }

  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    Math.min(
      WOLO_REST_REQUEST_TIMEOUT_MS,
      remainingMs,
    ),
  );

  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    const body = await response.text();

    if (
      Buffer.byteLength(body, "utf8") >
      MAX_WOLO_REST_RESPONSE_BYTES
    ) {
      throw new Error(
        "WoloChain network ledger REST response exceeded safety bound.",
      );
    }

    if (!response.ok) {
      throw new Error(
        `WoloChain REST ${response.status}: ${body.slice(0, 300)}`,
      );
    }

    try {
      return JSON.parse(body) as T;
    } catch {
      throw new Error(
        "WoloChain network ledger REST returned malformed JSON.",
      );
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function loadDenomOwners() {
  const restUrl = getRestUrl();

  const deadlineAt =
    Date.now() + WOLO_REST_TOTAL_TIMEOUT_MS;

  const nodeInfo =
    await fetchRestJson<RestNodeInfoResponse>(
      `${restUrl}/cosmos/base/tendermint/v1beta1/node_info`,
      deadlineAt,
    );

  if (
    nodeInfo.default_node_info?.network !==
    WOLO_MAINNET_CHAIN_ID
  ) {
    throw new Error(
      `Refusing WoloChain REST identity ${
        String(
          nodeInfo.default_node_info?.network ||
          "missing"
        )
      }; expected ${WOLO_MAINNET_CHAIN_ID}.`,
    );
  }

  const owners =
    new Map<string, string>();

  const paginationKeys =
    new Set<string>();

  let nextKey: string | null = null;
  let pageCount = 0;

  while (true) {
    pageCount += 1;

    if (
      pageCount >
      MAX_DENOM_OWNER_PAGES
    ) {
      throw new Error(
        "WoloChain denom-owner pagination exceeded safety bound.",
      );
    }

    const params =
      new URLSearchParams({
        "pagination.limit":
          String(
            DENOM_OWNER_PAGE_SIZE,
          ),
      });

    if (nextKey) {
      params.set(
        "pagination.key",
        nextKey,
      );
    }

    const payload =
      await fetchRestJson<DenomOwnersResponse>(
        `${restUrl}/cosmos/bank/v1beta1/denom_owners/${encodeURIComponent(
          WOLO_BASE_DENOM
        )}?${params.toString()}`,
        deadlineAt,
      );

    if (
      !Array.isArray(
        payload.denom_owners
      )
    ) {
      throw new Error(
        "WoloChain denom-owner response omitted owner array.",
      );
    }

    for (const owner of payload.denom_owners) {
      const address =
        typeof owner.address === "string"
          ? normalizeAddress(
              owner.address,
            )
          : "";

      if (
        !isValidBech32AccountAddress(
          address,
          WOLO_ADDRESS_PREFIX,
        )
      ) {
        throw new Error(
          "WoloChain returned invalid owner address.",
        );
      }

      if (
        owner.balance?.denom !==
        WOLO_BASE_DENOM
      ) {
        throw new Error(
          `WoloChain owner balance must use ${WOLO_BASE_DENOM}.`,
        );
      }

      if (
        owners.has(address)
      ) {
        throw new Error(
          "WoloChain returned duplicate denom owner.",
        );
      }

      owners.set(
        address,
        normalizeAmount(
          owner.balance?.amount,
        ),
      );

      if (
        owners.size >
        MAX_NETWORK_ADDRESSES
      ) {
        throw new Error(
          `Wolo network ledger exceeded ${MAX_NETWORK_ADDRESSES} live owners.`,
        );
      }
    }

    const rawNextKey =
      payload.pagination?.next_key;

    nextKey =
      typeof rawNextKey === "string" &&
      rawNextKey.length > 0
        ? rawNextKey
        : null;

    if (!nextKey) {
      break;
    }

    if (
      paginationKeys.has(
        nextKey,
      )
    ) {
      throw new Error(
        "WoloChain repeated denom-owner pagination key.",
      );
    }

    paginationKeys.add(
      nextKey,
    );
  }

  return owners;
}

async function loadAliases() {
  const networkAliases =
    Object.fromEntries(
      WOLO_MAINNET_NETWORK_ACCOUNTS.map(
        (account) => [
          normalizeAddress(
            account.address,
          ),
          account.label,
        ],
      ),
    );

  const staticAliases:
    Record<string, string> = {
      ...networkAliases,
      ...WOLO_MAINNET_WALLET_ALIAS_BY_ADDRESS,
    };

  const aliases:
    Record<string, string> = {
      ...staticAliases,
    };

  const aliasFile =
    process.env.WOLO_WALLET_ALIAS_FILE ||
    "/etc/aoe2hdbets/wolo-wallet-aliases.tsv";

  try {
    const body =
      await readFile(
        aliasFile,
        "utf8",
      );

    if (
      Buffer.byteLength(
        body,
        "utf8",
      ) >
      MAX_WALLET_ALIAS_FILE_BYTES
    ) {
      throw new Error(
        "Wolo wallet alias file exceeded safety bound.",
      );
    }

    for (
      const rawLine
      of body.split(/\r?\n/)
    ) {
      const line =
        rawLine.trim();

      if (
        !line ||
        line.startsWith("#")
      ) {
        continue;
      }

      const match =
        line.match(
          /^(wolo1[0-9a-z]+)\s+(.+)$/
        );

      if (!match) {
        continue;
      }

      const address =
        normalizeAddress(
          match[1],
        );

      if (
        !staticAliases[
          address
        ]
      ) {
        aliases[address] =
          match[2]
            .trim()
            .slice(
              0,
              MAX_PUBLIC_ALIAS_LENGTH,
            );
      }
    }
  } catch {
    // Static registry aliases remain authoritative fallback.
  }

  return aliases;
}

async function loadUserIdentityMap() {
  const prisma = getPrisma();

  const rows =
    await prisma.$queryRaw<
      UserWalletRow[]
    >`
      with wallet_bindings as (
        select
          u.id as user_id,
          lower(u.wallet_address)
            as address,
          false
            as historical_staking_binding
        from users u
        where
          coalesce(
            u.wallet_address,
            ''
          ) <> ''

        union all

        select
          sp.user_id,
          lower(sp.wallet_address)
            as address,
          true
            as historical_staking_binding
        from staking_positions sp
        where
          coalesce(
            sp.wallet_address,
            ''
          ) <> ''
      ),
      deduped_bindings as (
        select
          user_id,
          address,
          bool_or(
            historical_staking_binding
          ) as historical_staking_binding
        from wallet_bindings
        group by
          user_id,
          address
      )
      select
        u.id,
        u.uid,
        bindings.address,
        u.in_game_name,
        u.steam_persona_name,
        u.verified,
        u.verification_level,
        bindings.historical_staking_binding,
        exists (
          select 1
          from staking_positions active_sp
          where
            active_sp.user_id = u.id
            and
            active_sp.status = 'active'
            and (
              active_sp.current_staked_wolo > 0
              or
              active_sp.compounded_rewards_wolo > 0
            )
        ) as active_staker
      from deduped_bindings bindings
      join users u
        on u.id = bindings.user_id
      order by
        bindings.address,
        u.id
      limit ${MAX_NETWORK_ADDRESSES + 1}
    `;

  if (
    rows.length >
    MAX_NETWORK_ADDRESSES
  ) {
    throw new Error(
      "Wolo identity discovery exceeded safety bound.",
    );
  }

  const identities =
    new Map<
      string,
      Array<{
        displayName: string;
        trusted: boolean;
      }>
    >();

  const userAddresses =
    new Set<string>();

  for (const row of rows) {
    const address =
      normalizeAddress(
        row.address,
      );

    if (
      !isValidBech32AccountAddress(
        address,
        WOLO_ADDRESS_PREFIX,
      )
    ) {
      continue;
    }

    userAddresses.add(
      address,
    );

    const displayName =
      row.in_game_name?.trim() ||
      row.steam_persona_name?.trim() ||
      row.uid;

    const trusted =
      Boolean(
        row.verified ||
        row.verification_level > 0 ||
        row.active_staker ||
        row.historical_staking_binding
      );

    const current =
      identities.get(
        address,
      ) || [];

    current.push({
      displayName,
      trusted,
    });

    identities.set(
      address,
      current,
    );
  }

  const labels =
    new Map<string, string>();

  for (
    const [
      address,
      candidates,
    ]
    of identities
  ) {
    if (
      candidates.length !== 1
    ) {
      continue;
    }

    const [identity] =
      candidates;

    if (!identity.trusted) {
      continue;
    }

    labels.set(
      address,
      identity
        .displayName
        .slice(
          0,
          MAX_PUBLIC_ALIAS_LENGTH,
        ),
    );
  }

  return {
    labels,
    userAddresses,
  };
}

function operationalUse(
  address: string,
  account: WoloMainnetNetworkAccount | undefined,
  isUser: boolean,
) {
  const historical =
    LEGACY_USE_BY_ADDRESS[
      address
    ];

  if (historical) {
    return historical;
  }

  if (account) {
    return account.use
      .trim()
      .toUpperCase()
      .replace(
        /[^A-Z0-9]+/g,
        "_",
      );
  }

  return isUser
    ? "USER"
    : "UNCLASSIFIED_HOLDER";
}

function sortNetworkRows(rows: WoloNetworkAccountRow[]) {
  return [...rows].sort((left, right) => {
    const amountCompare = compareAmountStrings(left.rankingAmountUwolo, right.rankingAmountUwolo);

    if (amountCompare !== 0) return -amountCompare;
    return left.label.localeCompare(right.label);
  });
}

function buildNetworkRow(
  address: string,
  account: WoloMainnetNetworkAccount | undefined,
  ownerByAddress: Map<string, string>,
  stakedUwoloByAddress: Map<string, string>,
  aliases: Record<string, string>,
  identities: {
    labels: Map<string, string>;
    userAddresses: Set<string>;
  },
): WoloNetworkAccountRow {
  const directAmountUwolo =
    normalizeAmount(
      ownerByAddress.get(
        address,
      ) || "0",
    );

  const stakedAmountUwolo =
    normalizeAmount(
      stakedUwoloByAddress.get(
        address,
      ) || "0",
    );

  const rankingAmountUwolo =
    addAmountStrings(
      directAmountUwolo,
      stakedAmountUwolo,
    );

  const isUser =
    identities
      .userAddresses
      .has(address) ||
    account?.role === "user" ||
    account?.use === "Player Wallet";

  const label =
    account?.label ||
    aliases[address] ||
    identities.labels.get(
      address,
    ) ||
    "Unclassified wallet";

  const use =
    operationalUse(
      address,
      account,
      isUser,
    );

  const role =
    account?.role ||
    (
      isUser
        ? "user"
        : "holder"
    );

  const sources = [
    account
      ? "network-registry"
      : null,

    ownerByAddress.has(
      address,
    )
      ? "wolo-rest-denom-owner"
      : null,

    aliases[address]
      ? "wallet-alias"
      : null,

    identities
      .userAddresses
      .has(address)
      ? "app-user-wallet-history"
      : null,

    stakedUwoloByAddress.has(
      address,
    )
      ? "active-staking"
      : null,
  ].filter(
    (
      value,
    ): value is string =>
      Boolean(value),
  );

  return {
    label,
    address,
    use,
    role,

    amountUwolo:
      directAmountUwolo,

    amountWolo:
      formatWolo(
        directAmountUwolo,
      ),

    amountWoloFormatted:
      formatWolo(
        directAmountUwolo,
        true,
      ),

    directAmountUwolo,

    directAmountWoloFormatted:
      formatWolo(
        directAmountUwolo,
        true,
      ),

    stakedAmountUwolo,

    stakedAmountWoloFormatted:
      formatWolo(
        stakedAmountUwolo,
        true,
      ),

    rankingAmountUwolo,

    rankingAmountWoloFormatted:
      formatWolo(
        rankingAmountUwolo,
        true,
      ),

    hideBalance: false,

    isModule:
      account
        ? isWoloNetworkModuleAccount(
            account,
          )
        : false,

    isRetired:
      account
        ? isWoloNetworkRetiredAccount(
            account,
          )
        : false,

    isUserFacing:
      isUser ||
      (
        account
          ? isWoloNetworkUserFacingAccount(
              account,
            )
          : false
      ),

    sources,
  };
}

function renderTable(
  rows: WoloNetworkAccountRow[],
  supplyUwolo: string,
  knownAddressTotalUwolo: string,
  totalSource: string,
) {
  const untrackedUwolo =
    subtractAmountStrings(
      supplyUwolo,
      knownAddressTotalUwolo,
    );

  const lines = [
    `${"LABEL".padEnd(38)} ${"ADDRESS".padEnd(48)} ${"LIQUID".padStart(18)} ${"STAKED".padStart(18)} ${"OWNERSHIP TOTAL".padStart(18)} USE`,
    "-".repeat(164),

    ...rows.map(
      (row) =>
        `${row.label.padEnd(38)} ${row.address.padEnd(48)} ${row.directAmountWoloFormatted.padStart(18)} ${row.stakedAmountWoloFormatted.padStart(18)} ${row.rankingAmountWoloFormatted.padStart(18)} ${row.use}`,
    ),

    "-".repeat(164),

    `${rows.length} Wolo addresses in complete network ledger`,

    totalSource === "chain_supply"
      ? `${formatWolo(
          supplyUwolo,
          true,
        )} WOLO total supply (WoloChain)`
      : `${formatWolo(
          supplyUwolo,
          true,
        )} WOLO subtotal across complete ledger bank balances (chain supply unavailable)`,

    `${formatWolo(
      knownAddressTotalUwolo,
      true,
    )} WOLO across ledger bank balances`,

    `${formatWolo(
      untrackedUwolo,
      true,
    )} WOLO outside the ledger address map`,

    "Ownership totals include active stake and are not summed into supply reconciliation.",
  ];

  return `${lines.join("\n")}\n`;
}

export async function GET(
  request: NextRequest,
) {
  try {
    const [
      aliases,
      ownerByAddress,
      identities,
      stakedUwoloByAddress,
    ] = await Promise.all([
      loadAliases(),
      loadDenomOwners(),
      loadUserIdentityMap(),
      loadStakedUwoloByAddress(),
    ]);

    const staticByAddress =
      new Map(
        WOLO_MAINNET_NETWORK_ACCOUNTS.map(
          (account) => [
            normalizeAddress(
              account.address,
            ),
            account,
          ] as const,
        ),
      );

    const allAddresses =
      new Set<string>([
        ...staticByAddress.keys(),
        ...ownerByAddress.keys(),
        ...identities
          .userAddresses
          .values(),
        ...stakedUwoloByAddress.keys(),
      ]);

    if (
      allAddresses.size >
      MAX_NETWORK_ADDRESSES
    ) {
      throw new Error(
        `Complete Wolo network ledger exceeded ${MAX_NETWORK_ADDRESSES} addresses.`,
      );
    }

    const rows =
      sortNetworkRows(
        [...allAddresses].map(
          (address) =>
            buildNetworkRow(
              address,
              staticByAddress.get(
                address,
              ),
              ownerByAddress,
              stakedUwoloByAddress,
              aliases,
              identities,
            ),
        ),
      );

    const knownAddressTotalUwolo =
      rows.reduce(
        (sum, row) =>
          addAmountStrings(
            sum,
            row.directAmountUwolo,
          ),
        "0",
      );

    let totalUwolo = knownAddressTotalUwolo;
    let totalSource = "known_address_balances";

    try {
      totalUwolo = normalizeAmount(
        await fetchWoloSupplyAmount(),
      );
      totalSource = "chain_supply";
    } catch (error) {
      console.error(
        "Failed to load canonical WOLO supply; using complete-ledger bank total (chain supply unavailable):",
        error,
      );
    }

    const untrackedUwolo =
      subtractAmountStrings(
        totalUwolo,
        knownAddressTotalUwolo,
      );

    const format =
      request.nextUrl
        .searchParams
        .get("format");

    if (
      format === "table" ||
      format === "text" ||
      format === "txt"
    ) {
      return new NextResponse(
        renderTable(rows, totalUwolo, knownAddressTotalUwolo, totalSource),
        {
          headers: {
            ...NO_STORE_HEADERS,
            "Content-Type":
              "text/plain; charset=utf-8",
          },
        },
      );
    }

    return NextResponse.json(
      {
        chainId:
          WOLO_MAINNET_CHAIN_ID,

        denom:
          WOLO_BASE_DENOM,

        displayDenom:
          WOLO_DISPLAY_DENOM,

        decimals:
          WOLO_COIN_DECIMALS,

        balancePolicy:
          "all_network_balances_public",

        count:
          rows.length,

        liveOwnerCount:
          ownerByAddress.size,

        registryAddressCount:
          staticByAddress.size,

        identityAddressCount:
          identities
            .userAddresses
            .size,

        activeStakingAddressCount:
          stakedUwoloByAddress.size,

        totalUwolo,

        totalWolo:
          formatWolo(
            totalUwolo,
          ),

        totalWoloFormatted:
          formatWolo(
            totalUwolo,
            true,
          ),

        totalSource,

        knownAddressTotalUwolo:
          knownAddressTotalUwolo,

        knownAddressTotalWolo:
          formatWolo(
            knownAddressTotalUwolo,
          ),

        knownAddressTotalWoloFormatted:
          formatWolo(
            knownAddressTotalUwolo,
            true,
          ),

        untrackedUwolo,

        untrackedWolo:
          formatWolo(
            untrackedUwolo,
          ),

        untrackedWoloFormatted:
          formatWolo(
            untrackedUwolo,
            true,
          ),

        accounts: rows,
      },
      {
        headers:
          NO_STORE_HEADERS,
      },
    );
  } catch (error) {
    console.error(
      "Failed to load complete Wolo network ledger:",
      error,
    );

    return NextResponse.json(
      {
        detail:
          "Wolo network ledger unavailable.",
      },
      {
        status: 500,
        headers:
          NO_STORE_HEADERS,
      },
    );
  }
}
