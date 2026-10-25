import type { SanitizedIntelligenceObservation } from "@/lib/kingdomIntelligenceEvidence";

/**
 * Bounded, public-safe explanation of an already collected observation.
 * This selector does no I/O, collects no receipts and authorizes no actions.
 * Graph dependency ids correspond to config/kingdom-brain-authorities.json.
 */
export type KingdomIncidentStatus = "UNKNOWN" | "STALE" | "CONTRADICTORY" | "UNAVAILABLE" | "SOURCE_MISMATCH" | "BUILD_MISMATCH";
export type KingdomRemediation = "RECHECK_BRIDGE_READ_ONLY" | "REVIEW_REPORT_CONFLICT" | "VERIFY_CERTIFIED_RELEASE" | "REVIEW_RUNTIME_IDENTITY";
export type KingdomOperationalIncident = {
  schema: 1;
  code: string;
  status: KingdomIncidentStatus;
  owner: "Kingdom Intelligence" | "Release OS";
  dependencyIds: readonly ("intelligence" | "release")[];
  affectedRoutes: readonly string[];
  explanation: string;
  provenance: {
    producer: string | null;
    sourceGitSha: string | null;
    buildId: string | null;
    observedAt: string | null;
    ageSeconds: number | null;
    ttlSeconds: number | null;
    evidenceUri: null;
  };
  nextAction: KingdomRemediation;
  safeAction: string;
};

const routes = ["/kingdom-intelligence", "/workshop", "/kingdom-brain", "/kingdom-agents"] as const;
const hex40 = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{40}$/i.test(v);
const buildId = (v: unknown): v is string => typeof v === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(v);
function atMs(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value)) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value.slice(0, 10) ? ms : null;
}

/**
 * Only a comparison of two inputs; even MATCH_REPORTED is NOT an authenticated
 * release certificate. The independent reader MUST first verify its receipt,
 * active runtime and actual .next/BUILD_ID outside this pure selector.
 */
export type CertifiedRuntimeClaim = {
  sourceSha: string | null;
  nextBuildId: string | null; // Actual Next BUILD_ID, never NEXT_PUBLIC buildVersion
  observedAt: string | null;
  ttlSeconds: number;
  certificateStatus: "CERTIFIED" | "HELD" | "UNKNOWN";
};
export type RuntimeIdentityDecision =
  | "MATCH_REPORTED" | "SOURCE_MISMATCH" | "BUILD_MISMATCH" | "STALE" | "UNKNOWN";
export function compareReportedToCertifiedRuntime(
  report: SanitizedIntelligenceObservation | null,
  certified: CertifiedRuntimeClaim | null,
  nowMs: number,
): RuntimeIdentityDecision {
  if (!report || !certified || !Number.isFinite(nowMs)) return "UNKNOWN";
  if (report.status !== "SOURCE_REPORTED" || certified.certificateStatus !== "CERTIFIED") return "UNKNOWN";
  if (!hex40(report.sourceGitSha) || !hex40(certified.sourceSha)) return "UNKNOWN";
  if (!buildId(report.buildId) || !buildId(certified.nextBuildId)) return "UNKNOWN";
  const certifiedAt = atMs(certified.observedAt);
  const bridgeAt = atMs(report.observedAt);
  const receivedAt = atMs(report.receivedAt);
  if (certifiedAt === null || bridgeAt === null || receivedAt === null ||
      !Number.isSafeInteger(certified.ttlSeconds) || certified.ttlSeconds <= 0 || certified.ttlSeconds > 86400 ||
      !Number.isSafeInteger(report.ttlSeconds) || report.ttlSeconds <= 0 || report.ttlSeconds > 86400) return "UNKNOWN";
  if ([certifiedAt, bridgeAt, receivedAt].some(t => t > nowMs + 30_000)) return "UNKNOWN";
  if (nowMs - certifiedAt > certified.ttlSeconds * 1000 ||
      nowMs - bridgeAt > report.ttlSeconds * 1000 ||
      nowMs - receivedAt > report.ttlSeconds * 1000) return "STALE";
  if (report.sourceGitSha.toLowerCase() !== certified.sourceSha.toLowerCase()) return "SOURCE_MISMATCH";
  if (report.buildId !== certified.nextBuildId) return "BUILD_MISMATCH";
  return "MATCH_REPORTED";
}

