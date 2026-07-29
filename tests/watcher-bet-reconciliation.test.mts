import assert from "node:assert/strict";
import test from "node:test";

import {
  RECONCILABLE_WATCHER_STATUSES,
  applyBettingAuthorizedReplayAdjudication,
  buildFinalMarketTruth,
  canAutoRecoverWatcherIntegrityReview,
  classifyBetPayoutState,
  classifyWatcherFinalFailure,
  evaluateFinalMarketIntegrity,
  resolveMarketSettlementStatus,
  watcherFinalProofDeadline,
} from "../lib/bets.ts";
import {
  buildRosterHash,
  normalizeReplayPlayers,
  resolveReplayTeams,
  rosterSnapshot,
} from "../lib/teamResolution.ts";

function trustedStructuredResult(
  winningPlayerKeys: string[],
  winningPlayerNames: string[]
) {
  return {
    completed: true,
    result_resolution: {
      result_status: "resolved",
      result_trusted: true,
      result_provenance: "complete_losing_team_resignation",
      winning_player_keys: winningPlayerKeys,
      winning_player_names: winningPlayerNames,
    },
    team_resolution: {
      status: "resolved",
      confidence: "high",
    },
  };
}

test("a trusted structured 1v1 winner is valid frozen-market settlement proof", () => {
  const players = [
    { name: "Emaren", winner: false },
    { name: "Sechma", winner: false },
  ];
  const resolution = resolveReplayTeams(players);

  assert.equal(resolution.status, "resolved");
  assert.equal(resolution.format, "1v1");
  assert.ok(resolution.propositionHash);

  const winner = resolution.teams[0].players[0];
  const truth = buildFinalMarketTruth({
    winner: winner.name,
    players,
    parse_reason: "recorded_resignation_final",
    key_events: trustedStructuredResult(
      [winner.stablePlayerKey],
      [winner.name]
    ),
  });

  assert.equal(truth.bettingEligible, true);
  assert.equal(
    truth.players.filter((player) => player.winner === true).length,
    1
  );

  const integrity = evaluateFinalMarketIntegrity(
    {
      leftLabel: resolution.teams[0].players[0].name,
      rightLabel: resolution.teams[1].players[0].name,
      propositionHash: resolution.propositionHash,
      leftRosterSnapshot: rosterSnapshot(resolution.teams[0]),
      rightRosterSnapshot: rosterSnapshot(resolution.teams[1]),
    },
    {
      winner: winner.name,
      players,
      parse_reason: "recorded_resignation_final",
      key_events: trustedStructuredResult(
        [winner.stablePlayerKey],
        [winner.name]
      ),
    }
  );

  assert.equal(integrity.ok, true);
  assert.equal(integrity.winningSide, "left");
  assert.deepEqual(integrity.reasonCodes, []);
});

test("one partial winner never authorizes a structured team-game payout", () => {
  const players = [
    { name: "Alpha", team_id: 1, winner: false },
    { name: "Bravo", team_id: 1, winner: false },
    { name: "Charlie", team_id: 2, winner: false },
    { name: "Delta", team_id: 2, winner: false },
  ];
  const resolution = resolveReplayTeams(players, { final: true });
  const partialWinner = resolution.teams[1].players[0];
  const truth = buildFinalMarketTruth({
    winner: partialWinner.name,
    players,
    parse_reason: "team_resignation_not_complete",
    key_events: trustedStructuredResult(
      [partialWinner.stablePlayerKey],
      [partialWinner.name]
    ),
  });

  assert.equal(truth.bettingEligible, false);
});

test("missing winner proof uses grace while structural mismatches stay under review", () => {
  assert.equal(
    classifyWatcherFinalFailure([
      "final_replay_not_betting_eligible",
      "final_winning_team_not_coherent",
    ]),
    "awaiting_final_proof"
  );
  assert.equal(
    classifyWatcherFinalFailure([
      "final_replay_not_betting_eligible",
      "final_winning_team_not_coherent",
      "final_roster_identity_mismatch",
    ]),
    "integrity_review"
  );
  assert.equal(
    classifyWatcherFinalFailure([
      "final_proposition_hash_mismatch",
    ]),
    "integrity_review"
  );
});

test("only automated evidence-only reviews may reconcile without an operator", () => {
  assert.equal(
    canAutoRecoverWatcherIntegrityReview({
      status: "under_review",
      integrityReason:
        "MARKET_INTEGRITY_BLOCKED: market 420041 final proposition failed: final_replay_not_betting_eligible,final_winning_team_…",
      commissionerReviewState: "settlement_blocked",
    }),
    true
  );
  assert.equal(
    canAutoRecoverWatcherIntegrityReview({
      status: "under_review",
      integrityReason:
        "final_replay_not_betting_eligible,final_winning_team_not_coherent",
      commissionerReviewState: "settlement_blocked",
    }),
    true
  );
  assert.equal(
    canAutoRecoverWatcherIntegrityReview({
      status: "under_review",
      integrityReason:
        "MARKET_INTEGRITY_BLOCKED: market 433336 final proposition failed: final_replay_not_betting_eligible",
      commissionerReviewState: "settlement_blocked",
    }),
    true
  );
  assert.equal(
    canAutoRecoverWatcherIntegrityReview({
      status: "under_review",
      integrityReason: "final_proposition_hash_mismatch",
      commissionerReviewState: "settlement_blocked",
    }),
    false
  );
  assert.equal(
    canAutoRecoverWatcherIntegrityReview({
      status: "under_review",
      integrityReason: "roster_changed_after_stake",
      commissionerReviewState: "roster_changed_after_stake",
    }),
    false
  );
});

