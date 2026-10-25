/**
 * Public, bounded observation contract for the existing deterministic Kingdom
 * Intelligence bridge. This is a PROJECTION, not a new collector, certifier or
 * autonomous agent. Source-reported equality is not independent attestation.
 */
export type IntelligenceEvidenceStatus = "SOURCE_REPORTED" | "UNKNOWN" | "STALE" | "CONTRADICTORY";

export type SanitizedIntelligenceObservation = {
  sourceGitSha: string | null;
  buildId: string | null;
  collectorAuthority: "aoe2war-operator-bridge";
  producer: "kingdom-intelligence-brain";
  observedAt: string | null;
  receivedAt: string | null;
  ttlSeconds: number;
  status: IntelligenceEvidenceStatus;
  evidenceUri: null; // No authenticated public receipt URI is supplied by this bridge.
  limitations: string[];
  unknownReasons: string[];
};

type Json = Record<string, unknown>;
const TTL_SECONDS = 15 * 60;
const FUTURE_SKEW_MS = 30_000;
const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/;

const rec = (value: unknown): Json =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Json : {};

function sha(value: unknown): string | null {
  return typeof value === "string" && /^[0-9a-f]{40}$/i.test(value) ? value.toLowerCase() : null;
}

function build(value: unknown): string | null {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(value) ? value : null;
}

function timestamp(value: unknown): { iso: string; ms: number } | null {
  if (typeof value !== "string" || !ISO.test(value)) return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  // Date.parse normalizes impossible Gregorian dates on some runtimes.
  if (new Date(ms).toISOString().slice(0, 10) !== value.slice(0, 10)) return null;
  return { iso: new Date(ms).toISOString(), ms };
}

function safeCount(value: unknown): number | null {
  if (typeof value === "number") return Number.isSafeInteger(value) && value >= 0 ? value : null;
  if (typeof value === "string" && /^(0|[1-9]\d*)$/.test(value)) {
    const n = Number(value);
    return Number.isSafeInteger(n) ? n : null;
  }
  return null;
}

export function inspectIntelligenceHealthEvidence(input: {
  source: unknown;
  health: unknown;
  invariants: unknown;
  capturedAt: unknown;
  receivedAt: unknown;
  nowMs: number;
  /** Must come from an independent certified production reader, NEVER the bridge payload. */
  independentCertifiedSha?: string | null;
}): {
  observation: SanitizedIntelligenceObservation;
  counts: { p0: number | null; p1: number | null };
} {
  const source = rec(input.source);
  const production = rec(source.production);
  const certification = rec(source.certification);
  const health = rec(input.health);
  const sourceGitSha = sha(production.source_sha);
  const buildId = build(production.build_id) ?? build(production.buildId);
  const captured = timestamp(input.capturedAt);
  const received = timestamp(input.receivedAt);
  const reasons: string[] = [];
  let status: IntelligenceEvidenceStatus = "SOURCE_REPORTED";
  const counts = { p0: safeCount(health.p0), p1: safeCount(health.p1) };

  if (source.exact !== true) reasons.push("bridge-source-exact-not-reported");
  if (!sourceGitSha) reasons.push("production-source-sha-missing");
  if (!captured) reasons.push("capture-time-invalid");
  if (!received) reasons.push("receipt-time-invalid");
  if (!Number.isFinite(input.nowMs)) reasons.push("observation-clock-invalid");
  if (counts.p0 === null || counts.p1 === null) reasons.push("p0-p1-missing-or-invalid");

  // An independently certified source, when supplied by a future authorized
  // caller, is a hard identity gate. The reported certification object alone
  // cannot satisfy it or promote SOURCE_REPORTED to VERIFIED.
  const independent = input.independentCertifiedSha == null
    ? null : sha(input.independentCertifiedSha);
  if (input.independentCertifiedSha != null && !independent) {
    reasons.push("independent-certificate-invalid");
  }

  if (reasons.length) status = "UNKNOWN";
  else if (captured && received && (
    captured.ms > input.nowMs + FUTURE_SKEW_MS ||
    received.ms > input.nowMs + FUTURE_SKEW_MS
  )) {
    status = "UNKNOWN";
    reasons.push("timestamp-from-future");
  } else if (captured && received && (
    input.nowMs - captured.ms > TTL_SECONDS * 1000 ||
    input.nowMs - received.ms > TTL_SECONDS * 1000
  )) {
    status = "STALE";
    reasons.push("source-observation-expired");
  }

  const bridgeCertifiedSha = certification.source_sha === undefined
    ? null : sha(certification.source_sha);
  const reportContradiction =
    (certification.source_sha !== undefined && (!bridgeCertifiedSha || bridgeCertifiedSha !== sourceGitSha)) ||
    (independent !== null && independent !== sourceGitSha) ||
    (counts.p0 !== null && counts.p0 > 0 && health.doctor_status === "HEALTHY") ||
    (counts.p0 !== null && counts.p0 > 0 && health.estate === "HEALTHY") ||
    (Array.isArray(input.invariants) && input.invariants.some(v => {
      const invariant = rec(v);
      return invariant.status === "PASS" && (
        (invariant.key === "estate-p0-zero" && counts.p0 !== null && counts.p0 > 0) ||
        (invariant.key === "estate-p1-zero" && counts.p1 !== null && counts.p1 > 0)
      );
    }));
  if (reportContradiction) {
    status = "CONTRADICTORY";
    reasons.push("source-or-severity-contradiction");
  }

  return {
    observation: {
      sourceGitSha,
      buildId,
      collectorAuthority: "aoe2war-operator-bridge",
      producer: "kingdom-intelligence-brain",
      observedAt: captured?.iso ?? null,
      receivedAt: received?.iso ?? null,
      ttlSeconds: TTL_SECONDS,
      status,
      evidenceUri: null,
      limitations: [
        "SOURCE_REPORTED is a bridge observation, not independently certified production health.",
        "The bridge does not supply an authenticated public evidence URI.",
      ],
      unknownReasons: reasons,
    },
    // Incomplete, expired or contradictory reports cannot show zero findings.
    counts: status === "SOURCE_REPORTED" ? counts : { p0: null, p1: null },
  };
}