const explanations: Record<string, string> = {
  "bridge-source-exact-not-reported": "Bridge did not supply a valid self-consistent source report.",
  "production-source-sha-missing": "Reported production SHA is missing or not a full 40-hex identity.",
  "capture-time-invalid": "The collection timestamp is missing or malformed.",
  "receipt-time-invalid": "The persisted receipt timestamp is missing or malformed.",
  "observation-clock-invalid": "The observation clock cannot be evaluated.",
  "p0-p1-missing-or-invalid": "P0/P1 counts are missing or malformed; absence is not zero incidents.",
  "independent-certificate-invalid": "An independently supplied source identity is malformed.",
  "timestamp-from-future": "The capture or receipt is ahead of the allowed 30-second clock skew.",
  "source-observation-expired": "The collection or persisted receipt exceeded its source TTL.",
  "source-or-severity-contradiction": "The release identity, severity and invariant declarations disagree.",
};
function incident(
  code: string,
  status: KingdomIncidentStatus,
  observation: SanitizedIntelligenceObservation | null,
  nowMs: number,
  owner: "Kingdom Intelligence" | "Release OS",
  nextAction: KingdomRemediation,
  explanation: string,
): KingdomOperationalIncident {
  const ms = atMs(observation?.observedAt);
  const ageSeconds = ms !== null && Number.isFinite(nowMs) && ms <= nowMs + 30_000
    ? Math.floor((nowMs - ms) / 1000) : null;
  return {
    schema: 1, code, status, owner,
    dependencyIds: owner === "Release OS" ? ["release", "intelligence"] : ["intelligence"],
    affectedRoutes: routes,
    explanation,
    provenance: {
      producer: observation?.producer === "kingdom-intelligence-brain" ? observation.producer : null,
      sourceGitSha: hex40(observation?.sourceGitSha) ? observation!.sourceGitSha : null,
      buildId: buildId(observation?.buildId) ? observation!.buildId : null,
      observedAt: ms !== null ? observation!.observedAt : null,
      ageSeconds, ttlSeconds: typeof observation?.ttlSeconds === "number" &&
        Number.isSafeInteger(observation.ttlSeconds) && observation.ttlSeconds > 0 && observation.ttlSeconds <= 86400
        ? observation.ttlSeconds : null,
      evidenceUri: null, // Never copy operator-local receipt paths or untrusted URLs.
    },
    nextAction,
    safeAction: nextAction === "VERIFY_CERTIFIED_RELEASE"
      ? "Review the independently certified active release and real Next BUILD_ID in the protected release control."
      : nextAction === "REVIEW_RUNTIME_IDENTITY"
      ? "Compare independently certified active source/build receipts; do not deploy or restart automatically."
      : nextAction === "REVIEW_REPORT_CONFLICT"
      ? "Inspect the conflicting source receipts using existing read-only operator controls."
      : "Recheck the existing read-only Kingdom Intelligence bridge after its next bounded observation.",
  };
}

/** Return at most eight concrete diagnostic entries; no raw logs or invented repair receipts. */
export function explainKingdomOperationalState(input: {
  available: boolean;
  observation: SanitizedIntelligenceObservation | null;
  nowMs: number;
  identityComparison?: RuntimeIdentityDecision;
}): KingdomOperationalIncident[] {
  const { available, observation, nowMs, identityComparison } = input;
  if (!available || !observation) return [
    incident("bridge-unavailable", "UNAVAILABLE", null, nowMs, "Kingdom Intelligence",
      "RECHECK_BRIDGE_READ_ONLY", "No current sanitized bridge report is available."),
  ];
  const incidents: KingdomOperationalIncident[] = [];
  // Only stable audited reason codes may cross the public boundary.
  // Never echo arbitrary source/log text supplied as a future reason.
  const knownReasons = [...new Set(observation.unknownReasons.filter(code =>
    Object.prototype.hasOwnProperty.call(explanations, code)))].slice(0, 6);
  for (const code of knownReasons) {
    const status = observation.status === "STALE" ? "STALE"
      : observation.status === "CONTRADICTORY" ? "CONTRADICTORY" : "UNKNOWN";
    incidents.push(incident(code, status, observation, nowMs, "Kingdom Intelligence",
      status === "CONTRADICTORY" ? "REVIEW_REPORT_CONFLICT" : "RECHECK_BRIDGE_READ_ONLY",
      explanations[code] ?? "The bridge reported an unclassified evidence limitation."));
  }
  if (knownReasons.length === 0 && observation.status !== "SOURCE_REPORTED") {
    incidents.push(incident("source-evidence-unclassified", "UNKNOWN", observation, nowMs,
      "Kingdom Intelligence", "RECHECK_BRIDGE_READ_ONLY",
      "An unrecognized source limitation prevents reliable operational health."));
  }
  if (identityComparison === "SOURCE_MISMATCH" || identityComparison === "BUILD_MISMATCH") {
    incidents.push(incident("certified-runtime-" + identityComparison.toLowerCase().replace("_", "-"),
      identityComparison, observation, nowMs, "Release OS", "REVIEW_RUNTIME_IDENTITY",
      "Independently supplied active source/build identity disagrees with the bridge report."));
  } else {
    // Neither absence of a second reader nor a pure equality match is a certificate.
    incidents.push(incident("independent-runtime-verification-unavailable", "UNKNOWN", observation,
      nowMs, "Release OS", "VERIFY_CERTIFIED_RELEASE",
      "The public bridge report has no authenticated independent active production SHA and actual Next BUILD_ID proof."));
  }
  return incidents.slice(0, 8);
}
