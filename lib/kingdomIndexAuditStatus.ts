/**
 * Public Kingdom Index classification is NOT a certification authority.
 *
 * An agent or source-review is always provisional; an operator-provided observation
 * with kind="certified" and GitHub URL strings is only a CLAIM. No authenticated
 * per-criterion evidence verifier is wired into the server yet, so the claim
 * must not count as CURRENT/CERTIFIED, even at the exact source SHA.
 *
 * This helper is intentionally pure to make the dangerous boundary testable
 * without importing Next.js server-only modules or a live database.
 */
export type PublicIndexAuditKind = "certified" | "agent" | "source-review";
export type PublicIndexAuditStatus =
  | "unmeasured" | "current" | "drifted" | "stale" | "provisional";

export function classifyPublicKingdomAuditStatus({
  kind,
  versionAligned,
  stale,
}: {
  kind: PublicIndexAuditKind | null;
  versionAligned: boolean;
  stale: boolean;
}): PublicIndexAuditStatus {
  if (!kind) return "unmeasured";
  if (!versionAligned) return "drifted";
  if (stale) return "stale";
  // A self-declared "certified" observation is never a trusted signature.
  // Future certification needs independent source/runtime/criteria validation.
  // Fresh agent JSON and GitHub URLs are unverified claims, not proof.
  if (kind === "certified" || kind === "agent" || kind === "source-review") return "provisional";
  return "unmeasured";
}

/** No agent or certificate assertion can populate the live score slot until
 * an independent per-criterion verifier is implemented and exercised.
 * Historical reviews and unverified claims remain inspectable only.
 */
export function publicObservedKingdomScore(_input: {
  status: PublicIndexAuditStatus;
  kind: PublicIndexAuditKind | null;
  score: number | null;
}): number | null {
  // No authenticated independent per-criterion verifier currently exists.
  // Never promote operator JSON, even if the caller claims "current".
  return null;
}

/** An agent observation is only a fresh signal while actively refreshed.
 * The 30-day review-retention window is not permission to call an agent feed live.
 */
export function isKingdomObservationStale(input: {
  kind: PublicIndexAuditKind;
  checkedAtMs: number | null;
  nowMs: number;
}): boolean {
  if(input.checkedAtMs===null || !Number.isFinite(input.checkedAtMs) || !Number.isFinite(input.nowMs)) return true;
  const age = input.nowMs - input.checkedAtMs;
  const ttl = input.kind==="agent" ? 15*60*1000 : 30*24*60*60*1000;
  return age > ttl || age < -5*60*1000;
}
