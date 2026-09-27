import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  loadWatcherReceiptSnapshot, persistWatcherReceiptPlan,
  reconcileWatcherReceiptPromotion, WATCHER_RECEIPT_FENCE_SQL,
  WATCHER_RECEIPT_SNAPSHOT_SQL,
} from "../lib/watcherReceiptPromotion.ts";
import type { PrismaClient } from "../lib/generated/prisma/index.js";

const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const replayHash = "a".repeat(64);
const players = [
  { name: "Jim", steam_id: "76561198166409520", team_id: 0, number: 1, winner: null },
  { name: "Zodiac", steam_id: "76561198103810510", team_id: 2, number: 2, winner: null },
];
const sourceGame = {
  id: 41, user_uid: "jim", replay_hash: replayHash, replay_file: "battle.aoe2record",
  original_filename: "battle.aoe2record", created_at: "2026-09-26T00:00:00", game_version: "HD",
  map: null, game_type: "Random Map", duration: 1200, game_duration: 1200, winner: null, players,
  event_types: [], key_events: { platform_match_id: "exact-platform" },
  timestamp: "2026-09-26T00:00:00", played_on: null, parse_iteration: 10,
  is_final: true, disconnect_detected: false, parse_source: "watcher_final", parse_reason: "review_required",
};

function source() {
  return {
    schema: "aoe2war-modern-receipt-source/v1", target_game_stats_id: 41, platform_match_id: "exact-platform",
    games: [structuredClone(sourceGame)],
    attempts: [
      { id: 5, game_stats_id: 41, replay_hash: replayHash, user_uid: "jim", evidence: { schema: "modern" } },
      { id: 6, game_stats_id: 41, replay_hash: "b".repeat(64), user_uid: "zodiac", evidence: { schema: "modern" } },
    ],
    users: [{ id: 7, uid: "jim", steam_id: players[0].steam_id, in_game_name: "Jim" },
      { id: 9, uid: "zodiac", steam_id: players[1].steam_id, in_game_name: "Zodiac" }],
    adjudications: [] as Record<string, unknown>[], desync_incidents: [],
  };
}

/* This isolated process stands in for the separately tested Python planner.
 * Tests exercise the real spawn/stdin/bounds and DB writer, without replacing
 * the production entrance with a caller-supplied plan or evaluator callback.
 */
const plannerScript = `
const fs = require('node:fs');
const crypto = require('node:crypto');
const request = JSON.parse(fs.readFileSync(0, 'utf8'));
const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
const hash = text => crypto.createHash('sha256').update(text).digest('hex');
if (process.argv.includes('--verify')) {
  process.stdout.write(JSON.stringify({valid: !config.verifyFails, plan_sha256: request.plan.plan_sha256}));
} else {
  const snapshot = JSON.parse(request.snapshot_json);
  const game = snapshot.games.find(g => g.id === snapshot.target_game_stats_id);
  const plan = {
    schema: 'aoe2war-modern-receipt-plan/v1', source_snapshot_json: request.snapshot_json,
    snapshot_sha256: hash(request.snapshot_json), game_stats_id: game.id,
    created_at: new Date(Date.now() - (config.age || 0)).toISOString(),
    plan_sha256: 'c'.repeat(64), candidate_only: true, authority_granted: false,
    affects_stats: false, affects_bets: false, settlement_authorized: false, wolo_authority: false,
    eligible: !config.blocked, reason: config.blocked ? 'no_eligible_observations' : 'fresh_receipts',
    parser_contract: {version:'test'}, replay_hash: game.replay_hash, parse_iteration: game.parse_iteration,
    attempt_ids: snapshot.attempts.map(a=>a.id), all_source_hashes: snapshot.attempts.map(a=>a.replay_hash),
    teams: [{teamKey:'side:winner',playerKeys:['steam:76561198166409520']},
      {teamKey:'side:loser',playerKeys:['steam:76561198103810510']}], winning_team_key:'side:winner',
    evaluation: {promotion_eligible:true,candidate_only:true,authority_granted:false,
      settlement_authorized:false,financial_authority_changed:false,
      requires_explicit_promotion_write:true,proposed_authority_scope:'result_truth_only'}
  };
  if(config.badHash) plan.snapshot_sha256='d'.repeat(64);
  if(config.mixedGame) plan.game_stats_id=42;
  if(config.escalate) plan.evaluation.settlement_authorized=true;
  if(config.rootEscalate) plan.affects_stats=true;
  if(config.partialRoster) plan.teams[0].playerKeys=[];
  if(config.extraPlayer) plan.teams[0].playerKeys.push('steam:76561198000000000');
  if(config.badReplay) plan.replay_hash='f'.repeat(64);
  if(config.badIteration) plan.parse_iteration++;
  process.stdout.write(JSON.stringify(plan));
}
`;

