import type { Prisma, PrismaClient } from "@/lib/generated/prisma";
import {
  BETTING_FEE_RATE_BPS,
  BPS_DENOMINATOR,
  STAKER_SHARE_BPS,
} from "@/lib/bettingFees";
import { buildStakingTreasuryPayoutRequestId } from "@/lib/stakingTreasuryPayouts";
import {
  executeWoloSettlementRun,
  getWoloPayoutExecutionBlocker,
  hasWoloPayoutExecutionConfigured,
  validateWoloAddress,
  validateWoloSettlementRun,
  type SettlementRunResult,
} from "@/lib/woloBetSettlement";
import {
  loadWoloMainnetActivityRows,
  type WoloMainnetActivityRow,
} from "@/lib/woloTransactionRecovery";
import {
  loadMainnetStakingPositions,
} from "@/lib/mainnetStakingPositions";
import {
  derivePendingSettlementActivityGroups,
  type PendingSettlementActivityGroup,
} from "@/lib/mainnetSettlementActivity";
import {
  loadIndexedWoloTransferActivityRows,
  type WoloIndexedTransferActivityRow,
} from "@/lib/woloMainnetTransfers";
import { getWoloMainnetDisplayStartAt, isWoloMainnet } from "@/lib/woloChain";

export {
  BETTING_FEE_RATE_BPS,
  BPS_DENOMINATOR,
  STAKER_SHARE_BPS,
} from "@/lib/bettingFees";

export type StakingPeriodKey = "24h" | "7d" | "30d" | "all";
export type StakingBoardKey = "stakers" | "earners" | "rewards";
export type StakingActionType = "STAKE" | "UNSTAKE" | "CLAIM" | "ADJUSTMENT";
export type StakingActivityMode = "ledger" | "grouped";
export type StakingActivityFilter = "all" | "staking" | "bets" | "transfers";

export type StakingActivityItem = {
  key?: string;
  label: string;
  detail: string;
  meta: string;
  eventType?: string;
  amountLabel?: string;
  txFeeLabel?: string;
  timestampLabel?: string;
  occurredAt?: string;
  txHash?: string;
  txUrl?: string;
  children?: StakingActivityItem[];
  tone: "amber" | "emerald" | "sky" | "slate";
};

export type StakingActivityPage = {
  generatedAt: string;
  rows: StakingActivityItem[];
  hasMore: boolean;
  nextBefore: string | null;
};

export type StakingSummary = {
  period: StakingPeriodKey;
  generatedAt: string;
  dataLive: boolean;
  betsPlaced: number;
  betVolumeWolo: number;
  payoutWolo: number;
  settledVolumeWolo: number;
  stakerFeePoolWolo: number;
  treasuryShareWolo: number;
  activeBettors: number;
  activePlayers: number;
  activeStakers: number;
  totalStakedWolo: number;
  totalStakingWeight: string;
  directTransferCount: number;
  activity: StakingActivityItem[];
};

export type StakingRewardPayoutRun = {
  distributionId: number;
  distributionDate: string;
  payoutExecutionConfigured: boolean;
  settlementRunId: string | null;
  requestedPayouts: number;
  executedPayouts: number;
  skippedPayouts: number;
  status: "confirmed" | "partial" | "skipped" | "not_configured" | "failed";
  detail: string;
  validation: SettlementRunResult | null;
  execution: SettlementRunResult | null;
};

export type StakingLeaderboardRow = {
  player: string;
  badge: string;
  stakedWolo: number;
  rewardsWolo: number;
  stakingWeight: string;
  status: string;
  tone: "gold" | "emerald" | "sky" | "slate";
};

export type StakingLeaderboard = {
  board: StakingBoardKey;
  rows: StakingLeaderboardRow[];
  topStakers: StakingLeaderboardRow[];
  topEarners: StakingLeaderboardRow[];
  topWeight: StakingLeaderboardRow[];
  recentRewards: StakingLeaderboardRow[];
};

export class StakingActionError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "StakingActionError";
    this.status = status;
  }
}

type PositionForWeight = {
  id?: number;
  currentStakedWolo: number;
  accumulatedWeight: bigint;
  lastWeightUpdateAt: Date;
};

type DisplayUser = {
  uid: string;
  inGameName: string | null;
  steamPersonaName: string | null;
};

export const STAKING_PERIODS: Array<{
  key: StakingPeriodKey;
  label: string;
  days: number | null;
}> = [
  { key: "24h", label: "24H", days: 1 },
  { key: "7d", label: "7D", days: 7 },
  { key: "30d", label: "30D", days: 30 },
  { key: "all", label: "All-Time", days: null },
];

export function getStakingPeriodStart(period: StakingPeriodKey, now = new Date()) {
  const config = STAKING_PERIODS.find((item) => item.key === period);
  if (!config?.days) return null;
  return new Date(now.getTime() - config.days * 24 * 60 * 60 * 1000);
}

export function normalizeStakingPeriod(value: string | null | undefined): StakingPeriodKey {
  return value === "7d" || value === "30d" || value === "all" ? value : "24h";
}

export function normalizeStakingBoard(value: string | null | undefined): StakingBoardKey {
  return value === "earners" || value === "rewards" ? value : "stakers";
}

function visibleMainnetWagerWhere(
  extra: Prisma.BetWagerWhereInput = {}
): Prisma.BetWagerWhereInput {
  if (!isWoloMainnet()) return extra;
  return {
    ...extra,
    executionMode: "onchain_escrow",
    stakeTxHash: { not: null },
    stakeLockedAt: { gte: getWoloMainnetDisplayStartAt() },
    stakeIntent: {
      is: {
        status: "recorded",
      },
    },
  };
}

function mainnetDisplayDateWhere(
  field: "createdAt" | "creditedAt" = "createdAt"
): Record<string, unknown> {
  if (!isWoloMainnet()) return {};
  return {
    [field]: { gte: getWoloMainnetDisplayStartAt() },
  };
}

export function computeCurrentStakingWeight(position: PositionForWeight, now = new Date()) {
  const seconds = Math.max(
    0,
    Math.floor((now.getTime() - position.lastWeightUpdateAt.getTime()) / 1000)
  );
  return position.accumulatedWeight + BigInt(position.currentStakedWolo) * BigInt(seconds);
}

export function formatStakingWeight(value: bigint | string | number) {
  const raw = typeof value === "bigint" ? value : BigInt(value || 0);
  if (raw === BigInt(0)) return "--";
  return raw.toString();
}

export function calculateModeledFeePools(settledVolumeWolo: number) {
  const bettingFeePoolWolo = (settledVolumeWolo * BETTING_FEE_RATE_BPS) / BPS_DENOMINATOR;
  const stakerPoolWolo = (bettingFeePoolWolo * STAKER_SHARE_BPS) / BPS_DENOMINATOR;
  return {
    bettingFeePoolWolo,
    stakerPoolWolo,
    treasuryPoolWolo: bettingFeePoolWolo - stakerPoolWolo,
  };
}

export function calculateLedgerFeePools(settledVolumeWolo: number) {
  const bettingFeePoolWolo = Math.round(
    (settledVolumeWolo * BETTING_FEE_RATE_BPS) / BPS_DENOMINATOR
  );
  const stakerPoolWolo = Math.floor((bettingFeePoolWolo * STAKER_SHARE_BPS) / BPS_DENOMINATOR);
  return {
    bettingFeePoolWolo,
    stakerPoolWolo,
    treasuryPoolWolo: bettingFeePoolWolo - stakerPoolWolo,
  };
}

function displayPlayerName(input: DisplayUser) {
  return input.inGameName?.trim() || input.steamPersonaName?.trim() || input.uid;
}

