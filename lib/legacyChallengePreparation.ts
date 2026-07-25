import { createHash } from "node:crypto";

import type { Prisma, PrismaClient } from "@/lib/generated/prisma";

const LEGACY_PREPARATION_LOCK_NAMESPACE = 752009;
const LEGACY_PREPARATION_EVENT_TYPE = "legacy_terminal_prepared";
const LEGACY_PREPARATION_VERSION = "legacy-challenge-terminal-preparation.v1";

const TERMINAL_STATUSES = new Set([
  "completed",
  "forfeited",
  "declined",
  "cancelled",
  "canceled",
  "expired",
  "funding_expired",
  "no_show_left",
  "no_show_right",
  "double_no_show",
  "refunded",
]);

const ALLOWED_LEGACY_SOURCE_STATUSES = new Set([
  "proposed",
  "creator_funded",
  "accepted",
  "funded",
]);

const TERMINAL_TITLE_STATUSES = new Set([
  "cancelled",
  "canceled",
  "declined",
  "expired",
  "completed",
  "settled",
  "refunded",
]);

const LEGACY_CHALLENGE_PREPARATION_SELECT = {
  id: true,
  status: true,
  scheduledAt: true,
  acceptBy: true,
  fundBy: true,
  playBy: true,
  acceptedAt: true,
  expiredAt: true,
  reconciledAt: true,
  creationRequestId: true,
  wagerAmountWolo: true,
  guaranteeAmountWolo: true,
  challengerFundingTxHash: true,
  challengerFundingWalletAddress: true,
  challengerFundedAt: true,
  challengedFundingTxHash: true,
  challengedFundingWalletAddress: true,
  challengedFundedAt: true,
  liveConfirmedAt: true,
  resultAt: true,
  settlementReadyAt: true,
  linkedSessionKey: true,
  linkedWinner: true,
  challenger: {
    select: {
      id: true,
      uid: true,
      inGameName: true,
      steamPersonaName: true,
    },
  },
  challenged: {
    select: {
      id: true,
      uid: true,
      inGameName: true,
      steamPersonaName: true,
    },
  },
  fundingProofs: {
    orderBy: [
      { participantSide: "asc" },
      { id: "asc" },
    ] as Prisma.ScheduledMatchFundingProofOrderByWithRelationInput[],
    select: {
      participantSide: true,
      txHash: true,
      walletAddress: true,
      amountWolo: true,
    },
  },
  settlements: {
    select: {
      id: true,
      status: true,
      action: true,
      amountWolo: true,
      txHash: true,
    },
  },
  trophyChallenges: {
    select: {
      id: true,
      status: true,
    },
  },
  betMarket: {
    select: {
      id: true,
      status: true,
      settlementStatus: true,
      _count: {
        select: {
          wagers: true,
          stakeIntents: true,
        },
      },
    },
  },
  activities: {
    where: { eventType: LEGACY_PREPARATION_EVENT_TYPE },
    orderBy: [
      { createdAt: "asc" },
      { id: "asc" },
    ] as Prisma.ScheduledMatchActivityOrderByWithRelationInput[],
    select: {
      id: true,
      eventType: true,
      metadata: true,
      createdAt: true,
    },
  },
} as const;

type LegacyChallengePreparationRow = Prisma.ScheduledMatchGetPayload<{
  select: typeof LEGACY_CHALLENGE_PREPARATION_SELECT;
}>;

type ParticipantSide = "left" | "right";
type TargetStatus = "expired" | "funding_expired";

type FundingState = {
  side: ParticipantSide;
  txHash: string | null;
  walletAddress: string | null;
  fundedAt: Date | null;
};

type LegacyPreparationActivityMetadata = {
  version?: unknown;
  operationKey?: unknown;
  fundingFingerprint?: unknown;
  previousStatus?: unknown;
  targetStatus?: unknown;
};

