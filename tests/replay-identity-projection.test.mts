import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  classifyReplayIdentityRoster,
  ensureReplayIdentityProjections,
  replayIdentityProjectionRefreshReason,
} from "../lib/replayIdentityProjection.ts";

const identityProjectionSource = readFileSync(
  new URL("../lib/replayIdentityProjection.ts", import.meta.url),
  "utf8"
);

test("identity projection accepts distinct canonical Steam identities", () => {
  const roster = classifyReplayIdentityRoster([
    {
      name: "Same Display",
      steam_id: "76561198000000001",
      number: 1,
    },
    {
      name: "Same Display",
      steam_id: "76561198000000002",
      number: 2,
    },
  ]);

  assert.equal(roster.blocker, null);
  assert.equal(roster.players.length, 2);
  assert.notEqual(
    roster.players[0].stablePlayerKey,
    roster.players[1].stablePlayerKey
  );
});

test("identity projection skips duplicate canonical keys without aborting a batch", () => {
  const roster = classifyReplayIdentityRoster([
    {
      name: "Duplicate",
      number: 1,
    },
    {
      name: "Duplicate",
      number: 2,
    },
  ]);

  assert.equal(
    roster.blocker,
    "canonical_roster_ambiguous"
  );
  assert.equal(roster.players.length, 2);
});

test("identity projection skips incomplete canonical rosters", () => {
  const roster = classifyReplayIdentityRoster([
    {
      name: "Only Player",
      number: 1,
    },
  ]);

  assert.equal(
    roster.blocker,
    "canonical_roster_incomplete"
  );
});

test("a later accepted result supersedes an unresolved public projection", () => {
  const refreshReason = replayIdentityProjectionRefreshReason({
    current: {
      sourceIdentity: "parse-run:exact-current-hash",
      sourceHash: "a".repeat(64),
      resultEligibility: "unresolved",
      playerSnapshots: [
        { playerKey: "steam:1", resultStatus: "unresolved" },
        { playerKey: "steam:2", resultStatus: "unresolved" },
      ],
    },
    intended: {
      sourceIdentity: "parse-run:exact-current-hash",
      sourceHash: "a".repeat(64),
      resultEligibility: "resolved",
      winningPlayerKeys: ["steam:2"],
    },
  });

  assert.equal(refreshReason, "result_eligibility_changed");
});

test("a resolved projection is reused only for the same source and winners", () => {
  const current = {
    sourceIdentity: "parse-run:exact-current-hash",
    sourceHash: "b".repeat(64),
    resultEligibility: "resolved",
    playerSnapshots: [
      { playerKey: "steam:1", resultStatus: "loss" },
      { playerKey: "steam:2", resultStatus: "win" },
    ],
  };

  assert.equal(
    replayIdentityProjectionRefreshReason({
      current,
      intended: {
        sourceIdentity: current.sourceIdentity,
        sourceHash: current.sourceHash,
        resultEligibility: "resolved",
        winningPlayerKeys: ["steam:2"],
      },
    }),
    null
  );
  assert.equal(
    replayIdentityProjectionRefreshReason({
      current,
      intended: {
        sourceIdentity: current.sourceIdentity,
        sourceHash: current.sourceHash,
        resultEligibility: "resolved",
        winningPlayerKeys: ["steam:1"],
      },
    }),
    "winning_players_changed"
  );
});

test("automatic projection refresh appends immutable supersession lineage", () => {
  assert.match(identityProjectionSource, /supersedesId:\s*current\?\.id/);
  assert.match(identityProjectionSource, /refresh_reason:\s*refreshReason/);
  assert.match(identityProjectionSource, /supersedes_projection_id/);
});

test("ensure appends resolved snapshots over an existing unresolved projection", async () => {
  const replayHash = "c".repeat(64);
  const createdProjectionData: Array<Record<string, unknown>> = [];
  const createdSnapshots: Array<Record<string, unknown>> = [];
  let snapshotId = 0;
  const transaction = {
    replayStatProjection: {
      create: async (input: { data: Record<string, unknown> }) => {
        createdProjectionData.push(input.data);
        return { id: 901 };
      },
    },
    replayPlayerSnapshot: {
      create: async (input: { data: Record<string, unknown> }) => {
        createdSnapshots.push(input.data);
        snapshotId += 1;
        return { id: snapshotId };
      },
    },
    replayPlayerMetric: {
      createMany: async () => ({ count: 0 }),
    },
    replayGameMetric: {
      createMany: async () => ({ count: 0 }),
    },
  };
  const prisma = {
    gameStats: {
      findMany: async () => [
        {
          id: 77,
          replayHash,
          replay_file: "resolved-final.aoe2record",
          parse_iteration: 1,
          parse_source: "watcher_final",
          parse_reason: "watcher_final_parse",
          duration: 600,
          game_duration: 600,
          winner: "Bravo",
          players: [
            {
              name: "Alpha",
              steam_id: "76561198000000001",
              number: 1,
              winner: false,
            },
            {
              name: "Bravo",
              steam_id: "76561198000000002",
              number: 2,
              winner: true,
            },
          ],
          key_events: { completed: true },
          event_types: [],
          is_final: true,
          disconnect_detected: false,
          replayResultAdjudications: [],
          replayParseRuns: [],
          replayStatProjections: [
            {
              id: 800,
              sourceIdentity: "game-stats:77:1",
              sourceHash: replayHash,
              projectionHash: "d".repeat(64),
              resultEligibility: "unresolved",
              playerSnapshots: [
                { playerKey: "steam:76561198000000001", resultStatus: "unresolved" },
                { playerKey: "steam:76561198000000002", resultStatus: "unresolved" },
              ],
            },
          ],
        },
      ],
    },
    user: {
      findMany: async () => [],
    },
    replayStatProjection: {
      findUnique: async () => null,
    },
    $transaction: async (
      callback: (tx: typeof transaction) => Promise<unknown>
    ) => callback(transaction),
  };

  const report = await ensureReplayIdentityProjections(
    prisma as never,
    [77]
  );

  assert.equal(report.createdCount, 1);
  assert.equal(createdProjectionData.length, 1);
  assert.equal(createdProjectionData[0].supersedesId, 800);
  assert.equal(createdProjectionData[0].resultEligibility, "resolved");
  assert.deepEqual(
    createdSnapshots.map((snapshot) => snapshot.resultStatus).sort(),
    ["loss", "win"]
  );
});
