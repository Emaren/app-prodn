export type KingdomRuntimeReading = Readonly<{
  id: "navigation" | "accessibility" | "doctor" | "inspections" | "releaseParity";
  label:string; numerator:number;denominator:number; producer:string;
  observedAt:string;expiresAt:string;receiptSha256:string;
  status:"STALE"|"REPORTED_UNVERIFIED";
}>;
export type KingdomRuntimeTelemetry = Readonly<{
  schema:1; sourceSha:string;buildId:string;revisionSha256:string;
  capturedAt:string;authority:"OPERATOR_REPORTED_UNCERTIFIED";
  readings:ReadonlyArray<KingdomRuntimeReading>;
}>;
export const RUNTIME_SCHEMA:string;
export function parseKingdomRuntimeTelemetry(raw:string,options:{
 expectedGitSha:string;expectedBuildId:string;nowMs:number
}):KingdomRuntimeTelemetry;
export function readKingdomRuntimeTelemetry(options:{
 file:string|undefined;expectedGitSha:string;expectedBuildId:string;nowMs:number
}):Promise<KingdomRuntimeTelemetry|null>;