export type LegacyChallengePreparationPlan = {
  id: number;
  legacy: boolean;
  alreadyPrepared: boolean;
  previousStatus: string;
  currentStatus: string;
  targetStatus: TargetStatus | null;
  dueAt: string | null;
  participants: {
    left: { userId: number; uid: string; displayName: string };
    right: { userId: number; uid: string; displayName: string };
  };
  terms: {
    wagerAmountWolo: number;
    guaranteeAmountWolo: number;
    totalPerFundedParticipantWolo: number;
  };
  funding: {
    fingerprint: string;
    fundedSides: ParticipantSide[];
    exactRefundWolo: number;
    refunds: Array<{
      side: ParticipantSide;
      amountWolo: number;
      txHash: string;
      recipientAddress: string;
    }>;
  };
  linkedExposure: {
    settlementCount: number;
    titleChallengeCount: number;
    marketId: number | null;
    marketStatus: string | null;
    wagerCount: number;
    stakeIntentCount: number;
  };
  operationKey: string | null;
  confirmation: string | null;
  blockers: string[];
};

export type LegacyChallengePreparationAssertions = {
  expectedStatus: string;
  expectedLeftUid: string;
  expectedRightUid: string;
  expectedWagerAmountWolo: number;
  expectedGuaranteeAmountWolo: number;
  expectedFundingFingerprint: string;
  confirmation: string;
};

export type PrepareLegacyChallengeTerminalInput =
  LegacyChallengePreparationAssertions & {
    challengeId: number;
    actorUserId?: number | null;
    now?: Date;
  };

export type PrepareLegacyChallengeTerminalResult = {
  ok: true;
  applied: boolean;
  idempotentReplay: boolean;
  noFundsMoved: true;
  plan: LegacyChallengePreparationPlan;
};

export class LegacyChallengePreparationError extends Error {
  code: string;

  constructor(message: string, code = "LEGACY_CHALLENGE_PREPARATION_BLOCKED") {
    super(message);
    this.name = "LegacyChallengePreparationError";
    this.code = code;
  }
}

function normalizeStatus(value: string | null | undefined) {
  return (value || "").trim().toLowerCase();
}

function clean(value: string | null | undefined) {
  return value?.trim() || null;
}

function displayName(user: {
  uid: string;
  inGameName: string | null;
  steamPersonaName: string | null;
}) {
  return user.inGameName || user.steamPersonaName || user.uid;
}

function iso(value: Date | null) {
  return value?.toISOString() ?? null;
}

function fundingState(row: LegacyChallengePreparationRow): FundingState[] {
  return [
    {
      side: "left",
      txHash: clean(row.challengerFundingTxHash),
      walletAddress: clean(row.challengerFundingWalletAddress),
      fundedAt: row.challengerFundedAt,
    },
    {
      side: "right",
      txHash: clean(row.challengedFundingTxHash),
      walletAddress: clean(row.challengedFundingWalletAddress),
      fundedAt: row.challengedFundedAt,
    },
  ];
}

function canonicalFundingPayload(row: LegacyChallengePreparationRow) {
  return {
    version: "legacy-challenge-funding-fingerprint.v1",
    challengeId: row.id,
    participants: {
      left: {
        userId: row.challenger.id,
        uid: row.challenger.uid,
      },
      right: {
        userId: row.challenged.id,
        uid: row.challenged.uid,
      },
    },
    terms: {
      wagerAmountWolo: row.wagerAmountWolo,
      guaranteeAmountWolo: row.guaranteeAmountWolo,
    },
    funding: fundingState(row).map((entry) => ({
      side: entry.side,
      txHash: entry.txHash,
      walletAddress: entry.walletAddress,
      fundedAt: iso(entry.fundedAt),
    })),
    fundingProofs: row.fundingProofs.map((proof) => ({
      participantSide: normalizeStatus(proof.participantSide),
      txHash: clean(proof.txHash),
      walletAddress: clean(proof.walletAddress),
      amountWolo: proof.amountWolo,
    })),
  };
}

export function buildLegacyChallengeFundingFingerprint(
  row: LegacyChallengePreparationRow
) {
  const digest = createHash("sha256")
    .update(JSON.stringify(canonicalFundingPayload(row)))
    .digest("hex");
  return `sha256:${digest}`;
}

