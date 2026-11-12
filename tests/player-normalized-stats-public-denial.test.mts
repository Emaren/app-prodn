import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  isDeniedPublicReplayProjection,
  loadPlayerNormalizedStats,
} from "../lib/playerNormalizedStats.ts";

const deniedProjection = {
  code: "P2010",
  meta: {
    code: "42501",
    message: "permission denied for table replay_stat_projections",
  },
  message: "Raw query failed. Code: `42501`",
};

function forbiddenPrisma(error: unknown) {
  return {
    replayPlayerSnapshot: {
      async findMany() {
        throw error;
      },
    },
  } as unknown as Parameters<typeof loadPlayerNormalizedStats>[0];
}

test("only exact denied public replay projection is eligible for optional fallback", () => {
  assert.equal(isDeniedPublicReplayProjection(deniedProjection), true);
  assert.equal(isDeniedPublicReplayProjection({
    code: "P2039",
    message: "Database error. Code: `42501`. Message: `permission denied for table replay_stat_projections`",
  }), true);
  const bad = [
    { code: "P2010", meta: { code: "42501", message: "permission denied for table users" } },
    { code: "P2010", meta: { code: "42501", message: "permission denied for table bet_wagers" } },
    { code: "P2010", meta: { code: "42501", message: "permission denied for table payout_ledger" } },
    { code: "P2010", meta: { code: "42501", message: "permission denied for table replay_player_snapshots" } },
    { code: "P2010", meta: { code: "42P01", message: "relation replay_stat_projections does not exist" } },
    { code: "P2010", message: "permission denied for table replay_stat_projections" },
    { code: "P2010", meta: { code: "42501", message: "permission denied for table replay_stat_projections2" } },
    { code: "P2039", meta: { code: "42501", message: "permission denied for table payouts" } },
    { code: "P2002", meta: { code: "42501", message: "permission denied for table replay_stat_projections" } },
    null,
    "permission denied for table replay_stat_projections",
  ];
  for (const source of bad) {
    assert.equal(isDeniedPublicReplayProjection(source), false, JSON.stringify(source));
  }
});

test("denied optional projection never reports fabricated observed games or numeric zero facts", async () => {
  const result = await loadPlayerNormalizedStats(forbiddenPrisma(deniedProjection), {
    userId: 123,
    aliases: ["Sniper"],
  });
  assert.equal(result.availability, "unavailable");
  assert.deepEqual(result.metrics, []);
  assert.equal(result.metricCount, 0);
  assert.equal(result.schemaVersion, null);
  assert.equal(result.metricDictionaryVersion, null);
  assert.equal(result.truncated, false);
  assert.equal(result.visibleGames, 0);
  // The UI MUST identify unavailable evidence; numeric zero is not a finding.
  const ui = readFileSync(new URL("../components/players/PlayerProfilePage.tsx", import.meta.url),"utf8");
  assert.match(ui, /stats\.availability === "unavailable"/);
  assert.match(ui, /temporarily unavailable/);
  assert.match(ui, /missing evidence is not counted as zero/);
});

test("finance and identity permission denials never get swallowed", async () => {
  for (const table of ["users", "bet_wagers", "wolo_indexed_transfers", "replay_player_snapshots"]) {
    const err = {
      code:"P2010",
      meta:{code:"42501", message:"permission denied for table "+table},
    };
    await assert.rejects(
      () => loadPlayerNormalizedStats(forbiddenPrisma(err), {
        userId:123,aliases:["Sniper"],
      }),
      e => e === err,
    );
  }
});

test("ordinary other-runtime failure never becomes empty public metrics", async () => {
  const failure = new Error("postgres connection unavailable");
  await assert.rejects(
    () => loadPlayerNormalizedStats(forbiddenPrisma(failure), {
      userId:123,aliases: ["Sniper"],
    }),
    e=>e===failure,
  );
});

test("known schema compatibility fallback behavior remains unchanged", async () => {
  const dbError = {code:"P2021",meta:{modelName:"ReplayPlayerSnapshot"}};
  const result=await loadPlayerNormalizedStats(forbiddenPrisma(dbError),{
    userId:123,aliases:["Sniper"],
  });
  assert.deepEqual(result.metrics,[]);
  assert.equal(result.availability,undefined);
});

test("genuine empty snapshot result remains genuinely empty, not unavailable", async () => {
  const db={replayPlayerSnapshot:{findMany:async()=>[]}} as unknown as
    Parameters<typeof loadPlayerNormalizedStats>[0];
  const result=await loadPlayerNormalizedStats(db,{userId:123,aliases:["Sniper"]});
  assert.equal(result.visibleGames,0);
  assert.equal(result.availability,undefined);
});

test("no source changes to financial role or replay write path", () => {
  const source=readFileSync(new URL("../lib/playerNormalizedStats.ts", import.meta.url),"utf8");
  assert.doesNotMatch(source,/\bGRANT\b|\bREVOKE\b|\bUPDATE\s+replay_stat_projections/i);
  assert.match(source,/projectionStatus:\s*"accepted"/);
  assert.match(source,/affectsPublicAggregates:\s*true/);
  assert.match(source,/supersededBy:\s*null/);
  assert.match(source,/statEligible:\s*true/);
});
