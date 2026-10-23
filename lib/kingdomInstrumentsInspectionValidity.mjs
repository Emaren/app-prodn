/**
 * Display-only integrity guard for General Inspections operational readiness.
 * It prevents malformed/empty responses from claiming numeric readiness.
 * This does NOT independently authenticate inspections or certify any grade.
 */
const IDS = new Set(["speed", "documentation", "organization", "tests", "release", "security", "data"]);
const validScore = value => Number.isInteger(value) && value >= 0 && value <= 100;
export function validReportedInspectionReadiness(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      value.schema !== 1 || !Array.isArray(value.categories) ||
      value.categories.length !== IDS.size || !validScore(value.overallScore)) return false;
  const observed = new Set();
  let total = 0;
  for (const row of value.categories) {
    if (!row || typeof row !== "object" || Array.isArray(row) ||
        typeof row.id !== "string" || !IDS.has(row.id) || observed.has(row.id) ||
        typeof row.title !== "string" || !row.title.trim() ||
        row.maxScore !== 100 || !validScore(row.score) ||
        !Array.isArray(row.checks) || row.checks.length === 0) return false;
    observed.add(row.id);
    total += row.score;
  }
  return observed.size === IDS.size && Math.round(total / IDS.size) === value.overallScore;
}
