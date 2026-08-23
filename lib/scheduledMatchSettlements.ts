import { Prisma, type PrismaClient } from "@/lib/generated/prisma";
import {
  deriveChallengeFinancialConservation,
} from "@/lib/challengeFinancialConservation";
import {
  challengeSettlementSourceAllocationsForAction,
  challengeSourceAllocationsEqual,
  reconcileChallengeSettlementSourceAccounting,
  sumChallengeSourceAllocations,
  type ChallengeFundingSourceAllocation,
  type ChallengeTransferSourceAccounting,
} from "@/lib/challengeEscrowAccounting";
import {
  acquireChallengeDesyncAdvisoryLock,
  assertWinnerSettlementAllowed,
  ChallengeDesyncError,
  loadDesyncIncidentsForSettlement,
} from "@/lib/desyncChallenge";
import { resolveFinalGameStatsIdForSessionKey } from "@/lib/liveReplayDetail";
import { resolveCommunityTreasuryAddressConfig } from "@/lib/woloCommunityTreasury";
import { getWoloBetEscrowRuntime } from "@/lib/woloChain";
import {
  executeWoloEscrowSettlementRun,
  hasWoloEscrowSettlementExecutionConfigured,
  validateWoloEscrowSettlementRun,
  type SettlementRunPayoutInput,
  type SettlementRunResult,
} from "@/lib/woloBetSettlement";

export const SCHEDULED_MATCH_SETTLEMENT_BACKFILL_IDS = [17, 18, 19, 12] as const;

const SOURCE_APP = "aoe2hdbets";
const EXECUTION_STALE_MS = 15 * 60 * 1000;
const ADVISORY_LOCK_NAMESPACE = 752006;

const SETTLEMENT_STATUSES = new Set([
  "canceled",
  "cancelled",
  "expired",
  "funding_expired",
  "double_no_show",
  "no_show_left",
  "no_show_right",
  "completed",
]);

const SCHEDULED_MATCH_SETTLEMENT_SELECT = {
  id: true,
  status: true,
  scheduledAt: true,
  challengeNote: true,
  wagerAmountWolo: true,
  guaranteeAmountWolo: true,
  cancelledAt: true,
  resultAt: true,
  settlementReadyAt: true,
  linkedSessionKey: true,
  challengerFundingTxHash: true,
  challengerFundingWalletAddress: true,
  challengerFundedAt: true,
  challengedFundingTxHash: true,
  challengedFundingWalletAddress: true,
  challengedFundedAt: true,
  challengerCheckedInAt: true,
  challengedCheckedInAt: true,
  linkedWinner: true,
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
  settlements: {
    orderBy: [
      { createdAt: "asc" },
      { id: "asc" },
    ] as Prisma.ScheduledMatchSettlementOrderByWithRelationInput[],
    select: {
      id: true,
      status: true,
      action: true,
      recipientAddress: true,
      amountWolo: true,
      requestId: true,
      sourceWalletAddress: true,
      txHash: true,
      errorDetail: true,
      attemptCount: true,
      lastAttemptAt: true,
      createdAt: true,
      updatedAt: true,
      executedAt: true,

      allocations: {
        /*
         * Persisted allocation equality is order-independent.
         *
         * Use one deterministic Prisma order object rather
         * than a nested array that becomes a readonly tuple
         * under the surrounding `as const`.
         */
        orderBy: {
          id:
            "asc",
        },

        select: {
          id:
            true,

          sourceSide:
            true,

          sourceBucket:
            true,

          amountWolo:
            true,

          allocationVersion:
            true,

          createdAt:
            true,
        },
      },
    },
  },
} as const;

type ScheduledMatchSettlementRow = Prisma.ScheduledMatchGetPayload<{
  select: typeof SCHEDULED_MATCH_SETTLEMENT_SELECT;
}>;
type ScheduledMatchSettlementDbClient = PrismaClient | Prisma.TransactionClient;

type ParticipantSide = "left" | "right";
type TransferBucket = "wager" | "guarantee" | "combined";
type TransferReason = "refund" | "treasury" | "award";

type ParticipantPlan = {
  side: ParticipantSide;
  participantId: string;
  userId: number;
  uid: string;
  name: string;
  fundingTxHash: string | null;
  fundingWalletAddress: string | null;
  fundedAt: string | null;
  userWalletAddress: string | null;
  funded: boolean;
};

export type ScheduledMatchSettlementTransfer = {
  action: string;
  label: string;
  participantSide: ParticipantSide | "treasury";
  participantName: string | null;
  participantUid: string | null;
  bucket: TransferBucket;
  reason: TransferReason;
  recipientAddress: string | null;
  recipientLabel: string;
  amountWolo: number;

  /*
   * Exact original funded principal consumed by this
   * transfer. This is independent from the human-facing
   * action name.
   */
  sourceAllocations: ChallengeFundingSourceAllocation[];

  /*
   * Historical source-ledger reconciliation.
   */
  sourceAccounting: ChallengeTransferSourceAccounting;

  requestId: string;
  memo: string;
  eventType: "refund_sent" | "guarantee_forfeited_to_treasury" | "guarantee_awarded" | "wager_awarded";
  sourceWalletAddress: string | null;
  fundingTxHash: string | null;
  fundingWalletAddress: string | null;
  existingSettlement: {
    id: number;
    status: string;
    txHash: string | null;
    errorDetail: string | null;
    attemptCount: number;
    lastAttemptAt: string | null;
    executedAt: string | null;
    updatedAt: string;

    sourceAllocations:
      ChallengeFundingSourceAllocation[];
  } | null;
};

export type ScheduledMatchSettlementPlan = {
  id: number;
  title: string;
  status: string;
  state:
    | "ready"
    | "blocked"
    | "executed"
    | "failed"
    | "review_only"
    | "no_funding"
    | "funding_recorded";
  stateLabel: string;
  stateDetail: string;
  scheduledAt: string;
  updatedAt: string;
  resultAt: string | null;
  settlementReadyAt: string | null;
  settlementRunId: string;
  sourceEventId: string;
  sourceWalletAddress: string | null;
  treasuryAddress: string | null;
  treasuryConfigSource: string | null;
  terms: {
    wagerAmountWolo: number;
    guaranteeAmountWolo: number;
    totalFundingWolo: number;
  };
  participants: {
    left: ParticipantPlan;
    right: ParticipantPlan;
  };
  liability: {
    fundedParticipantCount: number;
    fundedLiabilityWolo: number;
    plannedTransferWolo: number;
    refundWolo: number;
    treasuryWolo: number;
    executedWolo: number;
    remainingLiabilityWolo: number;
    projectedSettlementWolo: number;
    conservationOk: boolean;
    failedTransferCount: number;
  };
  blockers: string[];
  transfers: ScheduledMatchSettlementTransfer[];
  dryRun: SettlementRunResult | null;
};