function deriveDueTarget(
  row: LegacyChallengePreparationRow,
  now: Date
): { targetStatus: TargetStatus; dueAt: Date } | null {
  if (
    !row.acceptedAt &&
    row.acceptBy &&
    row.acceptBy.getTime() <= now.getTime()
  ) {
    return { targetStatus: "expired", dueAt: row.acceptBy };
  }

  const fundedCount = fundingState(row).filter((entry) => entry.txHash).length;
  if (
    row.acceptedAt &&
    fundedCount < 2 &&
    row.fundBy &&
    row.fundBy.getTime() <= now.getTime()
  ) {
    return { targetStatus: "funding_expired", dueAt: row.fundBy };
  }

  if (
    fundedCount === 2 &&
    row.playBy &&
    row.playBy.getTime() <= now.getTime()
  ) {
    return { targetStatus: "expired", dueAt: row.playBy };
  }

  return null;
}

function activityMetadata(value: Prisma.JsonValue | null) {
  if (!value || Array.isArray(value) || typeof value !== "object") return null;
  return value as LegacyPreparationActivityMetadata;
}

function matchingPreparationActivity(
  row: LegacyChallengePreparationRow,
  fingerprint: string,
  targetStatus: TargetStatus | null
) {
  if (!targetStatus) return null;
  const operationKey = buildOperationKey(row.id, targetStatus, fingerprint);
  return (
    row.activities.find((activity) => {
      const metadata = activityMetadata(activity.metadata);
      return (
        metadata?.version === LEGACY_PREPARATION_VERSION &&
        metadata.operationKey === operationKey &&
        metadata.fundingFingerprint === fingerprint &&
        metadata.targetStatus === targetStatus
      );
    }) ?? null
  );
}

function buildOperationKey(
  challengeId: number,
  targetStatus: TargetStatus,
  fingerprint: string
) {
  return `${LEGACY_PREPARATION_VERSION}:${challengeId}:${targetStatus}:${fingerprint}`;
}

function buildConfirmation(
  challengeId: number,
  targetStatus: TargetStatus,
  fingerprint: string
) {
  return `PREPARE-LEGACY-${challengeId}-${targetStatus.toUpperCase()}-${fingerprint
    .replace(/^sha256:/, "")
    .slice(0, 16)
    .toUpperCase()}`;
}

function validateFundingConsistency(
  row: LegacyChallengePreparationRow,
  states: FundingState[],
  totalWolo: number
) {
  const blockers: string[] = [];
  for (const state of states) {
    const hasAnyMetadata = Boolean(
      state.txHash || state.walletAddress || state.fundedAt
    );
    if (hasAnyMetadata && !state.txHash) {
      blockers.push(
        `${state.side} funding metadata is incomplete: a funding transaction hash is required.`
      );
    }
    if (state.txHash && !state.walletAddress) {
      blockers.push(
        `${state.side} funding transaction has no exact refund wallet address.`
      );
    }
    if (state.txHash && !state.fundedAt) {
      blockers.push(
        `${state.side} funding transaction has no recorded funding timestamp.`
      );
    }

    const sideProofs = row.fundingProofs.filter(
      (proof) => normalizeStatus(proof.participantSide) === state.side
    );
    if (sideProofs.length > 1) {
      blockers.push(`${state.side} has more than one funding proof.`);
    }
    const proof = sideProofs[0];
    if (
      proof &&
      (!state.txHash ||
        clean(proof.txHash) !== state.txHash ||
        clean(proof.walletAddress) !== state.walletAddress ||
        proof.amountWolo !== totalWolo)
    ) {
      blockers.push(
        `${state.side} funding proof does not exactly match the scheduled-match funding record and terms.`
      );
    }
  }

  const unknownProof = row.fundingProofs.find(
    (proof) => !["left", "right"].includes(normalizeStatus(proof.participantSide))
  );
  if (unknownProof) {
    blockers.push(
      `Funding proof has unsupported participant side ${unknownProof.participantSide}.`
    );
  }
  return blockers;
}