function formatMoment(value: Date) {
  return value.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatActivityWoloAmount(value: number | null | undefined) {
  const amount = Number(value ?? 0);
  return `${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: Number.isInteger(amount) ? 0 : 3,
    minimumFractionDigits: 0,
  }).format(amount)} WOLO`;
}

function formatActivityTimestamp(value: Date | string | null | undefined) {
  if (!value) return "Ledger";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Ledger";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function extractActivityTxHash(item: StakingActivityItem) {
  const keyMatch = String(item.key || "").match(/tx-([A-Fa-f0-9]{64})/);
  if (keyMatch?.[1]) return keyMatch[1].toUpperCase();

  const detailMatch = String(item.detail || "").match(/\btx\s+([A-Fa-f0-9]{64})\b/);
  if (detailMatch?.[1]) return detailMatch[1].toUpperCase();

  return null;
}

function stripMemoForUi(value: string) {
  return value
    .replace(/\bmemo\s+/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function attachActivityTxFields(item: StakingActivityItem): StakingActivityItem {
  const txHash = item.txHash || extractActivityTxHash(item) || undefined;
  return {
    ...item,
    label: stripMemoForUi(item.label || ""),
    detail: stripMemoForUi(item.detail || ""),
    txHash,
    txUrl: item.txUrl || (txHash ? `/api/wolo/tx/${txHash}` : undefined),
  };
}

function cleanBetActivityMatchLabel(value: string) {
  return value
    .replace(/\bmemo\s+/gi, "")
    .replace(/\s+/g, " ")
    .replace(/\s+·.*$/g, "")
    .trim();
}

function extractBetActivityMatch(item: StakingActivityItem) {
  const text = `${item.label || ""} · ${item.detail || ""}`;

  const memoMatch = text.match(/memo\s+([^·]{2,96}?\s+vs\s+[^·]{2,96}?)(?=\s*·|\s*$)/i);
  if (memoMatch?.[1]) {
    const label = cleanBetActivityMatchLabel(memoMatch[1]);
    return label || null;
  }

  const settlementMatch = text.match(/settlement queue:\s*([^·]{2,96}?\s+vs\s+[^·]{2,96}?)(?=\s*·|\s*$)/i);
  if (settlementMatch?.[1]) {
    const label = cleanBetActivityMatchLabel(settlementMatch[1]);
    return label || null;
  }

  const looseMatch = text.match(/([^·:]{2,96}?\s+vs\s+[^·]{2,96}?)(?=\s*·|\s*$)/i);
  if (looseMatch?.[1]) {
    const label = cleanBetActivityMatchLabel(looseMatch[1]);
    if (!/^aoe2hdbets bet stake/i.test(label)) return label;
  }

  return null;
}

function groupedBetRowKind(item: StakingActivityItem) {
  const eventType = String(item.eventType || "").toUpperCase();
  const text = `${item.label || ""} ${item.detail || ""}`.toLowerCase();

  if (eventType === "SETTLEMENT" || text.includes("settlement queue") || text.includes("pending claim")) {
    return "pending settlement";
  }
  if (eventType === "ESCROW" || text.includes("bet stake") || text.includes("escrow")) {
    return "escrow";
  }
  if (eventType === "PAYOUT" || text.includes("bet_payout") || text.includes("bet payout")) {
    return "payout";
  }
  if (text.includes("founders_win")) return "founder win";
  if (text.includes("founders_bonus") || text.includes("founders bonus")) return "founder bonus";
  if (eventType === "DIRECT") return "transfer";

  return eventType ? eventType.toLowerCase() : "activity";
}

function groupStakingBetActivityItems(items: StakingActivityItem[], limit: number): StakingActivityItem[] {
  type Group = {
    label: string;
    rows: StakingActivityItem[];
    newestAt: string;
    amountTotal: number;
    hasSettlement: boolean;
    hasPayout: boolean;
    hasEscrow: boolean;
    hasFounder: boolean;
  };

  const groups = new Map<string, Group>();

  for (const item of items) {
    const matchLabel = extractBetActivityMatch(item);
    if (!matchLabel) continue;

    const key = matchLabel.toLowerCase();
    const occurredAt = item.occurredAt || new Date(0).toISOString();
    const amount = Number.parseFloat(String(item.amountLabel || "0").replace(/[^0-9.]/g, "")) || 0;
    const kind = groupedBetRowKind(item);

    const group = groups.get(key) ?? {
      label: matchLabel,
      rows: [],
      newestAt: occurredAt,
      amountTotal: 0,
      hasSettlement: false,
      hasPayout: false,
      hasEscrow: false,
      hasFounder: false,
    };

    group.rows.push(item);
    group.amountTotal += amount;
    group.hasSettlement = group.hasSettlement || kind === "pending settlement";
    group.hasPayout = group.hasPayout || kind === "payout";
    group.hasEscrow = group.hasEscrow || kind === "escrow";
    group.hasFounder = group.hasFounder || kind === "founder bonus" || kind === "founder win";

    if (Date.parse(occurredAt) > Date.parse(group.newestAt)) {
      group.newestAt = occurredAt;
    }

    groups.set(key, group);
  }

  return Array.from(groups.values())
    .map((group) => {
      const phases = [
        group.hasEscrow ? "escrow" : null,
        group.hasFounder ? "founder rewards" : null,
        group.hasPayout ? "payout" : null,
        group.hasSettlement ? "pending settlement" : null,
      ].filter(Boolean);

      const rowSummary = group.rows
        .slice(0, 5)
        .map((row) => {
          const amount = row.amountLabel ? ` ${row.amountLabel}` : "";
          return `${groupedBetRowKind(row)}${amount}`;
        })
        .join(" · ");

      const children = group.rows
        .sort((left, right) => {
          const leftTime = Date.parse(left.occurredAt || "");
          const rightTime = Date.parse(right.occurredAt || "");
          return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
        })
        .map((row) => attachActivityTxFields({
          ...row,
          label: `${groupedBetRowKind(row)}${row.amountLabel ? ` · ${row.amountLabel}` : ""}`,
        }));

      return {
        key: `grouped-bet-${group.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        label: group.label,
        detail: `${phases.length ? phases.join(" · ") : "bet activity"}${rowSummary ? ` · ${rowSummary}` : ""}`,
        meta: formatActivityTimestamp(group.newestAt),
        eventType: "GROUPED BET",
        amountLabel: group.amountTotal > 0 ? formatActivityWoloAmount(group.amountTotal) : undefined,
        timestampLabel: formatActivityTimestamp(group.newestAt),
        occurredAt: group.newestAt,
        children,
        tone: group.hasSettlement ? "sky" : group.hasPayout ? "emerald" : group.hasEscrow ? "amber" : "slate",
      } satisfies StakingActivityItem;
    })
    .sort((left, right) => {
      const leftTime = Date.parse(left.occurredAt || "");
      const rightTime = Date.parse(right.occurredAt || "");
      return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
    })
    .slice(0, limit);
}

function formatActivityWolo(value: number) {
  return `${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: value >= 10_000 ? 1 : Number.isInteger(value) ? 0 : 2,
    notation: value >= 10_000 ? "compact" : "standard",
  }).format(value)} WOLO`;
}

function formatTxFee(value: number | null | undefined) {
  if (!value || value <= 0) return null;
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  }).format(value);
}

function shortHash(value: string | null | undefined) {
  const clean = value?.trim();
  if (!clean) return null;
  if (clean.length <= 16) return clean;
  return `${clean.slice(0, 8)}...${clean.slice(-6)}`;
}

function shortAddress(value: string | null | undefined) {
  const clean = value?.trim();
  if (!clean) return null;
  if (clean.length <= 18) return clean;
  return `${clean.slice(0, 10)}...${clean.slice(-6)}`;
}

export function isPublicStakingActivityItem(item: StakingActivityItem) {
  return (
    item.eventType !== "FAUCET" &&
    (item.eventType === "CYCLE" ||
      item.eventType === "REWARD" ||
      item.eventType === "PAYOUT" ||
      item.eventType === "SETTLEMENT" ||
      item.eventType === "DIRECT" ||
      item.eventType === "GIFT" ||
      (item.key?.startsWith("tx-") ?? false) ||
      /\btx\s+[0-9a-f]{8}/i.test(item.detail))
  );
}

function indexedTransferToActivityItem(
  row: WoloIndexedTransferActivityRow,
  now = new Date()
): StakingActivityItem & { sortAt: Date } {
  const timestamp = new Date(row.timestamp);
  const safeTimestamp = Number.isNaN(timestamp.getTime()) ? now : timestamp;
  const timestampLabel = formatMoment(safeTimestamp);

  return {
    key: row.key,
    label: labelForIndexedTransfer(row),
    detail: detailForIndexedTransfer(row),
    meta: timestampLabel,
    eventType: "DIRECT",
    amountLabel: row.amountLabel,
    timestampLabel,
    occurredAt: safeTimestamp.toISOString(),
    tone: "emerald",
    sortAt: safeTimestamp,
  };
}

function eventTypeForMainnetActivity(row: WoloMainnetActivityRow) {
  if (row.actionType === "faucet_claim") return "FAUCET";
  if (row.actionType === "stake") return "STAKE";
  if (row.actionType === "unstake") return "UNSTAKE";
  if (row.actionType === "bet_challenge_escrow") return "ESCROW";
  if (row.actionType === "payout_settlement") return "PAYOUT";
  return "TX";
}

function toneForMainnetActivity(row: WoloMainnetActivityRow): StakingActivityItem["tone"] {
  if (row.actionType === "payout_settlement") return "emerald";
  if (row.actionType === "faucet_claim") return "slate";
  if (row.actionType === "bet_challenge_escrow") return "sky";
  if (row.actionType === "stake" || row.actionType === "unstake") return "amber";
  return "slate";
}

function labelForMainnetActivity(row: WoloMainnetActivityRow) {
  const actor = row.userLabel || shortAddress(row.walletAddress) || "wallet";
  const amount = row.amountWolo != null ? formatActivityWolo(row.amountWolo) : "WOLO";
  return `${amount} ${row.actionLabel.toLowerCase()}: ${actor}`;
}

function labelForIndexedTransfer(row: WoloIndexedTransferActivityRow) {
  return `${row.amountLabel} direct transfer`;
}

function detailForIndexedTransfer(row: WoloIndexedTransferActivityRow) {
  const sender = row.senderLabel || shortAddress(row.senderAddress) || "wallet";
  const recipient = row.recipientLabel || shortAddress(row.recipientAddress) || "wallet";
  const txLabel = shortHash(row.txHash);
  const parts = [`${sender} -> ${recipient}`, txLabel ? `tx ${txLabel}` : null];
  if (row.memo) parts.push(`memo ${row.memo.slice(0, 80)}`);
  return parts.filter(Boolean).join(" · ");
}


type WoloGiftActivityRow = {
  id: number;
  kind: string;
  amount: number | null;
  note: string | null;
  status: string;
  acceptedAt: Date | null;
  createdAt: Date;
  user: DisplayUser;
};

function giftCreatedAtWhere(before?: Date | string | null): Prisma.DateTimeFilter | undefined {
  const createdAt: Prisma.DateTimeFilter = {};

  if (isWoloMainnet()) {
    createdAt.gte = getWoloMainnetDisplayStartAt();
  }

  if (before) {
    const parsed = before instanceof Date ? before : new Date(before);
    if (!Number.isNaN(parsed.getTime())) {
      createdAt.lt = parsed;
    }
  }

  return Object.keys(createdAt).length ? createdAt : undefined;
}

async function loadRecentWoloGiftActivityRows(
  prisma: PrismaClient,
  take = 12,
  before?: Date | string | null
): Promise<WoloGiftActivityRow[]> {
  const createdAt = giftCreatedAtWhere(before);

  return prisma.userGift.findMany({
    where: {
      kind: "WOLO",
      amount: { gt: 0 },
      status: { in: ["pending", "accepted"] },
      ...(createdAt ? { createdAt } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: Math.max(1, take),
    select: {
      id: true,
      kind: true,
      amount: true,
      note: true,
      status: true,
      acceptedAt: true,
      createdAt: true,
      user: {
        select: {
          uid: true,
          inGameName: true,
          steamPersonaName: true,
        },
      },
    },
  });
}

function giftToActivityItem(
  row: WoloGiftActivityRow,
  now = new Date()
): StakingActivityItem & { sortAt: Date } {
  const timestamp = row.acceptedAt ?? row.createdAt;
  const safeTimestamp = Number.isNaN(timestamp.getTime()) ? now : timestamp;
  const timestampLabel = formatMoment(safeTimestamp);
  const player = displayPlayerName(row.user);
  const amountLabel = row.amount != null ? formatActivityWolo(row.amount) : undefined;
  const statusLabel = row.status === "accepted" ? "Accepted app gift" : "Claimable app gift";

  return {
    key: `gift-${row.id}`,
    label: `${amountLabel ?? row.kind} gift: ${player}`,
    detail: [statusLabel, row.note?.trim() || null].filter(Boolean).join(" · "),
    meta: timestampLabel,
    eventType: "GIFT",
    amountLabel,
    timestampLabel,
    occurredAt: safeTimestamp.toISOString(),
    tone: row.status === "accepted" ? "emerald" : "sky",
    sortAt: safeTimestamp,
  };
}


function detailForPendingSettlement(row: PendingSettlementActivityGroup) {
  const targetList =
    row.awaitingWalletTargetNames.length > 0
      ? row.awaitingWalletTargetNames.slice(0, 3).join(", ")
      : row.targetNames.length > 0
        ? row.targetNames.slice(0, 3).join(", ")
        : "players";
  const parts = [`${row.claimCount} pending claim${row.claimCount === 1 ? "" : "s"}`];

  if (row.awaitingWalletCount > 0) {
    parts.push(`${targetList} awaiting verified wallet${row.awaitingWalletCount === 1 ? "" : "s"}`);
  }

  if (row.failureCount > 0) {
    parts.push("operator payout path needs attention");
  }

  if (row.eventLabel) {
    parts.push(row.eventLabel);
  }

  return parts.join(" · ");
}

async function loadPendingSettlementActivityRows(
  prisma: PrismaClient,
  take = 12
): Promise<PendingSettlementActivityGroup[]> {
  if (!isWoloMainnet()) return [];

  const claims = await prisma.pendingWoloClaim.findMany({
    where: {
      status: "pending",
      amountWolo: { gt: 0 },
      sourceMarketId: { not: null },
      createdAt: { gte: getWoloMainnetDisplayStartAt() },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: Math.max(20, take * 8),
    select: {
      id: true,
      sourceMarketId: true,
      displayPlayerName: true,
      amountWolo: true,
      claimKind: true,
      status: true,
      errorState: true,
      payoutTxHash: true,
      payoutAttemptedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  const marketIds = Array.from(
    new Set(
      claims
        .map((claim) => claim.sourceMarketId)
        .filter((marketId): marketId is number => typeof marketId === "number")
    )
  );
  const markets = marketIds.length
    ? await prisma.betMarket.findMany({
        where: { id: { in: marketIds } },
        select: {
          id: true,
          title: true,
          eventLabel: true,
          leftLabel: true,
          rightLabel: true,
          winnerSide: true,
        },
      })
    : [];
  const marketsById = new Map(markets.map((market) => [market.id, market] as const));

  return derivePendingSettlementActivityGroups(
    claims.map((claim) => {
      const market =
        typeof claim.sourceMarketId === "number"
          ? marketsById.get(claim.sourceMarketId)
          : null;
      const winnerName =
        market?.winnerSide === "left"
          ? market.leftLabel
          : market?.winnerSide === "right"
            ? market.rightLabel
            : null;

      return {
        id: claim.id,
        sourceMarketId: claim.sourceMarketId,
        marketTitle: market?.title ?? null,
        eventLabel: market?.eventLabel ?? null,
        winnerName,
        displayPlayerName: claim.displayPlayerName,
        amountWolo: claim.amountWolo,
        claimKind: claim.claimKind,
        status: claim.status,
        errorState: claim.errorState,
        payoutTxHash: claim.payoutTxHash,
        payoutAttemptedAt: claim.payoutAttemptedAt,
        createdAt: claim.createdAt,
        updatedAt: claim.updatedAt,
      };
    }),
    { limit: take }
  );
}

function dedupeActivityRows(
  rows: Array<StakingActivityItem & { sortAt: Date }>,
  limit: number
) {
  const seen = new Set<string>();
  const deduped: Array<StakingActivityItem & { sortAt: Date }> = [];

  for (const item of rows.sort((left, right) => right.sortAt.getTime() - left.sortAt.getTime())) {
    const key = item.key || `${item.label}:${item.detail}:${item.meta}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
    if (deduped.length >= limit) break;
  }

  return deduped;
}

function jsonObject(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, Prisma.JsonValue>)
    : {};
}

function metadataNumber(
  metadata: Prisma.JsonValue | null | undefined,
  key: string
) {
  const value = jsonObject(metadata)[key];
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function badgeForRank(index: number, fallback: string) {
  if (index === 0) return "Crown lane";
  if (index === 1) return "Early seat";
  if (index === 2) return "Verified grind";
  return fallback;
}

function toneForRank(index: number): StakingLeaderboardRow["tone"] {
  if (index === 0) return "gold";
  if (index === 1) return "emerald";
  if (index === 2) return "sky";
  return "slate";
}

function serializeEvent(event: {
  id: number;
  type: string;
  amountWolo: number;
  status: string;
  createdAt: Date;
  txHash: string | null;
}) {
  return {
    id: event.id,
    type: event.type,
    amountWolo: event.amountWolo,
    status: event.status,
    txHash: event.txHash,
    createdAt: event.createdAt.toISOString(),
  };
}

export async function loadStakingSummary(
  prisma: PrismaClient,
  period: StakingPeriodKey
): Promise<StakingSummary> {
  const now = new Date();
  const periodStart = getStakingPeriodStart(period, now);
  const wagerWhere = visibleMainnetWagerWhere(periodStart ? { createdAt: { gte: periodStart } } : {});
  const settledWhere = visibleMainnetWagerWhere(periodStart
    ? { settledAt: { gte: periodStart } }
    : { settledAt: { not: null } });
  const activeUserWhere = periodStart ? { lastSeen: { gte: periodStart } } : {};

  const [
    wagerAggregate,
    settledAggregate,
    payoutAggregate,
    activeBettorRows,
    activePlayers,
    stakingAggregate,
    stakingPositions,
    mainnetStakingPositions,
    recentWagers,
    recentEvents,
    recentRewardAllocations,
    mainnetActivityRows,
    pendingSettlementRows,
    indexedTransferRows,
  ] = await Promise.all([
    prisma.betWager.aggregate({
      where: wagerWhere,
      _count: { _all: true },
      _sum: { amountWolo: true },
    }),
    prisma.betWager.aggregate({
      where: settledWhere,
      _sum: { amountWolo: true },
    }),
    prisma.betWager.aggregate({
      where: settledWhere,
      _sum: { payoutWolo: true },
    }),
    prisma.betWager.findMany({
      where: wagerWhere,
      distinct: ["userId"],
      select: { userId: true },
    }),
    prisma.user.count({ where: activeUserWhere }),
    prisma.stakingPosition.aggregate({
      where: { status: "active", currentStakedWolo: { gt: 0 } },
      _count: { _all: true },
      _sum: { currentStakedWolo: true },
    }),
    prisma.stakingPosition.findMany({
      where: { status: "active", currentStakedWolo: { gt: 0 } },
      select: {
        currentStakedWolo: true,
        accumulatedWeight: true,
        lastWeightUpdateAt: true,
      },
    }),
    isWoloMainnet() ? loadMainnetStakingPositions(prisma) : Promise.resolve([]),
    prisma.betWager.findMany({
      where: visibleMainnetWagerWhere(),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 8,
      select: {
        id: true,
        amountWolo: true,
        payoutWolo: true,
        status: true,
        side: true,
        createdAt: true,
        user: {
          select: {
            uid: true,
            inGameName: true,
            steamPersonaName: true,
          },
        },
        market: {
          select: {
            leftLabel: true,
            rightLabel: true,
          },
        },
      },
    }),
    prisma.stakingEvent.findMany({
      where: {
        status: { not: "PENDING_CHAIN" },
        ...(isWoloMainnet() ? { txHash: { not: null } } : {}),
        ...mainnetDisplayDateWhere(),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 6,
      select: {
        id: true,
        type: true,
        amountWolo: true,
        status: true,
        createdAt: true,
        txHash: true,
        metadata: true,
        user: {
          select: {
            uid: true,
            inGameName: true,
            steamPersonaName: true,
          },
        },
      },
    }),
    prisma.stakingRewardAllocation.findMany({
      where: {
        rewardWolo: { gt: 0 },
        status: { not: "CLAIMED" },
        ...(isWoloMainnet() ? { positionId: null } : {}),
        ...mainnetDisplayDateWhere(),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 6,
      select: {
        id: true,
        rewardWolo: true,
        status: true,
        createdAt: true,
        creditedAt: true,
        distribution: {
          select: {
            distributionDate: true,
          },
        },
        user: {
          select: {
            uid: true,
            inGameName: true,
            steamPersonaName: true,
          },
        },
      },
    }),
    loadWoloMainnetActivityRows(prisma, 25).catch(() => []),
    loadPendingSettlementActivityRows(prisma, 12).catch(() => []),
    loadIndexedWoloTransferActivityRows(prisma, 25).catch(() => []),
  ]);

  const settledVolumeWolo = settledAggregate._sum.amountWolo ?? 0;
  const feePools = calculateModeledFeePools(settledVolumeWolo);
  const legacyTotalStakingWeight = stakingPositions.reduce(
    (sum, position) => sum + computeCurrentStakingWeight(position, now),
    BigInt(0)
  );
  const mainnetTotalStakingWeight = mainnetStakingPositions.reduce(
    (sum, position) => sum + BigInt(position.stakingWeight || 0),
    BigInt(0)
  );
  const publicActiveStakers = isWoloMainnet()
    ? mainnetStakingPositions.filter((position) => position.currentStakedWolo > 0).length
    : stakingAggregate._count._all;
  const publicTotalStakedWolo = isWoloMainnet()
    ? mainnetStakingPositions.reduce((sum, position) => sum + position.currentStakedWolo, 0)
    : stakingAggregate._sum.currentStakedWolo ?? 0;
  const totalStakingWeight = isWoloMainnet()
    ? mainnetTotalStakingWeight
    : legacyTotalStakingWeight;
  const activity: Array<StakingActivityItem & { sortAt: Date }> = [];

  for (const event of recentEvents) {
    const player = displayPlayerName(event.user);
    const amountLabel = formatActivityWolo(event.amountWolo);
    const metadata = jsonObject(event.metadata);
    const isRewardPayout = Boolean(metadata.stakingRewardDistributionId);
    const eventType = isRewardPayout ? "REWARD" : event.type.toUpperCase();
    const timestampLabel = formatMoment(event.createdAt);
    const txFeeLabel = formatTxFee(metadataNumber(event.metadata, "txFeeWolo"));
    const verb =
      isRewardPayout
        ? "reward payout"
        : event.type === "UNSTAKE"
        ? "unstake"
        : event.type === "CLAIM"
          ? "claim"
          : "stake";
    activity.push({
      key: event.txHash ? `tx-${event.txHash}` : `staking-event-${event.id}`,
      label: `${amountLabel} ${verb}: ${player}`,
      detail:
        event.txHash
          ? `${isRewardPayout ? "Daily staking share paid" : event.type === "UNSTAKE" ? "Returned to wallet" : "Keplr signed"} · ${event.txHash.slice(0, 8)}...${event.txHash.slice(-6)}`
          : `Ledger status: ${event.status.toLowerCase()}.`,
      meta: timestampLabel,
      eventType,
      amountLabel,
      txFeeLabel: txFeeLabel ?? undefined,
      timestampLabel,
      occurredAt: event.createdAt.toISOString(),
      tone: event.type === "CLAIM" ? "emerald" : "amber",
      sortAt: event.createdAt,
    });
  }

  for (const allocation of recentRewardAllocations) {
    const player = displayPlayerName(allocation.user);
    const amountLabel = formatActivityWolo(allocation.rewardWolo);
    const timestamp = allocation.creditedAt ?? allocation.createdAt;
    const timestampLabel = formatMoment(timestamp);
    const distributionDate = allocation.distribution.distributionDate.toISOString().slice(0, 10);
    activity.push({
      key: `staking-reward-allocation-${allocation.id}`,
      label: `${amountLabel} reward queued: ${player}`,
      detail: `Daily staking share for ${distributionDate} is waiting on payout execution.`,
      meta: timestampLabel,
      eventType: "REWARD",
      amountLabel,
      timestampLabel,
      occurredAt: timestamp.toISOString(),
      tone: "amber",
      sortAt: timestamp,
    });
  }

  for (const row of mainnetActivityRows) {
    const timestamp = new Date(row.updatedAt || row.createdAt);
    const safeTimestamp = Number.isNaN(timestamp.getTime()) ? now : timestamp;
    const timestampLabel = formatMoment(safeTimestamp);
    const txLabel = shortHash(row.txHash);
    const amountLabel = row.amountWolo != null ? formatActivityWolo(row.amountWolo) : undefined;
    const addressLabel = shortAddress(row.walletAddress);
    const contextParts = [
      row.contextLabel,
      txLabel ? `tx ${txLabel}` : null,
      addressLabel ? `wallet ${addressLabel}` : null,
    ].filter(Boolean);

    activity.push({
      key: row.key,
      label: labelForMainnetActivity(row),
      detail: contextParts.join(" · "),
      meta: timestampLabel,
      eventType: eventTypeForMainnetActivity(row),
      amountLabel,
      timestampLabel,
      occurredAt: safeTimestamp.toISOString(),
      tone: toneForMainnetActivity(row),
      sortAt: safeTimestamp,
    });
  }

  for (const row of pendingSettlementRows) {
    const timestampLabel = formatMoment(row.latestAt);
    const amountLabel = formatActivityWolo(row.amountWolo);

    activity.push({
      key: row.key,
      label: `${amountLabel} settlement queue: ${row.marketTitle}`,
      detail: detailForPendingSettlement(row),
      meta: timestampLabel,
      eventType: "SETTLEMENT",
      amountLabel,
      timestampLabel,
      occurredAt: row.latestAt.toISOString(),
      tone: row.failureCount > 0 ? "amber" : "sky",
      sortAt: row.latestAt,
    });
  }

  for (const row of indexedTransferRows) {
    activity.push(indexedTransferToActivityItem(row, now));
  }

  for (const wager of recentWagers) {
    const player = displayPlayerName(wager.user);
    const pickedLabel = wager.side === "right" ? wager.market.rightLabel : wager.market.leftLabel;
    const matchLabel = `${wager.market.leftLabel} vs ${wager.market.rightLabel}`;
    const isWin = wager.status === "won" && (wager.payoutWolo ?? 0) > 0;
    const amountLabel = formatActivityWolo(isWin ? wager.payoutWolo ?? 0 : wager.amountWolo);
    const eventType = isWin ? "PAYOUT" : "WAGER";
    const timestampLabel = formatMoment(wager.createdAt);
    activity.push({
      key: `wager-${wager.id}`,
      label: isWin
        ? `${amountLabel} payout: ${matchLabel}`
        : `${amountLabel} wager: ${matchLabel}`,
      detail: isWin ? `${player} won on ${pickedLabel}` : `${player} picked ${pickedLabel}`,
      meta: timestampLabel,
      eventType,
      amountLabel,
      timestampLabel,
      occurredAt: wager.createdAt.toISOString(),
      tone: isWin ? "emerald" : "sky",
      sortAt: wager.createdAt,
    });
  }

  if (activity.length === 0) {
    activity.push({
      key: "activity-standby",
      label: "Recent activity is warming up",
      detail: "Settled matches, treasury movement, and staking rewards will land here.",
      meta: "Standby",
      eventType: "STANDBY",
      timestampLabel: "Standby",
      occurredAt: now.toISOString(),
      tone: "slate",
      sortAt: now,
    });
  }

  const publicActivity = dedupeActivityRows(activity, 64)
    .filter(isPublicStakingActivityItem)
    .slice(0, 16);

  return {
    period,
    generatedAt: now.toISOString(),
    dataLive: true,
    betsPlaced: wagerAggregate._count._all,
    betVolumeWolo: wagerAggregate._sum.amountWolo ?? 0,
    payoutWolo: payoutAggregate._sum.payoutWolo ?? 0,
    settledVolumeWolo,
    stakerFeePoolWolo: feePools.stakerPoolWolo,
    treasuryShareWolo: feePools.treasuryPoolWolo,
    activeBettors: activeBettorRows.length,
    activePlayers,
    activeStakers: publicActiveStakers,
    totalStakedWolo: publicTotalStakedWolo,
    totalStakingWeight: totalStakingWeight.toString(),
    directTransferCount: indexedTransferRows.length,
    activity: publicActivity
      .map((item) => ({
        key: item.key,
        label: item.label,
        detail: item.detail,
        meta: item.meta,
        eventType: item.eventType,
        amountLabel: item.amountLabel,
        txFeeLabel: item.txFeeLabel,
        timestampLabel: item.timestampLabel,
        occurredAt: item.occurredAt,
        tone: item.tone,
      })),
  };
}

export async function loadMainnetTransferStakingActivityPage(
  prisma: PrismaClient,
  options: {
    before?: Date | string | null;
    limit?: number | null;
    mode?: StakingActivityMode | null;
    filter?: StakingActivityFilter | null;
  } = {}
): Promise<StakingActivityPage> {
  const limit = Math.max(1, Math.min(options.limit ?? 16, 40));
  const before = options.before ?? null;
  const mode: StakingActivityMode = options.mode === "grouped" ? "grouped" : "ledger";
  const filter: StakingActivityFilter =
    options.filter === "staking" || options.filter === "bets" || options.filter === "transfers"
      ? options.filter
      : "all";
  const rawActivityTake =
    mode === "grouped" || filter !== "all"
      ? Math.max(80, Math.min(240, limit * 12))
      : limit + 1;
  const beforeDate =
    before instanceof Date
      ? before
      : typeof before === "string" && before.trim()
        ? new Date(before)
        : null;
  const validBeforeDate = beforeDate && !Number.isNaN(beforeDate.getTime()) ? beforeDate : null;

  const mainnetDisplayStartAt = getWoloMainnetDisplayStartAt();

  const [indexedTransferRows, giftRows, mainnetActivityRows, pendingSettlementRows, stakingCycleRows, stakingAllocationRows] = await Promise.all([
    loadIndexedWoloTransferActivityRows(prisma, rawActivityTake, { before }).catch(() => []),
    loadRecentWoloGiftActivityRows(prisma, rawActivityTake, before).catch(() => []),
    loadWoloMainnetActivityRows(prisma, rawActivityTake).catch(() => []),
    loadPendingSettlementActivityRows(prisma, rawActivityTake).catch(() => []),
    mode === "ledger" && filter === "staking"
      ? prisma.stakingRewardDistribution
          .findMany({
            where: {
              ...(validBeforeDate ? { createdAt: { lt: validBeforeDate } } : {}),
              ...(isWoloMainnet() ? { distributionDate: { gte: getWoloMainnetDisplayStartAt() } } : {}),
              status: "FINALIZED",
              stakerPoolWolo: { lte: 0 },
            },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: rawActivityTake,
          })
          .catch((error) => {
            console.warn("Failed to load staking cycle activity rows:", error);
            return [];
          })
      : Promise.resolve([]),
    mode === "ledger" && filter === "staking"
      ? prisma.$queryRawUnsafe<
          Array<{
            id: number;
            distribution_id: number;
            distribution_date: Date;
            distribution_created_at: Date;
            user_id: number;
            player: string | null;
            reward_wolo: number;
            reward_uwolo: bigint | number | string;
            status: string;
            created_at: Date;
            credited_at: Date | null;
            claimed_at: Date | null;
          }>
        >(
          `
          select
            a.id,
            a.distribution_id,
            d.distribution_date,
            d.created_at as distribution_created_at,
            a.user_id,
            coalesce(u.in_game_name, u.steam_persona_name, u.uid::text, ('User #' || a.user_id::text)) as player,
            a.reward_wolo,
            a.reward_uwolo,
            a.status,
            a.created_at,
            a.credited_at,
            a.claimed_at
          from staking_reward_allocations a
          join staking_reward_distributions d on d.id = a.distribution_id
          left join users u on u.id = a.user_id
          where d.status = 'FINALIZED'
            and d.distribution_date >= $1::timestamp
            and ($2::timestamp is null or a.created_at < $2::timestamp)
            and (a.reward_uwolo > 0 or a.reward_wolo > 0)
          order by d.created_at desc, a.reward_uwolo desc, a.id desc
          limit $3
          `,
          mainnetDisplayStartAt,
          validBeforeDate,
          rawActivityTake * 4
        ).catch((error) => {
          console.warn("Failed to load staking allocation activity rows:", error);
          return [];
        })
      : Promise.resolve([]),
  ]);
  const mainnetActivityItems: Array<StakingActivityItem & { sortAt: Date }> =
    mainnetActivityRows.map((row) => {
      const timestamp = new Date(row.updatedAt || row.createdAt);
      const safeTimestamp = Number.isNaN(timestamp.getTime()) ? new Date() : timestamp;
      const timestampLabel = formatMoment(safeTimestamp);
      const txLabel = shortHash(row.txHash);
      const amountLabel = row.amountWolo != null ? formatActivityWolo(row.amountWolo) : undefined;
      const addressLabel = shortAddress(row.walletAddress);
      const contextParts = [
        row.contextLabel,
        txLabel ? `tx ${txLabel}` : null,
        addressLabel ? `wallet ${addressLabel}` : null,
      ].filter(Boolean);

      return {
        key: row.key,
        label: labelForMainnetActivity(row),
        detail: contextParts.join(" · "),
        meta: timestampLabel,
        eventType: eventTypeForMainnetActivity(row),
        amountLabel,
        timestampLabel,
        occurredAt: safeTimestamp.toISOString(),
        tone: toneForMainnetActivity(row),
        sortAt: safeTimestamp,
      };
    });
  const pendingSettlementItems: Array<StakingActivityItem & { sortAt: Date }> =
    pendingSettlementRows.map((row) => {
      const timestampLabel = formatMoment(row.latestAt);
      const amountLabel = formatActivityWolo(row.amountWolo);

      return {
        key: row.key,
        label: `${amountLabel} settlement queue: ${row.marketTitle}`,
        detail: detailForPendingSettlement(row),
        meta: timestampLabel,
        eventType: "SETTLEMENT",
        amountLabel,
        timestampLabel,
        occurredAt: row.latestAt.toISOString(),
        tone: row.failureCount > 0 ? "amber" : "sky",
        sortAt: row.latestAt,
      };
    });

  const stakingCycleItems: Array<StakingActivityItem & { sortAt: Date }> =
    stakingCycleRows.map((distribution) => {
      const metadata =
        distribution.metadata &&
        typeof distribution.metadata === "object" &&
        !Array.isArray(distribution.metadata)
          ? (distribution.metadata as Record<string, unknown>)
          : {};

      const settledBets = Number(metadata.settledBets || 0);
      const settledVolumeWolo = Number(metadata.settledVolumeWolo || 0);
      const cycleDate = distribution.distributionDate.toISOString().slice(0, 10);
      const settledLabel = `${settledBets.toLocaleString()} settled ${settledBets === 1 ? "bet" : "bets"}`;
      const volumeLabel = `${formatActivityWoloAmount(settledVolumeWolo)} settled volume`;

      const rawStakerPoolUwolo = (distribution as {
        stakerPoolUwolo?: bigint | number | string | null;
      }).stakerPoolUwolo;

      const stakerPoolUwolo =
        rawStakerPoolUwolo == null
          ? BigInt(Math.max(0, Math.round(Number(distribution.stakerPoolWolo || 0) * 1_000_000)))
          : BigInt(String(rawStakerPoolUwolo));

      const amountLabel =
        stakerPoolUwolo > BigInt(0)
          ? stakerPoolUwolo < BigInt(1_000_000)
            ? "<1 WOLO"
            : formatActivityWoloAmount(Number(stakerPoolUwolo / BigInt(1_000_000)))
          : "0 WOLO";

      const distributionDetail =
        stakerPoolUwolo > BigInt(0)
          ? `${amountLabel} staking pool · below 1 WOLO payout threshold · ${settledLabel} · ${volumeLabel}`
          : `No reward distribution · ${settledLabel} · ${volumeLabel}`;

      return {
        key: `staking-cycle-${distribution.id}`,
        label:
          stakerPoolUwolo > BigInt(0)
            ? `${amountLabel} staking pool: ${cycleDate}`
            : `Staking cycle checked: ${cycleDate}`,
        detail: distributionDetail,
        meta: formatMoment(distribution.createdAt),
        eventType: "CYCLE",
        amountLabel,
        timestampLabel: formatMoment(distribution.createdAt),
        occurredAt: distribution.createdAt.toISOString(),
        tone: "slate",
        sortAt: distribution.createdAt,
      };
    });

  const stakingAllocationItems: Array<StakingActivityItem & { sortAt: Date }> =
    stakingAllocationRows.map((allocation) => {
      const createdAt =
        allocation.credited_at ||
        allocation.claimed_at ||
        allocation.created_at ||
        allocation.distribution_created_at ||
        new Date();

      const distributionDate = new Date(allocation.distribution_date).toISOString().slice(0, 10);
      const player = allocation.player || `User #${allocation.user_id}`;

      const rewardUwolo = BigInt(String(allocation.reward_uwolo || 0));
      const wholeWolo = rewardUwolo / BigInt(1_000_000);
      const rewardWoloDecimal = Number(rewardUwolo) / 1_000_000;

      const amountLabel =
        rewardUwolo > BigInt(0) && rewardUwolo < BigInt(1_000_000)
          ? `${rewardWoloDecimal.toFixed(6).replace(/0+$/, "").replace(/\.$/, "")} WOLO`
          : formatActivityWoloAmount(Number(wholeWolo));

      const status = String(allocation.status || "REWARD").toUpperCase();
      const isMicro = rewardUwolo > BigInt(0) && rewardUwolo < BigInt(1_000_000);
      const isCompounded = status === "COMPOUNDED";

      return {
        key: `staking-allocation-${allocation.id}`,
        label: isMicro
          ? `${amountLabel} staking reward held: ${player}`
          : isCompounded
            ? `${amountLabel} compound event: ${player}`
            : `${amountLabel} staking reward payout: ${player}`,
        detail: isMicro
          ? `${player} · micro reward accrued · pending 1 WOLO payout threshold · Distribution ${distributionDate}`
          : isCompounded
            ? `${player} · compounded reward allocation · Distribution ${distributionDate}`
            : `${player} · ${status.toLowerCase()} reward allocation · Distribution ${distributionDate}`,
        meta: formatMoment(createdAt),
        eventType: "REWARD",
        amountLabel,
        timestampLabel: formatMoment(createdAt),
        occurredAt: createdAt.toISOString(),
        tone: "amber",
        sortAt: createdAt,
      };
    });

  const compactMainnetActivityItems =
    stakingAllocationItems.length > 0
      ? mainnetActivityItems.filter((item) => {
          const eventType = String(item.eventType || "").toUpperCase();
          const text = `${item.label || ""} ${item.detail || ""}`.toLowerCase();

          if (
            eventType === "TX" &&
            (text.includes("tx compound") ||
              text.includes("compound-") ||
              text.includes("compound event"))
          ) {
            return false;
          }

          return true;
        })
      : mainnetActivityItems;

  const combined = dedupeActivityRows(
    [
      ...compactMainnetActivityItems,
      ...pendingSettlementItems,
      ...stakingAllocationItems,
      ...stakingCycleItems,
      ...indexedTransferRows.map((row) => indexedTransferToActivityItem(row)),
      ...giftRows.map((row) => giftToActivityItem(row)),
    ],
    rawActivityTake
  )
    .filter(isPublicStakingActivityItem)
    .filter((item) => {
      if (!validBeforeDate || !item.occurredAt) return true;
      const occurredAt = new Date(item.occurredAt);
      return !Number.isNaN(occurredAt.getTime()) && occurredAt < validBeforeDate;
    });

  const filteredCombined = combined.filter((item) => {
    const eventType = String(item.eventType || "").toUpperCase();
    const text = `${item.label || ""} ${item.detail || ""}`.toLowerCase();

    if (filter === "staking") {
      return (
        eventType === "REWARD" ||
        eventType === "STAKE" ||
        eventType === "UNSTAKE" ||
        eventType === "CYCLE" ||
        eventType === "COMPOUND" ||
        (eventType === "TX" && (text.includes("compound") || text.includes("staking event"))) ||
        text.includes("staking treasury") ||
        text.includes("staking payout") ||
        text.includes("staking fee share") ||
        text.includes("compound event") ||
        text.includes("compounded") ||
        text.includes("compound") ||
        text.includes("staking reward") ||
        text.includes("staking deposit") ||
        text.includes("staking fee share") ||
        text.includes("staking wallet")
      );
    }

    if (filter === "bets") {
      const stakingLike =
        eventType === "REWARD" ||
        eventType === "STAKE" ||
        eventType === "UNSTAKE" ||
        eventType === "CYCLE" ||
        eventType === "COMPOUND" ||
        (eventType === "TX" && (text.includes("compound") || text.includes("staking event"))) ||
        text.includes("staking treasury") ||
        text.includes("staking payout") ||
        text.includes("staking fee share") ||
        text.includes("staking reward") ||
        text.includes("staking wallet") ||
        text.includes("staking deposit") ||
        text.includes("staking unstake") ||
        text.includes("compound event") ||
        text.includes("compounded") ||
        text.includes("compound");

      if (stakingLike) return false;

      return (
        eventType === "GROUPED BET" ||
        eventType === "SETTLEMENT" ||
        eventType === "PAYOUT" ||
        eventType === "ESCROW" ||
        text.includes("bet_") ||
        text.includes("bet stake") ||
        text.includes("founders_") ||
        text.includes(" vs ")
      );
    }

    if (filter === "transfers") {
      return eventType === "DIRECT" || eventType === "GIFT";
    }

    return true;
  });

  const visibleRows =
    mode === "grouped"
      ? groupStakingBetActivityItems(filteredCombined, limit + 1)
      : filteredCombined;

  const pageRows = visibleRows.slice(0, limit).map((item) => {
    const normalized = attachActivityTxFields(item);
    return {
      key: normalized.key,
      label: normalized.label,
      detail: normalized.detail,
      meta: normalized.meta,
      eventType: normalized.eventType,
      amountLabel: normalized.amountLabel,
      txFeeLabel: normalized.txFeeLabel,
      timestampLabel: normalized.timestampLabel,
      occurredAt: normalized.occurredAt,
      txHash: normalized.txHash,
      txUrl: normalized.txUrl,
      children: normalized.children,
      tone: normalized.tone,
    };
  });
  const cursorRow =
    filteredCombined
      .slice(0, Math.max(1, rawActivityTake - 1))
      .reverse()
      .find((row) => row.timestampLabel !== "Current stake" && row.occurredAt) ?? null;

  return {
    generatedAt: new Date().toISOString(),
    rows: pageRows,
    hasMore: filteredCombined.length > limit,
    nextBefore: cursorRow?.occurredAt ?? null,
  };
}

async function loadBoardRows(
  prisma: PrismaClient,
  mode: "staked" | "earned" | "weight"
): Promise<StakingLeaderboardRow[]> {
  const now = new Date();
  if (isWoloMainnet()) {
    const [positions, allocations] = await Promise.all([
      loadMainnetStakingPositions(prisma, { asOf: now }),
      prisma.stakingRewardAllocation.findMany({
        where: {
          ...(isWoloMainnet() ? { positionId: null } : {}),
          ...mainnetDisplayDateWhere(),
        },
        select: {
          userId: true,
          rewardWolo: true,
        },
        take: 5_000,
      }),
    ]);
    const rewardsByUserId = new Map<number, number>();
    for (const allocation of allocations) {
      rewardsByUserId.set(
        allocation.userId,
        (rewardsByUserId.get(allocation.userId) ?? 0) + allocation.rewardWolo
      );
    }

    return positions
      .map((position, index) => ({
        player: position.player,
        badge: badgeForRank(index, mode === "earned" ? "Fee share" : "Mainnet stake"),
        stakedWolo: position.currentStakedWolo,
        rewardsWolo: rewardsByUserId.get(position.userId) ?? 0,
        stakingWeight: position.stakingWeight,
        status: "Live",
        tone: toneForRank(index),
      }))
      .sort((left, right) => {
        if (mode === "earned") return right.rewardsWolo - left.rewardsWolo || right.stakedWolo - left.stakedWolo;
        if (mode === "weight") {
          const leftWeight = BigInt(left.stakingWeight || 0);
          const rightWeight = BigInt(right.stakingWeight || 0);
          if (leftWeight !== rightWeight) return leftWeight > rightWeight ? -1 : 1;
        }
        return right.stakedWolo - left.stakedWolo || right.rewardsWolo - left.rewardsWolo;
      })
      .slice(0, 8)
      .map((row, index) => ({
        ...row,
        badge: badgeForRank(index, mode === "earned" ? "Fee share" : "Mainnet stake"),
        tone: toneForRank(index),
      }));
  }

  const orderBy =
    mode === "earned"
      ? [{ lifetimeRewardsWolo: "desc" as const }, { currentStakedWolo: "desc" as const }]
      : [{ currentStakedWolo: "desc" as const }, { lifetimeRewardsWolo: "desc" as const }];
  const positions = await prisma.stakingPosition.findMany({
    where: {
      status: "active",
      OR: [{ currentStakedWolo: { gt: 0 } }, { lifetimeRewardsWolo: { gt: 0 } }],
    },
    orderBy,
    take: 24,
    include: {
      user: {
        select: {
          uid: true,
          inGameName: true,
          steamPersonaName: true,
        },
      },
    },
  });

  const rows = positions.map((position, index) => ({
    player: displayPlayerName(position.user),
    badge: badgeForRank(index, mode === "earned" ? "Fee share" : "Staking seat"),
    stakedWolo: position.currentStakedWolo,
    rewardsWolo: position.lifetimeRewardsWolo,
    stakingWeight: computeCurrentStakingWeight(position, now).toString(),
    status: position.status === "active" ? "Live" : position.status,
    tone: toneForRank(index),
  }));

  if (mode !== "weight") return rows.slice(0, 8);

  return rows
    .sort((a, b) => {
      const left = BigInt(a.stakingWeight || 0);
      const right = BigInt(b.stakingWeight || 0);
      if (left === right) return b.stakedWolo - a.stakedWolo;
      return left > right ? -1 : 1;
    })
    .slice(0, 8);
}

async function loadRecentRewardRows(prisma: PrismaClient): Promise<StakingLeaderboardRow[]> {
  const allocations = await prisma.stakingRewardAllocation.findMany({
    where: {
      ...(isWoloMainnet() ? { positionId: null } : {}),
      ...mainnetDisplayDateWhere(),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 8,
    include: {
      user: {
        select: {
          uid: true,
          inGameName: true,
          steamPersonaName: true,
        },
      },
      position: {
        select: {
          currentStakedWolo: true,
        },
      },
    },
  });

  return allocations.map((allocation, index) => ({
    player: displayPlayerName(allocation.user),
    badge: allocation.status === "CREDITED" ? "Credited" : "Daily share",
    stakedWolo: allocation.position?.currentStakedWolo ?? 0,
    rewardsWolo: allocation.rewardWolo,
    stakingWeight: allocation.userWeight.toString(),
    status: allocation.status,
    tone: toneForRank(index),
  }));
}

async function loadMainnetRewardSnapshotForUser(
  prisma: PrismaClient,
  userId: number,
  positions: Awaited<ReturnType<typeof loadMainnetStakingPositions>>
) {
  const [unpaidAllocation, claimedAllocation, lifetimeAllocation, settledAggregate] =
    await Promise.all([
      prisma.stakingRewardAllocation.aggregate({
        where: {
          userId,
          positionId: null,
          rewardWolo: { gt: 0 },
          status: { not: "CLAIMED" },
          ...mainnetDisplayDateWhere(),
        },
        _sum: { rewardWolo: true },
      }),
      prisma.stakingRewardAllocation.aggregate({
        where: {
          userId,
          positionId: null,
          rewardWolo: { gt: 0 },
          status: "CLAIMED",
          ...mainnetDisplayDateWhere(),
        },
        _sum: { rewardWolo: true },
      }),
      prisma.stakingRewardAllocation.aggregate({
        where: {
          userId,
          positionId: null,
          rewardWolo: { gt: 0 },
          ...mainnetDisplayDateWhere(),
        },
        _sum: { rewardWolo: true },
      }),
      prisma.betWager.aggregate({
        where: visibleMainnetWagerWhere({
          settledAt: { not: null },
        }),
        _sum: { amountWolo: true },
      }),
    ]);

  const pendingAllocatedWolo = unpaidAllocation._sum.rewardWolo ?? 0;
  const claimedRewardsWolo = claimedAllocation._sum.rewardWolo ?? 0;
  const lifetimeAllocatedWolo = lifetimeAllocation._sum.rewardWolo ?? 0;
  const viewerPosition = positions.find((position) => position.userId === userId);
  const viewerWeight = BigInt(viewerPosition?.stakingWeight || 0);
  const totalWeight = positions.reduce(
    (sum, position) => sum + BigInt(position.stakingWeight || 0),
    BigInt(0)
  );

  let modeledPendingWolo = 0;
  if (viewerWeight > BigInt(0) && totalWeight > BigInt(0)) {
    const settledVolumeWolo = settledAggregate._sum.amountWolo ?? 0;
    const feePools = calculateModeledFeePools(settledVolumeWolo);
    const shareRatio = Number(viewerWeight) / Number(totalWeight);
    const modeledGrossWolo = Number.isFinite(shareRatio)
      ? feePools.stakerPoolWolo * shareRatio
      : 0;
    modeledPendingWolo = Math.max(0, modeledGrossWolo - claimedRewardsWolo);
  }

  const pendingRewardsWolo = Math.max(pendingAllocatedWolo, modeledPendingWolo);
  const lifetimeRewardsWolo = Math.max(
    lifetimeAllocatedWolo,
    pendingRewardsWolo + claimedRewardsWolo
  );

  return {
    pendingRewardsWolo,
    lifetimeRewardsWolo,
    claimedRewardsWolo,
  };
}

export async function loadStakingLeaderboard(
  prisma: PrismaClient,
  board: StakingBoardKey
): Promise<StakingLeaderboard> {
  const [topStakers, topEarners, topWeight, recentRewards] = await Promise.all([
    loadBoardRows(prisma, "staked"),
    loadBoardRows(prisma, "earned"),
    loadBoardRows(prisma, "weight"),
    loadRecentRewardRows(prisma),
  ]);

  const rows =
    board === "earners" ? topEarners : board === "rewards" ? recentRewards : topStakers;

  return {
    board,
    rows,
    topStakers,
    topEarners,
    topWeight,
    recentRewards,
  };
}

export async function loadStakingMe(prisma: PrismaClient, userId: number) {
  const now = new Date();
  const [user, position, mainnetPositions, events, txFeeEvents, lastReward] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        uid: true,
        inGameName: true,
        steamPersonaName: true,
        walletAddress: true,
      },
    }),
    prisma.stakingPosition.findUnique({
      where: { userId },
    }),
    isWoloMainnet() ? loadMainnetStakingPositions(prisma, { asOf: now }) : Promise.resolve([]),
    prisma.stakingEvent.findMany({
      where: {
        userId,
        ...(isWoloMainnet()
          ? { txHash: { not: null }, ...mainnetDisplayDateWhere() }
          : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 6,
      select: {
        id: true,
        type: true,
        amountWolo: true,
        status: true,
        createdAt: true,
        txHash: true,
        metadata: true,
      },
    }),
    prisma.stakingEvent.findMany({
      where: {
        userId,
        status: "CONFIRMED",
        ...(isWoloMainnet()
          ? { txHash: { not: null }, ...mainnetDisplayDateWhere() }
          : {}),
      },
      select: { metadata: true },
    }),
    prisma.stakingRewardAllocation.findFirst({
      where: {
        userId,
        ...(isWoloMainnet() ? { positionId: null, ...mainnetDisplayDateWhere() } : {}),
        OR: [{ creditedAt: { not: null } }, { claimedAt: { not: null } }],
      },
      orderBy: [{ creditedAt: "desc" }, { claimedAt: "desc" }, { createdAt: "desc" }],
      select: {
        creditedAt: true,
        claimedAt: true,
        rewardWolo: true,
        status: true,
      },
    }),
  ]);

  if (!user) {
    throw new StakingActionError("Viewer not found.", 404);
  }

  const useMainnetPosition = isWoloMainnet();
  const mainnetPosition = mainnetPositions.find((position) => position.userId === userId) ?? null;
  const mainnetRewardSnapshot = useMainnetPosition
    ? await loadMainnetRewardSnapshotForUser(prisma, userId, mainnetPositions)
    : {
        pendingRewardsWolo: 0,
        lifetimeRewardsWolo: 0,
        claimedRewardsWolo: 0,
      };
  const stakingWeight = useMainnetPosition
    ? BigInt(mainnetPosition?.stakingWeight || 0)
    : position
      ? computeCurrentStakingWeight(position, now)
      : BigInt(0);
  const lifetimeTxFeesWolo = txFeeEvents.reduce(
    (sum, event) => sum + metadataNumber(event.metadata, "txFeeWolo"),
    0
  );
  const currentStakedWolo = useMainnetPosition
    ? mainnetPosition?.currentStakedWolo ?? 0
    : position?.currentStakedWolo ?? 0;

  return {
    user: {
      id: user.id,
      uid: user.uid,
      playerName: displayPlayerName(user),
      walletAddress: user.walletAddress,
    },
    position: {
      currentStakedWolo,
      stakingWeight: stakingWeight.toString(),
      pendingRewardsWolo: useMainnetPosition
        ? mainnetRewardSnapshot.pendingRewardsWolo
        : position?.pendingRewardsWolo ?? 0,
      lifetimeRewardsWolo: useMainnetPosition
        ? mainnetRewardSnapshot.lifetimeRewardsWolo
        : position?.lifetimeRewardsWolo ?? 0,
      claimedRewardsWolo: useMainnetPosition
        ? mainnetRewardSnapshot.claimedRewardsWolo
        : position?.claimedRewardsWolo ?? 0,
      autoCompoundRewards: position?.autoCompoundRewards ?? true,
      compoundedRewardsWolo: position?.compoundedRewardsWolo ?? 0,
      lifetimeTxFeesWolo,
      status: useMainnetPosition
        ? currentStakedWolo > 0
          ? "mainnet_tx_backed"
          : "ledger_ready"
        : position?.status ?? "ledger_ready",
      lastWeightUpdateAt: useMainnetPosition
        ? mainnetPosition?.lastTxAt?.toISOString() ?? null
        : position?.lastWeightUpdateAt.toISOString() ?? null,
      lastRewardPaymentAt:
        lastReward?.claimedAt?.toISOString() ?? lastReward?.creditedAt?.toISOString() ?? null,
      lastRewardAmountWolo: lastReward?.rewardWolo ?? 0,
    },
    recentEvents: events.map(serializeEvent),
    execution: {
      status: "PENDING_CHAIN",
      detail: "Staking ledger ready. Chain execution pending.",
    },
  };
}

export async function createPendingStakingEvent(
  prisma: PrismaClient,
  input: {
    userId: number;
    walletAddress?: string | null;
    type: StakingActionType;
    amountWolo: number;
    metadata?: Prisma.InputJsonValue;
  }
) {
  if (!Number.isInteger(input.amountWolo) || input.amountWolo < 0) {
    throw new StakingActionError("Enter a valid whole-WOLO amount.", 400);
  }
  if ((input.type === "STAKE" || input.type === "UNSTAKE") && input.amountWolo <= 0) {
    throw new StakingActionError("Amount must be greater than 0 WOLO.", 400);
  }

  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const position = await tx.stakingPosition.upsert({
      where: { userId: input.userId },
      create: {
        userId: input.userId,
        walletAddress: input.walletAddress ?? null,
        lastWeightUpdateAt: now,
      },
      update: input.walletAddress ? { walletAddress: input.walletAddress } : {},
    });

    if (input.type === "UNSTAKE" && input.amountWolo > position.currentStakedWolo) {
      throw new StakingActionError("No confirmed stake is available for that unstake.", 409);
    }

    if (input.type === "CLAIM" && position.pendingRewardsWolo <= 0) {
      throw new StakingActionError("No staking rewards are ready to claim.", 409);
    }

    const weightBefore = computeCurrentStakingWeight(position, now);
    const amountWolo = input.type === "CLAIM" ? position.pendingRewardsWolo : input.amountWolo;

    return tx.stakingEvent.create({
      data: {
        userId: input.userId,
        positionId: position.id,
        walletAddress: input.walletAddress ?? position.walletAddress,
        type: input.type,
        amountWolo,
        status: "PENDING_CHAIN",
        weightBefore,
        weightAfter: weightBefore,
        balanceBefore: position.currentStakedWolo,
        balanceAfter: position.currentStakedWolo,
        metadata: {
          executionPending: true,
          detail: "Chain execution opens after WoloChain staking wallet cutover.",
          ...(typeof input.metadata === "object" && input.metadata ? input.metadata : {}),
        },
      },
    });
  });
}

export async function createConfirmedStakingEvent(
  prisma: PrismaClient,
  input: {
    userId: number;
    walletAddress?: string | null;
    type: Extract<StakingActionType, "STAKE" | "UNSTAKE">;
    amountWolo: number;
    txHash: string;
    txFeeWolo?: number | null;
    proofUrl?: string | null;
    metadata?: Prisma.InputJsonValue;
  }
) {
  if (!Number.isInteger(input.amountWolo) || input.amountWolo <= 0) {
    throw new StakingActionError("Amount must be greater than 0 WOLO.", 400);
  }

  const normalizedTxHash = input.txHash.trim().toUpperCase();
  if (!normalizedTxHash) {
    throw new StakingActionError("A confirmed chain tx hash is required.", 400);
  }

  const existing = await prisma.stakingEvent.findFirst({
    where: { txHash: normalizedTxHash },
  });
  if (existing) {
    return existing;
  }

  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const position = await tx.stakingPosition.upsert({
      where: { userId: input.userId },
      create: {
        userId: input.userId,
        walletAddress: input.walletAddress ?? null,
        lastWeightUpdateAt: now,
      },
      update: input.walletAddress ? { walletAddress: input.walletAddress } : {},
    });

    const weightBefore = computeCurrentStakingWeight(position, now);
    const balanceBefore = position.currentStakedWolo;
    const balanceAfter =
      input.type === "STAKE"
        ? balanceBefore + input.amountWolo
        : balanceBefore - input.amountWolo;

    if (balanceAfter < 0) {
      throw new StakingActionError("No confirmed stake is available for that unstake.", 409);
    }

    const event = await tx.stakingEvent.create({
      data: {
        userId: input.userId,
        positionId: position.id,
        walletAddress: input.walletAddress ?? position.walletAddress,
        type: input.type,
        amountWolo: input.amountWolo,
        txHash: normalizedTxHash,
        status: "CONFIRMED",
        weightBefore,
        weightAfter: weightBefore,
        balanceBefore,
        balanceAfter,
        confirmedAt: now,
        metadata: {
          txFeeWolo: input.txFeeWolo ?? 0,
          proofUrl: input.proofUrl ?? null,
          ...(typeof input.metadata === "object" && input.metadata ? input.metadata : {}),
        },
      },
    });

    await tx.stakingPosition.update({
      where: { id: position.id },
      data: {
        walletAddress: input.walletAddress ?? position.walletAddress,
        currentStakedWolo: balanceAfter,
        accumulatedWeight: weightBefore,
        lastWeightUpdateAt: now,
        status: balanceAfter > 0 ? "active" : "inactive",
      },
    });

    return event;
  });
}

