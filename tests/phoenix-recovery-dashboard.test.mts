import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validatePhoenixDashboard, type PhoenixDashboardSnapshot } from "../lib/phoenixRecoveryDashboard.ts";
import { parsePhoenixDashboardCache } from "../lib/phoenixRecoveryDashboardCache.ts";

function fixture(): PhoenixDashboardSnapshot {
  return {
    schema: "aoe2war.phoenix_dashboard.v1", observed_at: "2026-10-15T02:48:51.798Z",
    production_source: "e4594e1fb1d5fabd37e9a04ca100db085b514efd", certified_application_source: null,
    api_source_sha: "118ea8859efe20b5bdbd905a458160dd1c1976df", snapshot_sha256: "a".repeat(64), source_authority: "snapshot_bound_not_runtime_certification",
    corpus: { logical_battles: 5984, trusted_results: 4328, unresolved_results: 1656, workshop_complete_rosters: 5514, full_battle_truth: 4181, full_battle_truth_percent: 4181 / 5984 * 100 },
    unknown_causes: [{ reason: "disconnect_or_desync", count: 1074 }, { reason: "untrusted_structured_team_result", count: 542 }, { reason: "winner_missing", count: 38 }, { reason: "stored_winner_not_canonical_team", count: 2 }],
    recovery: { states: { no_replay_proof: 25, external_required: 1500, decoder_gap: 100, identity_ambiguous: 31, verified_review_required: 0, promotion_eligible: 0 }, evidence_families: { original_artifact_binding: 25, external_terminal_evidence: 1500, parser_decoder: 100, participant_binding: 31 }, exhausted_same_bytes_cases: 25, indexed_history_cases: 28, history_scope: "bounded_ledger_not_complete_attempt_history" },
    measurements: { originals_authenticated: 25, complete_byte_framed_streams: 25, full_summary_parses: 2, header_fallback_parses: 23, truncated_streams: 0, terminal_candidates: null, external_artifacts_indexed: 0, new_verified_winners_audit: 0, new_verified_winners_7_days: null, new_verified_winners_all_time: null, attempted_cases_all_time: null, yield_percent: null },
    measurement_scope: { kind: "current_unknown_inventory_with_optional_bound_historical_audit", audit_cases: 25, audit_observed_at: "2026-10-15T03:00:00Z" },
    opportunities: [{ family: "external_terminal_evidence", count: 1500, next_step: "Bind an authenticated final artifact to the exact battle.", game_stats_ids: [25590] }],
    authority: { candidate_only: true, result_authority: false, production_writes: 0, betting_writes: 0, settlement_writes: 0, wolo_writes: 0 },
  };
}
const digest = (raw: string) => createHash("sha256").update(raw).digest("hex");
const reject = (mutate: (row: PhoenixDashboardSnapshot) => void) => { const row = fixture(); mutate(row); assert.throws(() => validatePhoenixDashboard(row)); };

test("honest dated logical-battle baseline preserves zero, null and certification gap", () => {
  const row = validatePhoenixDashboard(fixture());
  assert.equal(row.corpus.full_battle_truth_percent.toFixed(6), "69.869652");
  assert.equal(row.measurements.new_verified_winners_audit, 0);
  assert.equal(row.measurements.new_verified_winners_7_days, null);
  assert.equal(row.measurements.new_verified_winners_all_time, null);
  assert.equal(row.certified_application_source, null);
  assert.equal(row.measurements.complete_byte_framed_streams, 25);
});

test("snapshot is cloned so a caller cannot mutate a validated view", () => {
  const original = fixture(); const row = validatePhoenixDashboard(original); original.corpus.trusted_results = 999;
  assert.equal(row.corpus.trusted_results, 4328);
});

test("cache binds exact bytes and rejects changed data, oversized bodies and malformed JSON", () => {
  const raw = JSON.stringify(fixture()); assert.deepEqual(parsePhoenixDashboardCache(raw, digest(raw)), fixture());
  assert.throws(() => parsePhoenixDashboardCache(`${raw}\n`, digest(raw)));
  assert.throws(() => parsePhoenixDashboardCache(raw, "a".repeat(64)));
  assert.throws(() => parsePhoenixDashboardCache(" ".repeat(65_537), digest(" ".repeat(65_537))));
  assert.throws(() => parsePhoenixDashboardCache("{", digest("{")));
});

test("unknown top-level or nested fields cannot forward private evidence", () => {
  for (const target of ["root", "corpus", "recovery", "measurements", "measurement_scope", "authority"]) {
    const row = fixture(); const object = target === "root" ? row : row[target as keyof PhoenixDashboardSnapshot];
    Object.assign(object as object, { steam_id: "private" }); assert.throws(() => validatePhoenixDashboard(row), target);
  }
});

