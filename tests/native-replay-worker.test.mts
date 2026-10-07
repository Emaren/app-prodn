import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import * as manifestContract from "../lib/nativeReplayManifest.ts";

const require = createRequire(import.meta.url);
const ts = require("typescript") as typeof import("typescript");
const source = readFileSync(new URL("../lib/nativeReplayWorker.ts", import.meta.url), "utf8");
const program = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const parserContract = {
  parserName: "aoe2war.mgz_hd", parserVersion: "1.8.51", schemaVersion: "2026-07-25.1",
  passName: "hd_deterministic_evidence", passVersion: "10",
};
const legacy32388Sha = "02a7bca0ae47d7177e970769b474de353ad76afd896c551ad3862e3f5112954b";

type Options = {
  parserMissing?: boolean;
  unknown?: boolean;
  disconnected?: boolean;
  desync?: boolean;
  exposure?: "markets" | "wagers" | "claims" | "settlements";
  corruptArchive?: boolean;
};

/** Execute the actual queue/manifest implementation with isolated database and archive boundaries. */
function harness(options: Options = {}) {
  const bytes = Buffer.from("Synthetic known-control archive; no replay or helper executes.\n", "utf8");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const sourceRow = {
    id: 32388, replayHash: sha256, is_final: true, resultKnown: !options.unknown,
    disconnect_detected: Boolean(options.disconnected), parse_source: "fixture",
    original_filename: "fixture.aoe2record", replay_file: `${sha256}.aoe2record`, key_events: null,
    replayResultAdjudications: [],
    players: Array.from({ length: 4 }, (_, i) => ({
      player_number: i + 1, steam_id: `7656119810381051${i}`, name: `Fixture 玩家 ${i}`,
      team_id: i < 2 ? 0 : 1, winner: i < 2,
    })),
  };
  const run = { id: 9117, ...parserContract, status: "completed", inputHash: sha256,
    candidateOnly: true, affectsPublicAggregates: false };
  const calls: Array<{ kind: string; value: unknown }> = [];
  const normalized = (players: typeof sourceRow.players) => players.map(p => ({
    ...p, playerNumber: p.player_number, stablePlayerKey: `steam:${p.steam_id}`,
  }));
  const tx = {
    gameStats: {
      findMany: async (query: any) => {
        calls.push({ kind: "gameStats.findMany", value: query });
        return query.where.is_final ? [sourceRow] : [];
      },
    },
    betMarket: { findMany: async () => options.exposure && options.exposure !== "claims" ? [{
      id: 1, settlementStatus: "not_started", settledAt: options.exposure === "settlements" ? "fixture" : null,
      settlementRunId: null, _count: { wagers: options.exposure === "wagers" ? 1 : 0 },
    }] : [] },
    pendingWoloClaim: { count: async () => options.exposure === "claims" ? 1 : 0 },
    scheduledMatch: { findMany: async () => [] },
    trophyChallenge: { count: async () => 0 },
    replayDesyncIncident: { count: async () => options.desync ? 1 : 0 },
    replayParseRun: { findFirst: async (query: unknown) => {
      calls.push({ kind: "replayParseRun.findFirst", value: query });
      return options.parserMissing ? null : run;
    } },
  };
  const prisma = {
    $transaction: async (callback: (value: typeof tx) => unknown, settings: unknown) => {
      assert.deepEqual(settings, { isolationLevel: "RepeatableRead", timeout: 30000 });
      return callback(tx);
    },
    gameStats: { findUnique: async () => {
      throw Error("Obsolete bare canary path queried findUnique.");
    } },
  };
  const modules: Record<string, unknown> = {
    "server-only": {},
    "@/lib/prisma": { getPrisma: () => prisma },
    "@/lib/teamResolution": { normalizeReplayPlayers: normalized },
    "@/lib/publicReplayTruth": {
      cleanPublicGameRows: (rows: unknown[]) => rows,
      publicReplayIdentity: (row: typeof sourceRow) => `hash:${row.replayHash}`,
      publicReplayWinnerTruth: (row: typeof sourceRow) => ({ winner: row.resultKnown ? "fixture known side" : null }),
    },
    "@/lib/replayAdjudications": {
      applyReplayAdjudicationToGameStats: (row: unknown) => row,
      EFFECTIVE_REPLAY_RESULT_ADJUDICATION_RELATION: { fixture: true },
    },
    "@/lib/replayPlayerResult": {
      resolveReplayResultForPlayer: (row: typeof sourceRow, matches: (player: ReturnType<typeof normalized>[number]) => boolean) => {
        const player = normalized(row.players).find(matches);
        return !row.resultKnown || !player ? "unknown" : player.winner ? "win" : "loss";
      },
    },
    "@/lib/replayEngineRoom": { HD_REPLAY_PARSER_CONTRACT: parserContract },
    "@/lib/nativeReplayManifest": manifestContract,
    "node:fs": { promises: {
      readdir: async (path: string) => {
        calls.push({ kind: "archive.readdir", value: path });
        return [{ name: `${sha256}.aoe2record`, isFile: () => true, isSymbolicLink: () => false }];
      },
      realpath: async (path: string) => path,
      lstat: async () => ({ isFile: () => true, size: bytes.length }),
      readFile: async () => options.corruptArchive ? Buffer.from("altered archive") : bytes,
    } },
  };
  const exports: Record<string, any> = {};
  new Function("exports", "require", program)(exports, (name: string) => {
    if (Object.hasOwn(modules, name)) return modules[name];
    if (name === "node:crypto" || name === "node:path") return require(name);
    throw Error(`Unexpected dependency in isolated native worker test: ${name}`);
  });
  return { worker: exports, calls, bytes, sha256, sourceRow, run };
}

