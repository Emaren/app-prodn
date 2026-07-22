import type { Prisma, PrismaClient } from "@/lib/generated/prisma";

/**
 * Challenge-side policy for human-confirmed replay desync incidents.
 *
 * This module deliberately does not own replay adjudication persistence. It
 * consumes the append-only incident truth produced by replay review and keeps
 * three independent facts separate:
 *
 * 1. whether a human confirmed a desync;
 * 2. whether a later competitive replay established a winner; and
 * 3. whether the commissioner chose review, rematch, or void/refund.
 *
 * A historical desync row is never changed or deleted when a rematch opens.
 * Future `Will this match desync?` markets should consume effective human
 * incident truth directly, not infer it from the ordinary winner proposition.
 */

export const CHALLENGE_DESYNC_REVIEW_STATUS = "desync_review" as const;
export const CHALLENGE_DESYNC_ACTIVITY_EVENT = "desync_human_confirmed" as const;
export const CHALLENGE_DESYNC_REMATCH_EVENT = "desync_rematch_reopened" as const;
export const CHALLENGE_DESYNC_VOID_EVENT = "desync_void_refund_requested" as const;
export const CHALLENGE_DESYNC_LOCK_NAMESPACE = 752009;

export type DesyncSettlementDisposition =
  | "commissioner_review"
  | "rematch"
  | "void_refund"
  | "not_applicable";

export type DesyncCompetitiveResultStatus = "unresolved" | "not_applicable";

export type DesyncIncidentDecision = {
  id: number;
  gameStatsId: number;
  scheduledMatchId: number | null;
  desyncOccurred: boolean;
  decisionStatus?: string;
  competitiveResultStatus?: string;
  settlementDisposition?: string | null;
  supersedesId?: number | null;
  reviewerUserId?: number | null;
  reviewerUid?: string | null;
  reviewerUidSnapshot?: string | null;
  reviewerDisplayName?: string | null;
  reviewerDisplayNameSnapshot?: string | null;
  note?: string | null;
  createdAt: Date | string;
};

export type DesyncCompetitiveCandidate = {
  gameStatsId: number | null;
  observedAt?: Date | string | null;
};

export type DesyncWinnerEffectMode =
  | "winner_allowed"
  | "halt_for_commissioner"
  | "rematch_result_only"
  | "refund_only";

export type DesyncChallengeProtocolState = {
  effectiveIncident: DesyncIncidentDecision | null;
  hasConfirmedHistory: boolean;
  effectiveDesyncOccurred: boolean;
  settlementDisposition: DesyncSettlementDisposition | null;
  winnerEffectMode: DesyncWinnerEffectMode;
  winnerSettlementBlocked: boolean;
  titleTransferBlocked: boolean;
  artifactTransferBlocked: boolean;
  label: string | null;
};

const ACCEPTED_DECISION_STATUSES = new Set(["accepted", "confirmed"]);
const KNOWN_DISPOSITIONS = new Set<DesyncSettlementDisposition>([
  "commissioner_review",
  "rematch",
  "void_refund",
  "not_applicable",
]);

export class ChallengeDesyncError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(code: string, message: string, status = 409) {
    super(message);
    this.name = "ChallengeDesyncError";
    this.code = code;
    this.status = status;
  }
}

