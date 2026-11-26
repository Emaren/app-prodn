/** Deterministic, owner-bound L2 *review* suggestions. Never deletion authority.
 * Inputs are authenticated server read models and HMAC-verified append-only
 * owner decisions. The browser cannot infer physical reclaim from gross bytes.
 */
import { CATEGORY_REVIEW_VERSION, categoryReviewEvidence, type ProtectionLevel, type TeachingPlane } from "./storageHogTeachingPolicy.ts";
import { teachingSourceDeadline } from "./storageSignedFreshness.ts";
import type { TeachingEvent } from "./storageHogTeachingLedger.ts";

export const STORAGE_L2_POLICY_VERSION = "aoe2war.storage-l2-review.v1" as const;

export type Level2Suggestion = {
  policyVersion: typeof STORAGE_L2_POLICY_VERSION;
  finding: "REVIEW_SUGGESTED" | "NEEDS_EXAMPLES" | "ALREADY_REVIEWED" | "PROTECTED" | "EXPIRED" | "UNVERIFIED";
  confidence: "NONE" | "LOW" | "MODERATE" | "HIGH";
  exampleCount: number;
  validUntilUtc: string | null;
  explanation: string;
  exceptions: string[];
  scope: "CATEGORY_ONLY_NOT_A_FILE";
  uniqueReclaimableBytes: null;
  deletionAuthorized: false;
};

export function recommendLevel2Category(
  events: readonly TeachingEvent[],
  input: { plane: TeachingPlane; category: string; sourceFloor: ProtectionLevel;
    overlaps: boolean; observedAt: string; sourceSigned: boolean },
  ownerBinding: string | null,
  now = Date.now(),
): Level2Suggestion {
  const base = {
    policyVersion: STORAGE_L2_POLICY_VERSION, exampleCount: 0,
    validUntilUtc: null, scope: "CATEGORY_ONLY_NOT_A_FILE" as const,
    uniqueReclaimableBytes: null, deletionAuthorized: false as const,
    exceptions: ["Individual-file identity, dependencies and restore proof are NOT admitted."],
  };
  if (!input.sourceSigned || !ownerBinding || !/^[0-9a-f]{64}$/.test(ownerBinding))
    return { ...base, finding: "UNVERIFIED", confidence: "NONE",
      explanation: "No authenticated signed source or enrolled owner history. No recommendation." };
  const expiry = teachingSourceDeadline(input.observedAt, 2, now);
  if (expiry === null) return { ...base, finding: "EXPIRED", confidence: "NONE",
    explanation: "The source is missing, future-dated or older than one hour. Refresh the signed observation." };
  const reviewed = categoryReviewEvidence(events, input, ownerBinding, now);
  const common = { ...base, validUntilUtc: new Date(expiry).toISOString(), exampleCount: reviewed.examples.length };
  if (reviewed.finding === "PROTECTED")
    return { ...common, finding: "PROTECTED", confidence: "NONE",
      explanation: "Source protection or a permanent owner L5 decision forbids an L2 suggestion." };
  if (reviewed.finding === "ALREADY_REVIEWED")
    return { ...common, finding: "ALREADY_REVIEWED", confidence: "NONE",
      explanation: "The owner has already recorded a decision for this exact observation." };
  if (reviewed.finding !== "REVIEW_SUGGESTED")
    return { ...common, finding: "NEEDS_EXAMPLES", confidence: "NONE",
      explanation: "Two separate prior signed observations with explicit L2 owner decisions and explanations are required." };
  const exceptions = input.overlaps
    ? [...base.exceptions, "Overlapping allocations or APFS clones: physical reclaim is UNKNOWN."]
    : base.exceptions;
  return { ...common, finding: "REVIEW_SUGGESTED",
    confidence: input.overlaps ? "LOW" : reviewed.examples.length >= 3 ? "HIGH" : "MODERATE",
    exceptions,
    explanation: "The enrolled owner recorded " + reviewed.examples.length
      + " distinct earlier L2 decisions for this protected category, on this exact plane and policy version. "
      + "This invites manual inspection only; individual files are not nominated.",
  };
}

export const STORAGE_L2_DRY_RUN_POLICY = "aoe2war.storage-l2-dry-run-proposal.v1" as const;
export type Level2DryRun = {
  policyVersion: typeof STORAGE_L2_DRY_RUN_POLICY;
  status: "HOLD" | "MANUAL_REVIEW_POSSIBLE";
  missing: string[];
  proposedSteps: readonly string[];
  estimatedPhysicalReclaimBytes: null;
  deletionAuthorized: false;
  executorAvailable: false;
};

/** No IO, fs operations, cloud calls, deletion, copy, move or trash APIs. */
export function evaluateLevel2DryRun(input: {
  sourceSigned: boolean; sourceObservedAt: string; ownerBoundDecision: boolean;
  sourceFloor: ProtectionLevel; effectiveLevel: ProtectionLevel;
  itemAlias: string | null; itemFingerprint: string | null; sourceDigest: string | null;
  allocatedBytes: number | null; logicalBytes: number | null;
  overlapResolved: boolean; dependencyAssessmentPassed: boolean;
  protectedPathExcluded: boolean; independentRestoreProven: boolean;
  ownerPolicyApproved: boolean; reversiblePlanReviewed: boolean;
}, now = Date.now()): Level2DryRun {
  const missing: string[] = [];
  if (!input.sourceSigned || teachingSourceDeadline(input.sourceObservedAt, 2, now) === null)
    missing.push("Fresh signed item source at most one hour old");
  if (!input.ownerBoundDecision || input.effectiveLevel !== 2 || input.sourceFloor > 2)
    missing.push("Owner-bound L2 decision without a stronger source floor");
  if (!input.itemAlias || !/^[A-Za-z0-9._:-]{4,120}$/.test(input.itemAlias)
      || !input.itemFingerprint || !/^[0-9a-f]{64}$/.test(input.itemFingerprint)
      || !input.sourceDigest || !/^[0-9a-f]{64}$/.test(input.sourceDigest))
    missing.push("Exact signed immutable item identity and source digest");
  if (!Number.isSafeInteger(input.allocatedBytes) || input.allocatedBytes === null || input.allocatedBytes < 0
      || !Number.isSafeInteger(input.logicalBytes) || input.logicalBytes === null || input.logicalBytes < 0)
    missing.push("Independently measured physical allocation and logical bytes");
  if (!input.overlapResolved) missing.push("Clone, hardlink and snapshot overlap resolved");
  if (!input.dependencyAssessmentPassed) missing.push("Dependencies independently cleared");
  if (!input.protectedPathExcluded) missing.push("Protected and operational path exclusions");
  if (!input.independentRestoreProven) missing.push("Independent backup AND real restore proof");
  if (!input.ownerPolicyApproved) missing.push("Separate explicit owner execution policy and manifest");
  if (!input.reversiblePlanReviewed) missing.push("Independently reviewed rollback and receipt design");
  return {
    policyVersion: STORAGE_L2_DRY_RUN_POLICY,
    status: missing.length ? "HOLD" : "MANUAL_REVIEW_POSSIBLE",
    missing,
    proposedSteps: [
      "Reobserve the exact source item, inode/alias and mount before any future action",
      "Recheck dependencies, protected paths, hardlinks, clones and current policy",
      "Verify an independently tested restorable copy and reversible quarantine design",
      "Obtain a distinct owner-signed purpose-specific executor permit after independent review",
      "ONLY a separately approved future executor may act; verify rollback and audit receipt",
    ],
    estimatedPhysicalReclaimBytes: null,
    deletionAuthorized: false,
    executorAvailable: false,
  };
}
