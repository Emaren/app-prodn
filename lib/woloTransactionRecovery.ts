import { promises as fs } from "node:fs";
import path from "node:path";

import type { Prisma, PrismaClient } from "@/lib/generated/prisma";
import {
  buildWoloRestTxLookupUrl,
  isMainnetVisibleWoloTx,
  isWoloMainnet,
  WOLO_REST_URL,
} from "@/lib/woloChain";
import {
  loadWoloIndexedTransferDashboard,
  type WoloIndexedTransferDashboard,
} from "@/lib/woloMainnetTransfers";

const SOURCE_TAKE = 80;
const DISPLAY_LIMIT = 80;
const CHAIN_LOOKUP_LIMIT = 45;
const TX_LOOKUP_TIMEOUT_MS = 4500;
const FAUCET_LEDGER_PATH =
  process.env.WOLO_FAUCET_LEDGER_PATH?.trim() ||
  path.join(process.cwd(), "storage", "wolo-faucet", "claims.json");

export type WoloRecoveryActionType =
  | "faucet_claim"
  | "stake"
  | "unstake"
  | "bet_challenge_escrow"
  | "payout_settlement"
  | "other";

export type WoloRecoveryAppStatus =
  | "pending"
  | "confirmed"
  | "failed"
  | "needs_review"
  | "reconciled";

export type WoloRecoveryChainStatus = {
  status: "found" | "not_found" | "not_checked" | "unavailable";
  checkedAt: string | null;
  txHash: string | null;
  height: string | null;
  code: number | null;
  success: boolean | null;
  rawLogSummary: string | null;
  timestamp: string | null;
  detail: string | null;
};

export type WoloRecoveryRow = {
  id: string;
  source: string;
  sourceId: string;
  actionType: WoloRecoveryActionType;
  actionLabel: string;
  appStatus: WoloRecoveryAppStatus;
  storedAppStatus: WoloRecoveryAppStatus;
  appStatusDetail: string;
  txHash: string | null;
  txUrl: string | null;
  user: {
    id: number | null;
    uid: string | null;
    displayName: string;
  } | null;
  walletAddress: string | null;
  amountWolo: number | null;
  contextLabel: string;
  createdAt: string;
  updatedAt: string;
  lastCheckedAt: string | null;
  chain: WoloRecoveryChainStatus;
};

export type WoloTransactionRecoveryDashboard = {
  generatedAt: string;
  rows: WoloRecoveryRow[];
  indexedTransfers: WoloIndexedTransferDashboard;
  filters: {
    status: WoloRecoveryAppStatus | "all";
    actionType: WoloRecoveryActionType | "all";
    query: string;
  };
  summary: {
    totalRows: number;
    checkedTxHashes: number;
    chainFound: number;
    chainNotFound: number;
    chainUnavailable: number;
    needsReview: number;
    pending: number;
    confirmed: number;
    failed: number;
    reconciled: number;
  };
  actionTypeCounts: Record<WoloRecoveryActionType, number>;
  statusCounts: Record<WoloRecoveryAppStatus, number>;
  notes: string[];
};

type WoloRecoveryCandidate = Omit<
  WoloRecoveryRow,
  "appStatus" | "txUrl" | "lastCheckedAt" | "chain"
>;

export type WoloMainnetActivityRow = {
  key: string;
  actionType: WoloRecoveryActionType;
  actionLabel: string;
  txHash: string | null;
  userLabel: string | null;
  walletAddress: string | null;
  amountWolo: number | null;
  contextLabel: string;
  createdAt: string;
  updatedAt: string;
};

type RecoveryUser = {
  id: number;
  uid: string;
  inGameName: string | null;
  steamPersonaName: string | null;
  walletAddress?: string | null;
};

type JsonRecord = Record<string, unknown>;

export const WOLO_RECOVERY_ACTION_LABELS: Record<WoloRecoveryActionType, string> = {
  faucet_claim: "Faucet / claim",
  stake: "Stake",
  unstake: "Unstake",
  bet_challenge_escrow: "Bet / challenge escrow",
  payout_settlement: "Payout / settlement",
  other: "Other",
};

export const WOLO_RECOVERY_STATUS_LABELS: Record<WoloRecoveryAppStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  failed: "Failed",
  needs_review: "Needs review",
  reconciled: "Reconciled",
};

function normalizeTxHash(value: string | null | undefined) {
  return (value || "").trim().toUpperCase();
}

function isTxHashLike(value: string) {
  return /^[A-F0-9]{16,128}$/i.test(value.trim());
}

function displayUser(user: RecoveryUser | null | undefined) {
  if (!user) return null;
  return {
    id: user.id,
    uid: user.uid,
    displayName: user.inGameName?.trim() || user.steamPersonaName?.trim() || user.uid,
  };
}