function timestamp(value: Date | string) {
  const parsed = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizedDisposition(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase() ?? "";
  return KNOWN_DISPOSITIONS.has(normalized as DesyncSettlementDisposition)
    ? (normalized as DesyncSettlementDisposition)
    : null;
}

function acceptedDecision(record: DesyncIncidentDecision) {
  // ReplayDesyncIncident is itself the accepted append-only admin ledger; the
  // optional discriminator also lets this policy consume projected records.
  if (!record.decisionStatus) return true;
  return ACCEPTED_DECISION_STATUSES.has(record.decisionStatus.trim().toLowerCase());
}

/** Latest accepted row is effective; every older row remains provenance. */
export function effectiveDesyncIncident(
  records: readonly DesyncIncidentDecision[]
): DesyncIncidentDecision | null {
  return [...records]
    .filter(acceptedDecision)
    .sort((left, right) => {
      const timeDelta = timestamp(right.createdAt) - timestamp(left.createdAt);
      return timeDelta || right.id - left.id;
    })[0] ?? null;
}

export function hasConfirmedDesyncHistory(
  records: readonly DesyncIncidentDecision[]
) {
  return records.some((record) => acceptedDecision(record) && record.desyncOccurred);
}

function isNewRematchCandidate(
  incident: DesyncIncidentDecision,
  candidate: DesyncCompetitiveCandidate | null | undefined
) {
  if (!candidate?.gameStatsId || candidate.gameStatsId === incident.gameStatsId) {
    return false;
  }

  if (!candidate.observedAt) return true;
  return timestamp(candidate.observedAt) > timestamp(incident.createdAt);
}

export function deriveDesyncChallengeProtocolState(input: {
  incidents: readonly DesyncIncidentDecision[];
  competitiveCandidate?: DesyncCompetitiveCandidate | null;
}): DesyncChallengeProtocolState {
  const effectiveIncident = effectiveDesyncIncident(input.incidents);
  const hasHistory = hasConfirmedDesyncHistory(input.incidents);
  const effectiveDesyncOccurred = Boolean(effectiveIncident?.desyncOccurred);
  const disposition = normalizedDisposition(effectiveIncident?.settlementDisposition);

  let winnerEffectMode: DesyncWinnerEffectMode = "winner_allowed";
  if (effectiveDesyncOccurred && disposition === "rematch") {
    winnerEffectMode = isNewRematchCandidate(
      effectiveIncident as DesyncIncidentDecision,
      input.competitiveCandidate
    )
      ? "winner_allowed"
      : "rematch_result_only";
  } else if (
    effectiveDesyncOccurred &&
    disposition === "void_refund"
  ) {
    winnerEffectMode = "refund_only";
  } else if (effectiveDesyncOccurred) {
    winnerEffectMode = "halt_for_commissioner";
  }

  const winnerEffectsBlocked = winnerEffectMode !== "winner_allowed";
  return {
    effectiveIncident,
    hasConfirmedHistory: hasHistory,
    effectiveDesyncOccurred,
    settlementDisposition: disposition,
    winnerEffectMode,
    winnerSettlementBlocked: winnerEffectsBlocked,
    titleTransferBlocked: winnerEffectsBlocked,
    artifactTransferBlocked: winnerEffectsBlocked,
    label: effectiveDesyncOccurred
      ? disposition === "rematch"
        ? "DESYNCED — Rematch opened"
        : disposition === "void_refund"
          ? "DESYNCED — Void & Refund"
          : "DESYNCED — Commissioner resolution required"
      : null,
  };
}

export function assertWinnerSettlementAllowed(input: {
  incidents: readonly DesyncIncidentDecision[];
  competitiveCandidate?: DesyncCompetitiveCandidate | null;
}) {
  const state = deriveDesyncChallengeProtocolState(input);
  if (!state.winnerSettlementBlocked) return state;

  const message =
    state.winnerEffectMode === "rematch_result_only"
      ? "The desynced replay cannot settle a winner. Attach a distinct later rematch replay first."
      : state.winnerEffectMode === "refund_only"
        ? "This desync was resolved through void/refund and cannot execute winner payouts."
        : "A human-confirmed desync is awaiting commissioner resolution; winner settlement is halted.";
  throw new ChallengeDesyncError("DESYNC_WINNER_SETTLEMENT_BLOCKED", message);
}

export function assertTitleTransferAllowed(input: {
  incidents: readonly DesyncIncidentDecision[];
  competitiveCandidate?: DesyncCompetitiveCandidate | null;
}) {
  const state = deriveDesyncChallengeProtocolState(input);
  if (!state.titleTransferBlocked) return state;
  throw new ChallengeDesyncError(
    "DESYNC_TITLE_TRANSFER_BLOCKED",
    "Title and artifact custody cannot change from an unresolved or voided desync replay."
  );
}

export type DesyncIncidentLookup = (input: {
  gameStatsId: number | null;
  scheduledMatchId: number | null;
}) => Promise<readonly DesyncIncidentDecision[]>;

type DesyncGuardDb = Pick<
  PrismaClient | Prisma.TransactionClient,
  "replayDesyncIncident"
>;

/**
 * Loads the effective append-only incident stream for a replay or Challenge.
 * Commissioner disposition is another append-only incident row. A rematch or
 * void/refund action therefore supersedes the current row without erasing it.
 */
export async function loadDesyncIncidentsForSettlement(
  prisma: DesyncGuardDb,
  input: { gameStatsId: number | null; scheduledMatchId: number | null }
): Promise<DesyncIncidentDecision[]> {
  const or: Array<{ gameStatsId?: number; scheduledMatchId?: number }> = [];
  if (input.gameStatsId) or.push({ gameStatsId: input.gameStatsId });
  if (input.scheduledMatchId) or.push({ scheduledMatchId: input.scheduledMatchId });
  if (or.length === 0) return [];

  const incidents = await prisma.replayDesyncIncident.findMany({
    where: { OR: or },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      gameStatsId: true,
      scheduledMatchId: true,
      supersedesId: true,
      desyncOccurred: true,
      competitiveResultStatus: true,
      settlementDisposition: true,
      reviewerUserId: true,
      reviewerUidSnapshot: true,
      reviewerDisplayNameSnapshot: true,
      note: true,
      createdAt: true,
    },
  });

  return incidents.map((incident) => ({
    ...incident,
    decisionStatus: "accepted",
  }));
}

