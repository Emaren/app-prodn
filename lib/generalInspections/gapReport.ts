import type { GeneralInspectionsSnapshot, InspectionCheck } from "./types.ts";
import { INSPECTION_CATEGORY_WEIGHTS } from "./scoring.ts";

export type GapStatus = "pass" | "fail" | "unknown";
const SHA = /^[0-9a-f]{40}$/;
const CATEGORY_IDS = ["speed", "documentation", "organization", "tests", "release", "security", "data"] as const;
const INVARIANT_CHECKS = new Set([
  "estate-findings", "failed-units", "maintenance", "service", "build-parity",
  "source-parity", "wolo-8092", "wolo-8093", "wolo-estate", "reboot",
  "system-map", "storage-map",
]);
const REPAIR: Record<string, string> = {
  speed: "Collect bounded cold-phone and edge cohort receipts on the exact certified website build; record measured timestamps and source SHA.",
  documentation: "Read the current DocsV2 registry/review queue; enumerate actual expired document IDs and reference-drift rows, renew their source reviews and rerun strict checks. Do not exclude failing documents.",
  organization: "Obtain a current read-only owner-host statfs/storage-expiry/worktree witness; preserve unique evidence and protected rollback generations.",
  tests: "Inspect the exact-source certified gate's required_commands, results and build receipt; do not turn skipped checks into fabricated passes.",
  release: "Compare certified activation, active BUILD_ID, source planes and a current owner-host Doctor capture; never rerun Finish automatically.",
  security: "Collect current read-only host, patch, P0 and recovery witnesses; never restart services from a public GET.",
  data: "Collect separate current read-only Wolo listener, replay-closure and mutation-boundary receipts; listener counts do not certify custody or financial solvency.",
};

