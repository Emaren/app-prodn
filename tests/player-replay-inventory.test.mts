import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { applyReplayAdjudicationToGameStats, EFFECTIVE_REPLAY_RESULT_ADJUDICATION_RELATION } from "../lib/replayAdjudications.ts";
import { cleanPublicGameRows, publicReplayIdentity, publicReplayWinnerTruth } from "../lib/publicReplayTruth.ts";
import { isPublicBattleArchiveRow } from "../lib/publicBattleArchiveEligibility.ts";
import { publicReplayRosterV2DisplayState } from "../lib/publicReplayRosterV2.ts";
import { resolveReplayResultForPlayer } from "../lib/replayPlayerResult.ts";
import { normalizeReplayPlayers, buildRosterHash } from "../lib/teamResolution.ts";
import { buildClaimedPublicPlayerRef, buildReplayPublicPlayerRef, publicPlayerMatchesReplayParticipant } from "../lib/publicPlayers.ts";
import { readLeaderboardSteamId } from "../lib/leaderboardIdentity.ts";
import { HD_REPLAY_PARSER_CONTRACT } from "../lib/replayEngineRoom.ts";
import { loadCurrentWatcherAccountStates } from "../lib/currentWatcherAccountState.ts";
import { validateReplayResultAdjudication } from "../lib/replayResultAdjudications.ts";

const steamId = "76561198103810510";
const opponent = "76561198123456789";
const third = "76561198123456780";
const targets = [{ name: "Zodiac", uid: "u_exact", steamId }];
const source = readFileSync(new URL("../scripts/player_replay_truth_remote.mjs", import.meta.url), "utf8");
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

function row(id: number, hash: string, battle: string, extra: Record<string, unknown> = {}) {
  return { id, replayHash: hash.repeat(64), userUid: "u_exact", is_final: true,
    replay_file: `${hash.repeat(64)}.aoe2record`, original_filename: `${battle}.aoe2record`,
    played_on: "2026-01-01T00:00:00Z", timestamp: "2026-01-01T00:00:00Z", createdAt: "2026-01-02T00:00:00Z",
    winner: null, parse_source: "watcher_final", parse_reason: "hd_final_parse_match_fallback", parse_iteration: id,
    disconnect_detected: false, key_events: { platform_match_id: battle }, event_types: [], map: { name: "Arabia" },
    players: [{ name: "Zodiac", steam_id: steamId, number: 1, team_id: 0, winner: null },
      { name: "Vegeta", steam_id: opponent, number: 2, team_id: 1, winner: null }], ...extra };
}

function adjudicated(game: ReturnType<typeof row>, winningTeamKey: string) {
  const participants = normalizeReplayPlayers(game.players);
  const teams = [...new Set(participants.map((p) => p.teamId))].map((teamId) => ({
    teamKey: `team:${teamId}`, playerKeys: participants.filter((p) => p.teamId === teamId).map((p) => p.stablePlayerKey),
  }));
  const accepted = validateReplayResultAdjudication({ replayHash: game.replayHash,
    parseIteration: game.parse_iteration, players: game.players, payload: {
      idempotencyKey: `commissioner:inventory-control:${game.id}`, sourceReplayHash: game.replayHash,
      sourceParseIteration: game.parse_iteration, sourceRosterHash: buildRosterHash(participants),
      teams, winningTeamKey, reason: "Synthetic fixture of an already accepted stats-only Commissioner result.",
    } });
  return { ...game, replayResultAdjudications: [{ ...accepted, id: 100 + game.id, decisionStatus: "accepted",
    affectsStats: true, affectsBets: false, teamAssignments: accepted.teams, actorRole: "site_admin",
    actorDisplayNameSnapshot: "Commissioner", createdAt: "2026-01-03T00:00:00Z" }] };
}

function fixture() {
  const win = adjudicated(row(1, "a", "known-win", { players: [
    { name: "Historical Alias", steam_id: steamId, number: 1, team_id: 0, winner: null },
    { name: "Vegeta", steam_id: opponent, number: 2, team_id: 1, winner: null },
  ] }), "team:0");
  const duplicateWin = adjudicated(row(2, "b", "known-win", { players: win.players }), "team:0");
  const loss = adjudicated(row(3, "c", "known-loss"), "team:1");
  // Raw legacy flags and a winner label remain unresolved through the actual public resolver.
  const unknown = row(4, "d", "unresolved-control", { winner: "Zodiac",
    parse_reason: "watcher_inferred_opponent_win_on_incomplete_1v1", players: [
    { name: "Zodiac", steam_id: steamId, number: 1, team_id: 0, winner: true },
    { name: "Vegeta", steam_id: opponent, number: 2, team_id: 1, winner: false },
  ] });
  const duplicateUnknown = row(5, "e", "unresolved-control", { players: unknown.players,
    winner: unknown.winner, parse_reason: unknown.parse_reason });
  const nonfinal = row(6, "e", "unresolved-control", { players: unknown.players, is_final: false });
  const sameNameWrongSteam = row(7, "f", "different-account", { players: [
    { name: "Zodiac", steam_id: third, number: 1, team_id: 0, winner: null },
    { name: "Vegeta", steam_id: opponent, number: 2, team_id: 1, winner: null },
  ] });
  const uneven = adjudicated(row(9, "9", "known-uneven", { players: [
    { name: "Zodiac", steam_id: steamId, number: 1, team_id: 0, winner: null },
    { name: "Vegeta", steam_id: opponent, number: 2, team_id: 1, winner: null },
    { name: "Third", steam_id: third, number: 3, team_id: 1, winner: null },
  ] }), "team:0");
  return { final: [win, duplicateWin, loss, unknown, duplicateUnknown, sameNameWrongSteam, uneven], nonfinal: [nonfinal] };
}

