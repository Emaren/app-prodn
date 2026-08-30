import { readFile } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";

import {
  WOLO_MAINNET_WALLET_ALIASES,
  WOLO_MAINNET_WALLET_ALIAS_BY_ADDRESS,
} from "@/lib/woloMainnetWallets";
import { WOLO_MAINNET_NETWORK_ACCOUNTS } from "@/lib/woloMainnetNetworkAccounts";
import {
  WOLO_ADDRESS_PREFIX,
  WOLO_BASE_DENOM,
  WOLO_CHAIN_ID,
  WOLO_COIN_DECIMALS,
  WOLO_DISPLAY_DENOM,
} from "@/lib/woloChain";
import { getPrisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminSession";
import {
  classifyPublicWoloHolder,
  comparePublicWoloHolderIdentity,
  projectPublicWoloHolderBalance,
  type PublicWoloHolderClassification,
} from "@/lib/woloPublicHolderPrivacy";
import {
  isValidBech32AccountAddress,
  normalizeMinimalDenomAmount,
} from "@/lib/woloBalanceRead";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0, must-revalidate",
  Expires: "0",
  Pragma: "no-cache",
};

const MAX_RETAINED_WALLETS = 5_000;
const MAX_PUBLIC_HOLDERS = 5_000;
const DENOM_OWNER_PAGE_SIZE = 500;
const MAX_DENOM_OWNER_PAGES = Math.ceil(MAX_PUBLIC_HOLDERS / DENOM_OWNER_PAGE_SIZE) + 1;
const WOLO_REST_REQUEST_TIMEOUT_MS = 5_000;
const WOLO_REST_TOTAL_TIMEOUT_MS = 15_000;
const MAX_WOLO_REST_PAGE_BYTES = 2 * 1024 * 1024;
const MAX_WALLET_ALIAS_FILE_BYTES = 256 * 1024;
const MAX_PUBLIC_ALIAS_LENGTH = 96;

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

type HolderRow = {
  rank: number;
  alias: string;
  address: string;
  role: string;
  use: string | null;
  balanceWolo: string | null;
  balanceWoloFormatted: string | null;
  exactBalanceWolo: string | null;
  balanceHidden: boolean;
  classification: PublicWoloHolderClassification;
  isKnown: boolean;
  isKnownUser: boolean;
  isInfrastructure: boolean;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  discoverySources: string[];
  amountUwolo?: string;
  identities?: Array<{
    userId: number;
    uid: string;
    displayName: string;
    identityVerified: boolean;
    activeStaker: boolean;
  }>;
};

type ObservedWalletRow = {
  address: string;
  first_seen_at: Date | string | null;
  last_seen_at: Date | string | null;
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
};