function rowDate(value: Date | null | undefined, fallback: Date) {
  return (value || fallback).toISOString();
}

function jsonRecord(value: Prisma.JsonValue | null | undefined): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function metadataString(metadata: Prisma.JsonValue | null | undefined, key: string) {
  const value = jsonRecord(metadata)[key];
  return typeof value === "string" ? value.trim() : null;
}

function metadataNumber(metadata: Prisma.JsonValue | null | undefined, key: string) {
  const value = jsonRecord(metadata)[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeStakingStatus(value: string) {
  const normalized = value.trim().toUpperCase();
  if (normalized === "CONFIRMED") return "confirmed";
  if (normalized === "PENDING_CHAIN") return "pending";
  if (normalized === "FAILED") return "failed";
  return "needs_review";
}

function normalizeStakeIntentStatus(value: string, txHash: string | null): WoloRecoveryAppStatus {
  switch (value) {
    case "recorded":
      return "reconciled";
    case "failed":
      return "failed";
    case "broadcast_submitted":
    case "verified_unrecorded":
    case "suspect":
    case "orphaned":
      return txHash ? "needs_review" : "pending";
    default:
      return "pending";
  }
}

function normalizeSettlementStatus(value: string | null | undefined): WoloRecoveryAppStatus {
  const normalized = (value || "").trim().toLowerCase();
  if (["executed", "paid", "claimed", "confirmed"].includes(normalized)) return "confirmed";
  if (["recorded", "settled", "active", "won", "lost", "void", "funded"].includes(normalized)) {
    return "reconciled";
  }
  if (["failed", "error"].includes(normalized)) return "failed";
  if (["processing", "executing", "planned", "pending", "dry_run"].includes(normalized)) {
    return "pending";
  }
  return "needs_review";
}

function compactRawLog(value: unknown, success: boolean | null) {
  if (typeof value !== "string" || !value.trim()) {
    return success ? "success" : null;
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.slice(0, 240);
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function chainStatusNotChecked(txHash: string | null): WoloRecoveryChainStatus {
  return {
    status: "not_checked",
    checkedAt: null,
    txHash,
    height: null,
    code: null,
    success: null,
    rawLogSummary: null,
    timestamp: null,
    detail: txHash ? "Not checked in this capped dashboard load." : "No tx hash stored.",
  };
}

export async function lookupWoloTxStatus(txHash: string): Promise<WoloRecoveryChainStatus> {
  const normalized = normalizeTxHash(txHash);
  const checkedAt = new Date().toISOString();

  if (!normalized) {
    return chainStatusNotChecked(null);
  }

  const controller = new AbortController();
  const timeout = windowlessSetTimeout(() => controller.abort(), TX_LOOKUP_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${WOLO_REST_URL.replace(/\/+$/, "")}/cosmos/tx/v1beta1/txs/${encodeURIComponent(
        normalized
      )}`,
      { cache: "no-store", signal: controller.signal }
    );

    if (response.status === 404) {
      return {
        status: "not_found",
        checkedAt,
        txHash: normalized,
        height: null,
        code: null,
        success: null,
        rawLogSummary: null,
        timestamp: null,
        detail: "WOLO REST did not find this tx hash.",
      };
    }

    if (!response.ok) {
      return {
        status: "unavailable",
        checkedAt,
        txHash: normalized,
        height: null,
        code: null,
        success: null,
        rawLogSummary: null,
        timestamp: null,
        detail: `WOLO REST returned HTTP ${response.status}.`,
      };
    }

    const payload = (await response.json().catch(() => null)) as unknown;
    const txResponse = asRecord(asRecord(payload)?.tx_response);
    const code = Number(txResponse?.code ?? 0);
    const success = Number.isFinite(code) ? code === 0 : null;

    return {
      status: "found",
      checkedAt,
      txHash: normalizeTxHash(String(txResponse?.txhash || normalized)),
      height: typeof txResponse?.height === "string" ? txResponse.height : null,
      code: Number.isFinite(code) ? code : null,
      success,
      rawLogSummary: compactRawLog(txResponse?.raw_log, success),
      timestamp: typeof txResponse?.timestamp === "string" ? txResponse.timestamp : null,
      detail: success === false ? "Chain found the tx, but it returned a non-zero code." : null,
    };
  } catch (error) {
    return {
      status: "unavailable",
      checkedAt,
      txHash: normalized,
      height: null,
      code: null,
      success: null,
      rawLogSummary: null,
      timestamp: null,
      detail: error instanceof Error ? error.message : "WOLO REST lookup failed.",
    };
  } finally {
    clearTimeout(timeout);
  }
}

function windowlessSetTimeout(callback: () => void, ms: number) {
  return setTimeout(callback, ms);
}

function deriveAppStatus(
  stored: WoloRecoveryAppStatus,
  chain: WoloRecoveryChainStatus
): WoloRecoveryAppStatus {
  if (chain.status === "found" && chain.success === true) {
    if (stored === "pending" || stored === "failed") return "needs_review";
    return stored;
  }

  if (chain.status === "found" && chain.success === false) {
    if (stored === "confirmed" || stored === "reconciled") return "needs_review";
    return "failed";
  }

  if (chain.status === "not_found" && (stored === "confirmed" || stored === "reconciled")) {
    return "needs_review";
  }

  return stored;
}

function enrichDetail(
  row: WoloRecoveryCandidate,
  appStatus: WoloRecoveryAppStatus,
  chain: WoloRecoveryChainStatus
) {
  if (appStatus === "needs_review" && chain.status === "found" && chain.success === true) {
    return `${row.appStatusDetail} Chain confirms success, but the app source is not reconciled.`;
  }

  if (appStatus === "needs_review" && chain.status === "not_found") {
    return `${row.appStatusDetail} App has a tx hash, but the chain lookup did not find it.`;
  }

  if (appStatus === "needs_review" && chain.status === "found" && chain.success === false) {
    return `${row.appStatusDetail} Chain found the tx with a non-zero code.`;
  }

  return row.appStatusDetail;
}

function matchesQuery(row: WoloRecoveryCandidate | WoloRecoveryRow, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;

  const haystack = [
    row.txHash,
    row.walletAddress,
    row.user?.uid,
    row.user?.displayName,
    row.contextLabel,
    row.source,
    row.sourceId,
    row.actionLabel,
    row.appStatusDetail,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(normalized);
}

function pushRow(rows: WoloRecoveryCandidate[], row: WoloRecoveryCandidate) {
  rows.push({
    ...row,
    txHash: normalizeTxHash(row.txHash) || null,
    walletAddress: row.walletAddress?.trim() || null,
  });
}

async function loadFaucetLedgerRows(existingTxHashes: Set<string>) {
  try {
    const raw = await fs.readFile(FAUCET_LEDGER_PATH, "utf8");
    const parsed = JSON.parse(raw) as Record<
      string,
      {
        claimedAtMs?: number;
        cooldownEndsAtMs?: number;
        txhash?: string;
        amountUwoLo?: string;
      }
    >;

    const ledgerRows: Array<WoloRecoveryCandidate | null> = Object.entries(parsed)
      .map(([address, record]) => {
        const txHash = normalizeTxHash(record.txhash);
        if (!txHash || existingTxHashes.has(txHash)) return null;

        const claimedAtMs = Number(record.claimedAtMs || 0);
        const claimedAt = Number.isFinite(claimedAtMs) && claimedAtMs > 0
          ? new Date(claimedAtMs)
          : new Date();
        const amountWolo = Number.parseFloat(record.amountUwoLo || "0") / 1_000_000;

        return {
          id: `faucet-ledger:${txHash}`,
          source: "faucet_ledger",
          sourceId: address,
          actionType: "faucet_claim" as const,
          actionLabel: "Faucet claim",
          storedAppStatus: "confirmed" as const,
          appStatusDetail: "Faucet JSON ledger recorded this transfer.",
          txHash,
          user: null,
          walletAddress: address,
          amountWolo: Number.isFinite(amountWolo) && amountWolo > 0 ? amountWolo : null,
          contextLabel: "Faucet ledger claim",
          createdAt: claimedAt.toISOString(),
          updatedAt: claimedAt.toISOString(),
        };
      })
    return ledgerRows
      .filter((row): row is WoloRecoveryCandidate => Boolean(row))
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
      .slice(0, SOURCE_TAKE);
  } catch {
    return [] as WoloRecoveryCandidate[];
  }
}

async function loadRecoveryCandidates(prisma: PrismaClient) {
  const [
    stakingEvents,
    stakeIntents,
    wagers,
    scheduledMatches,
    scheduledSettlements,
    pendingClaims,
    treasuryPayouts,
    faucetActivities,
  ] = await Promise.all([
    prisma.stakingEvent.findMany({
      where: {
        OR: [{ txHash: { not: null } }, { status: "PENDING_CHAIN" }],
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: SOURCE_TAKE,
      select: {
        id: true,
        type: true,
        amountWolo: true,
        status: true,
        txHash: true,
        walletAddress: true,
        createdAt: true,
        confirmedAt: true,
        metadata: true,
        user: {
          select: {
            id: true,
            uid: true,
            inGameName: true,
            steamPersonaName: true,
            walletAddress: true,
          },
        },
      },
    }),
    prisma.betStakeIntent.findMany({
      where: {
        OR: [
          { stakeTxHash: { not: null } },
          { status: { in: ["awaiting_signature", "broadcast_submitted", "verified_unrecorded", "failed", "suspect", "orphaned"] } },
        ],
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: SOURCE_TAKE,
      select: {
        id: true,
        amountWolo: true,
        side: true,
        status: true,
        stakeTxHash: true,
        walletAddress: true,
        errorDetail: true,
        createdAt: true,
        updatedAt: true,
        market: { select: { title: true, eventLabel: true } },
        user: {
          select: {
            id: true,
            uid: true,
            inGameName: true,
            steamPersonaName: true,
            walletAddress: true,
          },
        },
      },
    }),
    prisma.betWager.findMany({
      where: {
        OR: [{ stakeTxHash: { not: null } }, { payoutTxHash: { not: null } }],
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: SOURCE_TAKE,
      select: {
        id: true,
        amountWolo: true,
        payoutWolo: true,
        status: true,
        executionMode: true,
        stakeTxHash: true,
        stakeWalletAddress: true,
        payoutTxHash: true,
        createdAt: true,
        updatedAt: true,
        stakeLockedAt: true,
        settledAt: true,
        market: { select: { title: true, eventLabel: true } },
        user: {
          select: {
            id: true,
            uid: true,
            inGameName: true,
            steamPersonaName: true,
            walletAddress: true,
          },
        },
      },
    }),
    prisma.scheduledMatch.findMany({
      where: {
        OR: [
          { challengerFundingTxHash: { not: null } },
          { challengedFundingTxHash: { not: null } },
        ],
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: SOURCE_TAKE,
      select: {
        id: true,
        status: true,
        wagerAmountWolo: true,
        guaranteeAmountWolo: true,
        challengerFundingTxHash: true,
        challengerFundingWalletAddress: true,
        challengerFundedAt: true,
        challengedFundingTxHash: true,
        challengedFundingWalletAddress: true,
        challengedFundedAt: true,
        createdAt: true,
        updatedAt: true,
        challenger: {
          select: {
            id: true,
            uid: true,
            inGameName: true,
            steamPersonaName: true,
            walletAddress: true,
          },
        },
        challenged: {
          select: {
            id: true,
            uid: true,
            inGameName: true,
            steamPersonaName: true,
            walletAddress: true,
          },
        },
      },
    }),
    prisma.scheduledMatchSettlement.findMany({
      where: {
        OR: [{ txHash: { not: null } }, { status: { in: ["planned", "executing", "failed"] } }],
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: SOURCE_TAKE,
      select: {
        id: true,
        status: true,
        action: true,
        recipientAddress: true,
        sourceWalletAddress: true,
        amountWolo: true,
        requestId: true,
        txHash: true,
        errorDetail: true,
        createdAt: true,
        updatedAt: true,
        executedAt: true,
        scheduledMatch: {
          select: {
            id: true,
            challenger: { select: { uid: true, inGameName: true, steamPersonaName: true } },
            challenged: { select: { uid: true, inGameName: true, steamPersonaName: true } },
          },
        },
      },
    }),
    prisma.pendingWoloClaim.findMany({
      where: {
        OR: [
          { payoutTxHash: { not: null } },
          { payoutAttemptedAt: { not: null } },
          { errorState: { not: null } },
        ],
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: SOURCE_TAKE,
      select: {
        id: true,
        displayPlayerName: true,
        amountWolo: true,
        claimKind: true,
        status: true,
        claimedByUserId: true,
        payoutTxHash: true,
        errorState: true,
        payoutAttemptedAt: true,
        createdAt: true,
        updatedAt: true,
        claimedAt: true,
      },
    }),
    prisma.stakingRewardDistribution.findMany({
      where: {
        OR: [
          { treasuryPayoutTxHash: { not: null } },
          { treasuryPayoutStatus: { in: ["PROCESSING", "PAID", "FAILED"] } },
        ],
      },
      orderBy: [{ distributionDate: "desc" }, { id: "desc" }],
      take: SOURCE_TAKE,
      select: {
        id: true,
        distributionDate: true,
        status: true,
        treasuryPoolWolo: true,
        treasuryPayoutStatus: true,
        treasuryPayoutTxHash: true,
        treasuryPayoutAttemptedAt: true,
        treasuryPayoutExecutedAt: true,
        treasuryPayoutError: true,
        createdAt: true,
        finalizedAt: true,
      },
    }),
    prisma.userActivityEvent.findMany({
      where: { type: "wolo_faucet_claimed" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: SOURCE_TAKE,
      select: {
        id: true,
        createdAt: true,
        metadata: true,
        user: {
          select: {
            id: true,
            uid: true,
            inGameName: true,
            steamPersonaName: true,
            walletAddress: true,
          },
        },
      },
    }),
  ]);

  const claimUserIds = Array.from(
    new Set(
      pendingClaims
        .map((claim) => claim.claimedByUserId)
        .filter((userId): userId is number => typeof userId === "number")
    )
  );
  const claimUsers = claimUserIds.length
    ? await prisma.user.findMany({
        where: { id: { in: claimUserIds } },
        select: {
          id: true,
          uid: true,
          inGameName: true,
          steamPersonaName: true,
          walletAddress: true,
        },
      })
    : [];
  const claimUserById = new Map(claimUsers.map((user) => [user.id, user]));

  const rows: WoloRecoveryCandidate[] = [];

  for (const event of stakingEvents) {
    const type = event.type.toUpperCase();
    const actionType: WoloRecoveryActionType =
      type === "STAKE"
        ? "stake"
        : type === "UNSTAKE"
          ? "unstake"
          : type === "CLAIM"
            ? "faucet_claim"
            : "other";
    const storedAppStatus = normalizeStakingStatus(event.status);
    const proofUrl = metadataString(event.metadata, "proofUrl");

    pushRow(rows, {
      id: `staking-event:${event.id}`,
      source: "staking_events",
      sourceId: String(event.id),
      actionType,
      actionLabel: type === "CLAIM" ? "Staking reward claim" : `${type.toLowerCase()} event`,
      storedAppStatus,
      appStatusDetail: `Staking event status: ${event.status}.`,
      txHash: event.txHash,
      user: displayUser(event.user),
      walletAddress: event.walletAddress || event.user.walletAddress || null,
      amountWolo: event.amountWolo,
      contextLabel: proofUrl ? `Staking event · proof stored` : `Staking event #${event.id}`,
      createdAt: event.createdAt.toISOString(),
      updatedAt: rowDate(event.confirmedAt, event.createdAt),
    });
  }

  for (const intent of stakeIntents) {
    const txHash = normalizeTxHash(intent.stakeTxHash) || null;
    const storedAppStatus = normalizeStakeIntentStatus(intent.status, txHash);
    pushRow(rows, {
      id: `bet-stake-intent:${intent.id}`,
      source: "bet_stake_intents",
      sourceId: String(intent.id),
      actionType: "bet_challenge_escrow",
      actionLabel: "Bet escrow stake intent",
      storedAppStatus,
      appStatusDetail: intent.errorDetail || `Stake intent status: ${intent.status}.`,
      txHash,
      user: displayUser(intent.user),
      walletAddress: intent.walletAddress || intent.user.walletAddress || null,
      amountWolo: intent.amountWolo,
      contextLabel: `${intent.market.title} · ${intent.side}`,
      createdAt: intent.createdAt.toISOString(),
      updatedAt: intent.updatedAt.toISOString(),
    });
  }

  for (const wager of wagers) {
    const contextLabel = `${wager.market.title} · ${wager.market.eventLabel}`;
    if (wager.stakeTxHash) {
      pushRow(rows, {
        id: `bet-wager-stake:${wager.id}`,
        source: "bet_wagers.stake_tx_hash",
        sourceId: String(wager.id),
        actionType: "bet_challenge_escrow",
        actionLabel: "Recorded bet escrow",
        storedAppStatus: "reconciled",
        appStatusDetail: `Wager exists with status ${wager.status} and execution mode ${wager.executionMode}.`,
        txHash: wager.stakeTxHash,
        user: displayUser(wager.user),
        walletAddress: wager.stakeWalletAddress || wager.user.walletAddress || null,
        amountWolo: wager.amountWolo,
        contextLabel,
        createdAt: wager.createdAt.toISOString(),
        updatedAt: rowDate(wager.stakeLockedAt || wager.updatedAt, wager.createdAt),
      });
    }

    if (wager.payoutTxHash) {
      pushRow(rows, {
        id: `bet-wager-payout:${wager.id}`,
        source: "bet_wagers.payout_tx_hash",
        sourceId: String(wager.id),
        actionType: "payout_settlement",
        actionLabel: "Bet payout",
        storedAppStatus: "confirmed",
        appStatusDetail: `Bet payout recorded for wager status ${wager.status}.`,
        txHash: wager.payoutTxHash,
        user: displayUser(wager.user),
        walletAddress: wager.user.walletAddress || null,
        amountWolo: wager.payoutWolo,
        contextLabel,
        createdAt: wager.createdAt.toISOString(),
        updatedAt: rowDate(wager.settledAt || wager.updatedAt, wager.createdAt),
      });
    }
  }

  for (const match of scheduledMatches) {
    const amountWolo = match.wagerAmountWolo + match.guaranteeAmountWolo;
    const title = `${displayUser(match.challenger)?.displayName ?? "Challenger"} vs ${
      displayUser(match.challenged)?.displayName ?? "Challenged"
    }`;

    if (match.challengerFundingTxHash) {
      pushRow(rows, {
        id: `scheduled-match-challenger:${match.id}`,
        source: "scheduled_matches.challenger_funding_tx_hash",
        sourceId: String(match.id),
        actionType: "bet_challenge_escrow",
        actionLabel: "Challenge escrow funding",
        storedAppStatus: match.challengerFundedAt ? "reconciled" : "needs_review",
        appStatusDetail: `Challenge status: ${match.status}. Challenger funding ${
          match.challengerFundedAt ? "has funded_at" : "is missing funded_at"
        }.`,
        txHash: match.challengerFundingTxHash,
        user: displayUser(match.challenger),
        walletAddress: match.challengerFundingWalletAddress || match.challenger.walletAddress || null,
        amountWolo,
        contextLabel: title,
        createdAt: match.createdAt.toISOString(),
        updatedAt: rowDate(match.challengerFundedAt || match.updatedAt, match.createdAt),
      });
    }

    if (match.challengedFundingTxHash) {
      pushRow(rows, {
        id: `scheduled-match-challenged:${match.id}`,
        source: "scheduled_matches.challenged_funding_tx_hash",
        sourceId: String(match.id),
        actionType: "bet_challenge_escrow",
        actionLabel: "Challenge escrow funding",
        storedAppStatus: match.challengedFundedAt ? "reconciled" : "needs_review",
        appStatusDetail: `Challenge status: ${match.status}. Challenged funding ${
          match.challengedFundedAt ? "has funded_at" : "is missing funded_at"
        }.`,
        txHash: match.challengedFundingTxHash,
        user: displayUser(match.challenged),
        walletAddress: match.challengedFundingWalletAddress || match.challenged.walletAddress || null,
        amountWolo,
        contextLabel: title,
        createdAt: match.createdAt.toISOString(),
        updatedAt: rowDate(match.challengedFundedAt || match.updatedAt, match.createdAt),
      });
    }
  }

  for (const settlement of scheduledSettlements) {
    const title = `${settlement.scheduledMatch.challenger.inGameName || settlement.scheduledMatch.challenger.steamPersonaName || settlement.scheduledMatch.challenger.uid} vs ${
      settlement.scheduledMatch.challenged.inGameName || settlement.scheduledMatch.challenged.steamPersonaName || settlement.scheduledMatch.challenged.uid
    }`;
    pushRow(rows, {
      id: `scheduled-settlement:${settlement.id}`,
      source: "scheduled_match_settlements",
      sourceId: String(settlement.id),
      actionType: "payout_settlement",
      actionLabel: settlement.action.replace(/_/g, " "),
      storedAppStatus: normalizeSettlementStatus(settlement.status),
      appStatusDetail: settlement.errorDetail || `Scheduled settlement status: ${settlement.status}.`,
      txHash: settlement.txHash,
      user: null,
      walletAddress: settlement.recipientAddress || settlement.sourceWalletAddress || null,
      amountWolo: settlement.amountWolo,
      contextLabel: `${title} · ${settlement.requestId}`,
      createdAt: settlement.createdAt.toISOString(),
      updatedAt: rowDate(settlement.executedAt || settlement.updatedAt, settlement.createdAt),
    });
  }

  for (const claim of pendingClaims) {
    const claimedByUser = claim.claimedByUserId
      ? claimUserById.get(claim.claimedByUserId) ?? null
      : null;
    const storedAppStatus =
      claim.status === "claimed" && claim.payoutTxHash
        ? "confirmed"
        : claim.errorState
          ? "failed"
          : normalizeSettlementStatus(claim.status);
    pushRow(rows, {
      id: `pending-wolo-claim:${claim.id}`,
      source: "pending_wolo_claims",
      sourceId: String(claim.id),
      actionType: "payout_settlement",
      actionLabel: claim.claimKind.replace(/_/g, " "),
      storedAppStatus,
      appStatusDetail: claim.errorState || `Claim status: ${claim.status}.`,
      txHash: claim.payoutTxHash,
      user: displayUser(claimedByUser),
      walletAddress: claimedByUser?.walletAddress || null,
      amountWolo: claim.amountWolo,
      contextLabel: claim.displayPlayerName,
      createdAt: claim.createdAt.toISOString(),
      updatedAt: rowDate(claim.claimedAt || claim.payoutAttemptedAt || claim.updatedAt, claim.createdAt),
    });
  }

  for (const payout of treasuryPayouts) {
    const storedAppStatus = normalizeSettlementStatus(payout.treasuryPayoutStatus);
    pushRow(rows, {
      id: `staking-treasury-payout:${payout.id}`,
      source: "staking_reward_distributions.treasury_payout_tx_hash",
      sourceId: String(payout.id),
      actionType: "payout_settlement",
      actionLabel: "Staking treasury payout",
      storedAppStatus,
      appStatusDetail: payout.treasuryPayoutError || `Treasury payout status: ${payout.treasuryPayoutStatus}.`,
      txHash: payout.treasuryPayoutTxHash,
      user: null,
      walletAddress: null,
      amountWolo: payout.treasuryPoolWolo,
      contextLabel: `Distribution ${payout.distributionDate.toISOString().slice(0, 10)} · ${payout.status}`,
      createdAt: payout.createdAt.toISOString(),
      updatedAt: rowDate(
        payout.treasuryPayoutExecutedAt ||
          payout.treasuryPayoutAttemptedAt ||
          payout.finalizedAt ||
          payout.createdAt,
        payout.createdAt
      ),
    });
  }

  const faucetActivityTxHashes = new Set<string>();
  for (const activity of faucetActivities) {
    const txHash = normalizeTxHash(metadataString(activity.metadata, "txhash"));
    const address = metadataString(activity.metadata, "address") || activity.user.walletAddress || null;
    if (txHash) faucetActivityTxHashes.add(txHash);
    pushRow(rows, {
      id: `faucet-activity:${activity.id}`,
      source: "user_activity_events.wolo_faucet_claimed",
      sourceId: String(activity.id),
      actionType: "faucet_claim",
      actionLabel: "Faucet claim",
      storedAppStatus: txHash ? "confirmed" : "needs_review",
      appStatusDetail: txHash
        ? "User activity recorded a faucet claim tx hash."
        : "Faucet claim activity exists without a tx hash.",
      txHash,
      user: displayUser(activity.user),
      walletAddress: address,
      amountWolo: metadataNumber(activity.metadata, "claimedAmountWolo"),
      contextLabel: "Faucet claim activity",
      createdAt: activity.createdAt.toISOString(),
      updatedAt: activity.createdAt.toISOString(),
    });
  }

  rows.push(...(await loadFaucetLedgerRows(faucetActivityTxHashes)));

  return rows;
}

export async function loadWoloMainnetActivityRows(
  prisma: PrismaClient,
  limit = 25
): Promise<WoloMainnetActivityRow[]> {
  const candidates = dedupeRows(await loadRecoveryCandidates(prisma))
    .filter((row) =>
      isWoloMainnet()
        ? isMainnetVisibleWoloTx({
            txHash: row.txHash,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
          })
        : true
    )
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
    .slice(0, Math.max(1, Math.min(limit, SOURCE_TAKE)));

  return candidates.map((row) => ({
    key: row.txHash ? `tx-${row.txHash}` : `${row.source}:${row.sourceId}`,
    actionType: row.actionType,
    actionLabel: row.actionLabel,
    txHash: row.txHash,
    userLabel: row.user?.displayName ?? null,
    walletAddress: row.walletAddress,
    amountWolo: row.amountWolo,
    contextLabel: row.contextLabel,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

function dedupeRows(rows: WoloRecoveryCandidate[]) {
  const seen = new Set<string>();
  const uniqueRows: WoloRecoveryCandidate[] = [];

  for (const row of rows) {
    const key = row.id;
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueRows.push(row);
  }

  return uniqueRows;
}

function filterActionType(value: string | null | undefined): WoloRecoveryActionType | "all" {
  if (
    value === "faucet_claim" ||
    value === "stake" ||
    value === "unstake" ||
    value === "bet_challenge_escrow" ||
    value === "payout_settlement" ||
    value === "other"
  ) {
    return value;
  }
  return "all";
}

function filterStatus(value: string | null | undefined): WoloRecoveryAppStatus | "all" {
  if (
    value === "pending" ||
    value === "confirmed" ||
    value === "failed" ||
    value === "needs_review" ||
    value === "reconciled"
  ) {
    return value;
  }
  return "all";
}

export async function loadWoloTransactionRecoveryDashboard(
  prisma: PrismaClient,
  input?: {
    status?: string | null;
    actionType?: string | null;
    query?: string | null;
  }
): Promise<WoloTransactionRecoveryDashboard> {
  const generatedAt = new Date().toISOString();
  const status = filterStatus(input?.status);
  const actionType = filterActionType(input?.actionType);
  const query = (input?.query || "").trim().slice(0, 160);
  const queryTxHash = isTxHashLike(query) ? normalizeTxHash(query) : null;

  const [candidateRows, indexedTransfers] = await Promise.all([
    loadRecoveryCandidates(prisma),
    loadWoloIndexedTransferDashboard(prisma, 10).catch(
      (): WoloIndexedTransferDashboard => ({
        source: "wolo-mainnet-bank-send",
        totalRows: 0,
        latestTimestamp: null,
        rows: [],
        notes: [
          "Indexed direct transfers are not available yet. Run the read-only backfill after the database migration is applied.",
        ],
      })
    ),
  ]);

  let candidates = dedupeRows(candidateRows)
    .filter((row) => actionType === "all" || row.actionType === actionType)
    .filter((row) => matchesQuery(row, query))
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());

  const hasExactQueryTx = queryTxHash
    ? candidates.some((row) => row.txHash === queryTxHash)
    : true;
  if (queryTxHash && !hasExactQueryTx) {
    candidates = [
      {
        id: `ad-hoc-tx:${queryTxHash}`,
        source: "operator_tx_lookup",
        sourceId: queryTxHash,
        actionType: "other",
        actionLabel: "Operator tx lookup",
        storedAppStatus: "needs_review",
        appStatusDetail: "No matching app record was found in the recent recovery scan.",
        txHash: queryTxHash,
        user: null,
        walletAddress: null,
        amountWolo: null,
        contextLabel: "Pasted tx hash",
        createdAt: generatedAt,
        updatedAt: generatedAt,
      },
      ...candidates,
    ];
  }

  const chainLookupHashes = Array.from(
    new Set(
      candidates
        .map((row) => row.txHash)
        .filter((txHash): txHash is string => Boolean(txHash))
    )
  ).slice(0, CHAIN_LOOKUP_LIMIT);
  const chainEntries = await Promise.all(
    chainLookupHashes.map(async (txHash) => [txHash, await lookupWoloTxStatus(txHash)] as const)
  );
  const chainByHash = new Map<string, WoloRecoveryChainStatus>(chainEntries);

  const rows = candidates
    .map((row): WoloRecoveryRow => {
      const chain = row.txHash ? chainByHash.get(row.txHash) ?? chainStatusNotChecked(row.txHash) : chainStatusNotChecked(null);
      const appStatus = deriveAppStatus(row.storedAppStatus, chain);
      return {
        ...row,
        appStatus,
        appStatusDetail: enrichDetail(row, appStatus, chain),
        txUrl: buildWoloRestTxLookupUrl(row.txHash),
        lastCheckedAt: chain.checkedAt,
        chain,
      };
    })
    .filter((row) => status === "all" || row.appStatus === status)
    .slice(0, DISPLAY_LIMIT);

  const statusCounts = rows.reduce(
    (counts, row) => ({
      ...counts,
      [row.appStatus]: counts[row.appStatus] + 1,
    }),
    {
      pending: 0,
      confirmed: 0,
      failed: 0,
      needs_review: 0,
      reconciled: 0,
    } satisfies Record<WoloRecoveryAppStatus, number>
  );
  const actionTypeCounts = rows.reduce(
    (counts, row) => ({
      ...counts,
      [row.actionType]: counts[row.actionType] + 1,
    }),
    {
      faucet_claim: 0,
      stake: 0,
      unstake: 0,
      bet_challenge_escrow: 0,
      payout_settlement: 0,
      other: 0,
    } satisfies Record<WoloRecoveryActionType, number>
  );

  return {
    generatedAt,
    rows,
    indexedTransfers,
    filters: { status, actionType, query },
    summary: {
      totalRows: rows.length,
      checkedTxHashes: rows.filter((row) => row.lastCheckedAt).length,
      chainFound: rows.filter((row) => row.chain.status === "found").length,
      chainNotFound: rows.filter((row) => row.chain.status === "not_found").length,
      chainUnavailable: rows.filter((row) => row.chain.status === "unavailable").length,
      needsReview: statusCounts.needs_review,
      pending: statusCounts.pending,
      confirmed: statusCounts.confirmed,
      failed: statusCounts.failed,
      reconciled: statusCounts.reconciled,
    },
    actionTypeCounts,
    statusCounts,
    notes: [
      "This page is read-only. It queries chain status and highlights mismatches; it does not replay payouts, alter claims, or change balances.",
      "A successful chain tx with pending/failed app state is marked needs review so an operator can reconcile through an existing safe path.",
      "Rows are capped to recent source records plus an ad-hoc pasted tx lookup; direct bank-send transfers are cached separately from WoloChain REST tx search.",
      "Faucet rows come from user activity and the faucet JSON ledger when available, not from a normalized faucet DB table.",
    ],
  };
}