export type DesyncBetMarketIdentity = {
  id: number;
  winnerSide: string | null;
  linkedGameStatsId: number | null;
  scheduledMatchId?: number | null;
};

/**
 * Guard the ordinary left/right market payout loop. A void market has no
 * winner side and is intentionally allowed to continue to the refund branch;
 * a left/right payout is blocked when the linked replay or Challenge has an
 * effective human desync incident.
 */
export async function assertOrdinaryBetMarketWinnerPayoutAllowed(input: {
  market: DesyncBetMarketIdentity;
  loadIncidents: DesyncIncidentLookup;
}) {
  const hasWinner = input.market.winnerSide === "left" || input.market.winnerSide === "right";
  if (!hasWinner) {
    return deriveDesyncChallengeProtocolState({ incidents: [] });
  }

  const incidents = await input.loadIncidents({
    gameStatsId: input.market.linkedGameStatsId,
    scheduledMatchId: input.market.scheduledMatchId ?? null,
  });
  const state = deriveDesyncChallengeProtocolState({
    incidents,
    competitiveCandidate: {
      gameStatsId: input.market.linkedGameStatsId,
    },
  });
  if (state.winnerSettlementBlocked) {
    throw new ChallengeDesyncError(
      "DESYNC_BET_WINNER_PAYOUT_BLOCKED",
      `Market #${input.market.id} is linked to human-confirmed desync truth; ordinary winner payout is halted.`
    );
  }
  return state;
}

export async function assertOrdinaryBetMarketWinnerPayoutAllowedFromDb(input: {
  prisma: DesyncGuardDb;
  market: DesyncBetMarketIdentity;
}) {
  return assertOrdinaryBetMarketWinnerPayoutAllowed({
    market: input.market,
    loadIncidents: (lookup) => loadDesyncIncidentsForSettlement(input.prisma, lookup),
  });
}

export function planBetMarketDesyncReview(now = new Date()) {
  return {
    status: "under_review",
    winnerSide: null,
    closeAt: now,
    proofDeadlineAt: null,
    resolutionReason: "human_confirmed_desync",
    commissionerReviewState: "desync_resolution_required",
    settlementStatus: "blocked",
    settlementFailureCode: "HUMAN_DESYNC_REVIEW_REQUIRED",
    settlementDetail:
      "Human-confirmed desync. Ordinary winner settlement is halted pending rematch or void/refund.",
  } as const;
}

export function planBetMarketDesyncDisposition(
  action: DesyncCommissionerAction,
  now = new Date()
) {
  if (action === "rematch") {
    return {
      status: "under_review",
      winnerSide: null,
      settledAt: null,
      voidedAt: null,
      proofDeadlineAt: null,
      resolutionReason: "human_confirmed_desync_rematch",
      commissionerReviewState: "desync_rematch_open",
      settlementStatus: "blocked",
      settlementFailureCode: "AWAITING_REMATCH_PROOF",
      settlementDetail:
        "Original replay desynced. A distinct later rematch replay is required before winner settlement.",
    } as const;
  }

  return {
    status: "voided",
    winnerSide: null,
    settledAt: now,
    voidedAt: now,
    proofDeadlineAt: null,
    resolutionReason: "human_confirmed_desync_void_refund",
    commissionerReviewState: "desync_void_refund",
    refundStatus: "queued",
    settlementStatus: "refund_queued",
    settlementFailureCode: null,
    settlementDetail:
      "Commissioner chose void/refund after a human-confirmed desync. Refund proof is pending.",
  } as const;
}