async function fixture(config: Record<string, unknown> = {}) {
  const root = await mkdtemp(join(tmpdir(), "watcher-promotion-test-"));
  await mkdir(join(root, "scripts"));
  await mkdir(join(root, "archive"));
  await writeFile(join(root, "scripts/plan_watcher_receipt_promotion.py"), plannerScript);
  await writeFile(join(root, "config.json"), JSON.stringify(config));
  const state = source();
  const statements: string[] = [];
  const writes: Record<string, unknown>[] = [];
  let transactions = 0;
  let onFence: (() => void) | undefined;
  const game = { ...sourceGame, userUid: sourceGame.user_uid, replayHash: replayHash,
    createdAt: new Date(sourceGame.created_at) };
  const db = {
    async $queryRawUnsafe(sql: string, ...args: unknown[]) {
      statements.push(sql);
      if (sql === WATCHER_RECEIPT_SNAPSHOT_SQL) {
        const snapshot = structuredClone(state);
        if (args[1] != null) snapshot.adjudications = snapshot.adjudications.filter(a => a.id !== args[1]);
        return [{ snapshot_json: JSON.stringify(snapshot) }];
      }
      return [];
    },
    async $executeRawUnsafe(sql: string) {
      statements.push(sql);
      if (sql === WATCHER_RECEIPT_FENCE_SQL) onFence?.();
      return 0;
    },
    async $transaction(callback: (tx: unknown) => Promise<unknown>) {
      transactions += 1;
      return callback(db);
    },
    gameStats: { findUnique: async () => game },
    betMarket: { findMany: async () => [] },
    pendingWoloClaim: { findMany: async () => [] },
    replayResultAdjudication: {
      async create({ data }: { data: Record<string, unknown> }) {
        writes.push(data);
        return { id: 99 };
      },
    },
  };
  return {
    root, db: db as unknown as PrismaClient, state, statements, writes,
    get transactions() { return transactions; },
    set onFence(callback: () => void) { onFence = callback; },
    options: { gameStatsId: 41, apiRoot: root, pythonExecutable: process.execPath,
      archiveDirectory: join(root, "archive"), receiptDirectory: join(root, "receipts") },
    async close() { await rm(root, { recursive: true, force: true }); },
  };
}

test("default canary remains candidate-only, no transaction or adjudication", async () => {
  const f = await fixture();
  try {
    const report = await reconcileWatcherReceiptPromotion(f.db, f.options);
    assert.equal(report.outcome, "eligible");
    assert.equal(report.reason, "explicit_apply_required");
    assert.equal(f.transactions, 0);
    assert.equal(f.writes.length, 0);
    const path = join(f.options.receiptDirectory, report.receiptStorageKey);
    assert.equal((await stat(path)).mode & 0o777, 0o400);
    const saved = JSON.parse(await readFile(path, "utf8"));
    assert.equal(saved.source_snapshot_json, JSON.stringify(f.state));
    assert.equal(report.snapshotSha256, sha(saved.source_snapshot_json));
  } finally { await f.close(); }
});

test("ineligible signed-receipt inventory emits immutable blocked receipt and no writes", async () => {
  const f = await fixture({ blocked: true });
  try {
    const report = await reconcileWatcherReceiptPromotion(f.db, { ...f.options, apply: true });
    assert.equal(report.outcome, "blocked");
    assert.equal(f.transactions, 0);
    assert.equal(f.writes.length, 0);
  } finally { await f.close(); }
});