async function collect(inventoryOnly: boolean, readOnly = true) {
  const games = fixture();
  const calls: Array<{ table: string; query?: Record<string, unknown> }> = [];
  const project = (rows: Array<Record<string, unknown>>, query: Record<string, any>) => rows.map((r) =>
    query.select ? Object.fromEntries(Object.keys(query.select).filter((key) => query.select[key] && key in r).map((key) => [key, structuredClone(r[key])])) : structuredClone(r));
  const table = (name: string, rows: Array<Record<string, unknown>>) => ({ findMany: async (query: Record<string, any>) => {
    calls.push({ table: name, query }); return project(rows, query);
  } });
  const hashes = [...new Set([...games.final, ...games.nonfinal].map((r) => r.replayHash))];
  const tx = {
    user: table("user", [{ id: 1, uid: "u_exact", inGameName: "Zodiac", steamId, verified: true }]),
    gameStats: table("gameStats", games.final),
    replayPlayerSnapshot: { findMany: async (query: Record<string, any>) => {
      const seed = Boolean(query.select); calls.push({ table: seed ? "seedSnapshots" : "snapshots", query });
      return seed ? [] : [{ playerKey: `steam:${steamId}`, provenance: { bulk: "snapshot" } }];
    } },
    playerIdentityAlias: table("aliases", [{ steamId, observedNormalizedName: "zodiac", bulk: true }]),
    platformAccount: table("platforms", [{ externalAccountId: steamId, nameObservations: [{ bulk: true }] }]),
    identityProjectionPublication: table("publications", [{ id: 91, payload: { bulk: true } }]),
    replayParseRun: table("runs", hashes.map((inputHash, index) => ({ id: 200 + index, inputHash,
      ...HD_REPLAY_PARSER_CONTRACT, status: "completed", candidateOutputHash: "8".repeat(64),
      candidateOutputStorageKey: `/candidate/${inputHash}.json`, candidatePayload: { bulk: true } }))),
    replayParseAttempt: table("attempts", [...games.final, ...games.nonfinal].map((game) => ({ id: 300 + game.id,
      gameStatsId: game.id, replayHash: game.replayHash, userUid: game.userUid, parseSource: game.parse_source,
      status: "stored", uploadMode: "watcher", detail: null, createdAt: game.createdAt, evidence: { bulk: true } }))),
    $queryRaw: async () => { calls.push({ table: "currentWatcherState" }); return []; },
    $queryRawUnsafe: async (sql: string) => {
      assert.match(sql, /^SELECT /); assert.match(sql, /WHERE NOT g\.is_final/);
      calls.push({ table: "relatedNonfinal" }); return structuredClone(games.nonfinal);
    },
  };
  let output = "";
  let disconnected = false;
  const prisma = {
    $queryRawUnsafe: async (sql: string) => {
      assert.match(sql, /^SELECT current_setting\('transaction_read_only'\)/);
      return [{ transaction_mode: readOnly ? "on" : "off", default_mode: "on" }];
    },
    $transaction: async (callback: (tx: unknown) => unknown, options: unknown) => {
      assert.deepEqual(options, { isolationLevel: "RepeatableRead", timeout: 120000, maxWait: 5000 });
      return callback(tx);
    },
    $disconnect: async () => { disconnected = true; },
  };
  const bindings = { createHash, getPrisma: () => prisma, applyReplayAdjudicationToGameStats,
    EFFECTIVE_REPLAY_RESULT_ADJUDICATION_RELATION, cleanPublicGameRows, publicReplayIdentity, publicReplayWinnerTruth,
    isPublicBattleArchiveRow, publicReplayRosterV2DisplayState, resolveReplayResultForPlayer, normalizeReplayPlayers,
    buildClaimedPublicPlayerRef, buildReplayPublicPlayerRef, publicPlayerMatchesReplayParticipant, readLeaderboardSteamId,
    HD_REPLAY_PARSER_CONTRACT, loadCurrentWatcherAccountStates,
    existsSync: () => true, readdirSync: (path: string) => hashes.filter((hash) => path.endsWith(`/${hash.slice(0, 2)}/${hash.slice(2, 4)}`)).map((hash) => `${hash}.aoe2record`),
    statSync: () => ({ size: 1024 }), readFileSync: () => { throw Error("inventory must not read replay bytes"); },
    process: { env: { AOE2WAR_TRUTH_PRODUCTION_SOURCE: "test-only" }, stdout: { write: (value: string) => { output += value; } } },
  };
  const program = source.replace(/^import .*;\n/gm, "")
    .replace("const targets = []; // injected exact scope", `const targets=${JSON.stringify(targets)};`)
    .replace("const inventoryOnly = false; // injected collection mode", `const inventoryOnly=${inventoryOnly};`);
  const execute = new AsyncFunction(...Object.keys(bindings), program);
  try { await execute(...Object.values(bindings)); } finally { assert.equal(disconnected, true); }
  return { payload: JSON.parse(output), calls };
}