export function buildLegacyChallengePreparationPlan(
  row: LegacyChallengePreparationRow,
  now = new Date()
): LegacyChallengePreparationPlan {
  const currentStatus = normalizeStatus(row.status);
  const fingerprint = buildLegacyChallengeFundingFingerprint(row);
  const due = deriveDueTarget(row, now);
  const existingActivityTarget = row.activities
    .map((activity) => activityMetadata(activity.metadata)?.targetStatus)
    .find(
      (target): target is TargetStatus =>
        target === "expired" || target === "funding_expired"
    );
  const targetStatus = due?.targetStatus ?? existingActivityTarget ?? null;
  const matchingActivity = matchingPreparationActivity(
    row,
    fingerprint,
    targetStatus
  );
  const metadata = matchingActivity
    ? activityMetadata(matchingActivity.metadata)
    : null;
  const previousStatus =
    typeof metadata?.previousStatus === "string"
      ? normalizeStatus(metadata.previousStatus)
      : currentStatus;
  const totalWolo = row.wagerAmountWolo + row.guaranteeAmountWolo;
  const states = fundingState(row);
  const fundedStates = states.filter((state) => Boolean(state.txHash));
  const refunds = fundedStates
    .filter(
      (
        state
      ): state is FundingState & {
        txHash: string;
        walletAddress: string;
      } => Boolean(state.txHash && state.walletAddress)
    )
    .map((state) => ({
      side: state.side,
      amountWolo: totalWolo,
      txHash: state.txHash,
      recipientAddress: state.walletAddress,
    }));
  const activeTitleChallenges = row.trophyChallenges.filter(
    (challenge) => !TERMINAL_TITLE_STATUSES.has(normalizeStatus(challenge.status))
  );
  const marketWagerCount = row.betMarket?._count.wagers ?? 0;
  const marketStakeIntentCount = row.betMarket?._count.stakeIntents ?? 0;
  const blockers: string[] = [];

  if (row.creationRequestId !== null) {
    blockers.push(
      "This is a versioned challenge and must remain on the automatic reconciliation rail."
    );
  }
  if (matchingActivity) {
    if (currentStatus !== targetStatus) {
      blockers.push(
        `Existing preparation activity targets ${targetStatus}, but row status is ${currentStatus}.`
      );
    }
  } else {
    if (TERMINAL_STATUSES.has(currentStatus)) {
      blockers.push(
        `Legacy row is already terminal (${currentStatus}) without this preparation receipt.`
      );
    }
    if (!ALLOWED_LEGACY_SOURCE_STATUSES.has(currentStatus)) {
      blockers.push(
        `Legacy source status ${currentStatus || "(empty)"} is outside the narrow preparation allowlist.`
      );
    }
    if (!due) {
      blockers.push(
        "No acceptance, funding, or play deadline currently proves this legacy challenge is expired."
      );
    }
    if (row.settlements.length > 0) {
      blockers.push(
        "Settlement rows already exist; inspect the existing settlement rail instead of preparing this legacy row."
      );
    }
    if (row.liveConfirmedAt || row.linkedSessionKey || row.linkedWinner) {
      blockers.push(
        "The challenge has live/result linkage and cannot be terminally prepared by the legacy expiry workflow."
      );
    }
    if (row.resultAt || row.settlementReadyAt) {
      blockers.push(
        "The challenge already has result or settlement-ready state without a legacy preparation receipt."
      );
    }
  }

  if (
    !Number.isInteger(row.wagerAmountWolo) ||
    row.wagerAmountWolo < 0 ||
    !Number.isInteger(row.guaranteeAmountWolo) ||
    row.guaranteeAmountWolo < 0 ||
    totalWolo < 1
  ) {
    blockers.push("Challenge terms must resolve to a positive whole-WOLO amount.");
  }
  if (fundedStates.length > 1) {
    blockers.push(
      "Both sides have funding records; this narrow legacy workflow only supports zero or one funded participant."
    );
  }
  blockers.push(...validateFundingConsistency(row, states, totalWolo));
  if (refunds.length !== fundedStates.length) {
    blockers.push(
      "Every funded side must resolve to exactly one tx-backed refund destination."
    );
  }
  if (activeTitleChallenges.length > 0) {
    blockers.push(
      "An active title challenge is linked; commissioner title disposition is required first."
    );
  }
  if (marketWagerCount > 0 || marketStakeIntentCount > 0) {
    blockers.push(
      "A linked betting market has wager exposure; use the market-integrity workflow first."
    );
  }

  const operationKey =
    targetStatus !== null
      ? buildOperationKey(row.id, targetStatus, fingerprint)
      : null;

  return {
    id: row.id,
    legacy: row.creationRequestId === null,
    alreadyPrepared: Boolean(matchingActivity),
    previousStatus,
    currentStatus,
    targetStatus,
    dueAt: due?.dueAt.toISOString() ?? matchingActivity?.createdAt.toISOString() ?? null,
    participants: {
      left: {
        userId: row.challenger.id,
        uid: row.challenger.uid,
        displayName: displayName(row.challenger),
      },
      right: {
        userId: row.challenged.id,
        uid: row.challenged.uid,
        displayName: displayName(row.challenged),
      },
    },
    terms: {
      wagerAmountWolo: row.wagerAmountWolo,
      guaranteeAmountWolo: row.guaranteeAmountWolo,
      totalPerFundedParticipantWolo: totalWolo,
    },
    funding: {
      fingerprint,
      fundedSides: fundedStates.map((state) => state.side),
      exactRefundWolo: refunds.reduce(
        (sum, refund) => sum + refund.amountWolo,
        0
      ),
      refunds,
    },
    linkedExposure: {
      settlementCount: row.settlements.length,
      titleChallengeCount: activeTitleChallenges.length,
      marketId: row.betMarket?.id ?? null,
      marketStatus: row.betMarket?.status ?? null,
      wagerCount: marketWagerCount,
      stakeIntentCount: marketStakeIntentCount,
    },
    operationKey,
    confirmation:
      targetStatus !== null
        ? buildConfirmation(row.id, targetStatus, fingerprint)
        : null,
    blockers: Array.from(new Set(blockers)),
  };
}