test("accepted writer fences source then verifies and creates only stats adjudication", async () => {
  const f = await fixture();
  try {
    const report = await reconcileWatcherReceiptPromotion(f.db, { ...f.options, apply: true });
    assert.equal(report.outcome, "created");
    assert.equal(f.writes.length, 1);
    const row = f.writes[0];
    assert.equal(row.affectsStats, true);
    assert.equal(row.affectsBets, false);
    assert.equal(row.financialDisposition, "none");
    assert.equal(row.decisionStatus, "accepted");
    assert.deepEqual(row.winningPlayerKeys, ["steam:76561198166409520"]);
    assert.match(String(row.idempotencyKey), /^evidence:auto:watcher-receipts-v1:41:/);
    assert.ok(f.statements.includes(WATCHER_RECEIPT_FENCE_SQL));
    assert.ok(f.statements.some(s => s.includes("FOR SHARE")));
    const evidence = row.evidence as Record<string, unknown>;
    assert.equal(evidence.statistics_only, true);
    assert.equal(evidence.affects_bets, false);
    assert.equal(evidence.settlement_authorized, false);
    assert.equal(evidence.wolo_authority, false);
    assert.equal("source_snapshot_json" in evidence, false);
    assert.equal(JSON.stringify(row.rawParserSnapshot).includes('"attempts"'), false);
  } finally { await f.close(); }
});

for (const [label, mutation] of [
  ["new duplicate receipt", (s: ReturnType<typeof source>) => s.attempts.push({ ...s.attempts[0], id: 100 })],
  ["refreshed source hash", (s: ReturnType<typeof source>) => { s.games[0].replay_hash = "e".repeat(64); }],
  ["outer uploader", (s: ReturnType<typeof source>) => { s.attempts[0].user_uid = "changed"; }],
  ["platform alias", (s: ReturnType<typeof source>) => s.games.push({ ...s.games[0], id: 42 })],
  ["new adjudication", (s: ReturnType<typeof source>) => s.adjudications.push({ id: 101 })],
] as const) {
  test(`fenced source drift rejects ${label}`, async () => {
    const f = await fixture();
    try {
      f.onFence = () => mutation(f.state);
      await assert.rejects(reconcileWatcherReceiptPromotion(f.db, { ...f.options, apply: true }), /source_snapshot_changed/);
      assert.equal(f.writes.length, 0);
    } finally { await f.close(); }
  });
}

for (const [flag, reason] of [
  ["verifyFails", /fresh_plan_verification_failed/], ["badHash", /source_binding/],
  ["mixedGame", /source_binding/], ["escalate", /evaluator_authority/],
  ["rootEscalate", /planner_authority/], ["badReplay", /target_binding/],
  ["badIteration", /target_binding/], ["partialRoster", /must contain at least one/],
  ["extraPlayer", /canonical roster/],
] as const) {
  test(`writer refuses ${flag}`, async () => {
    const f = await fixture({ [flag]: true });
    try {
      await assert.rejects(reconcileWatcherReceiptPromotion(f.db, { ...f.options, apply: true }), reason);
      assert.equal(f.writes.length, 0);
    } finally { await f.close(); }
  });
}

test("expired planner snapshot never reaches writer", async () => {
  const f = await fixture({ age: 121_000 });
  try {
    await assert.rejects(reconcileWatcherReceiptPromotion(f.db, { ...f.options, apply: true }), /planner_expired/);
    assert.equal(f.writes.length, 0);
  } finally { await f.close(); }
});

test("private content-addressed receipts are immutable", async () => {
  const f = await fixture();
  try {
    const plan = { plan_sha256: "c".repeat(64), source: "original" };
    const first = await persistWatcherReceiptPlan(f.options.receiptDirectory, plan);
    assert.deepEqual(await persistWatcherReceiptPlan(f.options.receiptDirectory, plan), first);
    await assert.rejects(persistWatcherReceiptPlan(f.options.receiptDirectory, { ...plan, source: "altered" }), /immutable_receipt_conflict/);
  } finally { await f.close(); }
});

test("snapshot loader binds both SQL parameters and rejects oversized responses", async () => {
  const calls: unknown[][] = [];
  const db = { async $queryRawUnsafe(...args: unknown[]) {
    calls.push(args); return [{ snapshot_json: "x".repeat(8 * 1024 * 1024 + 1) }];
  } };
  await assert.rejects(loadWatcherReceiptSnapshot(db as never, 41, 99), /oversized/);
  assert.deepEqual(calls[0].slice(1), [41, 99]);
});