function startOfUtcDay(input: Date) {
  return new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()));
}

function stakingDistributionDateKey(input: Date) {
  return startOfUtcDay(input).toISOString().slice(0, 10);
}

function buildStakingRewardSettlementRunId(distributionId: number, distributionDate: Date) {
  return `aoe2-staking-${stakingDistributionDateKey(distributionDate)}-${distributionId}`;
}

function creditedRewardStatuses() {
  return ["CREDITED", "PENDING"] as const;
}

export async function calculateDailyStakingRewardDistribution(
  prisma: PrismaClient,
  distributionDate = startOfUtcDay(new Date(Date.now() - 24 * 60 * 60 * 1000))
) {
  const periodStart = startOfUtcDay(distributionDate);
  const periodEnd = new Date(periodStart.getTime() + 24 * 60 * 60 * 1000);
  if (periodEnd.getTime() > Date.now()) {
    throw new StakingActionError("Cannot finalize an open staking reward window.", 409);
  }

  const existing = await prisma.stakingRewardDistribution.findUnique({
    where: { distributionDate: periodStart },
    include: { allocations: { select: { id: true } } },
  });

  if (existing && existing.status !== "DRAFT") {
    return { distributionId: existing.id, created: false, status: existing.status };
  }

  if (existing?.allocations.length) {
    throw new StakingActionError("Distribution already has allocations; refusing to double-credit.", 409);
  }

  const [settledAggregate, legacyPositions, mainnetPositions] = await Promise.all([
    prisma.betWager.aggregate({
      where: visibleMainnetWagerWhere({
        settledAt: {
          gte: periodStart,
          lt: periodEnd,
        },
      }),
      _sum: { amountWolo: true },
      _count: { _all: true },
    }),
    prisma.stakingPosition.findMany({
      where: { status: "active", currentStakedWolo: { gt: 0 } },
      select: {
        id: true,
        userId: true,
        walletAddress: true,
        currentStakedWolo: true,
        accumulatedWeight: true,
        lastWeightUpdateAt: true,
      },
    }),
    isWoloMainnet()
      ? loadMainnetStakingPositions(prisma, { asOf: periodEnd, weightStartAt: periodStart })
      : Promise.resolve([]),
  ]);

  const positions = isWoloMainnet()
    ? mainnetPositions.map((position) => ({
        id: null as number | null,
        userId: position.userId,
        walletAddress: position.walletAddress,
        currentStakedWolo: position.currentStakedWolo,
        accumulatedWeight: BigInt(position.stakingWeight || 0),
        lastWeightUpdateAt: periodEnd,
      }))
    : legacyPositions.map((position) => ({
        ...position,
        id: position.id as number | null,
      }));
  const settledVolumeWolo = settledAggregate._sum.amountWolo ?? 0;
  const feePools = calculateLedgerFeePools(settledVolumeWolo);
  const weightedPositions = positions.map((position) => ({
    ...position,
    userWeight:
      position.id == null
        ? position.accumulatedWeight
        : computeCurrentStakingWeight(
            {
              currentStakedWolo: position.currentStakedWolo,
              accumulatedWeight: position.accumulatedWeight,
              lastWeightUpdateAt: position.lastWeightUpdateAt,
            },
            periodEnd
          ),
  }));
  const totalWeight = weightedPositions.reduce(
    (sum, position) => sum + position.userWeight,
    BigInt(0)
  );

  return prisma.$transaction(async (tx) => {
    const distribution = existing
      ? await tx.stakingRewardDistribution.update({
          where: { id: existing.id },
          data: {
            periodStart,
            periodEnd,
            bettingFeePoolWolo: feePools.bettingFeePoolWolo,
            stakerPoolWolo: feePools.stakerPoolWolo,
            treasuryPoolWolo: feePools.treasuryPoolWolo,
            treasuryPayoutRequestId: buildStakingTreasuryPayoutRequestId(periodStart),
            totalWeight,
            status: "FINALIZED",
            finalizedAt: new Date(),
            metadata: {
              settledBets: settledAggregate._count._all,
              settledVolumeWolo,
              unit: "whole_wolo",
            },
          },
        })
      : await tx.stakingRewardDistribution.create({
          data: {
            distributionDate: periodStart,
            periodStart,
            periodEnd,
            bettingFeePoolWolo: feePools.bettingFeePoolWolo,
            stakerPoolWolo: feePools.stakerPoolWolo,
            treasuryPoolWolo: feePools.treasuryPoolWolo,
            treasuryPayoutRequestId: buildStakingTreasuryPayoutRequestId(periodStart),
            totalWeight,
            status: "FINALIZED",
            finalizedAt: new Date(),
            metadata: {
              settledBets: settledAggregate._count._all,
              settledVolumeWolo,
              unit: "whole_wolo",
            },
          },
        });

      if (totalWeight > BigInt(0) && feePools.stakerPoolWolo > 0) {
        const rewardPlans = weightedPositions
          .filter((position) => position.userWeight > BigInt(0))
          .map((position, originalIndex) => {
            const numerator = BigInt(feePools.stakerPoolWolo) * position.userWeight;

            return {
              ...position,
              rewardWolo: Number(numerator / totalWeight),
              rewardRemainder: numerator % totalWeight,
              originalIndex,
            };
          });

        let unallocatedRewardWolo =
          feePools.stakerPoolWolo -
          rewardPlans.reduce((sum, position) => sum + position.rewardWolo, 0);

        for (const position of [...rewardPlans].sort((left, right) => {
          if (left.rewardRemainder !== right.rewardRemainder) {
            return left.rewardRemainder > right.rewardRemainder ? -1 : 1;
          }

          if (left.userWeight !== right.userWeight) {
            return left.userWeight > right.userWeight ? -1 : 1;
          }

          return left.userId - right.userId;
        })) {
          if (unallocatedRewardWolo <= 0) break;

          position.rewardWolo += 1;
          unallocatedRewardWolo -= 1;
        }

        for (const position of rewardPlans.sort((left, right) => left.originalIndex - right.originalIndex)) {
          const rewardWolo = position.rewardWolo;
          if (rewardWolo <= 0) continue;

          const preference = await tx.stakingPosition.findUnique({
            where: { userId: position.userId },
            select: { autoCompoundRewards: true },
          });
          const shouldCompound = preference?.autoCompoundRewards ?? true;
          const creditedAt = new Date();

          const allocation = await tx.stakingRewardAllocation.create({
            data: {
              distributionId: distribution.id,
              userId: position.userId,
              positionId: position.id,
              walletAddress: position.walletAddress,
              userWeight: position.userWeight,
              totalWeight,
              rewardWolo,
              status: shouldCompound ? "COMPOUNDED" : "CREDITED",
              creditedAt,
            },
          });

          if (shouldCompound) {
            const balanceBefore = position.currentStakedWolo;
            const balanceAfter = balanceBefore + rewardWolo;
            const compoundTxHash = `COMPOUND-${distribution.id}-${position.userId}`;

            const compoundPosition = await tx.stakingPosition.upsert({
              where: { userId: position.userId },
              create: {
                userId: position.userId,
                walletAddress: position.walletAddress,
                currentStakedWolo: isWoloMainnet() ? 0 : balanceAfter,
                compoundedRewardsWolo: rewardWolo,
                lifetimeRewardsWolo: rewardWolo,
                autoCompoundRewards: true,
                accumulatedWeight: position.userWeight,
                lastWeightUpdateAt: periodEnd,
                status: "active",
              },
              update: {
                walletAddress: position.walletAddress,
                ...(isWoloMainnet()
                  ? {}
                  : { currentStakedWolo: { increment: rewardWolo } }),
                compoundedRewardsWolo: { increment: rewardWolo },
                lifetimeRewardsWolo: { increment: rewardWolo },
                accumulatedWeight: position.userWeight,
                lastWeightUpdateAt: periodEnd,
                status: "active",
              },
            });

            await tx.stakingEvent.create({
              data: {
                userId: position.userId,
                positionId: compoundPosition.id,
                walletAddress: position.walletAddress,
                type: "COMPOUND",
                amountWolo: rewardWolo,
                txHash: compoundTxHash,
                status: "CONFIRMED",
                weightBefore: position.userWeight,
                weightAfter: position.userWeight,
                balanceBefore,
                balanceAfter,
                confirmedAt: periodEnd,
                metadata: {
                  internalCompound: true,
                  stakingRewardDistributionId: distribution.id,
                  stakingRewardAllocationId: allocation.id,
                  detail: "Auto-compounded staking reward.",
                },
              },
            });
          } else if (!isWoloMainnet() && position.id) {
            await tx.stakingPosition.update({
              where: { id: position.id },
              data: {
                pendingRewardsWolo: { increment: rewardWolo },
                lifetimeRewardsWolo: { increment: rewardWolo },
                accumulatedWeight: position.userWeight,
                lastWeightUpdateAt: periodEnd,
              },
            });
          }
        }
      }

    await tx.stakingDailyStat.upsert({
      where: { date: periodStart },
      create: {
        date: periodStart,
        totalStakedWolo: positions.reduce((sum, position) => sum + position.currentStakedWolo, 0),
        activeStakers: positions.length,
        totalWeight,
        stakerRewardsWolo: feePools.stakerPoolWolo,
        treasuryRevenueWolo: feePools.treasuryPoolWolo,
        betVolumeWolo: settledVolumeWolo,
        betsPlaced: settledAggregate._count._all,
      },
      update: {
        totalStakedWolo: positions.reduce((sum, position) => sum + position.currentStakedWolo, 0),
        activeStakers: positions.length,
        totalWeight,
        stakerRewardsWolo: feePools.stakerPoolWolo,
        treasuryRevenueWolo: feePools.treasuryPoolWolo,
        betVolumeWolo: settledVolumeWolo,
        betsPlaced: settledAggregate._count._all,
      },
    });

    return { distributionId: distribution.id, created: true, status: distribution.status };
  });
}

