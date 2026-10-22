/**
 * Page-local, non-certifying interpretation of General Inspections claims.
 * The upstream API exposes scored declarations and receipt timestamps, not
 * independently authenticated test executions. Never manufacture PASS here.
 */
type EvidenceAge = "UNKNOWN" | "FUTURE" | "STALE" | "DATED_CLAIM";
export type EvidenceCheck = { id: string; label: string; at: string | null; age: EvidenceAge; reportedState: string; detail: string | null };
export type EvidenceAssessment = { state: "UNAVAILABLE" | "CLAIMS_ONLY"; reason: string; checks: EvidenceCheck[]; releaseSha?: string | null; buildVersion?: string | null; assembledAt?: string | null; assemblyAge?: EvidenceAge; independentlyVerified?: null };
const MAX_CATEGORIES = 32;
const MAX_CHECKS = 40;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const FUTURE_SKEW_MS = 60 * 1000;
const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, length = 160): string | null => typeof value === "string" && value.trim() ? value.trim().slice(0, length) : null;
const isIso = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(Date.parse(value)).toISOString().slice(0, 19) === value.slice(0, 19);

export function evidenceAge(value: unknown, now = Date.now()): EvidenceAge {
  if (!isIso(value)) return "UNKNOWN";
  const age = now - Date.parse(value);
  if (age < -FUTURE_SKEW_MS) return "FUTURE";
  if (age > MAX_AGE_MS) return "STALE";
  return "DATED_CLAIM";
}

/**
 * Transport freshness is explicitly separate from underlying test evidence.
 * DATED_CLAIM means only that a reported timestamp falls inside the window.
 */
export function inspectKingdomTestsEvidence(input: unknown, now = Date.now()): EvidenceAssessment {
  if (!isObject(input) || input.schema !== 1 || !Array.isArray(input.categories) || input.categories.length > MAX_CATEGORIES) {
    return { state: "UNAVAILABLE", reason: "Inspection response does not match the bounded public schema.", checks: [] };
  }
  if (input.categories.filter(row => isObject(row) && row.id === "tests").length !== 1) {
    return { state: "UNAVAILABLE", reason: "Test-category authority is missing or ambiguous.", checks: [] };
  }
  const category = input.categories.find(row => isObject(row) && row.id === "tests");
  if (!category || !Array.isArray(category.checks) || category.checks.length > MAX_CHECKS) {
    return { state: "UNAVAILABLE", reason: "No bounded test-check definitions were supplied.", checks: [] };
  }
  const releaseSha = typeof input.releaseSha === "string" && /^[a-f\d]{40}$/i.test(input.releaseSha) ? input.releaseSha.toLowerCase() : null;
  const buildVersion = text(input.buildVersion, 100);
  const assembledAt = isIso(input.generatedAt) ? input.generatedAt : null;
  const assemblyAge = evidenceAge(assembledAt, now);
  const seen = new Set<string>();
  const checks: EvidenceCheck[] = [];
  for (const row of category.checks) {
    if (!isObject(row)) return { state: "UNAVAILABLE", reason: "A test-check definition is malformed.", checks: [] };
    const id = text(row.id, 80);
    const label = text(row.label, 120);
    if (!id || !label || seen.has(id)) return { state: "UNAVAILABLE", reason: "Test-check identities are missing or duplicated.", checks: [] };
    seen.add(id);
    const at = isIso(row.evidenceAt) ? row.evidenceAt : null;
    const age = evidenceAge(row.evidenceAt, now);
    checks.push({ id, label, at, age, reportedState: typeof row.state === "string" && ["green", "amber", "red"].includes(row.state) ? row.state.toUpperCase() : "UNKNOWN", detail: text(row.detail, 240) });
  }
  return {
    state: "CLAIMS_ONLY",
    reason: "The inspection API contains readiness declarations, not independently authenticated test-execution receipts.",
    releaseSha, buildVersion, assembledAt, assemblyAge,
    checks,
    independentlyVerified: null,
  };
}
