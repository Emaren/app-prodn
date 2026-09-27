import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdir, open, readFile, realpath } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

import { Prisma, type PrismaClient } from "./generated/prisma/index.js";
import { buildRosterHash, normalizeReplayPlayers } from "./teamResolution.ts";
import {
  buildMarketSnapshot,
  rawParserSnapshot,
  REVIEWABLE_GAME_SELECT,
  validateReplayResultAdjudication,
} from "./replayResultAdjudications.ts";

export const WATCHER_RECEIPT_POLICY = "watcher-receipts-v1";
const PREFIX = `evidence:auto:${WATCHER_RECEIPT_POLICY}:`;
const MAX_SNAPSHOT_BYTES = 8 * 1024 * 1024;
const MAX_PLAN_BYTES = 16 * 1024 * 1024;
const MAX_PLAN_AGE_MS = 120_000;
type JsonObject = Record<string, unknown>;
type QueryClient = Pick<Prisma.TransactionClient, "$queryRawUnsafe">;

/* PostgreSQL emits the canonical text. Hash that exact text in both runtimes;
 * JSON round trips would otherwise change floats, Unicode or timestamps.
 * Receipt platform identity deliberately includes rows attached to a different
 * game: the planner must reject those instead of silently dropping conflicts.
 */
export const WATCHER_RECEIPT_SNAPSHOT_SQL = `
WITH target AS (
  SELECT id, key_events->>'platform_match_id' AS platform_match_id
  FROM game_stats WHERE id = $1
), games AS (
  SELECT g.* FROM game_stats g, target t
  WHERE g.id = t.id OR (t.platform_match_id IS NOT NULL
    AND g.key_events->>'platform_match_id' = t.platform_match_id)
), attempts AS (
  SELECT a.* FROM replay_parse_attempts a, target t
  WHERE a.game_stats_id IN (SELECT id FROM games)
     OR (t.platform_match_id IS NOT NULL
       AND a.evidence->>'platform_match_id' = t.platform_match_id)
), identities AS (
  SELECT u.id, u.uid, u.steam_id, u.in_game_name, u.steam_persona_name
  FROM users u WHERE u.uid IN (
    SELECT user_uid FROM attempts UNION SELECT user_uid FROM games
  )
)
SELECT jsonb_build_object(
  'schema', 'aoe2war-modern-receipt-source/v1',
  'target_game_stats_id', $1::int,
  'platform_match_id', (SELECT platform_match_id FROM target),
  'games', COALESCE((SELECT jsonb_agg(to_jsonb(g) ORDER BY id) FROM games g), '[]'::jsonb),
  'attempts', COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM attempts a), '[]'::jsonb),
  'users', COALESCE((SELECT jsonb_agg(to_jsonb(u) ORDER BY id) FROM identities u), '[]'::jsonb),
  'adjudications', COALESCE((SELECT jsonb_agg(to_jsonb(j) ORDER BY id)
    FROM replay_result_adjudications j WHERE j.game_stats_id IN (SELECT id FROM games)
      AND j.id IS DISTINCT FROM $2::int), '[]'::jsonb),
  'desync_incidents', COALESCE((SELECT jsonb_agg(to_jsonb(d) ORDER BY id)
    FROM replay_desync_incidents d WHERE d.game_stats_id IN (SELECT id FROM games)), '[]'::jsonb)
)::text AS snapshot_json`;

/* API ingestion does not participate in app advisory locks. SHARE fences its
 * inserts and updates, including phantoms. Keep this transaction brief: parsing
 * happens before it; lock/statement/transaction timeouts abort without a write.
 * No market, wager, claim or chain table is locked or mutated here.
 */
export const WATCHER_RECEIPT_FENCE_SQL = `LOCK TABLE game_stats,
  replay_parse_attempts, replay_result_adjudications,
  replay_desync_incidents IN SHARE MODE`;