function normalizeAmount(value: unknown): string {
  try {
    return normalizeMinimalDenomAmount(value);
  } catch {
    throw new Error("WoloChain returned a malformed unsigned balance amount.");
  }
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

async function fetchBoundedRestJson<T>(url: string, deadlineAt: number): Promise<T> {
  const remainingMs = deadlineAt - Date.now();
  if (remainingMs <= 0) {
    throw new Error("WoloChain REST owner lookup exceeded its total time budget.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    Math.min(WOLO_REST_REQUEST_TIMEOUT_MS, remainingMs),
  );

  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    const declaredLength = Number.parseInt(
      response.headers.get("content-length") || "0",
      10,
    );
    if (
      Number.isFinite(declaredLength) &&
      declaredLength > MAX_WOLO_REST_PAGE_BYTES
    ) {
      await response.body?.cancel();
      throw new Error("WoloChain REST response exceeded the page-size safety bound.");
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let receivedBytes = 0;
    let text = "";

    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        receivedBytes += value.byteLength;
        if (receivedBytes > MAX_WOLO_REST_PAGE_BYTES) {
          await reader.cancel();
          throw new Error("WoloChain REST response exceeded the page-size safety bound.");
        }
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
    }

    if (!response.ok) {
      throw new Error(`WoloChain REST ${response.status}: ${text.slice(0, 300)}`);
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("application/json")) {
      throw new Error("WoloChain REST did not return JSON.");
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error("WoloChain REST returned malformed JSON.");
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function verifyRestChainIdentity(restUrl: string, deadlineAt: number) {
  const payload = await fetchBoundedRestJson<RestNodeInfoResponse>(
    `${restUrl}/cosmos/base/tendermint/v1beta1/node_info`,
    deadlineAt,
  );
  if (payload.default_node_info?.network !== WOLO_CHAIN_ID) {
    const observed = payload.default_node_info?.network;
    throw new Error(
      `Refusing WoloChain REST identity ${typeof observed === "string" ? observed : "missing"}; expected ${WOLO_CHAIN_ID}.`,
    );
  }
}

const networkByAddress = new Map(
  WOLO_MAINNET_NETWORK_ACCOUNTS.map((account) => [account.address.toLowerCase(), account])
);

const walletRoleByAddress = new Map(
  WOLO_MAINNET_WALLET_ALIASES.map((wallet) => [wallet.address.toLowerCase(), wallet.role])
);

const publicProtocolWalletRoles = new Set([
  "founder",
  "treasury",
  "liquidity",
  "faucet",
  "validator",
  "bounty",
  "escrow",
  "staking",
  "relayer",
  "payout",
]);

function publicHolderRole(role: string, use: string | null) {
  if (use && use.trim()) {
    return use.trim();
  }

  switch (role) {
    case "founder":
      return "Founder Wallet";
    case "treasury":
      return "Community Treasury";
    case "liquidity":
      return "Liquidity Reserve";
    case "faucet":
      return "Faucet Wallet";
    case "validator":
      return "Operations Reserve";
    case "bounty":
      return "Bounty Pool";
    case "escrow":
      return "Escrow";
    case "player":
    case "user":
      return "Player Wallet";
    case "staking":
      return "Staking Pool";
    case "relayer":
      return "Relayer Wallet";
    case "payout":
      return "Payout Wallet";
    case "test":
    case "module":
      return "Network Module";
    default:
      return "Holder Wallet";
  }
}

function classifyHolder(address: string, knownUserAddresses: ReadonlySet<string>) {
  const lower = address.toLowerCase();
  const networkAccount = networkByAddress.get(lower);
  const walletRole = walletRoleByAddress.get(lower);
  const rawRole = networkAccount?.role || walletRole || "holder";
  const use = networkAccount?.use ?? null;
  const isKnown = Boolean(networkAccount || walletRole || WOLO_MAINNET_WALLET_ALIAS_BY_ADDRESS[lower]);
  const isKnownUser = knownUserAddresses.has(lower) ||
    rawRole === "user" ||
    rawRole === "player" ||
    use === "Player Wallet" ||
    walletRole === "player";
  const isInfrastructure =
    !isKnownUser &&
    (Boolean(networkAccount) || Boolean(walletRole && publicProtocolWalletRoles.has(walletRole)));
  const classification = classifyPublicWoloHolder({ isKnownUser, isInfrastructure });

  return {
    role: publicHolderRole(rawRole, use),
    use,
    classification,
    isKnown,
    isKnownUser,
    isInfrastructure,
  };
}

function publicHolderAlias(input: {
  classification: PublicWoloHolderClassification;
  configuredAlias: string | null;
}) {
  if (input.classification === "protocol") {
    return input.configuredAlias || "Protocol wallet";
  }
  if (input.classification === "player") return input.configuredAlias || "Player wallet";
  return "Unclassified wallet";
}

async function loadAliases() {
  const staticAliases: Record<string, string> = {
    ...WOLO_MAINNET_WALLET_ALIAS_BY_ADDRESS,
  };
  const aliases: Record<string, string> = { ...staticAliases };
  const aliasFile = process.env.WOLO_WALLET_ALIAS_FILE || "/etc/aoe2hdbets/wolo-wallet-aliases.tsv";

  try {
    const text = await readFile(aliasFile, "utf8");
    if (Buffer.byteLength(text, "utf8") > MAX_WALLET_ALIAS_FILE_BYTES) {
      throw new Error("Wolo wallet alias file exceeded the safety bound.");
    }

    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) {
        continue;
      }

      const match = line.match(/^(wolo1[0-9a-z]+)\s+(.+)$/);
      if (!match) {
        continue;
      }

      const address = match[1].toLowerCase();
      if (!staticAliases[address]) {
        aliases[address] = match[2].trim().slice(0, MAX_PUBLIC_ALIAS_LENGTH);
      }
    }
  } catch {
    // Fallback aliases keep local/dev builds useful.
  }

  return aliases;
}

async function loadRetainedWalletDiscovery() {
  const prisma = getPrisma();
  try {
    const [observedRows, userRows] = await Promise.all([
      prisma.$queryRaw<ObservedWalletRow[]>`
      select
        lower(address) as address,
        min(observed_at) as first_seen_at,
        max(observed_at) as last_seen_at
      from (
        select sender_address as address, timestamp as observed_at
        from wolo_indexed_transfers
        where chain_id = ${WOLO_CHAIN_ID}
          and denom = ${WOLO_BASE_DENOM}
        union all
        select recipient_address as address, timestamp as observed_at
        from wolo_indexed_transfers
        where chain_id = ${WOLO_CHAIN_ID}
          and denom = ${WOLO_BASE_DENOM}
      ) observed
      where coalesce(address, '') <> ''
      group by lower(address)
      order by lower(address)
      limit ${MAX_RETAINED_WALLETS + 1}
    `,
    prisma.$queryRaw<UserWalletRow[]>`
      select
        u.id,
        u.uid,
        lower(u.wallet_address) as address,
        u.in_game_name,
        u.steam_persona_name,
        u.verified,
        u.verification_level,
        exists (
          select 1
          from staking_positions sp
          where sp.user_id = u.id
            and sp.status = 'active'
            and (
              sp.current_staked_wolo > 0
              or sp.compounded_rewards_wolo > 0
            )
        ) as active_staker
      from users u
      where coalesce(u.wallet_address, '') <> ''
      order by lower(u.wallet_address), u.id
      limit ${MAX_RETAINED_WALLETS + 1}
    `,
    ]);

    if (observedRows.length > MAX_RETAINED_WALLETS || userRows.length > MAX_RETAINED_WALLETS) {
      throw new Error(`Public wallet discovery exceeded the ${MAX_RETAINED_WALLETS}-address safety bound.`);
    }

    const observedByAddress = new Map(
      observedRows
        .filter((row) => isValidBech32AccountAddress(row.address, WOLO_ADDRESS_PREFIX))
        .map((row) => [
          row.address.toLowerCase(),
          {
            firstSeenAt: row.first_seen_at ? new Date(row.first_seen_at).toISOString() : null,
            lastSeenAt: row.last_seen_at ? new Date(row.last_seen_at).toISOString() : null,
          },
        ] as const),
    );
    const knownUserAddresses = new Set(
      userRows
        .map((row) => row.address?.toLowerCase())
        .filter((address): address is string =>
          isValidBech32AccountAddress(address, WOLO_ADDRESS_PREFIX)
        ),
    );

    const userIdentitiesByAddress = new Map<
      string,
      Array<{
        userId: number;
        uid: string;
        displayName: string;
        identityVerified: boolean;
        activeStaker: boolean;
      }>
    >();
    for (const row of userRows) {
      const address = row.address?.toLowerCase();
      if (!isValidBech32AccountAddress(address, WOLO_ADDRESS_PREFIX)) continue;
      const identityVerified = Boolean(row.verified || row.verification_level > 0);
      const displayName =
        row.in_game_name?.trim() || row.steam_persona_name?.trim() || row.uid;
      const identity = {
        userId: row.id,
        uid: row.uid,
        displayName,
        identityVerified,
        activeStaker: Boolean(row.active_staker),
      };
      const current = userIdentitiesByAddress.get(address) || [];
      current.push(identity);
      userIdentitiesByAddress.set(address, current);
    }

    const publicUserAliasByAddress = new Map<string, string>();
    for (const [address, identities] of userIdentitiesByAddress) {
      if (identities.length !== 1) continue;
      const [identity] = identities;
      if (identity.identityVerified || identity.activeStaker) {
        publicUserAliasByAddress.set(address, identity.displayName.slice(0, MAX_PUBLIC_ALIAS_LENGTH));
      }
    }

    return {
      observedByAddress,
      knownUserAddresses,
      userIdentitiesByAddress,
      publicUserAliasByAddress,
      available: true as const,
    };
  } catch (error) {
    console.warn("Retained Wolo wallet discovery unavailable:", error);
    return {
      observedByAddress: new Map<string, { firstSeenAt: string | null; lastSeenAt: string | null }>(),
      knownUserAddresses: new Set<string>(),
      userIdentitiesByAddress: new Map<string, Array<{
        userId: number;
        uid: string;
        displayName: string;
        identityVerified: boolean;
        activeStaker: boolean;
      }>>(),
      publicUserAliasByAddress: new Map<string, string>(),
      available: false as const,
    };
  }
}

async function loadDenomOwners(restUrl: string, denom: string) {
  const owners: Array<{ address: string; amountUwolo: string }> = [];
  const seenAddresses = new Set<string>();
  const seenPaginationKeys = new Set<string>();
  const deadlineAt = Date.now() + WOLO_REST_TOTAL_TIMEOUT_MS;
  let nextKey: string | null = null;
  let pageCount = 0;

  await verifyRestChainIdentity(restUrl, deadlineAt);

  while (true) {
    pageCount += 1;
    if (pageCount > MAX_DENOM_OWNER_PAGES) {
      throw new Error("WoloChain denom-owner pagination exceeded the page safety bound.");
    }

    const params = new URLSearchParams({
      "pagination.limit": String(DENOM_OWNER_PAGE_SIZE),
    });

    if (nextKey) {
      params.set("pagination.key", nextKey);
    }

    const payload = await fetchBoundedRestJson<DenomOwnersResponse>(
      `${restUrl}/cosmos/bank/v1beta1/denom_owners/${encodeURIComponent(denom)}?${params.toString()}`,
      deadlineAt,
    );

    if (!payload || !Array.isArray(payload.denom_owners)) {
      throw new Error("WoloChain denom-owner response did not include an owner array.");
    }

    for (const owner of payload.denom_owners) {
      const address = typeof owner.address === "string" ? owner.address : "";
      if (!isValidBech32AccountAddress(address, WOLO_ADDRESS_PREFIX)) {
        throw new Error("WoloChain returned a malformed denom-owner address.");
      }

      if (owner.balance?.denom !== denom) {
        throw new Error(`WoloChain denom-owner balance must use ${denom}.`);
      }

      const amountUwolo = normalizeAmount(owner.balance.amount);
      const normalizedAddress = address.toLowerCase();

      if (seenAddresses.has(normalizedAddress)) {
        throw new Error("WoloChain returned a duplicate denom-owner address.");
      }
      seenAddresses.add(normalizedAddress);
      if (seenAddresses.size > MAX_PUBLIC_HOLDERS) {
        throw new Error(
          `WoloChain denom owners exceeded the ${MAX_PUBLIC_HOLDERS}-address safety bound.`,
        );
      }

      if (amountUwolo !== "0") {
        owners.push({ address, amountUwolo });
      }
    }

    const rawNextKey = payload.pagination?.next_key;
    if (
      rawNextKey !== undefined &&
      rawNextKey !== null &&
      (typeof rawNextKey !== "string" ||
        rawNextKey.length > 1024 ||
        (rawNextKey.length > 0 && !/^[A-Za-z0-9+/=_-]+$/.test(rawNextKey)))
    ) {
      throw new Error("WoloChain returned a malformed pagination key.");
    }

    nextKey = typeof rawNextKey === "string" && rawNextKey.length > 0 ? rawNextKey : null;

    if (!nextKey) {
      break;
    }

    if (seenPaginationKeys.has(nextKey)) {
      throw new Error("WoloChain repeated a denom-owner pagination key.");
    }
    seenPaginationKeys.add(nextKey);
  }

  return owners;
}

function renderTable(holders: HolderRow[], operatorView: boolean) {
  const lines = [
    `${"ALIAS".padEnd(34)} ${"ADDRESS".padEnd(48)} ${"WOLO".padStart(18)} ROLE`,
    "-".repeat(116),
    ...holders.map((holder) => {
      const displayBalance = holder.balanceHidden
        ? "PRIVATE"
        : holder.balanceWoloFormatted || "UNAVAILABLE";
      return `${holder.alias.padEnd(34)} ${holder.address.padEnd(48)} ${displayBalance.padStart(18)} ${holder.role}`;
    }),
    "-".repeat(116),
    `${holders.length} listed wallets`,
    operatorView
      ? "Admin-authenticated operator projection; all current indexed balances are included."
      : "Only protocol/system wallet balances are public.",
  ];

  return `${lines.join("\n")}\n`;
}

export async function GET(request: NextRequest) {
  try {
    const operatorView = request.nextUrl.searchParams.get("view") === "operator";
    if (operatorView) {
      const gate = await requireAdmin(request);
      if ("error" in gate) return gate.error;
    }

    const restUrl = getRestUrl();
    const denom = WOLO_BASE_DENOM;
    const [aliases, owners, retained] = await Promise.all([
      loadAliases(),
      loadDenomOwners(restUrl, denom),
      loadRetainedWalletDiscovery(),
    ]);
    const ownerByAddress = new Map(
      owners.map((owner) => [owner.address.toLowerCase(), owner] as const),
    );
    const allAddresses = new Set([
      ...ownerByAddress.keys(),
      ...retained.observedByAddress.keys(),
      ...WOLO_MAINNET_WALLET_ALIASES.map((wallet) => wallet.address.toLowerCase()),
    ]);

    if (allAddresses.size > MAX_PUBLIC_HOLDERS) {
      throw new Error(
        `Public Wolo holder projection exceeded the ${MAX_PUBLIC_HOLDERS}-address safety bound.`,
      );
    }
    for (const address of allAddresses) {
      if (!isValidBech32AccountAddress(address, WOLO_ADDRESS_PREFIX)) {
        throw new Error("Public Wolo holder configuration contained an invalid account address.");
      }
    }

    const holders = [...allAddresses]
      .map((address) => {
        const owner = ownerByAddress.get(address);
        const discovery = retained.observedByAddress.get(address);
        const classification = classifyHolder(address, retained.knownUserAddresses);
        const configuredAlias = aliases[address] || null;
        const amountUwolo = owner?.amountUwolo || "0";
        const balanceWolo = formatWolo(amountUwolo);
        const balanceWoloFormatted = formatWolo(amountUwolo, true);
        const balance = operatorView
          ? {
              amountUwolo,
              balanceWolo,
              balanceWoloFormatted,
              exactBalanceWolo: balanceWolo,
              balanceHidden: false,
            }
          : projectPublicWoloHolderBalance({
              classification: classification.classification,
              balanceWolo,
              balanceWoloFormatted,
            });
        const userIdentities = retained.userIdentitiesByAddress.get(address) || [];
        const publicUserAlias = retained.publicUserAliasByAddress.get(address) || null;
        const alias = operatorView
          ? configuredAlias ||
            (userIdentities.length === 1
              ? userIdentities[0].displayName
              : userIdentities.length > 1
                ? "Multiple linked app users"
                : classification.classification === "protocol"
                  ? "Protocol wallet"
                  : "Unclassified wallet")
          : publicHolderAlias({
              classification: classification.classification,
              configuredAlias:
                classification.classification === "player"
                  ? publicUserAlias || configuredAlias
                  : configuredAlias,
            });

        return {
          alias,
          address,
          role: classification.role,
          use: classification.use,
          classification: classification.classification,
          ...balance,
          isKnown: classification.isKnown || classification.isKnownUser,
          isKnownUser: classification.isKnownUser,
          isInfrastructure: classification.isInfrastructure,
          firstSeenAt: discovery?.firstSeenAt || null,
          lastSeenAt: discovery?.lastSeenAt || null,
          discoverySources: [
            owner ? "wolo-rest-denom-owners" : null,
            discovery ? "indexed-transfer-ledger" : null,
            classification.isKnownUser ? "app-user-wallet" : null,
            classification.isKnown ? "configured-classification" : null,
          ].filter((source): source is string => Boolean(source)),
          ...(operatorView ? { identities: userIdentities } : {}),
        };
      })
      .sort(comparePublicWoloHolderIdentity)
      .map((holder, index) => ({
        ...holder,
        rank: index + 1,
      }));

    const format = request.nextUrl.searchParams.get("format");

    if (format === "table" || format === "text" || format === "txt") {
      return new NextResponse(renderTable(holders, operatorView), {
        headers: {
          ...NO_STORE_HEADERS,
          ...(operatorView ? { "Cache-Control": "private, no-store, max-age=0" } : {}),
          "Content-Type": "text/plain; charset=utf-8",
        },
      });
    }

    const observedAt = new Date().toISOString();

    return NextResponse.json(
      {
        updatedAt: observedAt,
        chainId: WOLO_CHAIN_ID,
        denom,
        displayDenom: WOLO_DISPLAY_DENOM,
        decimals: WOLO_COIN_DECIMALS,
        addressPrefix: WOLO_ADDRESS_PREFIX,
        count: holders.length,
        observedAddressCount: holders.length,
        currentNonzeroOwnerCount: owners.length,
        retainedTransferAddressCount: retained.observedByAddress.size,
        retainedDiscoveryAvailable: retained.available,
        balancePolicy: operatorView ? "admin_all_current" : "protocol_system_only",
        view: operatorView ? "operator" : "public",
        provenance: {
          source: "wolo-rest-denom-owners",
          sources: [
            "wolo-rest-denom-owners",
            ...(retained.available ? ["indexed-transfer-ledger"] : []),
          ],
          chainId: WOLO_CHAIN_ID,
          denom,
          observedAt,
        },
        holders,
      },
      {
        headers: {
          ...NO_STORE_HEADERS,
          ...(operatorView ? { "Cache-Control": "private, no-store, max-age=0" } : {}),
        },
      }
    );
  } catch (error) {
    console.error("Failed to load public Wolo holders:", error);

    return NextResponse.json(
      {
        detail: "Wolo holders unavailable.",
      },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