export async function executeDailyStakingRewardPayouts(
  prisma: PrismaClient,
  distributionId: number
): Promise<StakingRewardPayoutRun> {
  const distribution = await prisma.stakingRewardDistribution.findUnique({
    where: { id: distributionId },
    include: {
      allocations: {
        where: {
          rewardWolo: { gt: 0 },
          status: { in: [...creditedRewardStatuses()] },
        },
        orderBy: [{ id: "asc" }],
        include: {
          user: {
            select: {
              uid: true,
              inGameName: true,
              steamPersonaName: true,
            },
          },
        },
      },
    },
  });

  if (!distribution) {
    throw new StakingActionError("Staking reward distribution not found.", 404);
  }

  const distributionDate = stakingDistributionDateKey(distribution.distributionDate);
  const payoutExecutionConfigured = hasWoloPayoutExecutionConfigured();
  const validPlans = distribution.allocations
    .map((allocation) => {
      const walletAddress = allocation.walletAddress?.trim() || "";
      const addressError = walletAddress ? validateWoloAddress(walletAddress) : "Wallet address is required.";
      return {
        allocation,
        walletAddress,
        addressError,
        requestId: `staking-reward-${distributionDate}-${allocation.userId}`,
      };
    })
    .filter((plan) => !plan.addressError);
  const skippedPayouts = distribution.allocations.length - validPlans.length;

  if (validPlans.length === 0) {
    return {
      distributionId: distribution.id,
      distributionDate,
      payoutExecutionConfigured,
      settlementRunId: null,
      requestedPayouts: 0,
      executedPayouts: 0,
      skippedPayouts,
      status: "skipped",
      detail:
        skippedPayouts > 0
          ? "No reward payouts had a valid WOLO wallet address."
          : "No credited staking rewards are waiting for payout.",
      validation: null,
      execution: null,
    };
  }

  if (!payoutExecutionConfigured) {
    return {
      distributionId: distribution.id,
      distributionDate,
      payoutExecutionConfigured,
      settlementRunId: null,
      requestedPayouts: validPlans.length,
      executedPayouts: 0,
      skippedPayouts,
      status: "not_configured",
      detail:
        getWoloPayoutExecutionBlocker() ||
        "WOLO payout execution is not configured; rewards remain queued in the app ledger.",
      validation: null,
      execution: null,
    };
  }

  const settlementRunId = buildStakingRewardSettlementRunId(
    distribution.id,
    distribution.distributionDate
  );
  const payouts = validPlans.map((plan) => ({
    requestId: plan.requestId,
    toAddress: plan.walletAddress,
    amountWolo: plan.allocation.rewardWolo,
    memo: `AoE2 staking reward ${distributionDate}`,
  }));

  const validation = await validateWoloSettlementRun({
    settlementRunId,
    sourceApp: "aoe2hdbets",
    sourceEventId: `staking-reward-${distribution.id}`,
    note: `Staking reward distribution ${distributionDate}`,
    memo: `AoE2 staking rewards ${distributionDate}`,
    payouts,
  });
  if (!validation) {
    return {
      distributionId: distribution.id,
      distributionDate,
      payoutExecutionConfigured,
      settlementRunId,
      requestedPayouts: validPlans.length,
      executedPayouts: 0,
      skippedPayouts,
      status: "failed",
      detail:
        "WOLO grouped payout dry-run is not available; refusing to execute staking rewards without settlement validation.",
      validation,
      execution: null,
    };
  }
  if (!validation.ok) {
    return {
      distributionId: distribution.id,
      distributionDate,
      payoutExecutionConfigured,
      settlementRunId,
      requestedPayouts: validPlans.length,
      executedPayouts: 0,
      skippedPayouts,
      status: "failed",
      detail:
        validation.detail ||
        validation.failureCode ||
        "WOLO grouped payout dry-run failed; refusing to execute staking rewards.",
      validation,
      execution: null,
    };
  }

  const execution = await executeWoloSettlementRun({
    settlementRunId,
    sourceApp: "aoe2hdbets",
    sourceEventId: `staking-reward-${distribution.id}`,
    note: `Staking reward distribution ${distributionDate}`,
    memo: `AoE2 staking rewards ${distributionDate}`,
    payouts,
  });
  const payoutByRequestId = new Map(
    execution.payouts.map((payout) => [payout.requestId, payout] as const)
  );
  const paidAt = new Date();
  let executedPayouts = 0;

  await prisma.$transaction(async (tx) => {
    for (const plan of validPlans) {
      const payout = payoutByRequestId.get(plan.requestId);
      if (!payout?.ok || !payout.txHash) continue;

      const allocation = await tx.stakingRewardAllocation.findUnique({
        where: { id: plan.allocation.id },
      });
      if (!allocation || !creditedRewardStatuses().includes(allocation.status as "CREDITED" | "PENDING")) {
        continue;
      }

      const position = allocation.positionId
        ? await tx.stakingPosition.findUnique({ where: { id: allocation.positionId } })
        : await tx.stakingPosition.findUnique({ where: { userId: allocation.userId } });
      const weightBefore = position
        ? computeCurrentStakingWeight(position, paidAt)
        : allocation.userWeight;
      const balanceWolo = position?.currentStakedWolo ?? 0;

      await tx.stakingRewardAllocation.update({
        where: { id: allocation.id },
        data: {
          status: "CLAIMED",
          claimedAt: paidAt,
        },
      });

      if (position) {
        await tx.stakingPosition.update({
          where: { id: position.id },
          data: {
            pendingRewardsWolo: {
              decrement: Math.min(position.pendingRewardsWolo, allocation.rewardWolo),
            },
            claimedRewardsWolo: { increment: allocation.rewardWolo },
            accumulatedWeight: weightBefore,
            lastWeightUpdateAt: paidAt,
          },
        });
      }

      await tx.stakingEvent.create({
        data: {
          userId: allocation.userId,
          positionId: allocation.positionId,
          walletAddress: plan.walletAddress,
          type: "CLAIM",
          amountWolo: allocation.rewardWolo,
          txHash: payout.txHash,
          status: "CONFIRMED",
          weightBefore,
          weightAfter: weightBefore,
          balanceBefore: balanceWolo,
          balanceAfter: balanceWolo,
          confirmedAt: paidAt,
          metadata: {
            stakingRewardDistributionId: distribution.id,
            stakingRewardAllocationId: allocation.id,
            payoutRequestId: plan.requestId,
            payoutProofUrl: payout.proofUrl ?? null,
            settlementRunId,
            settlementStatus: execution.status,
            settlementDetail: payout.detail ?? execution.detail ?? null,
          },
        },
      });

      executedPayouts += 1;
    }
  });

  const status =
    executedPayouts === validPlans.length
      ? "confirmed"
      : executedPayouts > 0
        ? "partial"
        : "failed";

  return {
    distributionId: distribution.id,
    distributionDate,
    payoutExecutionConfigured,
    settlementRunId,
    requestedPayouts: validPlans.length,
    executedPayouts,
    skippedPayouts,
    status,
    detail:
      execution.detail ||
      (status === "confirmed"
        ? "All staking rewards were paid on WoloChain."
        : "One or more staking reward payouts did not execute."),
    validation,
    execution,
  };
}
