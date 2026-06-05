import type { PrismaClient } from "@/lib/generated/prisma";
import {
  WOLO_MAINNET_FAUCET_CLAIM_AMOUNT_UWOLO,
  WOLO_MAINNET_FAUCET_HOT_WALLET_ADDRESS,
  WOLO_MAINNET_WALLET_ALIASES,
} from "./woloMainnetWallets.ts";

export const WOLO_MAINNET_CHAIN_ID = "wolo-1";
export const WOLO_MAINNET_BASE_DENOM = "uwolo";
export const WOLO_MAINNET_DISPLAY_DENOM = "WOLO";
export const WOLO_INDEXED_TRANSFER_SOURCE = "wolo-mainnet-bank-send";

const WOLO_COIN_DECIMALS = 6;
const DEFAULT_BLOCK_LIMIT = 5_000_000;
const DEFAULT_ADDRESS_LIMIT = 80;
const DEFAULT_PER_ADDRESS_LIMIT = 2_000;
const DEFAULT_GLOBAL_LIMIT = 50_000;
const MAX_BLOCK_LIMIT = 20_000_000;
const MAX_ADDRESS_LIMIT = 400;
const MAX_PER_ADDRESS_LIMIT = 5_000;
const MAX_GLOBAL_LIMIT = 100_000;
const TX_SEARCH_PAGE_SIZE = 50;
const TX_SEARCH_TIMEOUT_MS = 8_000;
const QUERY_CONCURRENCY = 4;
const FAUCET_CLAIM_AMOUNT_UWOLO_BIGINT = BigInt(WOLO_MAINNET_FAUCET_CLAIM_AMOUNT_UWOLO);

const COMMUNITY_TREASURY_ENV_NAMES = [
  "WOLO_COMMUNITY_TREASURY_ADDRESS",
  "WOLO_COMMUNITY_TREASURY",
  "WOLO_TREASURY_ADDRESS",
  "WOLO_TREASURY",
  "WOLO_MATCH_GUARANTEE_TREASURY_ADDRESS",
  "WOLO_MATCH_GUARANTEE_TREASURY",
  "WOLO_TREASURY_WALLET_ADDRESS",
  "WOLO_TREASURY_WALLET",
  "WOLO_COMMUNITY_TREASURY_WALLET_ADDRESS",
  "WOLO_COMMUNITY_TREASURY_WALLET",
  "NEXT_PUBLIC_WOLO_COMMUNITY_TREASURY_ADDRESS",
  "NEXT_PUBLIC_WOLO_COMMUNITY_TREASURY",
  "NEXT_PUBLIC_WOLO_TREASURY_ADDRESS",
  "NEXT_PUBLIC_WOLO_TREASURY",
  "NEXT_PUBLIC_WOLO_MATCH_GUARANTEE_TREASURY_ADDRESS",
  "NEXT_PUBLIC_WOLO_MATCH_GUARANTEE_TREASURY",
  "NEXT_PUBLIC_WOLO_TREASURY_WALLET_ADDRESS",
  "NEXT_PUBLIC_WOLO_TREASURY_WALLET",
] as const;

type AddressKind =
  | "user"
  | "staking_wallet"
  | "community_treasury"
  | "escrow"
  | "tracked";

export type WoloAddressBookEntry = {
  address: string;
  label: string;
  kind: AddressKind;
  userId?: number | null;
  uid?: string | null;
};

export type IndexedWoloTransfer = {
  txHash: string;
  transferIndex: number;
  chainId: string;
  height: bigint;
  timestamp: Date;
  senderAddress: string;
  recipientAddress: string;
  amountUwolo: bigint;
  amountWoloDisplay: string;
  denom: string;
  memo: string | null;
  rawType: string;
  eventType: string;
  source: string;
};

export type WoloTransferBackfillOptions = {
  blockLimit?: number | null;
  addressLimit?: number | null;
  perAddressLimit?: number | null;
  globalLimit?: number | null;
};

export type WoloTransferBackfillResult = {
  ok: boolean;
  chainId: string;
  restUrl: string;
  rpcUrl: string;
  mode: "rest_tx_search";
  latestHeight: number;
  fromHeight: number;
  blockLimit: number;
  addressCount: number;
  queriesAttempted: number;
  txsSeen: number;
  transfersParsed: number;
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
  txHashes: string[];
};

