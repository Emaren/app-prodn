/** Public, immutable research measurements. Never a result-promotion contract. */
export const PHOENIX_STATES = ["no_replay_proof", "external_required", "decoder_gap", "identity_ambiguous", "verified_review_required", "promotion_eligible"] as const;
export const PHOENIX_FAMILIES = ["original_artifact_binding", "external_terminal_evidence", "parser_decoder", "participant_binding"] as const;
export const PHOENIX_UNKNOWN_CAUSES = ["disconnect_or_desync", "untrusted_structured_team_result", "winner_missing", "stored_winner_not_canonical_team", "other_public_reason"] as const;
export type PhoenixFamily = typeof PHOENIX_FAMILIES[number];
export type PhoenixDashboardSnapshot = {
  schema: "aoe2war.phoenix_dashboard.v1";
  observed_at: string;
  production_source: string;
  certified_application_source: string | null;
  api_source_sha: string;
  snapshot_sha256: string;
  source_authority: "snapshot_bound_not_runtime_certification";
  corpus: { logical_battles: number; trusted_results: number; unresolved_results: number; workshop_complete_rosters: number; full_battle_truth: number; full_battle_truth_percent: number };
  unknown_causes: Array<{ reason: string; count: number }>;
  recovery: { states: Record<typeof PHOENIX_STATES[number], number>; evidence_families: Record<PhoenixFamily, number>; exhausted_same_bytes_cases: number; indexed_history_cases: number; history_scope: "bounded_ledger_not_complete_attempt_history" };
  measurements: { originals_authenticated: number | null; complete_byte_framed_streams: number | null; full_summary_parses: number | null; header_fallback_parses: number | null; truncated_streams: number | null; terminal_candidates: number | null; external_artifacts_indexed: number | null; new_verified_winners_audit: number | null; new_verified_winners_7_days: number | null; new_verified_winners_all_time: number | null; attempted_cases_all_time: number | null; yield_percent: number | null };
  measurement_scope: { kind: "current_unknown_inventory_with_optional_bound_historical_audit"; audit_cases: number | null; audit_observed_at: string | null };
  opportunities: Array<{ family: PhoenixFamily; count: number; next_step: string; game_stats_ids: number[] }>;
  authority: { candidate_only: true; result_authority: false; production_writes: 0; betting_writes: 0; settlement_writes: 0; wolo_writes: 0 };
};

function invalid(): never { throw new Error("Invalid source-bound Phoenix dashboard snapshot"); }
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  const row = value as Record<string, unknown>;
  if (Object.keys(row).sort().join("\0") !== [...keys].sort().join("\0")) return invalid();
  return row;
}
function count(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > 1_000_000_000) return invalid();
  return value;
}
function sha(value: unknown, length: number): string {
  if (typeof value !== "string" || !new RegExp(`^[0-9a-f]{${length}}$`).test(value)) return invalid();
  return value;
}
function timestamp(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value) || !Number.isFinite(Date.parse(value))) return invalid();
  return value;
}
function counts(value: unknown, keys: readonly string[]) {
  const row = object(value, keys);
  for (const key of keys) count(row[key]);
  return row as Record<string, number>;
}