test("#32388 queues through the same complete immutable known-control manifest builder", async () => {
  const { worker, calls, bytes, sha256, sourceRow, run } = harness();
  const parameters = await worker.buildNativeReplayRunParameters(32388);
  const manifest = parameters.manifest;
  assert.ok(manifest, "#32388 must never queue the former bare canary envelope");
  assert.equal(manifestContract.validateNativeReplayManifest(manifest), manifest);
  assert.equal(parameters.gameStatsId, 32388);
  assert.equal(parameters.replaySha256, sha256);
  assert.deepEqual(parameters.rosterSlots, [1, 2, 3, 4]);
  assert.equal(parameters.candidateOnly, true);
  assert.equal(manifest.gameStatsId, 32388);
  assert.deepEqual(manifest.sourceGameStatsIds, [32388]);
  assert.equal(manifest.logicalBattleId, `hash:${sha256}`);
  assert.equal(manifest.sourceSnapshotSha256, manifestContract.nativeSnapshotDigest({ group: [sourceRow], game: sourceRow, run }));
  assert.deepEqual(manifest.archive, { objectKey: `${sha256}.aoe2record`, sha256, byteSize: bytes.length });
  assert.deepEqual(manifest.roster, manifestContract.nativeRosterFromSource(sourceRow.players));
  assert.deepEqual(manifest.result.winningSlots, [1, 2]);
  assert.deepEqual(manifest.parser, { ...parserContract, status: "completed" });
  assert.equal(manifest.executionKind, "control");
  assert.deepEqual(manifest.financialExposure, { markets: 0, wagers: 0, claims: 0, settlements: 0 });
  assert.deepEqual(manifest.authority, { stats: false, bets: false, settlement: false, wolo: false });
  assert.ok(calls.some(call => call.kind === "replayParseRun.findFirst"));
  assert.ok(calls.some(call => call.kind === "archive.readdir"));
});

test("#32388 with no current exact parser pass fails instead of falling back to bare SHA/roster", async () => {
  const { worker, calls } = harness({ parserMissing: true });
  await assert.rejects(worker.buildNativeReplayRunParameters(32388), /Current parser contract has not completed this exact archive/);
  assert.ok(!calls.some(call => call.kind === "archive.readdir"));
});

test("the formerly accepted exact bare #32388 canary envelope is rejected", () => {
  const { worker } = harness();
  assert.throws(() => worker.parseNativeReplayRunParameters({
    gameStatsId: 32388, replaySha256: legacy32388Sha, rosterSlots: [1, 2, 3, 4],
    candidateOnly: true, nativePerformanceSeconds: 240, timeoutSeconds: 300,
  }), /Immutable known-control manifest is required for native execution/);
});

for (const options of [{ unknown: true }, { disconnected: true }]) {
  test(`#32388 rejects ${options.unknown ? "unknown" : "disconnected"} control truth`, async () => {
    const { worker } = harness(options);
    await assert.rejects(worker.buildNativeReplayRunParameters(32388), /Unknown, conflicting or disconnected results cannot be native controls/);
  });
}

for (const exposure of ["markets", "wagers", "claims", "settlements"] as const) {
  test(`#32388 financial ${exposure} exposure blocks manifest execution`, async () => {
    const { worker, calls } = harness({ exposure });
    await assert.rejects(worker.buildNativeReplayRunParameters(32388), /Financially linked replay requires commissioner review/);
    assert.ok(!calls.some(call => call.kind === "archive.readdir"));
  });
}

test("#32388 desync evidence blocks trusted control admission", async () => {
  const { worker } = harness({ desync: true });
  await assert.rejects(worker.buildNativeReplayRunParameters(32388), /Desync\/review evidence cannot be a trusted native control/);
});

test("#32388 archive bytes must independently match the selected exact source SHA", async () => {
  const { worker } = harness({ corruptArchive: true });
  await assert.rejects(worker.buildNativeReplayRunParameters(32388), /Native archive hash mismatch/);
});

test("#32388 manifested envelope rejects altered outer battle, hash, roster and candidate authority", async () => {
  const { worker } = harness();
  const parameters = await worker.buildNativeReplayRunParameters(32388);
  for (const changed of [
    { gameStatsId: 32389 }, { replaySha256: "f".repeat(64) },
    { rosterSlots: [1, 2, 3] }, { candidateOnly: false },
  ]) assert.throws(() => worker.parseNativeReplayRunParameters({ ...parameters, ...changed }));
  const altered = structuredClone(parameters);
  altered.manifest.sourceSnapshotSha256 = "f".repeat(64);
  assert.throws(() => worker.parseNativeReplayRunParameters(altered), /Native manifest digest mismatch/);
});
