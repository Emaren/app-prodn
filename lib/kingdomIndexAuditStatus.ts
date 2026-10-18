/**
 * Public Kingdom Index classification is NOT a certification authority.
 *
 * A source-review is always provisional; an operator-provided observation
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
  if (kind === "certified" || kind === "source-review") return "provisional";
  return "current";
}

/** Only an aligned, unexpired agent observation may expose an observed score.
 * Historical reviews and unverified certificate claims remain inspectable,
 * but never occupy the live quality slot. This is NOT a certification grant.
 */
export function publicObservedKingdomScore(input: {
  status: PublicIndexAuditStatus;
  kind: PublicIndexAuditKind | null;
  score: number | null;
}): number | null {
  return input.status === "current" && input.kind === "agent" &&
    typeof input.score === "number" && Number.isInteger(input.score) &&
    input.score >= 0 && input.score < 100 ? input.score : null;
}