export type WoloIndexedTransferActivityRow = {
  key: string;
  txHash: string;
  transferIndex: number;
  height: string;
  timestamp: string;
  senderAddress: string;
  senderLabel: string | null;
  recipientAddress: string;
  recipientLabel: string | null;
  amountUwolo: string;
  amountWolo: number;
  amountLabel: string;
  memo: string | null;
  source: string;
};

export type WoloIndexedTransferDashboardRow = WoloIndexedTransferActivityRow & {
  senderKind: AddressKind | null;
  recipientKind: AddressKind | null;
};

export type WoloIndexedTransferDashboard = {
  source: string;
  totalRows: number;
  latestTimestamp: string | null;
  rows: WoloIndexedTransferDashboardRow[];
  notes: string[];
};

type ChainTxResponse = {
  height?: string;
  txhash?: string;
  code?: number;
  timestamp?: string;
  events?: Array<{ type?: string; attributes?: Array<{ key?: string; value?: string }> }>;
  tx?: {
    body?: {
      memo?: string;
      messages?: Array<{
        "@type"?: string;
        from_address?: string;
        to_address?: string;
        amount?: Array<{ denom?: string; amount?: string }>;
      }>;
    };
  };
};

type ChainMessage = NonNullable<
  NonNullable<NonNullable<ChainTxResponse["tx"]>["body"]>["messages"]
>[number];

type TxSearchPayload = {
  code?: number;
  message?: string;
  tx_responses?: ChainTxResponse[];
};

type RpcStatusPayload = {
  result?: {
    node_info?: {
      network?: string;
    };
    sync_info?: {
      latest_block_height?: string;
    };
  };
};

function getRestUrl() {
  return (
    process.env.WOLO_INTERNAL_REST_URL?.trim() ||
    process.env.WOLO_REST_URL?.trim() ||
    process.env.NEXT_PUBLIC_WOLO_REST_URL?.trim() ||
    "https://rest-mainnet.aoe2war.com"
  ).replace(/\/+$/, "");
}

function getRpcUrl() {
  return (
    process.env.WOLO_INTERNAL_RPC_URL?.trim() ||
    process.env.WOLO_RPC_URL?.trim() ||
    process.env.NEXT_PUBLIC_WOLO_RPC_URL?.trim() ||
    "https://rpc-mainnet.aoe2war.com"
  ).replace(/\/+$/, "");
}

function clampInt(value: number | null | undefined, fallback: number, max: number) {
  if (!Number.isFinite(value ?? NaN)) return fallback;
  return Math.max(1, Math.min(max, Math.floor(Number(value))));
}

function normalizeAddress(value: string | null | undefined) {
  const clean = (value || "").trim();
  return /^wolo1[0-9a-z]{20,90}$/i.test(clean) ? clean.toLowerCase() : null;
}

function normalizeTxHash(value: string | null | undefined) {
  const clean = (value || "").trim().toUpperCase();
  return /^[A-F0-9]{16,128}$/.test(clean) ? clean : null;
}

function displayUserName(user: {
  uid?: string | null;
  inGameName?: string | null;
  steamPersonaName?: string | null;
}) {
  return user.inGameName?.trim() || user.steamPersonaName?.trim() || user.uid?.trim() || "linked user";
}

function amountUwoloToDisplayString(amountUwolo: bigint) {
  const scale = BigInt(10 ** WOLO_COIN_DECIMALS);
  const whole = amountUwolo / scale;
  const fractional = (amountUwolo % scale).toString().padStart(WOLO_COIN_DECIMALS, "0");
  return `${whole.toString()}.${fractional}`;
}

function amountLabelFromDisplay(value: string | number) {
  const numeric = typeof value === "number" ? value : Number.parseFloat(String(value));
  if (!Number.isFinite(numeric)) return `0 ${WOLO_MAINNET_DISPLAY_DENOM}`;
  return `${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: numeric >= 10_000 ? 1 : numeric >= 1 ? 2 : 6,
    minimumFractionDigits: 0,
    notation: numeric >= 100_000 ? "compact" : "standard",
  }).format(numeric)} ${WOLO_MAINNET_DISPLAY_DENOM}`;
}