export type ScheduledMatchSettlementPlansPayload = {
  ok: true;
  checkedAt: string;
  dryRun: boolean;
  backfillMatchIds: number[];
  summary: {
    rowCount: number;
    readyCount: number;
    blockedCount: number;
    executedCount: number;
    failedCount: number;
    reviewOnlyCount: number;
    plannedTransferWolo: number;
    refundWolo: number;
    treasuryWolo: number;
  };
  rows: ScheduledMatchSettlementPlan[];
};

export type ScheduledMatchSettlementExecutionResult = {
  ok: boolean;
  plan: ScheduledMatchSettlementPlan;
  execution: SettlementRunResult;
};

export class ScheduledMatchSettlementError extends Error {
  status: number;
  code: string;

  constructor(message: string, options?: { status?: number; code?: string }) {
    super(message);
    this.name = "ScheduledMatchSettlementError";
    this.status = options?.status ?? 409;
    this.code = options?.code ?? "SCHEDULED_MATCH_SETTLEMENT_ERROR";
  }
}

function displayUserName(user: {
  uid: string;
  inGameName: string | null;
  steamPersonaName: string | null;
}) {
  return user.inGameName || user.steamPersonaName || user.uid;
}

function normalizeStatus(value: string | null | undefined) {
  return (value || "").trim().toLowerCase();
}

export function scheduledMatchSettlementRequiresWinnerDesyncGuard(
  status: string | null | undefined
) {
  return normalizeStatus(status) === "completed";
}

