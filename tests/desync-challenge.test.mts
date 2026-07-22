import assert from "node:assert/strict";
import test from "node:test";

import {
  CHALLENGE_DESYNC_ACTIVITY_EVENT,
  ChallengeDesyncError,
  appendChallengeDesyncActivity,
  assertOrdinaryBetMarketWinnerPayoutAllowed,
  assertTitleTransferAllowed,
  assertWinnerSettlementAllowed,
  buildChallengeDesyncNotice,
  deriveDesyncChallengeProtocolState,
  effectiveDesyncIncident,
  loadDesyncIncidentsForSettlement,
  planBetMarketDesyncDisposition,
  planBetMarketDesyncReview,
  planDesyncCommissionerAction,
  type DesyncIncidentDecision,
} from "../lib/desyncChallenge.ts";
import { isChallengeInboxNoticeBody } from "../lib/challengeInboxMessages.ts";

const confirmedAt = new Date("2026-07-22T18:00:00.000Z");
const incident: DesyncIncidentDecision = {
  id: 91,
  gameStatsId: 440,
  scheduledMatchId: 25,
  desyncOccurred: true,
  decisionStatus: "accepted",
  settlementDisposition: "commissioner_review",
  reviewerUserId: 1,
  reviewerUid: "emaren",
  note: "Both players dropped on the same frame.",
  createdAt: confirmedAt,
};

test("human desync truth is independent from winner and settlement disposition", () => {
  const state = deriveDesyncChallengeProtocolState({ incidents: [incident] });
  assert.equal(state.effectiveDesyncOccurred, true);
  assert.equal(state.effectiveIncident?.gameStatsId, 440);
  assert.equal(state.settlementDisposition, "commissioner_review");
  assert.equal(state.winnerSettlementBlocked, true);
  assert.equal(state.titleTransferBlocked, true);
  assert.equal(state.artifactTransferBlocked, true);
  assert.equal(state.label, "DESYNCED — Commissioner resolution required");
  assert.equal("winner" in state, false);
});

test("winner settlement and title transfer reject the desynced unresolved replay", () => {
  assert.throws(
    () => assertWinnerSettlementAllowed({
      incidents: [incident],
      competitiveCandidate: { gameStatsId: incident.gameStatsId },
    }),
    (error: unknown) =>
      error instanceof ChallengeDesyncError &&
      error.code === "DESYNC_WINNER_SETTLEMENT_BLOCKED"
  );
  assert.throws(
    () => assertTitleTransferAllowed({ incidents: [incident] }),
    (error: unknown) =>
      error instanceof ChallengeDesyncError &&
      error.code === "DESYNC_TITLE_TRANSFER_BLOCKED"
  );
});

test("ordinary winner market payouts halt for linked human desync truth", async () => {
  await assert.rejects(
    () => assertOrdinaryBetMarketWinnerPayoutAllowed({
      market: {
        id: 7,
        winnerSide: "left",
        linkedGameStatsId: incident.gameStatsId,
        scheduledMatchId: incident.scheduledMatchId,
      },
      loadIncidents: async () => [incident],
    }),
    (error: unknown) =>
      error instanceof ChallengeDesyncError &&
      error.code === "DESYNC_BET_WINNER_PAYOUT_BLOCKED"
  );
});

test("void markets may reach the refund branch but never a winner payout", async () => {
  let lookupCalled = false;
  const state = await assertOrdinaryBetMarketWinnerPayoutAllowed({
    market: {
      id: 7,
      winnerSide: null,
      linkedGameStatsId: incident.gameStatsId,
      scheduledMatchId: incident.scheduledMatchId,
    },
    loadIncidents: async () => {
      lookupCalled = true;
      return [incident];
    },
  });
  assert.equal(lookupCalled, false);
  assert.equal(state.winnerSettlementBlocked, false);

  const queued = planBetMarketDesyncDisposition("void_refund", confirmedAt);
  assert.equal(queued.status, "voided");
  assert.equal(queued.winnerSide, null);
  assert.equal(queued.refundStatus, "queued");
  assert.match(queued.settlementDetail, /proof is pending/i);
});