function putAddress(
  book: Map<string, WoloAddressBookEntry>,
  rawAddress: string | null | undefined,
  entry: Omit<WoloAddressBookEntry, "address">,
  options: { prefer?: boolean } = {}
) {
  const address = normalizeAddress(rawAddress);
  if (!address) return;
  if (!options.prefer && book.has(address)) return;
  book.set(address, { address, ...entry });
}

function envAddress(name: string) {
  return normalizeAddress(process.env[name]?.trim());
}

function addressBookKindForWalletAlias(
  role: (typeof WOLO_MAINNET_WALLET_ALIASES)[number]["role"]
): AddressKind {
  if (role === "treasury") return "community_treasury";
  if (role === "staking") return "staking_wallet";
  if (role === "escrow") return "escrow";
  return "tracked";
}

function isIndexedFaucetClaimTransfer(row: {
  senderAddress: string;
  amountUwolo: bigint;
}) {
  return (
    row.senderAddress.toLowerCase() === WOLO_MAINNET_FAUCET_HOT_WALLET_ADDRESS &&
    row.amountUwolo === FAUCET_CLAIM_AMOUNT_UWOLO_BIGINT
  );
}

async function fetchJson<T>(url: string, timeoutMs = TX_SEARCH_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: { accept: "application/json" },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from ${new URL(url).host}`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchMainnetHeight() {
  const rpcUrl = getRpcUrl();
  const payload = await fetchJson<RpcStatusPayload>(`${rpcUrl}/status`);
  const network = payload.result?.node_info?.network || "";
  if (network && network !== WOLO_MAINNET_CHAIN_ID) {
    throw new Error(`Refusing to index ${network}; expected ${WOLO_MAINNET_CHAIN_ID}.`);
  }

  const latestHeight = Number.parseInt(
    payload.result?.sync_info?.latest_block_height || "0",
    10
  );
  if (!Number.isFinite(latestHeight) || latestHeight <= 0) {
    throw new Error("WoloChain RPC did not return a usable latest height.");
  }

  return latestHeight;
}

async function searchRestTxs(query: string, limit: number) {
  const requested = Math.max(1, Math.min(MAX_GLOBAL_LIMIT, Math.floor(limit)));
  const txs: ChainTxResponse[] = [];
  let offset = 0;

  while (txs.length < requested) {
    const pageLimit = Math.min(TX_SEARCH_PAGE_SIZE, requested - txs.length);
    const params = new URLSearchParams();
    params.set("query", query);
    params.set("order_by", "ORDER_BY_DESC");
    params.set("pagination.limit", String(pageLimit));
    params.set("pagination.offset", String(offset));

    const payload = await fetchJson<TxSearchPayload>(
      `${getRestUrl()}/cosmos/tx/v1beta1/txs?${params.toString()}`
    );

    if (payload.code) {
      throw new Error(payload.message || `REST tx search returned code ${payload.code}`);
    }

    const page = payload.tx_responses || [];
    txs.push(...page);
    if (page.length < pageLimit) break;
    offset += page.length;
  }

  return txs;
}

function parseUwoloAmount(message: ChainMessage) {
  const coin = message.amount?.find((item) => item.denom === WOLO_MAINNET_BASE_DENOM);
  if (!coin?.amount) return null;

  try {
    const amount = BigInt(coin.amount);
    return amount > BigInt(0) ? amount : null;
  } catch {
    return null;
  }
}

function parseBankSendTx(tx: ChainTxResponse): IndexedWoloTransfer[] {
  if (Number(tx.code || 0) !== 0) return [];

  const txHash = normalizeTxHash(tx.txhash);
  const height = Number.parseInt(tx.height || "0", 10);
  const timestamp = tx.timestamp ? new Date(tx.timestamp) : null;
  const messages = tx.tx?.body?.messages || [];
  if (!txHash || !Number.isFinite(height) || height <= 0 || !timestamp || Number.isNaN(timestamp.getTime())) {
    return [];
  }

  const transfers: IndexedWoloTransfer[] = [];
  for (const [messageIndex, message] of messages.entries()) {
    if (message["@type"] !== "/cosmos.bank.v1beta1.MsgSend") continue;

    const senderAddress = normalizeAddress(message.from_address);
    const recipientAddress = normalizeAddress(message.to_address);
    const amountUwolo = parseUwoloAmount(message);
    if (!senderAddress || !recipientAddress || !amountUwolo) continue;

    transfers.push({
      chainId: WOLO_MAINNET_CHAIN_ID,
      txHash,
      transferIndex: messageIndex,
      height: BigInt(height),
      timestamp,
      senderAddress,
      recipientAddress,
      amountUwolo,
      amountWoloDisplay: amountUwoloToDisplayString(amountUwolo),
      denom: WOLO_MAINNET_BASE_DENOM,
      memo: tx.tx?.body?.memo?.trim() || null,
      rawType: message["@type"],
      eventType: "direct_bank_send",
      source: WOLO_INDEXED_TRANSFER_SOURCE,
    });
  }

  return transfers;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>
) {
  const results: R[] = [];
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  );
  return results;
}

export async function buildWoloAddressBook(prisma: PrismaClient) {
  const book = new Map<string, WoloAddressBookEntry>();

  for (const wallet of WOLO_MAINNET_WALLET_ALIASES) {
    putAddress(book, wallet.address, {
      label: wallet.label,
      kind: addressBookKindForWalletAlias(wallet.role),
    });
  }

  putAddress(book, process.env.NEXT_PUBLIC_WOLO_STAKING_WALLET_ADDRESS, {
    label: "Staking wallet",
    kind: "staking_wallet",
  });
  putAddress(book, process.env.WOLO_STAKING_WALLET_ADDRESS, {
    label: "Staking wallet",
    kind: "staking_wallet",
  });
  putAddress(book, process.env.NEXT_PUBLIC_WOLO_BET_ESCROW_ADDRESS, {
    label: "Bet escrow",
    kind: "escrow",
  });
  putAddress(book, process.env.WOLO_BET_ESCROW_ADDRESS, {
    label: "Bet escrow",
    kind: "escrow",
  });
  putAddress(book, process.env.NEXT_PUBLIC_WOLO_CHALLENGE_ESCROW_ADDRESS, {
    label: "Challenge escrow",
    kind: "escrow",
  });
  putAddress(book, process.env.WOLO_CHALLENGE_ESCROW_ADDRESS, {
    label: "Challenge escrow",
    kind: "escrow",
  });

  for (const name of COMMUNITY_TREASURY_ENV_NAMES) {
    putAddress(book, envAddress(name), {
      label: "Community treasury",
      kind: "community_treasury",
    });
  }

  const [
    users,
    stakingPositions,
    stakingEvents,
    stakeIntents,
    wagers,
    scheduledMatches,
    scheduledSettlements,
  ] = await Promise.all([
    prisma.user.findMany({
      where: { walletAddress: { not: null } },
      select: {
        id: true,
        uid: true,
        inGameName: true,
        steamPersonaName: true,
        walletAddress: true,
      },
      take: 500,
    }),
    prisma.stakingPosition.findMany({
      where: { walletAddress: { not: null } },
      distinct: ["walletAddress"],
      select: {
        walletAddress: true,
        user: { select: { id: true, uid: true, inGameName: true, steamPersonaName: true } },
      },
      take: 200,
    }),
    prisma.stakingEvent.findMany({
      where: { walletAddress: { not: null } },
      distinct: ["walletAddress"],
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        walletAddress: true,
        user: { select: { id: true, uid: true, inGameName: true, steamPersonaName: true } },
      },
      take: 200,
    }),
    prisma.betStakeIntent.findMany({
      where: { walletAddress: { not: null } },
      distinct: ["walletAddress"],
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      select: {
        walletAddress: true,
        user: { select: { id: true, uid: true, inGameName: true, steamPersonaName: true } },
      },
      take: 200,
    }),
    prisma.betWager.findMany({
      where: { stakeWalletAddress: { not: null } },
      distinct: ["stakeWalletAddress"],
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      select: {
        stakeWalletAddress: true,
        user: { select: { id: true, uid: true, inGameName: true, steamPersonaName: true } },
      },
      take: 200,
    }),
    prisma.scheduledMatch.findMany({
      where: {
        OR: [
          { challengerFundingWalletAddress: { not: null } },
          { challengedFundingWalletAddress: { not: null } },
        ],
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      select: {
        challengerFundingWalletAddress: true,
        challengedFundingWalletAddress: true,
        challenger: { select: { id: true, uid: true, inGameName: true, steamPersonaName: true } },
        challenged: { select: { id: true, uid: true, inGameName: true, steamPersonaName: true } },
      },
      take: 200,
    }),
    prisma.scheduledMatchSettlement.findMany({
      where: {},
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      select: {
        recipientAddress: true,
        sourceWalletAddress: true,
      },
      take: 200,
    }),
  ]);

  for (const user of users) {
    putAddress(
      book,
      user.walletAddress,
      {
        label: displayUserName(user),
        kind: "user",
        userId: user.id,
        uid: user.uid,
      },
      { prefer: true }
    );
  }

  for (const position of stakingPositions) {
    putAddress(book, position.walletAddress, {
      label: displayUserName(position.user),
      kind: "user",
      userId: position.user.id,
      uid: position.user.uid,
    });
  }

  for (const event of stakingEvents) {
    putAddress(book, event.walletAddress, {
      label: displayUserName(event.user),
      kind: "user",
      userId: event.user.id,
      uid: event.user.uid,
    });
  }

  for (const intent of stakeIntents) {
    putAddress(book, intent.walletAddress, {
      label: displayUserName(intent.user),
      kind: "user",
      userId: intent.user.id,
      uid: intent.user.uid,
    });
  }

  for (const wager of wagers) {
    putAddress(book, wager.stakeWalletAddress, {
      label: displayUserName(wager.user),
      kind: "user",
      userId: wager.user.id,
      uid: wager.user.uid,
    });
  }

  for (const match of scheduledMatches) {
    putAddress(book, match.challengerFundingWalletAddress, {
      label: displayUserName(match.challenger),
      kind: "user",
      userId: match.challenger.id,
      uid: match.challenger.uid,
    });
    putAddress(book, match.challengedFundingWalletAddress, {
      label: displayUserName(match.challenged),
      kind: "user",
      userId: match.challenged.id,
      uid: match.challenged.uid,
    });
  }

  for (const settlement of scheduledSettlements) {
    putAddress(book, settlement.sourceWalletAddress, {
      label: "Tracked source wallet",
      kind: "tracked",
    });
    putAddress(book, settlement.recipientAddress, {
      label: "Tracked recipient wallet",
      kind: "tracked",
    });
  }

  return book;
}

async function upsertTransfer(prisma: PrismaClient, transfer: IndexedWoloTransfer) {
  const existing = await prisma.woloIndexedTransfer.findFirst({
    where: {
      txHash: transfer.txHash,
      transferIndex: transfer.transferIndex,
    },
    select: { id: true },
  });

  if (existing) {
    await prisma.woloIndexedTransfer.update({
      where: { id: existing.id },
      data: {
        chainId: transfer.chainId,
        height: transfer.height,
        timestamp: transfer.timestamp,
        senderAddress: transfer.senderAddress,
        recipientAddress: transfer.recipientAddress,
        amountUwolo: transfer.amountUwolo,
        amountWoloDisplay: transfer.amountWoloDisplay,
        denom: transfer.denom,
        memo: transfer.memo,
        rawType: transfer.rawType,
        eventType: transfer.eventType,
        source: transfer.source,
      },
    });
    return "updated";
  }

  await prisma.woloIndexedTransfer.create({
    data: {
      chainId: transfer.chainId,
      txHash: transfer.txHash,
      transferIndex: transfer.transferIndex,
      height: transfer.height,
      timestamp: transfer.timestamp,
      senderAddress: transfer.senderAddress,
      recipientAddress: transfer.recipientAddress,
      amountUwolo: transfer.amountUwolo,
      amountWoloDisplay: transfer.amountWoloDisplay,
      denom: transfer.denom,
      memo: transfer.memo,
      rawType: transfer.rawType,
      eventType: transfer.eventType,
      source: transfer.source,
    },
  });

  return "created";
}

export async function backfillWoloMainnetTransfers(
  prisma: PrismaClient,
  options: WoloTransferBackfillOptions = {}
): Promise<WoloTransferBackfillResult> {
  const blockLimit = clampInt(options.blockLimit, DEFAULT_BLOCK_LIMIT, MAX_BLOCK_LIMIT);
  const addressLimit = clampInt(options.addressLimit, DEFAULT_ADDRESS_LIMIT, MAX_ADDRESS_LIMIT);
  const perAddressLimit = clampInt(
    options.perAddressLimit,
    DEFAULT_PER_ADDRESS_LIMIT,
    MAX_PER_ADDRESS_LIMIT
  );
  const globalLimit = clampInt(options.globalLimit, DEFAULT_GLOBAL_LIMIT, MAX_GLOBAL_LIMIT);
  const latestHeight = await fetchMainnetHeight();
  const fromHeight = Math.max(1, latestHeight - blockLimit + 1);
  const addressBook = await buildWoloAddressBook(prisma);
  const addresses = Array.from(addressBook.keys()).slice(0, addressLimit);
  const queries = [
    {
      label: "recent-msg-send",
      query: `message.action='/cosmos.bank.v1beta1.MsgSend' AND tx.height>=${fromHeight}`,
      limit: globalLimit,
    },
    ...addresses.flatMap((address) => [
      {
        label: `sender:${address}`,
        query: `transfer.sender='${address}' AND tx.height>=${fromHeight}`,
        limit: perAddressLimit,
      },
      {
        label: `recipient:${address}`,
        query: `transfer.recipient='${address}' AND tx.height>=${fromHeight}`,
        limit: perAddressLimit,
      },
    ]),
  ];
  const errors: string[] = [];
  const txsByHash = new Map<string, ChainTxResponse>();

  await mapWithConcurrency(queries, QUERY_CONCURRENCY, async (item) => {
    try {
      const txs = await searchRestTxs(item.query, item.limit);
      for (const tx of txs) {
        const txHash = normalizeTxHash(tx.txhash);
        if (txHash) txsByHash.set(txHash, tx);
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : "unknown search failure";
      errors.push(`${item.label}: ${detail}`);
    }
  });

  let transfersParsed = 0;
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const txHashes: string[] = [];

  for (const tx of txsByHash.values()) {
    const transfers = parseBankSendTx(tx);
    if (transfers.length === 0) {
      skipped += 1;
      continue;
    }

    for (const transfer of transfers) {
      transfersParsed += 1;
      const outcome = await upsertTransfer(prisma, transfer);
      if (outcome === "created") created += 1;
      else updated += 1;
      txHashes.push(
        transfer.transferIndex > 0
          ? `${transfer.txHash}#${transfer.transferIndex}`
          : transfer.txHash
      );
    }
  }

  return {
    ok: errors.length === 0,
    chainId: WOLO_MAINNET_CHAIN_ID,
    restUrl: getRestUrl(),
    rpcUrl: getRpcUrl(),
    mode: "rest_tx_search",
    latestHeight,
    fromHeight,
    blockLimit,
    addressCount: addresses.length,
    queriesAttempted: queries.length,
    txsSeen: txsByHash.size,
    transfersParsed,
    created,
    updated,
    skipped,
    errors: errors.slice(0, 12),
    txHashes,
  };
}