test("detached watcher finals honor an accepted bet-authorizing adjudication overlay", () => {
  const players = [
    { name: "Emaren", team_id: 1, winner: false },
    { name: "Sechma", team_id: 2, winner: false },
  ];
  const normalizedPlayers = normalizeReplayPlayers(players);
  const resolution = resolveReplayTeams(players, { final: true });
  const winner = resolution.teams[0].players[0];
  const replayHash = "a".repeat(64);

  const projected = applyBettingAuthorizedReplayAdjudication({
    id: 19947,
    is_final: true,
    replayHash,
    winner: null,
    players,
    parse_reason: "result_unresolved",
    key_events: {
      result_resolution: {
        result_status: "unresolved",
        result_trusted: false,
      },
    },
    replayResultAdjudications: [
      {
        id: 17,
        idempotencyKey: `financial-authority:${"b".repeat(64)}`,
        decisionStatus: "accepted",
        affectsStats: true,
        affectsBets: true,
        actorDisplayNameSnapshot: "Operator",
        actorRole: "admin",
        teamAssignments: resolution.teams.map((team) => ({
          teamKey: team.teamKey,
          players: team.players.map((player) => ({
            stablePlayerKey: player.stablePlayerKey,
            name: player.name,
            normalizedName: player.normalizedName,
            steamId: player.steamId,
            sourceTeamId: player.teamId,
            playerNumber: player.playerNumber,
          })),
        })),
        winningTeamKey: resolution.teams[0].teamKey,
        winningPlayerKeys: [winner.stablePlayerKey],
        reason: "Accepted complete replay evidence.",
        evidence: {},
        sourceReplayHash: replayHash,
        sourceParseIteration: 1,
        sourceRosterHash: buildRosterHash(normalizedPlayers),
        sourcePropositionHash: resolution.propositionHash,
        createdAt: "2026-07-29T18:00:00.000Z",
      },
    ],
  });

  const truth = buildFinalMarketTruth(projected);
  assert.equal(projected.parse_reason, "manual_result_adjudication");
  assert.equal(truth.bettingEligible, true);
  assert.deepEqual(
    truth.players
      .filter((player) => player.winner)
      .map((player) => player.stablePlayerKey),
    [winner.stablePlayerKey]
  );
});

test("legacy reviews keep their original proof deadline instead of restarting grace", () => {
  const expiredDeadline =
    new Date("2026-07-26T02:00:00.000Z");
  assert.equal(
    watcherFinalProofDeadline({
      proofDeadlineAt: expiredDeadline,
      underReviewAt:
        new Date("2026-07-26T01:30:00.000Z"),
    }).toISOString(),
    expiredDeadline.toISOString()
  );

  const reviewStartedAt =
    new Date("2026-07-01T00:00:00.000Z");
  const derived = watcherFinalProofDeadline(
    {
      proofDeadlineAt: null,
      underReviewAt: reviewStartedAt,
    },
    new Date("2026-07-29T00:00:00.000Z").getTime()
  );
  assert.ok(derived > reviewStartedAt);
  assert.ok(
    derived <
      new Date("2026-07-29T00:00:00.000Z")
  );
});

test("watcher reconciliation revisits automated under-review markets", () => {
  assert.ok(
    RECONCILABLE_WATCHER_STATUSES.includes("under_review")
  );
  assert.equal(
    RECONCILABLE_WATCHER_STATUSES.includes("voided"),
    false
  );
});

test("a mixed auto-paid and manual claim market is not payout proof", () => {
  assert.equal(
    resolveMarketSettlementStatus(
      {
        ok: true,
        status: "executed",
        executedPayoutCount: 1,
      } as never,
      null,
      2
    ),
    "partial"
  );

  assert.equal(
    classifyBetPayoutState({
      settlementStatus: "executed",
      refundStatus: null,
      claims: [
        {
          status: "claimed",
          payoutTxHash: "A".repeat(64),
        },
        {
          status: "pending",
          payoutTxHash: null,
        },
      ],
    }),
    "partial"
  );

  assert.equal(
    classifyBetPayoutState({
      settlementStatus: "executed",
      refundStatus: null,
      claims: [
        {
          status: "claimed",
          payoutTxHash: "A".repeat(64),
        },
        {
          status: "claimed",
          payoutTxHash: "B".repeat(64),
        },
      ],
    }),
    "executed"
  );
});