function timestamp(value: string | null | undefined): number | null {
  if (!value || !/^\d{4}-\d\d-\d\dT/.test(value)) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function ttlHours(categoryId: string, checkId: string): number | null {
  if (categoryId === "speed") return 168;
  if (categoryId === "documentation") return 72;
  if (categoryId === "tests") return null; // Certified source/build proof, not a live-host heartbeat.
  if (categoryId === "release" && ["certified", "receipt"].includes(checkId)) return null;
  if (categoryId === "release" && ["doctor", "estate-findings", "build-parity", "service", "source-parity"].includes(checkId)) return 6;
  if (categoryId === "security" && ["vpssentry", "failed-units", "updates", "reboot", "maintenance", "security-fresh"].includes(checkId)) return 6;
  if (categoryId === "data" && ["wolo-8092", "wolo-8093", "wolo-estate", "watcher-release"].includes(checkId)) return 6;
  if (categoryId === "organization" && ["root-free", "volume-used"].includes(checkId)) return null; // Local statfs taken during snapshot build.
  return 168;
}

function checkStatus(categoryId: string, item: InspectionCheck, now: number): { status: GapStatus; reason: string; ageHours: number | null; ttlHours: number | null } {
  const ttl = ttlHours(categoryId, item.id);
  const at = timestamp(item.evidenceAt);
  const age = at === null ? null : Math.round(((now - at) / 3_600_000) * 10) / 10;
  if (at !== null && now - at < -5 * 60_000) return { status: "unknown", reason: "future-dated-evidence", ageHours: age, ttlHours: ttl };
  if (ttl !== null && at !== null && now - at > ttl * 3_600_000) return { status: "unknown", reason: "stale-evidence", ageHours: age, ttlHours: ttl };
  const full = item.earned + 0.001 >= item.weight;
  if (full) {
    if (ttl !== null && at === null && !(categoryId === "organization" && ["root-free", "volume-used"].includes(item.id))) {
      return { status: "unknown", reason: "missing-observation-time", ageHours: age, ttlHours: ttl };
    }
    return { status: "pass", reason: "scored-full-on-published-evidence", ageHours: age, ttlHours: ttl };
  }
  if (at === null) return { status: "unknown", reason: "missing-observation-time", ageHours: age, ttlHours: ttl };
  if (INVARIANT_CHECKS.has(item.id) && !/unknown|not proven|pending|unavailable|\?|no bridged/i.test(item.detail)) {
    return { status: "fail", reason: "observed-invariant-gap", ageHours: age, ttlHours: ttl };
  }
  return { status: "unknown", reason: "incomplete-or-unverified-proof", ageHours: age, ttlHours: ttl };
}

/** Pure projection of one sanitized inspection snapshot. Never reads host evidence again. */
export function buildWhyNotGreenReport(snapshot: GeneralInspectionsSnapshot) {
  const generatedAt = timestamp(snapshot.generatedAt);
  if (!generatedAt || !SHA.test(snapshot.releaseSha || "") || snapshot.schema !== 1 ||
      !Array.isArray(snapshot.categories) || snapshot.categories.length !== CATEGORY_IDS.length) {
    throw new Error("Incomplete or unbound General Inspections snapshot");
  }
  const seen = new Set<string>();
  const categoryMatrix = [];
  const gaps = [];
  let total = 0;
  for (const group of snapshot.categories) {
    const weights = INSPECTION_CATEGORY_WEIGHTS[group.id as keyof typeof INSPECTION_CATEGORY_WEIGHTS] as readonly number[] | undefined;
    if (!weights || seen.has(group.id) || group.maxScore !== 100 ||
        group.checks.length !== weights.length || !Number.isInteger(group.score)) {
      throw new Error("Invalid category or canonical weight count");
    }
    seen.add(group.id);
    let earned = 0;
    let failures = 0;
    let unknowns = 0;
    const checkIds = new Set<string>();
    for (const [i, item] of group.checks.entries()) {
      if (checkIds.has(item.id) || item.weight !== weights[i] ||
          !Number.isFinite(item.earned) || item.earned < 0 || item.earned > item.weight) {
        throw new Error("Invalid canonical weighted check evidence");
      }
      checkIds.add(item.id);
      earned += item.earned;
      const result = checkStatus(group.id, item, generatedAt);
      if (result.status === "fail") failures++;
      if (result.status === "unknown") unknowns++;
      if (result.status !== "pass" || item.earned < item.weight) {
        gaps.push({
          categoryId: group.id, checkId: item.id, label: item.label,
          status: result.status, reason: result.reason,
          earned: item.earned, weight: item.weight,
          missingPoints: Math.round((item.weight - item.earned) * 10) / 10,
          observedAt: item.evidenceAt ?? null, ageHours: result.ageHours,
          ttlHours: result.ttlHours, detail: item.detail,
          repair: REPAIR[group.id],
        });
      }
    }
    if (Math.round(earned) !== group.score) throw new Error("Category score/receipt mismatch");
    total += group.score;
    categoryMatrix.push({
      id: group.id, title: group.title, observedScore: group.score,
      status: failures ? "fail" : unknowns ? "unknown" : "pass",
      failedChecks: failures, unknownChecks: unknowns,
      repair: REPAIR[group.id],
    });
  }
  if (seen.size !== CATEGORY_IDS.length ||
      Math.round(total / CATEGORY_IDS.length) !== snapshot.overallScore) {
    throw new Error("Category membership or overall-score mismatch");
  }
  gaps.sort((a, b) => b.missingPoints - a.missingPoints || a.categoryId.localeCompare(b.categoryId) || a.checkId.localeCompare(b.checkId));
  return {
    schema: "aoe2war.general-inspections.why-not-green.v1",
    generatedAt: snapshot.generatedAt,
    claimedCertifiedReleaseSha: snapshot.releaseSha,
    buildVersion: snapshot.buildVersion,
    observedOverallScore: snapshot.overallScore,
    certainty: "projection-of-published-inspection-receipts-not-independent-host-certification",
    matrix: categoryMatrix,
    gaps,
    totalMissingCategoryPoints: Math.round((700 - total) * 10) / 10,
    measuredHealthChanged: false,
    notes: [
      "PASS/FAIL/UNKNOWN describes published check evidence, not Kingdom Index certification or Wolo financial safety.",
      "Unknown/missing proof is not an observed operational failure.",
      "Document IDs are not present in the aggregate documentation check: a current DocsV2 registry/review-queue witness is required for exact expired IDs.",
      "No collection, recomputation or privileged action is performed by this report.",
    ],
  };
}