/** Reject unknown fields instead of forwarding private research metadata. */
export function validatePhoenixDashboard(value: unknown): PhoenixDashboardSnapshot {
  const row = object(value, ["schema", "observed_at", "production_source", "certified_application_source", "api_source_sha", "snapshot_sha256", "source_authority", "corpus", "unknown_causes", "recovery", "measurements", "measurement_scope", "opportunities", "authority"]);
  if (row.schema !== "aoe2war.phoenix_dashboard.v1" || row.source_authority !== "snapshot_bound_not_runtime_certification") invalid();
  timestamp(row.observed_at); sha(row.production_source, 40); sha(row.api_source_sha, 40); sha(row.snapshot_sha256, 64);
  if (row.certified_application_source !== null) sha(row.certified_application_source, 40);
  const corpus = object(row.corpus, ["logical_battles", "trusted_results", "unresolved_results", "workshop_complete_rosters", "full_battle_truth", "full_battle_truth_percent"]);
  for (const key of ["logical_battles", "trusted_results", "unresolved_results", "workshop_complete_rosters", "full_battle_truth"]) count(corpus[key]);
  const { logical_battles: total, trusted_results: trusted, unresolved_results: unknown, full_battle_truth: complete, workshop_complete_rosters: rosters, full_battle_truth_percent: pct } = corpus as PhoenixDashboardSnapshot["corpus"];
  if (trusted + unknown !== total || rosters > total || complete > Math.min(trusted, rosters) || typeof pct !== "number" || !Number.isFinite(pct) || Math.abs(pct - (total ? complete / total * 100 : 0)) > 0.00001) invalid();
  if (!Array.isArray(row.unknown_causes) || row.unknown_causes.length > 12) invalid();
  const causeReasons = new Set<string>(); let causeTotal = 0;
  for (const value of row.unknown_causes as unknown[]) {
    const cause = object(value, ["reason", "count"]);
    if (typeof cause.reason !== "string" || !PHOENIX_UNKNOWN_CAUSES.includes(cause.reason as typeof PHOENIX_UNKNOWN_CAUSES[number]) || causeReasons.has(cause.reason)) invalid();
    causeReasons.add(cause.reason); causeTotal += count(cause.count);
  }
  if (causeTotal !== unknown) invalid();
  const recovery = object(row.recovery, ["states", "evidence_families", "exhausted_same_bytes_cases", "indexed_history_cases", "history_scope"]);
  if (recovery.history_scope !== "bounded_ledger_not_complete_attempt_history") invalid();
  const states = counts(recovery.states, PHOENIX_STATES), families = counts(recovery.evidence_families, PHOENIX_FAMILIES);
  if (Object.values(states).reduce((a, b) => a + b, 0) !== unknown || Object.values(families).reduce((a, b) => a + b, 0) !== unknown || states.verified_review_required !== 0 || states.promotion_eligible !== 0) invalid();
  if (count(recovery.exhausted_same_bytes_cases) > count(recovery.indexed_history_cases) || count(recovery.indexed_history_cases) > unknown) invalid();
  const measurementKeys = ["originals_authenticated", "complete_byte_framed_streams", "full_summary_parses", "header_fallback_parses", "truncated_streams", "terminal_candidates", "external_artifacts_indexed", "new_verified_winners_audit", "new_verified_winners_7_days", "new_verified_winners_all_time", "attempted_cases_all_time", "yield_percent"];
  const measurements = object(row.measurements, measurementKeys);
  for (const key of measurementKeys.filter(key => key !== "yield_percent")) if (measurements[key] !== null) count(measurements[key]);
  if (measurements.yield_percent !== null && (typeof measurements.yield_percent !== "number" || !Number.isFinite(measurements.yield_percent) || measurements.yield_percent < 0 || measurements.yield_percent > 100)) invalid();
  const scope = object(row.measurement_scope, ["kind", "audit_cases", "audit_observed_at"]);
  if (scope.kind !== "current_unknown_inventory_with_optional_bound_historical_audit") invalid();
  if (scope.audit_cases !== null) count(scope.audit_cases);
  if (scope.audit_observed_at !== null) timestamp(scope.audit_observed_at);
  if ((scope.audit_cases === null) !== (scope.audit_observed_at === null)) invalid();
  const auditKeys = ["originals_authenticated", "complete_byte_framed_streams", "full_summary_parses", "header_fallback_parses", "truncated_streams", "terminal_candidates", "new_verified_winners_audit"];
  for (const key of auditKeys) if (measurements[key] !== null && (scope.audit_cases === null || (measurements[key] as number) > (scope.audit_cases as number))) invalid();
  for (const keys of [["full_summary_parses", "header_fallback_parses"], ["complete_byte_framed_streams", "truncated_streams"]]) {
    if (keys.every(key => measurements[key] !== null) && (measurements[keys[0]!] as number) + (measurements[keys[1]!] as number) > (scope.audit_cases as number)) invalid();
  }
  if (!Array.isArray(row.opportunities) || row.opportunities.length > 12) invalid();
  const gameIds = new Set<number>(), seenFamilies = new Set<string>();
  for (const value of row.opportunities as unknown[]) {
    const opportunity = object(value, ["family", "count", "next_step", "game_stats_ids"]);
    if (!PHOENIX_FAMILIES.includes(opportunity.family as PhoenixFamily) || seenFamilies.has(String(opportunity.family)) || count(opportunity.count) !== families[String(opportunity.family)]) invalid();
    seenFamilies.add(String(opportunity.family));
    if (typeof opportunity.next_step !== "string" || !opportunity.next_step.trim() || opportunity.next_step.length > 600 || /[\x00-\x1f\x7f]|\/Users\/|\/var\/|\b\d{17}\b/.test(opportunity.next_step)) invalid();
    if (!Array.isArray(opportunity.game_stats_ids) || opportunity.game_stats_ids.length > Math.min(3, opportunity.count as number)) invalid();
    for (const id of opportunity.game_stats_ids as unknown[]) {
      if (count(id) === 0 || gameIds.has(id as number)) invalid();
      gameIds.add(id as number);
    }
  }
  const authority = object(row.authority, ["candidate_only", "result_authority", "production_writes", "betting_writes", "settlement_writes", "wolo_writes"]);
  if (authority.candidate_only !== true || authority.result_authority !== false || ["production_writes", "betting_writes", "settlement_writes", "wolo_writes"].some(key => authority[key] !== 0)) invalid();
  return structuredClone(value) as PhoenixDashboardSnapshot;
}
