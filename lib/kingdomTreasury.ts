
/**
 * Kingdom Treasury V1: read-only public view contracts.
 * No per-player aggregate balances, inferred transaction purposes,
 * fabricated fiat conversions, or generated transfer events.
 */
export type TreasuryHolder = {
  address: string;
  alias: string;
  role: string;
  use: string | null;
  classification: "protocol" | "player" | "unclassified";
  balanceWoloFormatted: string | null;
  balanceHidden: boolean;
  firstSeenAt?: string | null;
};

export type TreasuryHolders = {
  chainId: "wolo-1";
  denom: "uwolo";
  view: "public";
  balancePolicy: "protocol_system_only";
  updatedAt: string;
  count: number;
  currentNonzeroOwnerCount: number;
  retainedTransferAddressCount: number;
  holders: TreasuryHolder[];
};

export type TreasuryNetworkAccount = {
  address: string;
  label: string;
  role: string;
  use: string;
  isModule: boolean;
  isRetired: boolean;
  isUserFacing: boolean;
  amountWoloFormatted: string;
};
export type TreasuryNetwork = {
  chainId: "wolo-1";
  denom: "uwolo";
  count: number;
  registryAddressCount: number;
  liveOwnerCount: number;
  accounts: TreasuryNetworkAccount[];
};

export type TreasuryPool = {
  ok: true;
  poolId: string;
  poolUrl: string;
  source: string;
  updatedAt: string;
  pairLabel: "WOLO / USDC";
  priceUsd: number;
  reserveWolo: number;
  reserveUsdc: number;
  liquidityUsd: number;
};

export type TreasuryTransfer = {
  key: string;
  txHash: string;
  timestamp: string;
  senderAddress: string;
  senderLabel: string | null;
  recipientAddress: string;
  recipientLabel: string | null;
  senderKind: string | null;
  recipientKind: string | null;
  amountWolo: number;
  amountLabel: string;
  source: string;
};

export type TreasuryTransfers = {
  ok: true;
  source: string;
  latestTimestamp: string | null;
  totalRows: number;
  rows: TreasuryTransfer[];
};

export type TreasuryCost = {
  id: string;
  name: string;
  amount: number;
  currency: "reported-$";
  billing: "monthly" | "unconfirmed";
  status: "reported-active" | "planned-unpaid";
  note: string;
};

// Self-reported founder costs, NOT invoice / bank payment evidence.
// The $ denomination has not yet been independently confirmed as CAD or USD.
export const REPORTED_TREASURY_COSTS: readonly TreasuryCost[] = [
  { id: "chatgpt", name: "ChatGPT", amount: 24.99, currency: "reported-$", billing: "monthly", status: "reported-active", note: "Founder reported · Oct 12, 2026" },
  { id: "hetzner", name: "Hetzner VPS", amount: 31.95, currency: "reported-$", billing: "monthly", status: "reported-active", note: "Founder reported · Oct 12, 2026" },
  { id: "azure", name: "Microsoft / Azure signing", amount: 14.95, currency: "reported-$", billing: "monthly", status: "reported-active", note: "Founder reported · Oct 12, 2026" },
  { id: "apple", name: "Apple developer program", amount: 99, currency: "reported-$", billing: "unconfirmed", status: "planned-unpaid", note: "Not yet paid · billing cadence unconfirmed" },
] as const;

export const TREASURY_FAUCET_INCIDENT = {
  date: "2026-08-18",
  successfulClaims: 653,
  payoutWolo: 2,
  grossOutflowWolo: 1306,
  walletOnwardTransfers: 647,
  commonDestinationRecipients: 644,
  provenance: "docs/WOLO_FAUCET_SECURITY.md",
} as const;

export function reportedMonthlyOutlay(costs: readonly TreasuryCost[] = REPORTED_TREASURY_COSTS) {
  return Math.round(costs.filter((cost) => cost.billing === "monthly" && cost.status === "reported-active")
    .reduce((sum, cost) => sum + cost.amount, 0) * 100) / 100;
}

export function isPublicTreasuryHolders(value: unknown): value is TreasuryHolders {
  if (!value || typeof value !== "object") return false;
  const p = value as Partial<TreasuryHolders>;
  return p.chainId === "wolo-1" && p.denom === "uwolo" &&
    p.view === "public" && p.balancePolicy === "protocol_system_only" &&
    typeof p.count === "number" && Number.isSafeInteger(p.count) &&
    p.count >= 0 && Array.isArray(p.holders) && p.holders.length === p.count &&
    typeof p.currentNonzeroOwnerCount === "number" &&
    typeof p.retainedTransferAddressCount === "number" &&
    typeof p.updatedAt === "string" &&
    p.holders.every((h) =>
      !!h && typeof h.address === "string" && /^wolo1[0-9a-z]{30,90}$/.test(h.address) &&
      typeof h.alias === "string" && ["protocol","player","unclassified"].includes(h.classification) &&
      (h.classification === "protocol"
        ? h.balanceHidden === false && typeof h.balanceWoloFormatted === "string"
        : h.balanceHidden === true && h.balanceWoloFormatted === null)
    );
}