type ActivityRow = { id?: number; createdAt?: Date | string } & Record<string, unknown>;

export type ChallengeActivityDelegate<T extends ActivityRow = ActivityRow> = {
  findFirst(args: Record<string, unknown>): Promise<T | null>;
  create(args: { data: Record<string, unknown> }): Promise<T>;
};

/**
 * Call inside the same transaction that persisted the incident, after taking
 * the per-match advisory lock. Repeated delivery of one incident is a no-op.
 */
export async function appendChallengeDesyncActivity<T extends ActivityRow>(input: {
  activity: ChallengeActivityDelegate<T>;
  incident: DesyncIncidentDecision;
  actorUserId?: number | null;
  reviewerLabel?: string | null;
  contextMetadata?: Record<string, unknown> | null;
}) {
  const { activity, incident } = input;
  const disposition = normalizedDisposition(incident.settlementDisposition);
  if (
    !incident.scheduledMatchId ||
    !incident.desyncOccurred ||
    (disposition !== null && disposition !== "commissioner_review")
  ) {
    return { created: false, activity: null as T | null };
  }

  const existing = await activity.findFirst({
    where: {
      scheduledMatchId: incident.scheduledMatchId,
      eventType: CHALLENGE_DESYNC_ACTIVITY_EVENT,
      metadata: {
        path: ["desyncIncidentId"],
        equals: incident.id,
      },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  if (existing) return { created: false, activity: existing };

  const confirmedAt = new Date(incident.createdAt);
  const reviewer =
    input.reviewerLabel?.trim() ||
    incident.reviewerDisplayName?.trim() ||
    incident.reviewerDisplayNameSnapshot?.trim() ||
    incident.reviewerUid?.trim() ||
    incident.reviewerUidSnapshot?.trim() ||
    "Commissioner";
  const created = await activity.create({
    data: {
      scheduledMatchId: incident.scheduledMatchId,
      actorUserId: input.actorUserId ?? incident.reviewerUserId ?? undefined,
      eventType: CHALLENGE_DESYNC_ACTIVITY_EVENT,
      detail: `⚡ DESYNCED! Human-confirmed by ${reviewer}. Commissioner resolution required.`.slice(
        0,
        255
      ),
      metadata: {
        ...(input.contextMetadata ?? {}),
        desyncIncidentId: incident.id,
        gameStatsId: incident.gameStatsId,
        desyncOccurred: true,
        competitiveWinner: null,
        settlementDisposition:
          normalizedDisposition(incident.settlementDisposition) ?? "commissioner_review",
        note: incident.note?.trim() || null,
        provenance: "human_replay_review",
      },
      createdAt: Number.isNaN(confirmedAt.getTime()) ? new Date() : confirmedAt,
    },
  });

  return { created: true, activity: created };
}

export type ChallengeDesyncLockClient = {
  $queryRawUnsafe<T>(query: string, ...values: unknown[]): Promise<T>;
};

/** Must be called on a transaction client, never a long-lived Prisma client. */
export async function acquireChallengeDesyncAdvisoryLock(
  tx: ChallengeDesyncLockClient,
  scheduledMatchId: number
) {
  if (!Number.isSafeInteger(scheduledMatchId) || scheduledMatchId < 1) {
    throw new ChallengeDesyncError(
      "INVALID_SCHEDULED_MATCH_ID",
      "A valid scheduled match id is required.",
      400
    );
  }
  await tx.$queryRawUnsafe<Array<{ lock_acquired: number }>>(
    "SELECT 1::int AS lock_acquired FROM pg_advisory_xact_lock($1, $2)",
    CHALLENGE_DESYNC_LOCK_NAMESPACE,
    scheduledMatchId
  );
}

export type DesyncCommissionerAction = "rematch" | "void_refund";

export type DesyncResolutionPlan = {
  action: DesyncCommissionerAction;
  nextIncidentDisposition: "rematch" | "void_refund";
  scheduledMatchData: Record<string, unknown>;
  activity: {
    eventType: typeof CHALLENGE_DESYNC_REMATCH_EVENT | typeof CHALLENGE_DESYNC_VOID_EVENT;
    detail: string;
    metadata: Record<string, unknown>;
    createdAt: Date;
  };
  executeRefundSettlement: boolean;
};

/**
 * Produces mutation data only. The authenticated route owns the transaction;
 * `void_refund` must invoke executeScheduledMatchSettlement after commit so the
 * existing idempotent escrow rail remains the only thing that can call funds
 * paid/refunded.
 */
export function planDesyncCommissionerAction(input: {
  action: DesyncCommissionerAction;
  isAdmin: boolean;
  incident: DesyncIncidentDecision;
  now?: Date;
  rematchAt?: Date | null;
  bothParticipantsFunded: boolean;
  hasExecutedWinnerSettlement?: boolean;
  hasExecutedTitleTransfer?: boolean;
}): DesyncResolutionPlan {
  if (!input.isAdmin) {
    throw new ChallengeDesyncError(
      "DESYNC_ADMIN_REQUIRED",
      "Only a site admin can resolve a confirmed desync.",
      403
    );
  }
  if (!input.incident.desyncOccurred || !input.incident.scheduledMatchId) {
    throw new ChallengeDesyncError(
      "DESYNC_INCIDENT_REQUIRED",
      "A linked, human-confirmed desync incident is required."
    );
  }
  const currentDisposition =
    normalizedDisposition(input.incident.settlementDisposition) ?? "commissioner_review";
  if (currentDisposition !== "commissioner_review") {
    throw new ChallengeDesyncError(
      "DESYNC_DISPOSITION_ALREADY_RECORDED",
      "This desync already has a commissioner disposition. Use the original idempotency key to replay that action safely."
    );
  }
  if (input.hasExecutedWinnerSettlement || input.hasExecutedTitleTransfer) {
    throw new ChallengeDesyncError(
      "DESYNC_POST_SETTLEMENT_CORRECTION_REQUIRED",
      "Winner-dependent value already moved. Record a financial/custody correction before resolving this desync."
    );
  }

  const now = input.now ?? new Date();
  const commonMetadata = {
    desyncIncidentId: input.incident.id,
    gameStatsId: input.incident.gameStatsId,
    originalDesyncPreserved: true,
    competitiveWinner: null,
  };

  if (input.action === "rematch") {
    const rematchAt = input.rematchAt;
    if (!rematchAt || Number.isNaN(rematchAt.getTime()) || rematchAt <= now) {
      throw new ChallengeDesyncError(
        "REMATCH_TIME_REQUIRED",
        "Choose a future rematch time before reopening competitive resolution.",
        422
      );
    }
    return {
      action: "rematch",
      nextIncidentDisposition: "rematch",
      scheduledMatchData: {
        status: input.bothParticipantsFunded ? "funded" : "accepted",
        timingMode: "scheduled",
        scheduledAt: rematchAt,
        matchTime: rematchAt,
        matchTimeConfirmedAt: now,
        challengerCheckedInAt: null,
        challengedCheckedInAt: null,
        liveConfirmedAt: null,
        resultAt: null,
        settlementReadyAt: null,
        linkedSessionKey: null,
        linkedMapName: null,
        linkedWinner: null,
        linkedDurationSeconds: null,
      },
      activity: {
        eventType: CHALLENGE_DESYNC_REMATCH_EVENT,
        detail: "Commissioner reopened competitive resolution for a rematch; the original desync remains in provenance.",
        metadata: {
          ...commonMetadata,
          settlementDisposition: "rematch",
          rematchAt: rematchAt.toISOString(),
        },
        createdAt: now,
      },
      executeRefundSettlement: false,
    };
  }

  return {
    action: "void_refund",
    nextIncidentDisposition: "void_refund",
    scheduledMatchData: {
      status: "cancelled",
      cancelledAt: now,
      resultAt: now,
      settlementReadyAt: now,
      linkedWinner: null,
    },
    activity: {
      eventType: CHALLENGE_DESYNC_VOID_EVENT,
      detail: "Commissioner chose Void & Refund. Refund execution is queued on the authenticated escrow rail.",
      metadata: {
        ...commonMetadata,
        settlementDisposition: "void_refund",
        refundPaid: false,
      },
      createdAt: now,
    },
    executeRefundSettlement: true,
  };
}

export function buildChallengeDesyncNotice(input: {
  challengeId: number;
  challengerName: string;
  challengedName: string;
  reviewerName: string;
  note?: string | null;
}) {
  return [
    "Challenge desync confirmed",
    `${input.challengerName} vs ${input.challengedName}`,
    `Challenge ID: #${input.challengeId}`,
    "Status: DESYNCED — Commissioner resolution required",
    `Reviewer: ${input.reviewerName}`,
    input.note?.trim() ? `Note: ${input.note.trim()}` : null,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}
