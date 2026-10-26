export type VerifiedKingdomPublication = {
  readonly score:number|null;
  readonly authenticatedEarned:number;
  readonly certified:boolean;
  readonly status:"current"|"provisional";
  readonly issuedAt:string;
  readonly expiresAt:string;
  readonly evidenceSha256:string;
  readonly source:{readonly gitSha:string;readonly buildId:string;readonly releaseSha256:string;readonly assetsSha256:string;readonly closureSha256:string};
  readonly dimensions:{readonly correctness:number;readonly functionality:number;readonly performance:number;readonly maintainability:number;readonly tests:number};
  readonly gates:ReadonlyArray<{readonly id:string;readonly result:"pass"|"fail"}>;
  readonly criteria: ReadonlyArray<{
    readonly id:string;readonly dimension:string;readonly earned:number;
    readonly proofKinds:ReadonlyArray<string>;readonly proofDigests:ReadonlyArray<string>;
  }>;
  readonly criteriaVerified:number;
  readonly artifactsVerified:number;
};
export function loadCurrentKingdomIndexTrustedPublication(input:{
  rubric:unknown;
  profile:unknown;
  nowMs?:number;
}):Promise<VerifiedKingdomPublication|null>;