export async function loadIndexedWoloTransferActivityRows(
  prisma: PrismaClient,
  limit = 20,
  options: { before?: Date | string | null; offset?: number | null } = {}
): Promise<WoloIndexedTransferActivityRow[]> {
  const before =
    options.before instanceof Date
      ? options.before
      : options.before
        ? new Date(options.before)
        : null;
  const timestampWhere =
    before && !Number.isNaN(before.getTime()) ? { lt: before } : undefined;

  const [addressBook, rows] = await Promise.all([
    buildWoloAddressBook(prisma),
    prisma.woloIndexedTransfer.findMany({
      where: {
        chainId: WOLO_MAINNET_CHAIN_ID,
        denom: WOLO_MAINNET_BASE_DENOM,
        source: WOLO_INDEXED_TRANSFER_SOURCE,
        ...(timestampWhere ? { timestamp: timestampWhere } : {}),
        NOT: [
          {
            senderAddress: WOLO_MAINNET_FAUCET_HOT_WALLET_ADDRESS,
            amountUwolo: FAUCET_CLAIM_AMOUNT_UWOLO_BIGINT,
          },
        ],
      },
      orderBy: [{ timestamp: "desc" }, { height: "desc" }, { id: "desc" }],
      skip: Math.max(0, Math.min(10_000, Math.floor(options.offset ?? 0))),
      take: Math.max(1, Math.min(100, limit)),
    }),
  ]);

  return rows.filter((row) => !isIndexedFaucetClaimTransfer(row)).map((row) => {
    const senderAddress = row.senderAddress.toLowerCase();
    const recipientAddress = row.recipientAddress.toLowerCase();
    const sender = addressBook.get(senderAddress) || null;
    const recipient = addressBook.get(recipientAddress) || null;
    const amountWolo = Number(row.amountWoloDisplay);

    return {
      key: `tx-${row.txHash}-${row.transferIndex}`,
      txHash: row.txHash,
      transferIndex: row.transferIndex,
      height: row.height.toString(),
      timestamp: row.timestamp.toISOString(),
      senderAddress,
      senderLabel: sender?.label ?? null,
      recipientAddress,
      recipientLabel: recipient?.label ?? null,
      amountUwolo: row.amountUwolo.toString(),
      amountWolo: Number.isFinite(amountWolo) ? amountWolo : 0,
      amountLabel: amountLabelFromDisplay(Number.isFinite(amountWolo) ? amountWolo : 0),
      memo: row.memo,
      source: row.source,
    };
  });
}