function assertExactPreparation(
  plan: LegacyChallengePreparationPlan,
  assertions: LegacyChallengePreparationAssertions
) {
  const failures: string[] = [];
  const expectedStatus = normalizeStatus(assertions.expectedStatus);

  if (
    plan.currentStatus !== expectedStatus &&
    !(plan.alreadyPrepared && plan.previousStatus === expectedStatus)
  ) {
    failures.push(
      `status expected ${expectedStatus}, observed ${plan.currentStatus}`
    );
  }
  if (plan.participants.left.uid !== assertions.expectedLeftUid.trim()) {
    failures.push("left participant UID changed");
  }
  if (plan.participants.right.uid !== assertions.expectedRightUid.trim()) {
    failures.push("right participant UID changed");
  }
  if (
    plan.terms.wagerAmountWolo !== assertions.expectedWagerAmountWolo ||
    plan.terms.guaranteeAmountWolo !== assertions.expectedGuaranteeAmountWolo
  ) {
    failures.push(
      `terms expected ${assertions.expectedWagerAmountWolo}+${assertions.expectedGuaranteeAmountWolo}, observed ${plan.terms.wagerAmountWolo}+${plan.terms.guaranteeAmountWolo}`
    );
  }
  if (
    plan.funding.fingerprint !==
    assertions.expectedFundingFingerprint.trim().toLowerCase()
  ) {
    failures.push("funding fingerprint changed");
  }
  if (!plan.confirmation || plan.confirmation !== assertions.confirmation.trim()) {
    failures.push("confirmation token is missing or incorrect");
  }
  if (plan.blockers.length > 0) {
    failures.push(...plan.blockers);
  }

  if (failures.length > 0) {
    throw new LegacyChallengePreparationError(
      `STOP: legacy challenge #${plan.id} preparation assertions failed: ${failures.join(
        " | "
      )}`,
      "LEGACY_CHALLENGE_ASSERTION_FAILED"
    );
  }
}

async function loadPreparationRow(
  prisma: PrismaClient | Prisma.TransactionClient,
  challengeId: number
) {
  const row = await prisma.scheduledMatch.findUnique({
    where: { id: challengeId },
    select: LEGACY_CHALLENGE_PREPARATION_SELECT,
  });
  return row as LegacyChallengePreparationRow | null;
}

