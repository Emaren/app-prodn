/**
 * Read-only arbitration of two independently collected production source IDs.
 *
 * General Inspections carries the complete certified release SHA. Kingdom
 * Intelligence's public payload intentionally carries only its first 12 chars.
 * A missing or malformed proof is NOT an agreement and cannot clear an agent.
 * This function never manufactures release identity from GitHub or CI.
 */
export type KingdomReleaseAlignment = "aligned" | "mismatch" | "unknown";

export function reconcileKingdomReleaseEvidence(
  inspectionRelease: string | null | undefined,
  intelligenceRelease: string | null | undefined,
): KingdomReleaseAlignment {
  if (!inspectionRelease || !intelligenceRelease) return "unknown";
  // Require a full certified inspection SHA and exactly 12 hex chars from KI.
  // Never compare unvalidated strings or shorter, collision-prone prefixes.
  if (!/^[a-f0-9]{40}$/i.test(inspectionRelease) ||
      !/^[a-f0-9]{12}$/i.test(intelligenceRelease)) return "unknown";
  return inspectionRelease.slice(0, 12).toLowerCase() === intelligenceRelease.toLowerCase()
    ? "aligned"
    : "mismatch";
}