test("market review and rematch states clear stale winner truth", () => {
  const review = planBetMarketDesyncReview(confirmedAt);
  assert.equal(review.status, "under_review");
  assert.equal(review.winnerSide, null);
  assert.equal(review.settlementFailureCode, "HUMAN_DESYNC_REVIEW_REQUIRED");

  const rematch = planBetMarketDesyncDisposition("rematch", confirmedAt);
  assert.equal(rematch.status, "under_review");
  assert.equal(rematch.winnerSide, null);
  assert.equal(rematch.commissionerReviewState, "desync_rematch_open");
});

test("a rematch permits only a distinct later replay while preserving desync history", () => {
  const reopened = {
    ...incident,
    id: 92,
    supersedesId: incident.id,
    settlementDisposition: "rematch",
    createdAt: new Date("2026-07-22T18:05:00.000Z"),
  } satisfies DesyncIncidentDecision;

  assert.equal(effectiveDesyncIncident([incident, reopened])?.id, reopened.id);
  assert.equal(
    deriveDesyncChallengeProtocolState({
      incidents: [incident, reopened],
      competitiveCandidate: { gameStatsId: incident.gameStatsId },
    }).winnerSettlementBlocked,
    true
  );
  assert.equal(
    deriveDesyncChallengeProtocolState({
      incidents: [incident, reopened],
      competitiveCandidate: {
        gameStatsId: 441,
        observedAt: new Date("2026-07-23T18:00:00.000Z"),
      },
    }).winnerSettlementBlocked,
    false
  );
  assert.equal(
    deriveDesyncChallengeProtocolState({ incidents: [incident, reopened] })
      .hasConfirmedHistory,
    true
  );
});

test("a no-desync correction becomes effective without deleting confirmed history", () => {
  const correction = {
    ...incident,
    id: 93,
    supersedesId: incident.id,
    desyncOccurred: false,
    competitiveResultStatus: "not_applicable",
    settlementDisposition: "not_applicable",
    createdAt: new Date("2026-07-22T18:10:00.000Z"),
  } satisfies DesyncIncidentDecision;
  const state = deriveDesyncChallengeProtocolState({ incidents: [incident, correction] });
  assert.equal(state.effectiveIncident?.id, correction.id);
  assert.equal(state.effectiveDesyncOccurred, false);
  assert.equal(state.hasConfirmedHistory, true);
  assert.equal(state.winnerSettlementBlocked, false);
});

test("database adapter reads append-only competitive and disposition axes", async () => {
  const db = {
    replayDesyncIncident: {
      async findMany() {
        return [{
          id: incident.id,
          gameStatsId: incident.gameStatsId,
          scheduledMatchId: incident.scheduledMatchId,
          supersedesId: null,
          desyncOccurred: true,
          competitiveResultStatus: "unresolved",
          settlementDisposition: "commissioner_review",
          reviewerUserId: 1,
          reviewerUidSnapshot: "emaren",
          reviewerDisplayNameSnapshot: "Emaren",
          note: incident.note,
          createdAt: confirmedAt,
        }];
      },
    },
  } as unknown as Parameters<typeof loadDesyncIncidentsForSettlement>[0];
  const loaded = await loadDesyncIncidentsForSettlement(db, {
    gameStatsId: incident.gameStatsId,
    scheduledMatchId: incident.scheduledMatchId,
  });
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].competitiveResultStatus, "unresolved");
  assert.equal(loaded[0].settlementDisposition, "commissioner_review");
});

test("append-only challenge activity is chronological and idempotent per incident", async () => {
  const rows: Array<Record<string, unknown> & { id: number; createdAt: Date }> = [];
  const activity = {
    async findFirst(args: Record<string, unknown>) {
      const where = args.where as {
        scheduledMatchId: number;
        eventType: string;
        metadata: { equals: number };
      };
      return rows.find((row) => {
        const metadata = row.metadata as { desyncIncidentId?: number };
        return row.scheduledMatchId === where.scheduledMatchId &&
          row.eventType === where.eventType &&
          metadata.desyncIncidentId === where.metadata.equals;
      }) ?? null;
    },
    async create(args: { data: Record<string, unknown> }) {
      const row = {
        ...args.data,
        id: rows.length + 1,
        createdAt: args.data.createdAt as Date,
      };
      rows.push(row);
      return row;
    },
  };

  const first = await appendChallengeDesyncActivity({ activity, incident });
  const repeated = await appendChallengeDesyncActivity({ activity, incident });
  assert.equal(first.created, true);
  assert.equal(repeated.created, false);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].eventType, CHALLENGE_DESYNC_ACTIVITY_EVENT);
  assert.equal(rows[0].createdAt.toISOString(), confirmedAt.toISOString());
  assert.equal((rows[0].metadata as Record<string, unknown>).competitiveWinner, null);
});