export async function inspectLegacyChallengePreparation(
  prisma: PrismaClient,
  challengeId: number,
  now = new Date()
) {
  if (!Number.isInteger(challengeId) || challengeId < 1) {
    throw new LegacyChallengePreparationError(
      "A single positive scheduled-match ID is required.",
      "LEGACY_CHALLENGE_ID_REQUIRED"
    );
  }
  const row = await loadPreparationRow(prisma, challengeId);
  if (!row) {
    throw new LegacyChallengePreparationError(
      `Scheduled match #${challengeId} was not found.`,
      "LEGACY_CHALLENGE_NOT_FOUND"
    );
  }
  return buildLegacyChallengePreparationPlan(row, now);
}

export async function prepareLegacyChallengeTerminal(
  prisma: PrismaClient,
  input: PrepareLegacyChallengeTerminalInput
): Promise<PrepareLegacyChallengeTerminalResult> {
  if (!Number.isInteger(input.challengeId) || input.challengeId < 1) {
    throw new LegacyChallengePreparationError(
      "A single positive scheduled-match ID is required.",
      "LEGACY_CHALLENGE_ID_REQUIRED"
    );
  }
  const now = input.now ?? new Date();

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LEGACY_PREPARATION_LOCK_NAMESPACE}, ${input.challengeId})`;
    const row = await loadPreparationRow(tx, input.challengeId);
    if (!row) {
      throw new LegacyChallengePreparationError(
        `Scheduled match #${input.challengeId} was not found.`,
        "LEGACY_CHALLENGE_NOT_FOUND"
      );
    }

    const plan = buildLegacyChallengePreparationPlan(row, now);
    assertExactPreparation(plan, input);

    if (plan.alreadyPrepared) {
      return {
        ok: true,
        applied: false,
        idempotentReplay: true,
        noFundsMoved: true,
        plan,
      };
    }
    if (!plan.targetStatus || !plan.operationKey) {
      throw new LegacyChallengePreparationError(
        `Legacy challenge #${input.challengeId} has no exact terminal preparation target.`
      );
    }

    await tx.scheduledMatch.update({
      where: { id: input.challengeId },
      data: {
        status: plan.targetStatus,
        expiredAt: now,
        resultAt: now,
        settlementReadyAt:
          plan.funding.fundedSides.length > 0 ? now : null,
        reconciledAt: now,
      },
    });
    await tx.scheduledMatchActivity.create({
      data: {
        scheduledMatchId: input.challengeId,
        actorUserId: input.actorUserId ?? undefined,
        eventType: LEGACY_PREPARATION_EVENT_TYPE,
        detail:
          plan.funding.exactRefundWolo > 0
            ? `Legacy challenge closed after its deadline. Exact ${plan.funding.exactRefundWolo} WOLO refund prepared for the separate settlement rail.`
            : "Legacy challenge closed after its deadline. No WOLO funding was recorded.",
        metadata: {
          version: LEGACY_PREPARATION_VERSION,
          operationKey: plan.operationKey,
          automatic: false,
          previousStatus: plan.currentStatus,
          targetStatus: plan.targetStatus,
          fundingFingerprint: plan.funding.fingerprint,
          fundedSides: plan.funding.fundedSides,
          exactRefundWolo: plan.funding.exactRefundWolo,
          noFundsMoved: true,
          settlementExecutionSeparate: true,
          dueAt: plan.dueAt,
          preparedAt: now.toISOString(),
        } as Prisma.InputJsonValue,
        createdAt: now,
      },
    });

    const refreshed = await loadPreparationRow(tx, input.challengeId);
    if (!refreshed) {
      throw new LegacyChallengePreparationError(
        `Scheduled match #${input.challengeId} disappeared after preparation.`
      );
    }
    const refreshedPlan = buildLegacyChallengePreparationPlan(refreshed, now);
    if (!refreshedPlan.alreadyPrepared) {
      throw new LegacyChallengePreparationError(
        "Preparation transaction did not produce its immutable activity receipt."
      );
    }

    return {
      ok: true,
      applied: true,
      idempotentReplay: false,
      noFundsMoved: true,
      plan: refreshedPlan,
    };
  });
}
