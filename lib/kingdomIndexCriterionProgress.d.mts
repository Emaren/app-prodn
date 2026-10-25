/** Read-only projection input is ONLY the independently verified signed result. */
export type IndependentlyVerifiedCriterion = {
  readonly id:string;readonly dimension:string;readonly earned:number;
  readonly proofKinds:ReadonlyArray<string>;readonly proofDigests:ReadonlyArray<string>;
};
export type KingdomCriterionProgress = {
  maximum:number;authenticatedEarned:number|null;approvedCriteria:number;pendingCriteria:number;
  scoreAuthority:string;
  criteria:Array<{
    id:string;dimension:string;maximum:number;requirement:string;
    earned:number|null;status:"APPROVED"|"PENDING_INDEPENDENT_EVIDENCE";
    requiredProofKinds:string[];evidenceDigests:string[];missingEvidence:string[];
    nextAction:string;
  }>;
};
export function projectKingdomCriterionProgress(
  rubric:unknown,
  trustedCriteria?:ReadonlyArray<IndependentlyVerifiedCriterion>|null
):KingdomCriterionProgress;