test("non-admin cannot choose rematch or void-refund", () => {
  assert.throws(
    () => planDesyncCommissionerAction({
      action: "void_refund",
      isAdmin: false,
      incident,
      bothParticipantsFunded: true,
    }),
    (error: unknown) =>
      error instanceof ChallengeDesyncError && error.code === "DESYNC_ADMIN_REQUIRED"
  );
});

test("rematch clears winner projection without deleting the incident or funding", () => {
  const rematchAt = new Date("2026-07-24T18:00:00.000Z");
  const plan = planDesyncCommissionerAction({
    action: "rematch",
    isAdmin: true,
    incident,
    now: new Date("2026-07-22T19:00:00.000Z"),
    rematchAt,
    bothParticipantsFunded: true,
  });
  assert.equal(plan.scheduledMatchData.status, "funded");
  assert.equal(plan.scheduledMatchData.linkedWinner, null);
  assert.equal(plan.scheduledMatchData.resultAt, null);
  assert.equal(plan.scheduledMatchData.challengerFundedAt, undefined);
  assert.equal(plan.activity.metadata.originalDesyncPreserved, true);
  assert.equal(plan.nextIncidentDisposition, "rematch");
  assert.equal(plan.executeRefundSettlement, false);
});

test("void-refund queues the existing rail and never claims money was paid", () => {
  const plan = planDesyncCommissionerAction({
    action: "void_refund",
    isAdmin: true,
    incident,
    now: new Date("2026-07-22T19:00:00.000Z"),
    bothParticipantsFunded: true,
  });
  assert.equal(plan.scheduledMatchData.status, "cancelled");
  assert.equal(plan.scheduledMatchData.linkedWinner, null);
  assert.equal(plan.executeRefundSettlement, true);
  assert.equal(plan.nextIncidentDisposition, "void_refund");
  assert.equal(plan.activity.metadata.refundPaid, false);
  assert.match(plan.activity.detail, /queued on the authenticated escrow rail/);
});

test("resolution stops if winner funds or title custody already moved", () => {
  assert.throws(
    () => planDesyncCommissionerAction({
      action: "void_refund",
      isAdmin: true,
      incident,
      bothParticipantsFunded: true,
      hasExecutedWinnerSettlement: true,
    }),
    (error: unknown) =>
      error instanceof ChallengeDesyncError &&
      error.code === "DESYNC_POST_SETTLEMENT_CORRECTION_REQUIRED"
  );
});

test("a resolved desync cannot clear a later rematch result through a repeated action", () => {
  assert.throws(
    () => planDesyncCommissionerAction({
      action: "rematch",
      isAdmin: true,
      incident: { ...incident, settlementDisposition: "rematch" },
      now: new Date("2026-07-22T19:00:00.000Z"),
      rematchAt: new Date("2026-07-24T18:00:00.000Z"),
      bothParticipantsFunded: true,
    }),
    (error: unknown) =>
      error instanceof ChallengeDesyncError &&
      error.code === "DESYNC_DISPOSITION_ALREADY_RECORDED"
  );
});

test("participant notice is a reserved challenge-shaped system message", () => {
  const notice = buildChallengeDesyncNotice({
    challengeId: 25,
    challengerName: "Jim",
    challengedName: "Zodiac",
    reviewerName: "Emaren",
    note: incident.note,
  });
  assert.match(notice, /^Challenge desync confirmed/);
  assert.match(notice, /Challenge ID: #25/);
  assert.match(notice, /DESYNCED — Commissioner resolution required/);
  assert.doesNotMatch(notice, /Winner:/);
  assert.equal(isChallengeInboxNoticeBody(notice), true);
});