test("counts reconcile at logical grain and rates recompute from the same denominator", () => {
  reject(row => row.corpus.trusted_results++); reject(row => row.corpus.workshop_complete_rosters = 6000);
  reject(row => row.corpus.full_battle_truth = 4329); reject(row => row.corpus.full_battle_truth_percent = 71);
  reject(row => row.recovery.states.external_required++); reject(row => row.recovery.evidence_families.external_terminal_evidence++);
});

test("unknown cause dispositions reconcile without duplicate, unsafe or private reasons", () => {
  reject(row => row.unknown_causes[0]!.count++);
  reject(row => row.unknown_causes.push({ reason: "disconnect_or_desync", count: 0 }));
  reject(row => row.unknown_causes[0]!.reason = "/Users/private");
  reject(row => Object.assign(row.unknown_causes[0]!, { player_name: "private" }));
});

test("audit measurements require a bound audit and cannot exceed its scope", () => {
  reject(row => row.measurement_scope.audit_cases = null); reject(row => row.measurement_scope.audit_observed_at = null);
  reject(row => row.measurements.originals_authenticated = 26); reject(row => row.measurements.header_fallback_parses = 24);
  reject(row => row.measurements.truncated_streams = 1); reject(row => row.measurements.new_verified_winners_audit = 26);
  const row = fixture(); row.measurement_scope.audit_cases = null; row.measurement_scope.audit_observed_at = null;
  for (const key of ["originals_authenticated", "complete_byte_framed_streams", "full_summary_parses", "header_fallback_parses", "truncated_streams", "terminal_candidates", "new_verified_winners_audit"] as const) row.measurements[key] = null;
  assert.doesNotThrow(() => validatePhoenixDashboard(row));
});

test("research history is explicitly partial and exhausted cases cannot exceed history", () => {
  reject(row => row.recovery.exhausted_same_bytes_cases = 29); reject(row => row.recovery.indexed_history_cases = 1657);
  reject(row => Object.assign(row.recovery, { history_scope: "complete_history" }));
});

test("promotion and financial authority stay false even for an otherwise valid dashboard", () => {
  for (const key of ["production_writes", "betting_writes", "settlement_writes", "wolo_writes"] as const) reject(row => row.authority[key] = 1 as 0);
  reject(row => Object.assign(row.authority, { result_authority: true })); reject(row => Object.assign(row.authority, { candidate_only: false }));
  reject(row => { row.recovery.states.external_required--; row.recovery.states.promotion_eligible++; });
});

test("opportunities bind family counts, public game IDs and compact safe descriptions", () => {
  reject(row => row.opportunities[0]!.count++); reject(row => row.opportunities[0]!.game_stats_ids = [25590, 25590]);
  reject(row => row.opportunities[0]!.next_step = "/Users/operator/private/archive");
  reject(row => row.opportunities[0]!.next_step = "Steam 76561198000000000");
  reject(row => row.opportunities.push(structuredClone(row.opportunities[0]!)));
});

test("nonfinite, negative, fractional and noncanonical source data fail closed", () => {
  reject(row => row.measurements.full_summary_parses = -1); reject(row => row.measurements.full_summary_parses = 1.5);
  reject(row => row.measurements.yield_percent = Infinity); reject(row => row.measurements.yield_percent = 101);
  reject(row => row.production_source = "main"); reject(row => row.snapshot_sha256 = "a".repeat(40));
  reject(row => row.observed_at = "yesterday");
});

test("page uses named immutable cache; research view has no scan, mutation or result inference", () => {
  const page = readFileSync("app/hd-replay-engine/page.tsx", "utf8");
  const cache = readFileSync("lib/phoenixRecoveryDashboardCache.ts", "utf8");
  const view = readFileSync("components/replay-engine/PhoenixRecoveryDashboard.tsx", "utf8");
  assert.match(page, /phoenix=\{loadPhoenixDashboardCache\(\)\}/);
  assert.match(cache, /data.*phoenix-recovery\.snapshot\.json/); assert.match(cache, /lstatSync/);
  assert.doesNotMatch(cache + view, /prisma\.|fetch\(|child_process|POST|PUT|DELETE|ensureBetMarkets|submitAdjudication/);
  assert.match(view, /Not measured/); assert.match(view, /Does not prove game completion/);
  assert.match(view, /New winners · bound audit/); assert.match(view, /not runtime certification/);
  assert.match(view, /<details/); assert.match(view, /role="img"/);
});

test("checked-in public cache is byte-bound and contains no private source identities", () => {
  const raw = readFileSync("data/phoenix-recovery.snapshot.json", "utf8");
  const row = parsePhoenixDashboardCache(raw, readFileSync("data/phoenix-recovery.snapshot.sha256", "utf8").trim());
  assert.equal(row.corpus.unresolved_results, 1656);
  assert.doesNotMatch(raw, /\/Users\/|\/var\/|steam_id|archive_path|player_names|\b\d{17}\b/);
});