function normalizeIdentity(value: string | null | undefined) {
  return (value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function participantAliases(user: ScheduledMatchSettlementRow["challenger"]) {
  return new Set(
    [user.uid, user.inGameName, user.steamPersonaName]
      .map(normalizeIdentity)
      .filter(Boolean)
  );
}

function titleForMatch(row: ScheduledMatchSettlementRow) {
  return `${displayUserName(row.challenger)} vs ${displayUserName(row.challenged)}`;
}

function settlementSlug(status: string) {
  switch (normalizeStatus(status)) {
    case "cancelled":
    case "canceled":
      return "canceled";
    case "expired":
      return "expired";
    case "funding_expired":
      return "funding-expired";
    case "double_no_show":
      return "double-noshow";
    case "no_show_left":
      return "no-show-left";
    case "no_show_right":
      return "no-show-right";
    case "completed":
      return "completed-review";
    default:
      return "review";
  }
}

function buildSettlementRunId(row: ScheduledMatchSettlementRow) {
  return `aoe2hdbets:challenge-${row.id}:${settlementSlug(row.status)}:v1`;
}

function buildSourceEventId(row: ScheduledMatchSettlementRow) {
  return `scheduled-match-${row.id}`;
}

function compactMemo(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, 180);
}

function buildParticipant(
  side: ParticipantSide,
  user: ScheduledMatchSettlementRow["challenger"],
  funding: {
    fundingTxHash: string | null;
    fundingWalletAddress: string | null;
    fundedAt: Date | null;
  }
): ParticipantPlan {
  const fundingTxHash = funding.fundingTxHash?.trim() || null;
  const fundingWalletAddress = funding.fundingWalletAddress?.trim() || null;
  const fundedAt = funding.fundedAt?.toISOString() ?? null;
  // Mainnet settlement liability is tx-backed. A timestamp or wallet field alone
  // is not proof that WOLO reached Bet Escrow. Missing recipient metadata remains
  // visible as a blocker when a funding tx exists.
  const funded = Boolean(fundingTxHash);

  return {
    side,
    participantId: user.uid,
    userId: user.id,
    uid: user.uid,
    name: displayUserName(user),
    fundingTxHash,
    fundingWalletAddress,
    fundedAt,
    userWalletAddress: user.walletAddress?.trim() || null,
    funded,
  };
}

function transferRequestId(matchId: number, action: string) {
  return `aoe2hdbets:challenge-${matchId}:${action}`;
}

function buildExistingSettlementMap(row: ScheduledMatchSettlementRow) {
  const map = new Map<string, ScheduledMatchSettlementTransfer["existingSettlement"]>();
  for (const settlement of row.settlements) {
    // Superseded rows remain immutable history but are
    // never the current economic obligation.
    if (
      normalizeStatus(settlement.status) ===
      "superseded"
    ) {
      continue;
    }

    const key = settlementKey({
      action: settlement.action,
      recipientAddress: settlement.recipientAddress,
      amountWolo: settlement.amountWolo,
    });
    map.set(key, {
      id: settlement.id,
      status: settlement.status,
      txHash: settlement.txHash ?? null,
      errorDetail: settlement.errorDetail ?? null,
      attemptCount: settlement.attemptCount,
      lastAttemptAt: settlement.lastAttemptAt?.toISOString() ?? null,
      executedAt: settlement.executedAt?.toISOString() ?? null,
      updatedAt: settlement.updatedAt.toISOString(),

      sourceAllocations:
        settlement.allocations.map(
          (allocation) => ({
            side:
              allocation.sourceSide as
                | "left"
                | "right",

            bucket:
              allocation.sourceBucket as
                | "wager"
                | "guarantee",

            amountWolo:
              allocation.amountWolo,
          }),
        ),
    });
  }
  return map;
}

function settlementKey(input: {
  action: string;
  recipientAddress: string | null;
  amountWolo: number;
}) {
  return `${input.action}|${input.recipientAddress || ""}|${input.amountWolo}`;
}

function existingForTransfer(
  existingMap: Map<string, ScheduledMatchSettlementTransfer["existingSettlement"]>,
  transfer: Pick<ScheduledMatchSettlementTransfer, "action" | "recipientAddress" | "amountWolo">
) {
  return (
    existingMap.get(
      settlementKey({
        action: transfer.action,
        recipientAddress: transfer.recipientAddress,
        amountWolo: transfer.amountWolo,
      })
    ) ?? null
  );
}

function addTransfer(
  transfers: ScheduledMatchSettlementTransfer[],
  row: ScheduledMatchSettlementRow,
  existingMap: Map<string, ScheduledMatchSettlementTransfer["existingSettlement"]>,
  input: {
    action: string;
    label: string;
    participant: ParticipantPlan | null;
    participantSide: ParticipantSide | "treasury";
    bucket: TransferBucket;
    reason: TransferReason;
    recipientAddress: string | null;
    recipientLabel: string;
    amountWolo: number;
    eventType: ScheduledMatchSettlementTransfer["eventType"];
    sourceWalletAddress: string | null;
  }
) {
  if (input.amountWolo <= 0) return;

  const transfer: ScheduledMatchSettlementTransfer = {
    action: input.action,
    label: input.label,
    participantSide: input.participantSide,
    participantName: input.participant?.name ?? null,
    participantUid: input.participant?.uid ?? null,
    bucket: input.bucket,
    reason: input.reason,
    recipientAddress: input.recipientAddress,
    recipientLabel: input.recipientLabel,
    amountWolo: input.amountWolo,

    sourceAllocations:
      challengeSettlementSourceAllocationsForAction({
        action: input.action,
        amountWolo: input.amountWolo,

        wagerAmountWolo:
          row.wagerAmountWolo,

        guaranteeAmountWolo:
          row.guaranteeAmountWolo,

        leftFunded:
          Boolean(
            row.challengerFundingTxHash?.trim(),
          ),

        rightFunded:
          Boolean(
            row.challengedFundingTxHash?.trim(),
          ),
      }),

    sourceAccounting: {
      satisfiedByHistory: false,
      satisfiedBySettlementIds: [],
      blocker: null,
    },

    requestId: transferRequestId(row.id, input.action),
    memo: compactMemo(`AoE2 challenge #${row.id} ${input.label}`),
    eventType: input.eventType,
    sourceWalletAddress: input.sourceWalletAddress,
    fundingTxHash: input.participant?.fundingTxHash ?? null,
    fundingWalletAddress: input.participant?.fundingWalletAddress ?? null,
    existingSettlement: null,
  };

  transfer.existingSettlement = existingForTransfer(existingMap, transfer);
  transfers.push(transfer);
}

function buildRawTransfers(input: {
  row: ScheduledMatchSettlementRow;
  left: ParticipantPlan;
  right: ParticipantPlan;
  sourceWalletAddress: string | null;
  treasuryAddress: string | null;
  existingMap: Map<string, ScheduledMatchSettlementTransfer["existingSettlement"]>;
}) {
  const transfers: ScheduledMatchSettlementTransfer[] = [];
  const status = normalizeStatus(input.row.status);
  const wager = Math.max(0, input.row.wagerAmountWolo);
  const guarantee = Math.max(0, input.row.guaranteeAmountWolo);
  const total = wager + guarantee;

  const refundParticipant = (
    participant: ParticipantPlan,
    amountWolo: number,
    action: string,
    label: string,
    bucket: TransferBucket
  ) => {
    addTransfer(transfers, input.row, input.existingMap, {
      action,
      label,
      participant,
      participantSide: participant.side,
      bucket,
      reason: "refund",
      recipientAddress: participant.fundingWalletAddress,
      recipientLabel: participant.name,
      amountWolo,
      eventType: "refund_sent",
      sourceWalletAddress: input.sourceWalletAddress,
    });
  };

  const treasuryTransfer = (
    participant: ParticipantPlan | null,
    amountWolo: number,
    action: string,
    label: string
  ) => {
    addTransfer(transfers, input.row, input.existingMap, {
      action,
      label,
      participant,
      participantSide: participant?.side ?? "treasury",
      bucket: "guarantee",
      reason: "treasury",
      recipientAddress: input.treasuryAddress,
      recipientLabel: "Community Treasury",
      amountWolo,
      eventType: "guarantee_forfeited_to_treasury",
      sourceWalletAddress: input.sourceWalletAddress,
    });
  };

  const awardGuaranteeToParticipant = (
    recipient: ParticipantPlan,
    sourceParticipant: ParticipantPlan,
    amountWolo: number,
    action: string,
    label: string
  ) => {
    addTransfer(transfers, input.row, input.existingMap, {
      action,
      label,
      participant: sourceParticipant,
      participantSide: recipient.side,
      bucket: "guarantee",
      reason: "award",
      recipientAddress: recipient.fundingWalletAddress || recipient.userWalletAddress,
      recipientLabel: recipient.name,
      amountWolo,
      eventType: "guarantee_awarded",
      sourceWalletAddress: input.sourceWalletAddress,
    });
  };

  const awardWagerToParticipant = (
    recipient: ParticipantPlan,
    amountWolo: number,
    action: string,
    label: string
  ) => {
    addTransfer(transfers, input.row, input.existingMap, {
      action,
      label,
      participant: recipient,
      participantSide: recipient.side,
      bucket: "wager",
      reason: "award",
      recipientAddress: recipient.fundingWalletAddress || recipient.userWalletAddress,
      recipientLabel: recipient.name,
      amountWolo,
      eventType: "wager_awarded",
      sourceWalletAddress: input.sourceWalletAddress,
    });
  };

  if (["canceled", "cancelled", "expired", "funding_expired"].includes(status)) {
    if (input.left.funded) {
      refundParticipant(input.left, total, "left_full_refund", "left full refund", "combined");
    }
    if (input.right.funded) {
      refundParticipant(input.right, total, "right_full_refund", "right full refund", "combined");
    }
    return transfers;
  }

  if (status === "completed") {
    const winnerKey = normalizeIdentity(input.row.linkedWinner);
    const leftMatches = Boolean(winnerKey) && participantAliases(input.row.challenger).has(winnerKey);
    const rightMatches = Boolean(winnerKey) && participantAliases(input.row.challenged).has(winnerKey);
    const winner = leftMatches === rightMatches ? null : leftMatches ? input.left : input.right;

    if (!winner || !input.left.funded || !input.right.funded) {
      return transfers;
    }

    if (guarantee > 0) {
      refundParticipant(input.left, guarantee, "left_guarantee_return", "left match guarantee return", "guarantee");
      refundParticipant(input.right, guarantee, "right_guarantee_return", "right match guarantee return", "guarantee");
    }
    awardWagerToParticipant(
      winner,
      wager * 2,
      `${winner.side}_winner_wager_award`,
      `${winner.side} winner wager award`
    );
    return transfers;
  }

  if (status === "double_no_show") {
    if (input.left.funded) {
      refundParticipant(input.left, wager, "left_wager_refund", "left wager refund", "wager");
    }
    if (input.right.funded) {
      refundParticipant(input.right, wager, "right_wager_refund", "right wager refund", "wager");
    }

    const treasuryWolo =
      (input.left.funded ? guarantee : 0) + (input.right.funded ? guarantee : 0);
    if (treasuryWolo > 0) {
      treasuryTransfer(null, treasuryWolo, "guarantees_to_treasury", "match guarantees to treasury");
    }
    return transfers;
  }

  if (status === "no_show_left") {
    if (input.left.funded) {
      refundParticipant(input.left, wager, "left_wager_refund", "left wager refund", "wager");
    }
    if (input.right.funded) {
      refundParticipant(input.right, wager, "right_wager_refund", "right wager refund", "wager");
      awardGuaranteeToParticipant(
        input.right,
        input.right,
        guarantee,
        "right_own_guarantee_return",
        "right own match guarantee return"
      );
      if (input.left.funded) {
        awardGuaranteeToParticipant(
          input.right,
          input.left,
          guarantee,
          "left_guarantee_awarded_to_right",
          "left missed-side match guarantee to right"
        );
      }
    }
    return transfers;
  }

  if (status === "no_show_right") {
    if (input.right.funded) {
      refundParticipant(input.right, wager, "right_wager_refund", "right wager refund", "wager");
    }
    if (input.left.funded) {
      refundParticipant(input.left, wager, "left_wager_refund", "left wager refund", "wager");
      awardGuaranteeToParticipant(
        input.left,
        input.left,
        guarantee,
        "left_own_guarantee_return",
        "left own match guarantee return"
      );
      if (input.right.funded) {
        awardGuaranteeToParticipant(
          input.left,
          input.right,
          guarantee,
          "right_guarantee_awarded_to_left",
          "right missed-side match guarantee to left"
        );
      }
    }
  }

  return transfers;
}

function transferBlockers(plan: {
  sourceWalletAddress: string | null;
  treasuryAddress: string | null;
  transfers: ScheduledMatchSettlementTransfer[];
}) {
  const blockers: string[] = [];
  if (!plan.sourceWalletAddress) {
    blockers.push("WOLO_BET_ESCROW_ADDRESS is not configured for Bet Escrow settlement.");
  }

  for (const transfer of plan.transfers) {
    if (!transfer.recipientAddress) {
      blockers.push(`${transfer.label} cannot execute because ${transfer.recipientLabel} has no funding wallet address.`);
    }
    if (transfer.amountWolo < 1) {
      blockers.push(`${transfer.label} has no positive WOLO amount.`);
    }

    const sourceAllocationWolo =
      sumChallengeSourceAllocations(
        transfer.sourceAllocations,
      );

    if (
      transfer.sourceAllocations.length === 0 ||
      sourceAllocationWolo !== transfer.amountWolo
    ) {
      blockers.push(
        `${transfer.label} has no exact escrow source accounting: ` +
        `${sourceAllocationWolo.toLocaleString()} WOLO allocated ` +
        `for a ${transfer.amountWolo.toLocaleString()} WOLO transfer.`,
      );
    }


    if (
      transfer.existingSettlement
    ) {
      const persisted =
        transfer
          .existingSettlement
          .sourceAllocations;

      if (
        persisted.length ===
        0
      ) {
        blockers.push(
          `PERSISTED ESCROW ALLOCATION MISSING: ` +
          `settlement #${transfer.existingSettlement.id} ` +
          `has no durable funded-source allocation.`,
        );
      } else if (
        !challengeSourceAllocationsEqual(
          persisted,
          transfer.sourceAllocations,
        )
      ) {
        blockers.push(
          `PERSISTED ESCROW ALLOCATION MISMATCH: ` +
          `settlement #${transfer.existingSettlement.id} ` +
          `does not match the current economic obligation.`,
        );
      }
    }
  }

  if (plan.transfers.some((transfer) => transfer.reason === "treasury") && !plan.treasuryAddress) {
    blockers.push("Community Treasury address is not configured.");
  }

  return Array.from(new Set(blockers));
}

function determinePlanState(input: {
  status: string;
  fundedCount: number;
  transfers: ScheduledMatchSettlementTransfer[];
  blockers: string[];
}) {
  if (input.fundedCount === 0) {
    return {
      state: "no_funding" as const,
      stateLabel: "No funding",
      stateDetail: "No scheduled-match funding is recorded, so there is nothing to settle.",
    };
  }

  if (input.blockers.length > 0) {
    return {
      state: "blocked" as const,
      stateLabel: "Needs review",
      stateDetail: input.blockers[0],
    };
  }

  const executedTransfers =
    input.transfers.filter(
      isTransferExecuted,
    );
  if (input.transfers.length > 0 && executedTransfers.length === input.transfers.length) {
    return {
      state: "executed" as const,
      stateLabel: "Settlement executed",
      stateDetail: "Every scheduled-match escrow transfer has an executed tx hash.",
    };
  }

  if (input.transfers.some((transfer) => transfer.existingSettlement?.status === "failed")) {
    return {
      state: "failed" as const,
      stateLabel: "Failed / retryable",
      stateDetail: "One or more scheduled-match settlement transfers failed and need operator review.",
    };
  }

  if (SETTLEMENT_STATUSES.has(normalizeStatus(input.status))) {
    return {
      state: "ready" as const,
      stateLabel: "Settlement ready",
      stateDetail: "Dry-run the exact transfers, then execute from the operator rail.",
    };
  }

  return {
    state: "funding_recorded" as const,
    stateLabel: "Funding recorded",
    stateDetail: "Funding exists, but the match is not yet in a settlement-ready status.",
  };
}

function isTransferExecuted(
  transfer: ScheduledMatchSettlementTransfer,
) {
  return Boolean(
    transfer
      .sourceAccounting
      .satisfiedByHistory ||
    (
      transfer
        .existingSettlement
        ?.status ===
        "executed" &&
      transfer
        .existingSettlement
        .txHash
    )
  );
}

export function buildScheduledMatchSettlementPlan(
  row: ScheduledMatchSettlementRow,
  options?: { dryRun?: SettlementRunResult | null }
): ScheduledMatchSettlementPlan {
  const escrowRuntime = getWoloBetEscrowRuntime();
  const treasuryConfig = resolveCommunityTreasuryAddressConfig();
  const sourceWalletAddress = escrowRuntime.escrowAddress;
  const treasuryAddress = treasuryConfig.address;
  const existingMap = buildExistingSettlementMap(row);
  const left = buildParticipant("left", row.challenger, {
    fundingTxHash: row.challengerFundingTxHash,
    fundingWalletAddress: row.challengerFundingWalletAddress,
    fundedAt: row.challengerFundedAt,
  });
  const right = buildParticipant("right", row.challenged, {
    fundingTxHash: row.challengedFundingTxHash,
    fundingWalletAddress: row.challengedFundingWalletAddress,
    fundedAt: row.challengedFundedAt,
  });
  const fundedParticipants = [left, right].filter((participant) => participant.funded);
  const transfers = buildRawTransfers({
    row,
    left,
    right,
    sourceWalletAddress,
    treasuryAddress,
    existingMap,
  });

  const sourceAccounting =
    reconcileChallengeSettlementSourceAccounting({
      wagerAmountWolo:
        row.wagerAmountWolo,

      guaranteeAmountWolo:
        row.guaranteeAmountWolo,

      leftFunded:
        left.funded,

      rightFunded:
        right.funded,

      settlements:
        row.settlements.map(
          (settlement) => ({
            id:
              settlement.id,

            status:
              settlement.status,

            action:
              settlement.action,

            recipientAddress:
              settlement.recipientAddress,

            amountWolo:
              settlement.amountWolo,

            txHash:
              settlement.txHash,

            sourceAllocations:
              settlement.allocations.map(
                (allocation) => ({
                  side:
                    allocation.sourceSide as
                      | "left"
                      | "right",

                  bucket:
                    allocation.sourceBucket as
                      | "wager"
                      | "guarantee",

                  amountWolo:
                    allocation.amountWolo,
                }),
              ),
          }),
        ),

      transfers:
        transfers.map(
          (transfer) => ({
            label:
              transfer.label,

            recipientAddress:
              transfer.recipientAddress,

            amountWolo:
              transfer.amountWolo,

            sourceAllocations:
              transfer.sourceAllocations,
          }),
        ),
    });

  sourceAccounting
    .transferAccounting
    .forEach(
      (
        accounting,
        index,
      ) => {
        const transfer =
          transfers[index];

        if (transfer) {
          transfer.sourceAccounting =
            accounting;
        }
      },
    );

  const blockers = transferBlockers({
    sourceWalletAddress,
    treasuryAddress,
    transfers,
  });

  blockers.push(
    ...sourceAccounting.blockers,
  );
  if (normalizeStatus(row.status) === "completed") {
    const winnerKey = normalizeIdentity(row.linkedWinner);
    const leftMatches = Boolean(winnerKey) && participantAliases(row.challenger).has(winnerKey);
    const rightMatches = Boolean(winnerKey) && participantAliases(row.challenged).has(winnerKey);
    if (!winnerKey || leftMatches === rightMatches) {
      blockers.push("Completed match winner does not resolve uniquely to one challenge participant.");
    }
    if (!left.funded || !right.funded) {
      blockers.push("Completed wager settlement requires both participants to have verified funding.");
    }
  }
  const pendingPlanWolo = transfers
    .filter(
      (transfer) =>
        !isTransferExecuted(transfer),
    )
    .reduce(
      (sum, transfer) =>
        sum + transfer.amountWolo,
      0,
    );

  /*
   * This is the Challenge V3 financial firewall.
   *
   * It deliberately consumes ALL historical rows marked
   * executed, including rows generated by older planner
   * action names.
   *
   * A renamed or restructured planner therefore cannot
   * regain spending authority over already-consumed
   * Challenge principal.
   */
  const conservation =
    deriveChallengeFinancialConservation({
      fundingEachWolo:
        row.wagerAmountWolo +
        row.guaranteeAmountWolo,

      leftFunded:
        left.funded,

      rightFunded:
        right.funded,

      settlements:
        row.settlements,

      pendingPlanWolo,
    });

  blockers.unshift(
    ...conservation.blockers,
  );

  const planState = determinePlanState({
    status: row.status,
    fundedCount: fundedParticipants.length,
    transfers,
    blockers,
  });
  const plannedTransferWolo = transfers.reduce((sum, transfer) => sum + transfer.amountWolo, 0);
  const executedWolo =
    conservation.historicalExecutedWolo;

  return {
    id: row.id,
    title: titleForMatch(row),
    status: row.status,
    state: planState.state,
    stateLabel: planState.stateLabel,
    stateDetail: planState.stateDetail,
    scheduledAt: row.scheduledAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    resultAt: row.resultAt?.toISOString() ?? null,
    settlementReadyAt: row.settlementReadyAt?.toISOString() ?? null,
    settlementRunId: buildSettlementRunId(row),
    sourceEventId: buildSourceEventId(row),
    sourceWalletAddress,
    treasuryAddress,
    treasuryConfigSource: treasuryConfig.sourceLabel,
    terms: {
      wagerAmountWolo: row.wagerAmountWolo,
      guaranteeAmountWolo: row.guaranteeAmountWolo,
      totalFundingWolo: row.wagerAmountWolo + row.guaranteeAmountWolo,
    },
    participants: {
      left,
      right,
    },
    liability: {
      fundedParticipantCount: fundedParticipants.length,
      fundedLiabilityWolo:
        conservation.fundedLiabilityWolo,
      plannedTransferWolo,
      refundWolo: transfers
        .filter((transfer) => transfer.reason === "refund")
        .reduce((sum, transfer) => sum + transfer.amountWolo, 0),
      treasuryWolo: transfers
        .filter((transfer) => transfer.reason === "treasury")
        .reduce((sum, transfer) => sum + transfer.amountWolo, 0),
      executedWolo,
      remainingLiabilityWolo:
        conservation.remainingLiabilityWolo,
      projectedSettlementWolo:
        conservation.projectedSettlementWolo,
      conservationOk:
        conservation.ok,
      failedTransferCount: transfers.filter(
        (transfer) => transfer.existingSettlement?.status === "failed"
      ).length,
    },
    blockers,
    transfers,
    dryRun: options?.dryRun ?? null,
  };
}

function buildSettlementRunInput(plan: ScheduledMatchSettlementPlan) {
  const payouts = plan.transfers.filter((transfer) => !isTransferExecuted(transfer));
  return {
    settlementRunId: plan.settlementRunId,
    sourceApp: SOURCE_APP,
    sourceEventId: plan.sourceEventId,
    note: `Scheduled match settlement · ${plan.title} · ${plan.status}`,
    memo: compactMemo(`AoE2 challenge #${plan.id} escrow settlement`),
    payouts: payouts.map((transfer) => ({
      requestId: transfer.requestId,
      toAddress: transfer.recipientAddress || "",
      amountWolo: transfer.amountWolo,
      memo: transfer.memo,
    })) satisfies SettlementRunPayoutInput[],
  };
}

async function validatePlanDryRun(plan: ScheduledMatchSettlementPlan) {
  if (
    plan.blockers.length > 0 ||
    plan.state === "executed" ||
    plan.state === "review_only" ||
    plan.state === "no_funding"
  ) {
    return null;
  }
  if (plan.transfers.length === 0 || plan.transfers.every(isTransferExecuted)) {
    return null;
  }
  const dryRun = await validateWoloEscrowSettlementRun(buildSettlementRunInput(plan));
  return enforceEscrowRunSource(plan, dryRun);
}

function firstRunSigner(run: SettlementRunResult | null) {
  const payoutSigner = run?.payouts.find(
    (payout) => payout.signerRole || payout.signerAddress
  );
  return {
    role: run?.signerRole || payoutSigner?.signerRole || null,
    address: run?.signerAddress || payoutSigner?.signerAddress || null,
  };
}

function enforceEscrowRunSource(
  plan: ScheduledMatchSettlementPlan,
  run: SettlementRunResult | null
) {
  if (!run) return null;
  const signer = firstRunSigner(run);
  const role = signer.role?.trim().toLowerCase() || null;
  const address = signer.address?.trim() || null;
  const expectedAddress = plan.sourceWalletAddress?.trim() || null;
  const roleMismatch = role !== null && role !== "escrow";
  const addressMismatch =
    address !== null &&
    expectedAddress !== null &&
    address.toLowerCase() !== expectedAddress.toLowerCase();
  const verified = run.ok && role === "escrow" && Boolean(address);
  if (!roleMismatch && !addressMismatch && (!run.ok || verified)) {
    return run;
  }

  const detail = roleMismatch
    ? `WoloChain grouped run reported signer role ${role}; scheduled-match settlements must execute from Bet Escrow.`
    : addressMismatch
      ? `WoloChain grouped run reported signer ${address}; expected Bet Escrow ${expectedAddress}.`
      : "WoloChain grouped run did not confirm an escrow signer for this scheduled-match settlement.";

  return {
    ...run,
    ok: false,
    status: "failed",
    failureCode: "ESCROW_SIGNER_UNVERIFIED",
    retryable: false,
    detail,
  } satisfies SettlementRunResult;
}

async function requireExecutableEscrowDryRun(plan: ScheduledMatchSettlementPlan) {
  const dryRun = await validatePlanDryRun(plan);
  if (!dryRun) {
    throw new ScheduledMatchSettlementError(
      "WOLO escrow settlement dry-run is not available in this environment.",
      { status: 409, code: "ESCROW_DRY_RUN_UNAVAILABLE" }
    );
  }
  if (!dryRun.ok) {
    throw new ScheduledMatchSettlementError(
      dryRun.detail || dryRun.failureCode || "WOLO escrow settlement dry-run failed.",
      { status: 409, code: dryRun.failureCode || "ESCROW_DRY_RUN_FAILED" }
    );
  }
  return dryRun;
}

function summarizePlans(
  plans: ScheduledMatchSettlementPlan[],
  dryRun: boolean
): ScheduledMatchSettlementPlansPayload {
  return {
    ok: true,
    checkedAt: new Date().toISOString(),
    dryRun,
    backfillMatchIds: [...SCHEDULED_MATCH_SETTLEMENT_BACKFILL_IDS],
    summary: {
      rowCount: plans.length,
      readyCount: plans.filter((plan) => plan.state === "ready").length,
      blockedCount: plans.filter((plan) => plan.state === "blocked").length,
      executedCount: plans.filter((plan) => plan.state === "executed").length,
      failedCount: plans.filter((plan) => plan.state === "failed").length,
      reviewOnlyCount: plans.filter((plan) => plan.state === "review_only").length,
      plannedTransferWolo: plans.reduce(
        (sum, plan) => sum + plan.liability.plannedTransferWolo,
        0
      ),
      refundWolo: plans.reduce((sum, plan) => sum + plan.liability.refundWolo, 0),
      treasuryWolo: plans.reduce((sum, plan) => sum + plan.liability.treasuryWolo, 0),
    },
    rows: plans,
  };
}

export async function loadScheduledMatchSettlementPlans(
  prisma: PrismaClient,
  options?: {
    dryRun?: boolean;
    ids?: number[];
    take?: number;
  }
): Promise<ScheduledMatchSettlementPlansPayload> {
  const ids = options?.ids?.filter((id) => Number.isInteger(id) && id > 0) ?? [];
  const take = Math.max(1, Math.min(options?.take ?? 40, 100));
  const rows = await prisma.scheduledMatch.findMany({
    where:
      ids.length > 0
        ? { id: { in: ids } }
        : {
            OR: [
              { status: { in: ["canceled", "cancelled", "expired", "funding_expired", "double_no_show", "no_show_left", "no_show_right", "completed"] } },
              { settlementReadyAt: { not: null } },
              { challengerFundedAt: { not: null } },
              { challengedFundedAt: { not: null } },
              { challengerFundingTxHash: { not: null } },
              { challengedFundingTxHash: { not: null } },
            ],
          },
    orderBy: [{ settlementReadyAt: "asc" }, { updatedAt: "asc" }, { id: "asc" }],
    take,
    select: SCHEDULED_MATCH_SETTLEMENT_SELECT,
  });

  let plans = rows.map((row) => buildScheduledMatchSettlementPlan(row));
  if (options?.dryRun) {
    plans = await Promise.all(
      plans.map(async (plan) => {
        try {
          const dryRun = await validatePlanDryRun(plan);
          return { ...plan, dryRun };
        } catch (error) {
          const detail =
            error instanceof Error ? error.message : "WoloChain settlement dry-run failed.";
          return {
            ...plan,
            dryRun: {
              ok: false,
              dryRun: true,
              status: "failed",
              failureCode: "DRY_RUN_FAILED",
              retryable: true,
              idempotentReplay: false,
              settlementRunId: plan.settlementRunId,
              sourceApp: SOURCE_APP,
              sourceEventId: plan.sourceEventId,
              note: null,
              memo: null,
              requestedPayoutCount: plan.transfers.length,
              executedPayoutCount: 0,
              confirmedPayoutCount: 0,
              acceptedPayoutCount: 0,
              refusedPayoutCount: plan.transfers.length,
              replayPayoutCount: 0,
              requestedTotalUWolo: null,
              executedTotalUWolo: null,
              projectedRemainingUWolo: null,
              estimatedFeeTotalUWolo: null,
              warnings: [detail],
              detail,
              payouts: [],
            } satisfies SettlementRunResult,
          };
        }
      })
    );
  }

  return summarizePlans(plans, Boolean(options?.dryRun));
}

async function loadSingleSettlementPlan(
  prisma: ScheduledMatchSettlementDbClient,
  matchId: number
) {
  const row = await prisma.scheduledMatch.findUnique({
    where: { id: matchId },
    select: SCHEDULED_MATCH_SETTLEMENT_SELECT,
  });
  return row ? buildScheduledMatchSettlementPlan(row) : null;
}

function assertExecutablePlan(plan: ScheduledMatchSettlementPlan) {
  if (plan.state === "executed") {
    throw new ScheduledMatchSettlementError("Scheduled match is already fully settled.", {
      status: 409,
      code: "ALREADY_SETTLED",
    });
  }
  if (plan.state === "review_only") {
    throw new ScheduledMatchSettlementError(
      "Scheduled-match settlement requires operator review before execution.",
      { status: 409, code: "SETTLEMENT_REVIEW_ONLY" }
    );
  }
  if (plan.state === "no_funding") {
    throw new ScheduledMatchSettlementError("Scheduled match has no funding to settle.", {
      status: 409,
      code: "NO_FUNDING",
    });
  }
  if (plan.transfers.length === 0) {
    throw new ScheduledMatchSettlementError("No scheduled-match settlement transfers were planned.", {
      status: 409,
      code: "NO_TRANSFERS",
    });
  }
  if (plan.transfers.every(isTransferExecuted)) {
    throw new ScheduledMatchSettlementError("Scheduled match is already fully settled.", {
      status: 409,
      code: "ALREADY_SETTLED",
    });
  }
  if (plan.blockers.length > 0) {
    throw new ScheduledMatchSettlementError(plan.blockers[0], {
      status: 409,
      code: "PLAN_BLOCKED",
    });
  }
  if (!hasWoloEscrowSettlementExecutionConfigured()) {
    throw new ScheduledMatchSettlementError(
      "WOLO settlement execution is not configured in this environment.",
      { status: 409, code: "SETTLEMENT_UNCONFIGURED" }
    );
  }
}

function isRecentExecuting(
  transfer: ScheduledMatchSettlementTransfer,
) {
  if (
    isTransferExecuted(
      transfer,
    )
  ) {
    return false;
  }

  if (
    transfer
      .existingSettlement
      ?.status !==
    "executing"
  ) {
    return false;
  }
  const updatedAt = new Date(transfer.existingSettlement.updatedAt).getTime();
  return Number.isFinite(updatedAt) && Date.now() - updatedAt < EXECUTION_STALE_MS;
}

async function assertLockedWinnerSettlementAllowed(
  tx: Prisma.TransactionClient,
  matchId: number
) {
  await acquireChallengeDesyncAdvisoryLock(tx, matchId);
  const match = await tx.scheduledMatch.findUnique({
    where: { id: matchId },
    select: {
      status: true,
      linkedSessionKey: true,
    },
  });
  if (!match || !scheduledMatchSettlementRequiresWinnerDesyncGuard(match.status)) return;

  const gameStatsId = match.linkedSessionKey
    ? await resolveFinalGameStatsIdForSessionKey(tx, match.linkedSessionKey)
    : null;
  const preliminaryIncidents = await loadDesyncIncidentsForSettlement(tx, {
    gameStatsId,
    scheduledMatchId: matchId,
  });
  const replayLockIds = Array.from(
    new Set(
      [gameStatsId, ...preliminaryIncidents.map((incident) => incident.gameStatsId)]
        .filter((id): id is number => typeof id === "number" && id > 0)
    )
  ).sort((left, right) => left - right);

  for (const replayLockId of replayLockIds) {
    await tx.$queryRaw<Array<{ lock_acquired: number }>>`
      SELECT 1::int AS lock_acquired
      FROM pg_advisory_xact_lock(${replayLockId})
    `;
  }

  const [incidents, candidate] = await Promise.all([
    loadDesyncIncidentsForSettlement(tx, {
      gameStatsId,
      scheduledMatchId: matchId,
    }),
    gameStatsId
      ? tx.gameStats.findUnique({
          where: { id: gameStatsId },
          select: { createdAt: true },
        })
      : Promise.resolve(null),
  ]);

  try {
    assertWinnerSettlementAllowed({
      incidents,
      competitiveCandidate: {
        gameStatsId,
        observedAt: candidate?.createdAt ?? null,
      },
    });
  } catch (error) {
    if (error instanceof ChallengeDesyncError) {
      throw new ScheduledMatchSettlementError(error.message, {
        status: error.status,
        code: "DESYNC_WINNER_SETTLEMENT_BLOCKED",
      });
    }
    throw error;
  }
}

async function markSettlementExecutionStarted(
  prisma: PrismaClient,
  matchId: number
): Promise<ScheduledMatchSettlementPlan> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ADVISORY_LOCK_NAMESPACE}, ${matchId})`;
    await assertLockedWinnerSettlementAllowed(tx, matchId);
    const plan = await loadSingleSettlementPlan(tx, matchId);
    if (!plan) {
      throw new ScheduledMatchSettlementError("Scheduled match not found.", {
        status: 404,
        code: "NOT_FOUND",
      });
    }
    assertExecutablePlan(plan);

    const inProgress = plan.transfers.find(isRecentExecuting);
    if (inProgress) {
      throw new ScheduledMatchSettlementError(
        `${inProgress.label} is already executing. Refresh before retrying.`,
        { status: 409, code: "EXECUTION_IN_PROGRESS" }
      );
    }

    for (const transfer of plan.transfers) {
      if (
        isTransferExecuted(
          transfer,
        )
      ) {
        continue;
      }

      await tx.scheduledMatchSettlement.upsert({
        where: {
          scheduledMatchId_action_recipientAddress_amountWolo: {
            scheduledMatchId: plan.id,
            action: transfer.action,
            recipientAddress: transfer.recipientAddress || "",
            amountWolo: transfer.amountWolo,
          },
        },
        create: {
          scheduledMatchId: plan.id,
          status: "executing",
          action: transfer.action,
          recipientAddress: transfer.recipientAddress || "",
          amountWolo: transfer.amountWolo,
          requestId: transfer.requestId,
          sourceWalletAddress: transfer.sourceWalletAddress,
          errorDetail: null,
          attemptCount: 1,
          lastAttemptAt: new Date(),

          allocations: {
            create:
              transfer
                .sourceAllocations
                .map(
                  (allocation) => ({
                    sourceSide:
                      allocation.side,

                    sourceBucket:
                      allocation.bucket,

                    amountWolo:
                      allocation.amountWolo,

                    allocationVersion:
                      1,
                  }),
                ),
          },
        },
        update: {
          status: "executing",
          requestId: transfer.requestId,
          sourceWalletAddress: transfer.sourceWalletAddress,
          errorDetail: null,
          txHash: null,
          executedAt: null,
          attemptCount: { increment: 1 },
          lastAttemptAt: new Date(),
        },
      });
    }

    const markedPlan = await loadSingleSettlementPlan(tx, matchId);
    if (!markedPlan) {
      throw new ScheduledMatchSettlementError("Scheduled match not found after execution mark.", {
        status: 404,
        code: "NOT_FOUND",
      });
    }
    return markedPlan;
  });
}

function compactError(value: string | null | undefined) {
  const normalized = (value || "").trim().replace(/\s+/g, " ");
  return normalized ? normalized.slice(0, 500) : null;
}

function transferDetail(transfer: ScheduledMatchSettlementTransfer, txHash: string) {
  return `${transfer.label} · ${transfer.amountWolo.toLocaleString()} WOLO · tx ${txHash}`.slice(0, 255);
}

function resultByRequestId(run: SettlementRunResult) {
  return new Map(run.payouts.map((payout) => [payout.requestId, payout] as const));
}

async function createSettlementActivity(
  tx: Prisma.TransactionClient,
  input: {
    scheduledMatchId: number;
    actorUserId?: number | null;
    eventType: string;
    detail: string;
    metadata: Record<string, unknown>;
  }
) {
  await tx.scheduledMatchActivity.create({
    data: {
      scheduledMatchId: input.scheduledMatchId,
      actorUserId: input.actorUserId ?? undefined,
      eventType: input.eventType.slice(0, 32),
      detail: input.detail.slice(0, 255),
      metadata: input.metadata as Prisma.InputJsonValue,
    },
  });
}

async function recordExecutionResult(
  prisma: PrismaClient,
  plan: ScheduledMatchSettlementPlan,
  execution: SettlementRunResult,
  adminUserId: number | null
): Promise<ScheduledMatchSettlementPlan> {
  const payoutByRequestId = resultByRequestId(execution);

  return prisma.$transaction(async (tx) => {
    const currentRows = await tx.scheduledMatchSettlement.findMany({
      where: { scheduledMatchId: plan.id },
      select: {
        id: true,
        requestId: true,
        status: true,
        txHash: true,
      },
    });
    const currentByRequestId = new Map(currentRows.map((row) => [row.requestId, row]));
    const now = new Date();
    const failedTransfers: Array<{ requestId: string; detail: string }> = [];

    for (const transfer of plan.transfers) {
      const payout = payoutByRequestId.get(transfer.requestId);
      const previous = currentByRequestId.get(transfer.requestId);
      if (previous?.status === "executed" && previous.txHash) {
        continue;
      }

      const txHash = payout?.txHash?.trim() || null;
      const succeeded = Boolean(payout?.ok && txHash);
      const detail = compactError(
        payout?.detail ||
          payout?.failureCode ||
          execution.detail ||
          execution.failureCode ||
          "Scheduled-match settlement transfer did not return a tx hash."
      );

      await tx.scheduledMatchSettlement.update({
        where: { requestId: transfer.requestId },
        data: succeeded
          ? {
              status: "executed",
              txHash,
              errorDetail: null,
              executedAt: now,
            }
          : {
              status: "failed",
              errorDetail: detail,
            },
      });

      if (succeeded && previous?.status !== "executed") {
        await createSettlementActivity(tx, {
          scheduledMatchId: plan.id,
          actorUserId: adminUserId,
          eventType: transfer.eventType,
          detail: transferDetail(transfer, txHash || ""),
          metadata: {
            amountWolo: transfer.amountWolo,
            recipientAddress: transfer.recipientAddress,
            txHash,
            settlementAction: transfer.action,
            settlementRunId: execution.settlementRunId,
            requestId: transfer.requestId,
            sourceWalletAddress: transfer.sourceWalletAddress,
            sourceWalletRole: "bet_escrow",
            signerRole: payout?.signerRole ?? execution.signerRole ?? null,
            signerAddress: payout?.signerAddress ?? execution.signerAddress ?? null,
            transferToAddress: payout?.toAddress ?? null,
            proofUrl: payout?.proofUrl ?? null,
          },
        });
      }

      if (!succeeded) {
        failedTransfers.push({
          requestId: transfer.requestId,
          detail: detail || "Transfer failed.",
        });
      }
    }

    if (failedTransfers.length > 0) {
      await createSettlementActivity(tx, {
        scheduledMatchId: plan.id,
        actorUserId: adminUserId,
        eventType: "scheduled_settlement_failed",
        detail:
          execution.detail ||
          `${failedTransfers.length} scheduled-match settlement transfer(s) failed.`,
        metadata: {
          settlementRunId: execution.settlementRunId,
          status: execution.status,
          failureCode: execution.failureCode,
          failedTransfers,
          sourceWalletAddress: plan.sourceWalletAddress,
          sourceWalletRole: "bet_escrow",
          signerRole: execution.signerRole ?? null,
          signerAddress: execution.signerAddress ?? null,
        },
      });
    } else {
      const existingCompleted = await tx.scheduledMatchActivity.findFirst({
        where: {
          scheduledMatchId: plan.id,
          eventType: "scheduled_settlement_completed",
        },
        select: { id: true },
      });
      if (!existingCompleted) {
        await createSettlementActivity(tx, {
          scheduledMatchId: plan.id,
          actorUserId: adminUserId,
          eventType: "scheduled_settlement_completed",
          detail: `Scheduled-match settlement completed · ${plan.liability.plannedTransferWolo.toLocaleString()} WOLO.`,
          metadata: {
            settlementRunId: execution.settlementRunId,
            status: execution.status,
            amountWolo: plan.liability.plannedTransferWolo,
            sourceWalletAddress: plan.sourceWalletAddress,
            sourceWalletRole: "bet_escrow",
            signerRole: execution.signerRole ?? null,
            signerAddress: execution.signerAddress ?? null,
          },
        });
      }
    }

    const refreshed = await loadSingleSettlementPlan(tx, plan.id);
    if (!refreshed) {
      throw new ScheduledMatchSettlementError("Scheduled match disappeared after execution.", {
        status: 404,
        code: "NOT_FOUND",
      });
    }
    return refreshed;
  });
}

async function recordExecutionFailure(
  prisma: PrismaClient,
  plan: ScheduledMatchSettlementPlan,
  adminUserId: number | null,
  detail: string
) {
  await prisma.$transaction(async (tx) => {
    await tx.scheduledMatchSettlement.updateMany({
      where: {
        scheduledMatchId: plan.id,
        status: "executing",
      },
      data: {
        status: "failed",
        errorDetail: compactError(detail),
      },
    });
    await createSettlementActivity(tx, {
      scheduledMatchId: plan.id,
      actorUserId: adminUserId,
      eventType: "scheduled_settlement_failed",
      detail,
      metadata: {
        settlementRunId: plan.settlementRunId,
        sourceWalletAddress: plan.sourceWalletAddress,
        sourceWalletRole: "bet_escrow",
        errorDetail: detail,
      },
    });
  });
}

export async function executeScheduledMatchSettlement(
  prisma: PrismaClient,
  matchId: number,
  adminUserId: number | null = null
): Promise<ScheduledMatchSettlementExecutionResult> {
  const markedPlan = await markSettlementExecutionStarted(prisma, matchId);

  try {
    await requireExecutableEscrowDryRun(markedPlan);
    const execution = await executeWoloEscrowSettlementRun(buildSettlementRunInput(markedPlan));
    const guardedExecution = enforceEscrowRunSource(markedPlan, execution) ?? execution;
    const plan = await recordExecutionResult(prisma, markedPlan, guardedExecution, adminUserId);
    return {
      ok: guardedExecution.ok,
      plan,
      execution: guardedExecution,
    };
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "Scheduled-match settlement execution failed.";
    await recordExecutionFailure(prisma, markedPlan, adminUserId, detail);
    throw new ScheduledMatchSettlementError(detail, {
      status: 502,
      code: "EXECUTION_FAILED",
    });
  }
}
