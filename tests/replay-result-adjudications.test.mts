import assert from "node:assert/strict";
import test from "node:test";

import {
  applyReplayResultAdjudication,
  decideReplayResultReviewAccess,
  replayResultDecisionStatus,
  ReplayResultReviewError,
  validateReplayResultAdjudication,
} from "../lib/replayResultAdjudications.ts";
import {
  buildRosterHash,
  normalizeReplayPlayers,
} from "../lib/teamResolution.ts";

const replayHash = "a".repeat(64);
const players = [
  { name: "Jim", team_id: 0, number: 1, winner: false },
  { name: "Tekki", team_id: 1, number: 2, winner: false },
  { name: "Rick", team_id: 1, number: 3, winner: false },
  { name: "MTR", team_id: 0, number: 4, winner: true },
];
const sourceRosterHash = buildRosterHash(normalizeReplayPlayers(players)) as string;

function validPayload() {
  return {
    idempotencyKey: "review:game-42:one",
    sourceReplayHash: replayHash,
    sourceParseIteration: 3,
    sourceRosterHash,
    teams: [
      { teamKey: "allies", playerKeys: ["name:jim", "name:rick"] },
      { teamKey: "enemies", playerKeys: ["name:tekki", "name:mtr"] },
    ],
    winningTeamKey: "allies",
    reason: "Verified from the final statistics screen.",
    evidence: { kind: "final_stats_screen", attachmentId: "evidence-1" },
  };
}

test("review access requires both capability and immutable submission evidence", () => {
  assert.deepEqual(
    decideReplayResultReviewAccess({
      isAdmin: false,
      canReviewOwnReplayResults: true,
      hasVerifiedSubmission: false,
    }),
    {
      allowed: false,
      role: null,
      isAdmin: false,
      hasReviewerCapability: true,
      hasVerifiedSubmission: false,
    }
  );
  assert.equal(
    decideReplayResultReviewAccess({
      isAdmin: false,
      canReviewOwnReplayResults: true,
      hasVerifiedSubmission: true,
    }).role,
    "verified_submitter"
  );
  assert.equal(
    decideReplayResultReviewAccess({
      isAdmin: true,
      canReviewOwnReplayResults: false,
      hasVerifiedSubmission: false,
    }).role,
    "site_admin"
  );
});

test("market-linked submitter verdicts wait for admin without touching betting state", () => {
  assert.equal(
    replayResultDecisionStatus("verified_submitter", true),
    "pending_admin_approval"
  );
  assert.equal(replayResultDecisionStatus("verified_submitter", false), "accepted");
  assert.equal(replayResultDecisionStatus("site_admin", true), "accepted");
});

test("a verdict must assign the exact canonical roster and derives the full winning team", () => {
  const validated = validateReplayResultAdjudication({
    payload: validPayload(),
    replayHash,
    parseIteration: 3,
    players,
  });

  assert.deepEqual(validated.winningPlayerKeys, ["name:jim", "name:rick"]);
  assert.equal(validated.teams.length, 2);
  assert.equal(validated.teams.flatMap((team) => team.players).length, 4);
  assert.match(validated.sourcePropositionHash, /^[a-f0-9]{64}$/);
  assert.match(validated.inputHash, /^[a-f0-9]{64}$/);
});

test("numeric team id zero remains a valid manual side key", () => {
  const validated = validateReplayResultAdjudication({
    payload: {
      ...validPayload(),
      teams: [
        { teamKey: 0, playerKeys: ["name:jim", "name:rick"] },
        { teamKey: 1, playerKeys: ["name:tekki", "name:mtr"] },
      ],
      winningTeamKey: 0,
    },
    replayHash,
    parseIteration: 3,
    players,
  });

  assert.equal(validated.winningTeamKey, "0");
  assert.deepEqual(validated.winningPlayerKeys, ["name:jim", "name:rick"]);
});

test("a verdict cannot omit a roster member or add a noncanonical player", () => {
  const payload = validPayload();
  payload.teams[1].playerKeys = ["name:tekki"];
  assert.throws(
    () =>
      validateReplayResultAdjudication({
        payload,
        replayHash,
        parseIteration: 3,
        players,
      }),
    (error) =>
      error instanceof ReplayResultReviewError &&
      error.code === "roster_assignment_mismatch"
  );

  const payloadWithIntruder = validPayload();
  payloadWithIntruder.teams[1].playerKeys = ["name:tekki", "name:intruder"];
  assert.throws(
    () =>
      validateReplayResultAdjudication({
        payload: payloadWithIntruder,
        replayHash,
        parseIteration: 3,
        players,
      }),
    (error) =>
      error instanceof ReplayResultReviewError && error.code === "noncanonical_player"
  );
});

test("optimistic hashes reject a stale parser or roster view", () => {
  assert.throws(
    () =>
      validateReplayResultAdjudication({
        payload: { ...validPayload(), sourceParseIteration: 2 },
        replayHash,
        parseIteration: 3,
        players,
      }),
    (error) =>
      error instanceof ReplayResultReviewError && error.code === "stale_parse_iteration"
  );
  assert.throws(
    () =>
      validateReplayResultAdjudication({
        payload: { ...validPayload(), sourceRosterHash: "b".repeat(64) },
        replayHash,
        parseIteration: 3,
        players,
      }),
    (error) =>
      error instanceof ReplayResultReviewError && error.code === "stale_roster"
  );
});

test("the effective projection marks every winning teammate and preserves raw evidence", () => {
  const validated = validateReplayResultAdjudication({
    payload: validPayload(),
    replayHash,
    parseIteration: 3,
    players,
  });
  const projected = applyReplayResultAdjudication(
    {
      winner: "MTR",
      players,
      parse_reason: "recorded_resignation_final",
      parse_source: "watcher_final",
      key_events: { resigned_player_names: ["Jim"] },
    },
    {
      id: 7,
      decisionStatus: "accepted",
      actorDisplayNameSnapshot: "Emaren",
      actorRole: "site_admin",
      teamAssignments: validated.teams,
      winningTeamKey: validated.winningTeamKey,
      winningPlayerKeys: validated.winningPlayerKeys,
      reason: validated.reason,
      sourceReplayHash: replayHash,
      sourceParseIteration: 3,
      sourceRosterHash,
      sourcePropositionHash: validated.sourcePropositionHash,
      createdAt: new Date("2026-07-14T17:00:00.000Z"),
    }
  ) as {
    winner: string;
    winnerPlayers: string[];
    players: Array<{ name: string; winner: boolean; team_id: string }>;
    key_events: Record<string, unknown>;
  };

  assert.equal(projected.winner, "Jim / Rick");
  assert.deepEqual(projected.winnerPlayers.sort(), ["Jim", "Rick"]);
  assert.deepEqual(
    projected.players.map((player) => [player.name, player.team_id, player.winner]),
    [
      ["Jim", "allies", true],
      ["Tekki", "enemies", false],
      ["Rick", "allies", true],
      ["MTR", "enemies", false],
    ]
  );
  assert.deepEqual(projected.key_events.resigned_player_names, ["Jim"]);
  assert.ok(projected.key_events.replay_result_adjudication);
});