function object(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("invalid_receipt_object");
  }
  return value as JsonObject;
}
function rows(value: unknown): JsonObject[] {
  if (!Array.isArray(value)) throw new Error("invalid_snapshot_rows");
  return value.map(object);
}
function positiveId(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new Error("invalid_game_stats_id");
  }
  return value;
}
function hash(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}
function isHash(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

export async function loadWatcherReceiptSnapshot(
  db: QueryClient, gameStatsId: number, excludedAdjudicationId: number | null = null,
): Promise<string> {
  positiveId(gameStatsId);
  const result = await db.$queryRawUnsafe<Array<{ snapshot_json: string }>>(
    WATCHER_RECEIPT_SNAPSHOT_SQL, gameStatsId, excludedAdjudicationId,
  );
  const text = result[0]?.snapshot_json;
  if (typeof text !== "string" || Buffer.byteLength(text) > MAX_SNAPSHOT_BYTES) {
    throw new Error("snapshot_missing_or_oversized");
  }
  return text;
}

export type WatcherReceiptPromotionOptions = {
  gameStatsId: number;
  apiRoot: string;
  pythonExecutable: string;
  archiveDirectory: string;
  receiptDirectory: string;
  apply?: boolean;
};

async function runPlanner(
  options: WatcherReceiptPromotionOptions, input: unknown, verify = false,
): Promise<JsonObject> {
  for (const path of [options.apiRoot, options.pythonExecutable, options.archiveDirectory]) {
    if (!isAbsolute(path)) throw new Error("absolute_runtime_paths_required");
  }
  const script = join(options.apiRoot, "scripts/plan_watcher_receipt_promotion.py");
  if (!(await lstat(script)).isFile()) throw new Error("planner_unavailable");
  const body = JSON.stringify(input);
  if (Buffer.byteLength(body) > 32 * 1024 * 1024) throw new Error("planner_input_oversized");
  return new Promise((resolve, reject) => {
    const child = spawn(options.pythonExecutable, [script,
      ...(verify ? ["--verify"] : []), "--archive-dir", options.archiveDirectory], {
      cwd: options.apiRoot, stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
    });
    let stdout = Buffer.alloc(0);
    let stderrBytes = 0;
    let failure: Error | null = null;
    const stop = (reason: string) => {
      failure ??= new Error(reason);
      child.kill("SIGKILL");
    };
    const timer = setTimeout(() => stop("planner_timeout"), verify ? 8_000 : 100_000);
    child.stdout.on("data", (data: Buffer) => {
      if (stdout.length + data.length > MAX_PLAN_BYTES) stop("planner_output_oversized");
      else stdout = Buffer.concat([stdout, data]);
    });
    // Parser diagnostics can contain private replay names; never echo them.
    child.stderr.on("data", (data: Buffer) => {
      stderrBytes += data.length;
      if (stderrBytes > 1024 * 1024) stop("planner_diagnostics_oversized");
    });
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.stdin.on("error", () => stop("planner_input_failed"));
    child.on("close", (code) => {
      clearTimeout(timer);
      if (failure) return reject(failure);
      if (code !== 0) return reject(new Error("planner_failed"));
      try { resolve(object(JSON.parse(stdout.toString("utf8")))); }
      catch { reject(new Error("planner_invalid_response")); }
    });
    child.stdin.end(body);
  });
}

export function validateWatcherReceiptPlanBinding(
  plan: JsonObject, snapshotJson: string, gameStatsId: number,
) {
  if (plan.schema !== "aoe2war-modern-receipt-plan/v1" ||
      plan.source_snapshot_json !== snapshotJson ||
      plan.snapshot_sha256 !== hash(snapshotJson) ||
      plan.game_stats_id !== gameStatsId || !isHash(plan.plan_sha256)) {
    throw new Error("planner_source_binding_mismatch");
  }
  if (plan.candidate_only !== true || plan.authority_granted !== false ||
      plan.affects_stats !== false || plan.affects_bets !== false ||
      plan.settlement_authorized !== false || plan.wolo_authority !== false) {
    throw new Error("planner_authority_escalation");
  }
  const age = Date.now() - Date.parse(String(plan.created_at));
  if (!Number.isFinite(age) || age < 0 || age > MAX_PLAN_AGE_MS) {
    throw new Error("planner_expired");
  }
  if (plan.eligible === true) {
    const evaluation = object(plan.evaluation);
    if (evaluation.promotion_eligible !== true || evaluation.candidate_only !== true ||
        evaluation.authority_granted !== false || evaluation.settlement_authorized !== false ||
        evaluation.financial_authority_changed !== false ||
        evaluation.requires_explicit_promotion_write !== true ||
        evaluation.proposed_authority_scope !== "result_truth_only") {
      throw new Error("evaluator_authority_escalation");
    }
    const snapshot = object(JSON.parse(snapshotJson));
    const game = rows(snapshot.games).find((g) => g.id === gameStatsId);
    if (!game || game.replay_hash !== plan.replay_hash ||
        game.parse_iteration !== plan.parse_iteration || !isHash(plan.replay_hash)) {
      throw new Error("planner_target_binding_mismatch");
    }
  } else if (plan.eligible !== false) {
    throw new Error("planner_eligibility_missing");
  }
}

export async function persistWatcherReceiptPlan(directory: string, plan: JsonObject) {
  if (!isAbsolute(directory) || !isHash(plan.plan_sha256)) throw new Error("invalid_receipt_location");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const dirStat = await lstat(directory);
  if (!dirStat.isDirectory() || dirStat.isSymbolicLink() || (dirStat.mode & 0o077) !== 0) {
    throw new Error("receipt_directory_not_private");
  }
  const storageKey = `plan-${plan.plan_sha256}.json`;
  const path = join(await realpath(directory), storageKey);
  const bytes = Buffer.from(JSON.stringify(plan) + "\n");
  if (bytes.length > MAX_PLAN_BYTES) throw new Error("plan_receipt_oversized");
  try {
    const handle = await open(path, "wx", 0o400);
    try { await handle.writeFile(bytes); await handle.sync(); }
    finally { await handle.close(); }
    const directoryHandle = await open(directory, "r");
    try { await directoryHandle.sync(); } finally { await directoryHandle.close(); }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const fileStat = await lstat(path);
    if (!fileStat.isFile() || fileStat.isSymbolicLink() || (fileStat.mode & 0o277) !== 0 ||
        !(await readFile(path)).equals(bytes)) throw new Error("immutable_receipt_conflict");
  }
  return { storageKey, fileSha256: hash(bytes) };
}

function priorPromotion(snapshot: JsonObject, gameStatsId: number) {
  const adjudications = rows(snapshot.adjudications);
  if (adjudications.length !== 1) return null;
  const row = adjudications[0];
  if (row.game_stats_id !== gameStatsId || row.decision_status !== "accepted" ||
      row.affects_stats !== true || row.affects_bets !== false ||
      typeof row.idempotency_key !== "string" || !row.idempotency_key.startsWith(PREFIX)) return null;
  return row;
}

export type WatcherReceiptPromotionReport = {
  gameStatsId: number;
  outcome: "blocked" | "eligible" | "created" | "existing";
  reason: string;
  adjudicationId: number | null;
  planSha256: string;
  snapshotSha256: string;
  receiptStorageKey: string;
  affectsBets: false;
  settlementAuthorized: false;
  woloAuthority: false;
};

/** This is the sole writer entrance. It accepts runtime locations and an ID,
 * never a saved plan or caller-supplied evaluation. Native evidence has no path
 * into this modern signed-receipt policy.
 */
export async function reconcileWatcherReceiptPromotion(
  prisma: PrismaClient, options: WatcherReceiptPromotionOptions,
): Promise<WatcherReceiptPromotionReport> {
  const gameStatsId = positiveId(options.gameStatsId);
  const originalJson = await loadWatcherReceiptSnapshot(prisma, gameStatsId);
  const original = object(JSON.parse(originalJson));
  const prior = priorPromotion(original, gameStatsId);
  // Idempotent retries independently revalidate the original source set. Only
  // this one matching policy row is excluded; every other verdict still blocks.
  const snapshotJson = prior
    ? await loadWatcherReceiptSnapshot(prisma, gameStatsId, positiveId(prior.id))
    : originalJson;
  const snapshot = object(JSON.parse(snapshotJson));
  const plan = await runPlanner(options, { snapshot_json: snapshotJson });
  validateWatcherReceiptPlanBinding(plan, snapshotJson, gameStatsId);
  const receipt = await persistWatcherReceiptPlan(options.receiptDirectory, plan);
  const base = { gameStatsId, adjudicationId: null, planSha256: String(plan.plan_sha256),
    snapshotSha256: String(plan.snapshot_sha256), receiptStorageKey: receipt.storageKey,
    affectsBets: false as const, settlementAuthorized: false as const, woloAuthority: false as const };
  if (plan.eligible !== true) return { ...base, outcome: "blocked", reason: String(plan.reason) };
  if (options.apply !== true) return { ...base, outcome: "eligible", reason: "explicit_apply_required" };

  const expectedIdempotency = `${PREFIX}${gameStatsId}:${plan.snapshot_sha256}`;
  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '2000ms'");
    await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '10000ms'");
    // Acquire the shared app locks before table fences to avoid reversing the
    // existing manual adjudication lock order.
    for (const game of rows(snapshot.games)) {
      await tx.$queryRawUnsafe("SELECT 1::int AS locked FROM pg_advisory_xact_lock($1::bigint)", positiveId(game.id));
    }
    await tx.$executeRawUnsafe(WATCHER_RECEIPT_FENCE_SQL);
    const userIds = rows(snapshot.users).map((u) => positiveId(u.id)).sort((a, b) => a - b);
    await tx.$queryRawUnsafe("SELECT id FROM users WHERE id = ANY($1::int[]) ORDER BY id FOR SHARE", userIds);
    const currentJson = await loadWatcherReceiptSnapshot(tx, gameStatsId);
    if (currentJson !== originalJson) throw new Error("source_snapshot_changed");
    validateWatcherReceiptPlanBinding(plan, snapshotJson, gameStatsId);
    const verified = await runPlanner(options, { plan }, true);
    if (verified.valid !== true || verified.plan_sha256 !== plan.plan_sha256) {
      throw new Error("fresh_plan_verification_failed");
    }
    const game = await tx.gameStats.findUnique({ where: { id: gameStatsId }, select: REVIEWABLE_GAME_SELECT });
    if (!game) throw new Error("target_disappeared");
    const evidence = {
      schema: "aoe2war-modern-receipt-promotion/v1", policy: WATCHER_RECEIPT_POLICY,
      plan_sha256: plan.plan_sha256, snapshot_sha256: plan.snapshot_sha256,
      receipt_storage_key: receipt.storageKey, receipt_file_sha256: receipt.fileSha256,
      parser_contract: plan.parser_contract, source_attempt_ids: plan.attempt_ids,
      source_replay_hashes: plan.all_source_hashes, evaluation: plan.evaluation,
      statistics_only: true, affects_bets: false, settlement_authorized: false, wolo_authority: false,
    };
    const validated = validateReplayResultAdjudication({
      payload: { idempotencyKey: expectedIdempotency, sourceReplayHash: plan.replay_hash,
        sourceParseIteration: plan.parse_iteration,
        sourceRosterHash: buildRosterHash(normalizeReplayPlayers(Array.isArray(game.players) ? game.players : [])),
        teams: plan.teams, winningTeamKey: plan.winning_team_key,
        reason: "Independent signed Watcher final receipts agree across both sides; every source was revalidated against the current parser and exact battle identity.",
        evidence }, replayHash: game.replayHash, parseIteration: game.parse_iteration, players: game.players,
    });
    if (prior) {
      const oldEvidence = object(prior.evidence);
      if (prior.idempotency_key !== expectedIdempotency || oldEvidence.snapshot_sha256 !== plan.snapshot_sha256 ||
          prior.source_replay_hash !== validated.sourceReplayHash ||
          prior.source_parse_iteration !== validated.sourceParseIteration ||
          prior.source_roster_hash !== validated.sourceRosterHash ||
          prior.source_proposition_hash !== validated.sourcePropositionHash ||
          prior.winning_team_key !== validated.winningTeamKey ||
          JSON.stringify(prior.winning_player_keys) !== JSON.stringify(validated.winningPlayerKeys)) {
        throw new Error("existing_promotion_source_changed");
      }
      return { outcome: "existing" as const, adjudicationId: positiveId(prior.id) };
    }
    const participants = rows(snapshot.attempts).filter((a) => a.evidence !== null && a.evidence !== undefined);
    const actor = rows(snapshot.users).find((u) => participants.some((a) => a.user_uid === u.uid));
    if (!actor || typeof actor.uid !== "string") throw new Error("receipt_actor_missing");
    const markets = await buildMarketSnapshot(tx as unknown as Parameters<typeof buildMarketSnapshot>[0],
      gameStatsId, [game.original_filename, game.replay_file]);
    const adjudication = await tx.replayResultAdjudication.create({ data: {
      gameStatsId, actorUserId: positiveId(actor.id), supersedesId: null,
      idempotencyKey: validated.idempotencyKey, inputHash: validated.inputHash,
      decisionStatus: "accepted", actorUidSnapshot: actor.uid,
      actorDisplayNameSnapshot: String(actor.in_game_name || actor.steam_persona_name || actor.uid).slice(0, 100),
      actorRole: "verified_submitter", teamAssignments: validated.teams as unknown as Prisma.InputJsonValue,
      winningTeamKey: validated.winningTeamKey, winningPlayerKeys: validated.winningPlayerKeys,
      reason: validated.reason, evidence: validated.evidence ?? Prisma.JsonNull,
      sourceReplayHash: validated.sourceReplayHash, sourceParseIteration: validated.sourceParseIteration,
      sourceRosterHash: validated.sourceRosterHash, sourcePropositionHash: validated.sourcePropositionHash,
      rawParserSnapshot: rawParserSnapshot(game), marketSnapshot: markets.snapshot,
      hasLinkedMarket: markets.hasLinkedMarket,
      financialDisposition: markets.hasLinkedMarket ? "operator_review_required" : "none",
      affectsStats: true, affectsBets: false,
    }, select: { id: true } });
    return { outcome: "created" as const, adjudicationId: adjudication.id };
  }, { maxWait: 2_000, timeout: 15_000 });
  return { ...base, ...result, reason: "accepted_statistics_only" };
}
