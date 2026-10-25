import type { GeneralInspectionsSnapshot, InspectionCheck } from "./types.ts";
import { INSPECTION_CATEGORY_WEIGHTS } from "./scoring.ts";

export type GapStatus = "pass" | "fail" | "unknown";
// An additive operational evidence state. Keep legacy GapStatus and scoring
// unchanged so existing report clients do not mistake STALE for an outage.
export type EvidenceStatus = "PASS" | "FAIL" | "STALE" | "UNKNOWN";
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

const OWNER: Record<string, string> = {
  speed: "SpeedOS/browser-and-edge-operator",
  documentation: "Central/DocsV2-single-writer",
  organization: "StorageOS-and-estate-operator",
  tests: "Certified-build-gate-owner",
  release: "Release-controller-and-host-operator",
  security: "VPSSentry-and-host-security-owner",
  data: "Replay-and-WoloChain-readonly-owner",
};

// The published check itself does not contain a cryptographically bound
// producer-receipt ID. These are repair routing hints, not auth decisions.
const REPAIR_BY_CHECK: Record<string, string> = {
  "documentation/docs-control": "Reconcile active central taxonomy and local source metadata, substantively review expired documents, then rerun strict DocsV2; preserve historical hashes.",
  "documentation/strict-doc-build": "After the original docs-review errors are resolved, rerun the independent strict documentation build and preserve its exact-source receipt.",
  "documentation/audit-taxonomy": "Rerun the central taxonomy audit after reconciled review metadata; one failed upstream generation may block multiple downstream gates.",
  "documentation/central-doc-repo": "Review the central app source snapshot and source-registry hash differences with the DocsV2 single writer; retain old commit history.",
  "organization/volume-used": "Evidence volume measured 92% used: inspect protected hot/cold checkpoints and authorized reclaim inventory before any deletion; measure same-filesystem headroom afterwards.",
  "organization/expiry-debt": "Use the existing Storage OS read-only expiry inventory and verify receipt/references for every candidate; no deletion from a public GET.",
  "release/doctor": "Collect fresh original Doctor findings from the owner machine with current production SHA/BUILD_ID; do not infer individual P0 IDs from aggregate health.",
  "release/estate-findings": "Repair the actual upstream Estate audit P0/P1 keys, rerun the original producer, and publish a source-bound observation; never suppress a severity.",
  "security/vpssentry": "Coordinate vps-sentry issue #4: reproduce overlapping runtime-directory instances and prove actual operator alert delivery in an authenticated receipt.",
  "security/failed-units": "Distinguish historical Certbot failure from VPS Sentry 226/NAMESPACE; only a new clean service result and unit health observation can clear this check.",
  "security/updates": "Classify actionable host security updates separately from intentionally phased Ubuntu rollout; do not install or reboot from an inspection reader.",
  "data/wolo-estate": "Reconcile WoloChain VPS checkout with certified implementation baseline and independently verify wolo-1 RPC on 27657; preserve protected custody.",
  "data/wolo-8092": "Observe actual protected 8092 listener identity and liveness; listener presence alone is not settlement/custody proof.",
  "data/wolo-8093": "Observe actual protected 8093 listener identity and liveness; do not touch settlement or founder-reward operation.",
  "data/watcher-release": "Verify the published signed Watcher version and real current download manifest; an unpublished candidate has no release-grade score.",
};

function repairFor(categoryId: string, checkId: string) {
  return REPAIR_BY_CHECK[categoryId + "/" + checkId] ?? REPAIR[categoryId];
}