export function isTreasuryPool(value: unknown): value is TreasuryPool {
  if (!value || typeof value !== "object") return false;
  const p = value as Partial<TreasuryPool>;
  return p.ok === true && typeof p.poolId === "string" &&
    typeof p.poolUrl === "string" && p.poolUrl.startsWith("https://app.osmosis.zone/pool/") &&
    p.pairLabel === "WOLO / USDC" && typeof p.updatedAt === "string" &&
    [p.priceUsd,p.reserveWolo,p.reserveUsdc,p.liquidityUsd].every((n) =>
      typeof n === "number" && Number.isFinite(n) && n >= 0);
}

export function isTreasuryNetwork(value: unknown): value is TreasuryNetwork {
  if (!value || typeof value !== "object") return false;
  const n = value as Partial<TreasuryNetwork>;
  return n.chainId === "wolo-1" && n.denom === "uwolo" &&
    typeof n.count === "number" && Number.isSafeInteger(n.count) &&
    typeof n.registryAddressCount === "number" && typeof n.liveOwnerCount === "number" &&
    Array.isArray(n.accounts) && n.count === n.accounts.length &&
    n.accounts.every((a) => !!a && typeof a.address === "string" &&
      /^wolo1[0-9a-z]{30,90}$/.test(a.address) && typeof a.label === "string" &&
      typeof a.role === "string" && typeof a.isModule === "boolean" &&
      typeof a.isRetired === "boolean" && typeof a.isUserFacing === "boolean");
}

export function isTreasuryTransfers(value: unknown): value is TreasuryTransfers {
  if (!value || typeof value !== "object") return false;
  const t = value as Partial<TreasuryTransfers>;
  return t.ok === true && t.source === "wolo-mainnet-bank-send" &&
    typeof t.totalRows === "number" && Number.isSafeInteger(t.totalRows) &&
    Array.isArray(t.rows) && t.rows.length <= 25 &&
    t.rows.every((row) => !!row && typeof row.txHash === "string" &&
      typeof row.senderAddress === "string" &&
      typeof row.recipientAddress === "string" &&
      typeof row.amountWolo === "number" && Number.isFinite(row.amountWolo));
}

/** Exact unencumbered reserve labels authorized by lib/kingdomSummary.ts. */
export const KINGDOM_RESERVE_LABELS = new Set([
  "Community Treasury",
  "DEX Liquidity Reserve",
  "Faucet Growth Reserve",
  "Faucet Hot Wallet",
  "Validator Ops",
  "Ecosystem Bounties",
  "Workshop Sponsorships",
  "Wolo-Osmosis Relayer Gas",
]);

export function disclosedKingdomReserveBalance(
  accounts: readonly { label: string; publicBalance: string | null }[]
) {
  const sources = accounts.filter((a) => KINGDOM_RESERVE_LABELS.has(a.label));
  if (sources.length !== KINGDOM_RESERVE_LABELS.size || sources.some((a) => a.publicBalance === null)) {
    return null;
  }
  return sources.reduce((sum, a) => {
    const amount = Number((a.publicBalance || "").replace(/,/g, ""));
    return Number.isFinite(amount) && amount >= 0 ? sum + amount : NaN;
  }, 0);
}

export function publicSystemAccounts(network: TreasuryNetwork, holders: TreasuryHolders) {
  const currentProtocol = new Map(holders.holders
    .filter((h) => h.classification === "protocol")
    .map((h) => [h.address.toLowerCase(), h] as const));

  // Registered infrastructure may have a zero balance and therefore not be a
  // current holder. Its network count MUST NOT be added to current holders.
  const accounts = network.accounts.filter((account) =>
    !account.isRetired && !account.isUserFacing && account.role !== "user"
  ).map((account) => ({
    ...account,
    publicBalance: currentProtocol.get(account.address.toLowerCase())?.balanceWoloFormatted ?? null,
    currentHolder: currentProtocol.has(account.address.toLowerCase()),
  }));
  return accounts;
}

export function observedKingdomOutflows(
  rows: readonly TreasuryTransfer[],
  systemAccounts: readonly { address: string }[]
) {
  const senders = new Set(systemAccounts.map((a) => a.address.toLowerCase()));
  return rows.filter((row) => senders.has(row.senderAddress.toLowerCase()));
}