export async function loadWoloIndexedTransferDashboard(
  prisma: PrismaClient,
  limit = 10
): Promise<WoloIndexedTransferDashboard> {
  const [addressBook, rows, totalRows, latest] = await Promise.all([
    buildWoloAddressBook(prisma),
    prisma.woloIndexedTransfer.findMany({
      where: { chainId: WOLO_MAINNET_CHAIN_ID, source: WOLO_INDEXED_TRANSFER_SOURCE },
      orderBy: [{ timestamp: "desc" }, { height: "desc" }, { id: "desc" }],
      take: Math.max(1, Math.min(25, limit)),
    }),
    prisma.woloIndexedTransfer.count({
      where: { chainId: WOLO_MAINNET_CHAIN_ID, source: WOLO_INDEXED_TRANSFER_SOURCE },
    }),
    prisma.woloIndexedTransfer.findFirst({
      where: { chainId: WOLO_MAINNET_CHAIN_ID, source: WOLO_INDEXED_TRANSFER_SOURCE },
      orderBy: [{ timestamp: "desc" }, { height: "desc" }, { id: "desc" }],
      select: { timestamp: true },
    }),
  ]);

  const activityRows = rows.map((row) => {
    const senderAddress = row.senderAddress.toLowerCase();
    const recipientAddress = row.recipientAddress.toLowerCase();
    const sender = addressBook.get(senderAddress) || null;
    const recipient = addressBook.get(recipientAddress) || null;
    const amountWolo = Number(row.amountWoloDisplay);

    return {
      key: `tx-${row.txHash}-${row.transferIndex}`,
      txHash: row.txHash,
      transferIndex: row.transferIndex,
      height: row.height.toString(),
      timestamp: row.timestamp.toISOString(),
      senderAddress,
      senderLabel: sender?.label ?? null,
      senderKind: sender?.kind ?? null,
      recipientAddress,
      recipientLabel: recipient?.label ?? null,
      recipientKind: recipient?.kind ?? null,
      amountUwolo: row.amountUwolo.toString(),
      amountWolo: Number.isFinite(amountWolo) ? amountWolo : 0,
      amountLabel: amountLabelFromDisplay(Number.isFinite(amountWolo) ? amountWolo : 0),
      memo: row.memo,
      source: row.source,
    };
  });

  return {
    source: WOLO_INDEXED_TRANSFER_SOURCE,
    totalRows,
    latestTimestamp: latest?.timestamp.toISOString() ?? null,
    rows: activityRows,
    notes: [
      "Indexed from WoloChain mainnet REST tx search.",
      "Backfill is capped and read-only; it stores successful /cosmos.bank.v1beta1.MsgSend transfers only.",
    ],
  };
}