function timestamp(value: string | null | undefined): number | null {
  if (!value || !/^\d{4}-\d\d-\d\dT/.test(value)) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function ttlHours(categoryId: string, checkId: string): number | null {
  if (categoryId === "speed") return 168;
  if (categoryId === "documentation") return 72;
  if (categoryId === "tests") return 168; // Source/build-scoped certified gate proof expires after 168h; not a live-host heartbeat.
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
  // A ratio without its original observation timestamp is not an independently
  // current failure (nor a PASS), even if some samples are marked failed.
  if (ttl !== null && at === null) return { status: "unknown", reason: "missing-observation-time", ageHours: age, ttlHours: ttl };
  // A cohort may have a full weighted score but still explicitly report failed
  // samples. Attribution must not silently promote that contradiction to PASS.
  // Malformed/empty ratios are not independent proof of a failure.
  const ratio = item.ratio;
  if (ratio) {
    if (!Number.isInteger(ratio.passed) || !Number.isInteger(ratio.total) ||
        ratio.total <= 0 || ratio.passed < 0 || ratio.passed > ratio.total) {
      return { status: "unknown", reason: "invalid-cohort-ratio", ageHours: age, ttlHours: ttl };
    }
    if (ratio.passed < ratio.total) {
      return { status: "fail", reason: "observed-cohort-failure", ageHours: age, ttlHours: ttl };
    }
  }
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

function evidenceStatus(status: GapStatus, reason: string): EvidenceStatus {
  return reason === "stale-evidence" || reason === "stale-snapshot" ? "STALE" : status.toUpperCase() as EvidenceStatus;
}

function nextDueAt(observedAt: string | null | undefined, ttl: number | null): string | null {
  const at = timestamp(observedAt);
  if (at === null || ttl === null) return null;
  const due = at + ttl * 3_600_000;
  return Number.isFinite(due) && due <= 8_640_000_000_000_000
    ? new Date(due).toISOString()
    : null;
}

/** Pure projection of one sanitized inspection snapshot. Never reads host evidence again.
 * evaluationTimeMs is the independently supplied read time, NOT a regenerated
 * producer timestamp. The public API supplies Date.now(); tests can pin time.
 */
export function buildWhyNotGreenReport(snapshot: GeneralInspectionsSnapshot, evaluationTimeMs?: number) {
  const generatedAt = timestamp(snapshot.generatedAt);
  const evaluatedAt = evaluationTimeMs ?? generatedAt;
  if (!generatedAt || !Number.isFinite(evaluatedAt) ||
      evaluatedAt === null || Math.abs(evaluatedAt) > 8_640_000_000_000_000 ||
      !SHA.test(snapshot.releaseSha || "") || snapshot.schema !== 1 ||
      !Array.isArray(snapshot.categories) || snapshot.categories.length !== CATEGORY_IDS.length) {
    throw new Error("Incomplete or unbound General Inspections snapshot");
  }
  // A previously published snapshot must never stay green when re-read hours
  // later. A six-hour bound matches the fastest existing host evidence TTL;
  // immutable certification history remains intact but the live report is STALE.
  const snapshotAgeMs = evaluatedAt - generatedAt;
  const snapshotProblem = snapshotAgeMs < -5 * 60_000
    ? "future-dated-snapshot"
    : snapshotAgeMs > 6 * 3_600_000 ? "stale-snapshot" : null;
  const seen = new Set<string>();
  const categoryMatrix = [];
  const gaps = [];
  const evidenceChecks = [];
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
    let stales = 0;
    const checkIds = new Set<string>();
    for (const [i, item] of group.checks.entries()) {
      if (checkIds.has(item.id) || item.weight !== weights[i] ||
          !Number.isFinite(item.earned) || item.earned < 0 || item.earned > item.weight) {
        throw new Error("Invalid canonical weighted check evidence");
      }
      checkIds.add(item.id);
      earned += item.earned;
      const checked = checkStatus(group.id, item, evaluatedAt);
      const result = snapshotProblem
        ? { ...checked, status: "unknown" as const, reason: snapshotProblem }
        : checked;
      const operationalStatus = evidenceStatus(result.status, result.reason);
      const dueAt = nextDueAt(item.evidenceAt, result.ttlHours);
      if (operationalStatus === "FAIL") failures++;
      if (operationalStatus === "UNKNOWN") unknowns++;
      if (operationalStatus === "STALE") stales++;
      // Stable checkKey identifies the published *check contract*, not a
      // source receipt. A real receipt ID must come from its producer.
      const checkKey = group.id + "/" + item.id;
      evidenceChecks.push({
        checkKey, categoryId: group.id, checkId: item.id, label: item.label,
        evidenceStatus: operationalStatus, reason: result.reason,
        observedAt: item.evidenceAt ?? null, ageHours: result.ageHours,
        ttlHours: result.ttlHours, nextDueAt: dueAt,
        earned: item.earned, weight: item.weight,
        claimedReleaseSha: snapshot.releaseSha, claimedBuildVersion: snapshot.buildVersion,
        originalProducerReceiptId: null, originalProducerReceiptDigest: null,
        detail: item.detail, owner: OWNER[group.id], repair: repairFor(group.id, item.id),
      });
      if (result.status !== "pass" || item.earned < item.weight) {
        gaps.push({
          categoryId: group.id, checkId: item.id, checkKey, label: item.label,
          status: result.status, evidenceStatus: operationalStatus, reason: result.reason,
          earned: item.earned, weight: item.weight,
          missingPoints: Math.round((item.weight - item.earned) * 10) / 10,
          observedAt: item.evidenceAt ?? null, ageHours: result.ageHours,
          ttlHours: result.ttlHours, nextDueAt: dueAt, detail: item.detail,
          owner: OWNER[group.id], repair: repairFor(group.id, item.id),
        });
      }
    }
    if (Math.round(earned) !== group.score) throw new Error("Category score/receipt mismatch");
    total += group.score;
    categoryMatrix.push({
      id: group.id, title: group.title, observedScore: group.score,
      status: failures ? "fail" : unknowns || stales ? "unknown" : "pass",
      evidenceStatus: failures ? "FAIL" : stales ? "STALE" : unknowns ? "UNKNOWN" : "PASS",
      failedChecks: failures, staleChecks: stales, unknownChecks: unknowns,
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
    evaluatedAt: new Date(evaluatedAt).toISOString(),
    snapshotAgeHours: Math.round(snapshotAgeMs / 3_600_000 * 10) / 10,
    snapshotEvidenceStatus: snapshotProblem
      ? evidenceStatus("unknown", snapshotProblem) : "PASS" as EvidenceStatus,
    claimedCertifiedReleaseSha: snapshot.releaseSha,
    buildVersion: snapshot.buildVersion,
    observedOverallScore: snapshot.overallScore,
    certainty: "projection-of-published-inspection-receipts-not-independent-host-certification",
    matrix: categoryMatrix,
    // All checks, including full-credit ones: omission cannot hide stale proof.
    // These rows are projections only, NOT separately authenticated receipts.
    evidenceChecks,
    gaps,
    totalMissingCategoryPoints: Math.round((700 - total) * 10) / 10,
    measuredHealthChanged: false,
    notes: [
      "PASS/FAIL/STALE/UNKNOWN describes published check evidence, not Kingdom Index certification or Wolo financial safety.",
      "Unknown/missing proof is not an observed operational failure.",
      "Document IDs are not present in the aggregate documentation check: a current DocsV2 registry/review-queue witness is required for exact expired IDs.",
      "checkKey identifies a check, not the original producer receipt ID. Source receipt IDs and original capture timestamps require producer evidence.",
      "originalProducerReceiptId/digest are unknown in the published snapshot; claimed source/build identifiers are not independent producer attestations.",
      "A replayed older-than-six-hour snapshot is STALE even when it previously reported 100; historical scores remain unchanged.",
      "nextDueAt is a projected TTL deadline, not proof a scheduler is enabled or a reinspection has run.",
      "No collection, recomputation or privileged action is performed by this report.",
    ],
  };
}
