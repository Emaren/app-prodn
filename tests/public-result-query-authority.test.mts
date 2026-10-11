import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

import { parsePlayers } from "../lib/gameStatsView.ts";
import * as adjudications from "../lib/replayAdjudications.ts";
import * as publicTruth from "../lib/publicReplayTruth.ts";
import { resolveReplayWinnerTruth } from "../lib/unresolvedWatcherResult.ts";

const require = createRequire(import.meta.url);
const ts = require("typescript") as typeof import("typescript");

// Execute the owning query functions, with a Prisma double that returns only
// selected columns. An omitted counterevidence column must fail this test.
function harness(filename: string, expose: string[], disconnected = true) {
  // A synthetic structured claim reproduces the omitted-input failure. It
  // asserts no historical replay outcome or participant identity.
  const row = {
    id: 25620,
    is_final: true,
    disconnect_detected: disconnected,
    winner: "Unknown",
    players: [
      { name: "Alpha", number: 1, steam_id: "76561198000000001", team_id: 0, winner: false },
      { name: "Bravo", number: 2, steam_id: "76561198000000002", team_id: 0, winner: false },
      { name: "Charlie", number: 3, steam_id: "76561198000000003", team_id: 1, winner: true },
      { name: "Delta", number: 4, steam_id: "76561198000000004", team_id: 1, winner: true },
    ],
    event_types: ["resign"],
    key_events: {
      completed: true,
      result_resolution: {
        result_status: "resolved", result_trusted: true,
        result_provenance: "complete_losing_team_resignation",
        winning_player_names: ["Charlie", "Delta"],
      },
      team_resolution: { status: "resolved", confidence: "high" },
    },
    parse_source: "watcher_final",
    parse_reason: "recorded_resignation_final",
    replayHash: "a".repeat(64),
    replayResultAdjudications: [],
    userUid: "synthetic-user",
  };
  const queries: Array<{ select: Record<string, unknown> }> = [];
  const prisma = {
    gameStats: {
      findMany: async (query: { select: Record<string, unknown> }) => {
        queries.push(query);
        return [Object.fromEntries(Object.keys(query.select).map(key => [key, row[key as keyof typeof row]]))];
      },
    },
  };
  const bindings: Record<string, unknown> = {
    "next/cache": { unstable_cache: (callback: unknown) => callback },
    "@/lib/prisma": { getPrisma: () => prisma },
    "@/lib/gameStatsView": { parsePlayers },
    "@/lib/replayAdjudications": adjudications,
    "@/lib/publicReplayTruth": publicTruth,
    "@/lib/unresolvedWatcherResult": { resolveReplayWinnerTruth },
    "@/lib/generationKeyedLoader": { createGenerationKeyedLoader: () => () => {
      throw new Error("the query regression must not invoke a cache loader");
    } },
  };
  const source = readFileSync(new URL("../" + filename, import.meta.url), "utf8")
    + `\nexport { ${expose.join(", ")} };\n`;
  const program = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {} as {
    loadCorpusRows: () => Promise<Array<typeof row>>;
    resultTruth: (value: typeof row) => ReturnType<typeof resolveReplayWinnerTruth>;
    loadViewerParserVault: (uid: string) => Promise<{ total: number; resolved: number; unknown: number }>;
    loadPublicLeaderboardRawGamePage: (client: typeof prisma, afterId: number | null, maxId: number) => Promise<Array<typeof row>>;
  };
  new Function("exports", "require", program)(exports, (name: string) => bindings[name] ?? {});
  return { row, queries, exports, prisma };
}

test("Workshop corpus query carries disconnect counterevidence into result authority", async () => {
  const { queries, exports } = harness("lib/parserObservatory.ts", ["loadCorpusRows", "resultTruth"]);
  const [row] = await exports.loadCorpusRows();
  assert.equal(queries[0].select.disconnect_detected, true);
  assert.equal(queries[0].select.is_final, true);
  assert.equal(row.disconnect_detected, true);
  const result = exports.resultTruth(row);
  assert.equal(result.winner, null);
  assert.equal(result.statsEligible, false);
  assert.equal(result.bettingEligible, false);
  assert.ok(result.truthReasons.includes("disconnect_or_desync"));
});

test("viewer parser vault keeps a disconnected structured result unresolved", async () => {
  const { queries, exports } = harness("lib/parserObservatory.ts", []);
  const result = await exports.loadViewerParserVault("synthetic-user");
  assert.equal(queries[0].select.disconnect_detected, true);
  assert.equal(result.total, 1);
  assert.equal(result.resolved, 0);
  assert.equal(result.unknown, 1);
});

test("leaderboard raw-game page preserves the same disconnect authority input", async () => {
  const { queries, exports, prisma } = harness("lib/publicLeaderboardGameCorpus.ts", ["loadPublicLeaderboardRawGamePage"]);
  const [row] = await exports.loadPublicLeaderboardRawGamePage(prisma, null, 25620);
  assert.equal(queries[0].select.disconnect_detected, true);
  assert.equal(row.disconnect_detected, true);
  const result = publicTruth.publicReplayWinnerTruth(row);
  assert.equal(result.winner, null);
  assert.equal(result.statsEligible, false);
  assert.equal(result.bettingEligible, false);
});

test("clean complete structured evidence retains existing stats eligibility", async () => {
  const { exports } = harness("lib/parserObservatory.ts", ["loadCorpusRows", "resultTruth"], false);
  const [row] = await exports.loadCorpusRows();
  const result = exports.resultTruth(row);
  assert.equal(result.winner, "Charlie / Delta");
  assert.equal(result.statsEligible, true);
  assert.equal(result.bettingEligible, false);
});