test("inventory-only executes the same collector and preserves exact Steam and public logical census", async () => {
  const full = (await collect(false)).payload;
  const lean = (await collect(true)).payload;
  for (const field of ["global", "players", "parserContract", "grain", "archives", "mutations", "currentWatcherAccountStates"]) {
    assert.deepEqual(lean[field], full[field], field);
  }
  assert.deepEqual(lean.global, { fullBattleTruthNumerator: 2, denominator: 5, percentage: 40, finalRowCount: 7 });
  const player = lean.players[0];
  assert.equal(player.total, 4); assert.equal(player.resultResolved, 3);
  assert.equal(player.wins, 2); assert.equal(player.losses, 1);
  assert.equal(player.unknown, 2); assert.equal(player.unknownResults, 1); assert.equal(player.rosterIncomplete, 1);
  assert.equal(player.sourceRowCount, 7);
  assert.ok(player.cases.some((c: any) => c.result === "win" && c.players[0].name === "Historical Alias"));
  assert.ok(!player.cases.some((c: any) => c.sourceIds.includes(7)));
  assert.deepEqual(player.nameOnlyRows, [7]);
  assert.deepEqual(player.cases.find((c: any) => c.result === "unknown").sourceIds, [4, 5, 6]);
  assert.deepEqual(player.cases.find((c: any) => c.logicalBattleId === "platform:known-win").sourceIds, [1, 2]);
  assert.deepEqual(lean.mutations, { production: 0, parserRows: 0, identityRows: 0, currentRatingRows: 0, wolo: 0 });
});

test("inventory payload omissions are explicit and preserve unknown source and parser bindings", async () => {
  const full = await collect(false); const lean = await collect(true);
  assert.deepEqual(full.payload.collection, { inventoryOnly: false, omitted: [] });
  assert.deepEqual(lean.payload.collection, { inventoryOnly: true, omitted: ["identity_payloads", "parse_attempt_evidence", "parse_run_bulk_payloads", "result_known_source_game_payloads"] });
  assert.deepEqual(lean.payload.identities, { aliases: null, platforms: null, snapshots: null, publications: null });
  for (const table of ["aliases", "platforms", "snapshots", "publications"]) {
    assert.ok(full.calls.some((call) => call.table === table));
    assert.ok(!lean.calls.some((call) => call.table === table));
  }
  assert.ok(lean.calls.some((call) => call.table === "seedSnapshots"));
  assert.equal(full.payload.sourceGames.length, 8);
  assert.deepEqual(lean.payload.sourceGames.map((r: any) => r.id), [4, 5, 6]);
  assert.ok(lean.payload.players[0].cases.some((c: any) => c.id === 9 && !c.fullBattleTruth && c.result === "win"));
  assert.ok(full.payload.attempts.every((r: any) => "evidence" in r));
  assert.ok(lean.payload.attempts.every((r: any) => !Object.hasOwn(r, "evidence")));
  assert.ok(full.payload.runs.every((r: any) => "candidatePayload" in r));
  assert.ok(lean.payload.runs.every((r: any) => !Object.hasOwn(r, "candidatePayload") && r.candidateOutputHash && r.candidateOutputStorageKey));
  assert.deepEqual(lean.payload.attempts.map((r: any) => r.id), full.payload.attempts.map((r: any) => r.id));
  assert.deepEqual(lean.payload.runs.map((r: any) => r.id), full.payload.runs.map((r: any) => r.id));
});

test("both collection modes reject a writable database before querying census rows", async () => {
  for (const inventoryOnly of [false, true]) await assert.rejects(collect(inventoryOnly, false), /read-only required/);
});
