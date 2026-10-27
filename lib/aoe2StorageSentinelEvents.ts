/** PRIVATE Storage Sentinel event contract. Not a public API or activation permit. */
export const SENTINEL_EVENT_SCHEMA = "aoe2war.storage-sentinel.event.v1" as const;
export const SENTINEL_PUBLIC_SCHEMA = "aoe2war.storage-sentinel.public.v1" as const;
export type SentinelPlane = "mac" | "hel1-root" | "hel1-volume-105319120";
export type SentinelRule = "storage_pressure" | "storage_regression" |
  "snapshot_admission_hold" | "collector_stale" | "backup_failed" |
  "scan_incomplete" | "cleanup_candidate_review" | "build_generation_expired";
export type SentinelSeverity = "WATCH" | "CRITICAL" | "HOLD";
export type SentinelEvent = Readonly<{
  schema: typeof SENTINEL_EVENT_SCHEMA;
  id: string; // sha256 of plane/rule/band/source epoch; stable across retries
  plane: SentinelPlane;
  rule: SentinelRule;
  band: string;
  source_sha: string; // private, never emit in public projection
  collector_id: string; // private
  sequence: number; // private
  observed_at: string;
  evaluated_at: string;
  coverage: "complete" | "partial" | "inaccessible";
  severity: SentinelSeverity;
  reason: string; // ALLOWLIST only; no raw paths, hostnames, secrets
  recommendation: string; // ALLOWLIST only; never executable
  atlas_href: "/aoe2war-os/storage-atlas";
  approval: "REVIEW_REQUIRED" | "NOT_APPLICABLE";
  receipt_sha256: string; // private
}>;
export type SentinelPublicProjection = Readonly<{
  schema: typeof SENTINEL_PUBLIC_SCHEMA;
  live: false;
  admission: "HOLD";
  last_ingested_at: string | null;
  unresolved: ReadonlyArray<Readonly<{
    plane: SentinelPlane; rule: SentinelRule; severity: SentinelSeverity;
    observed_at: string; age_seconds: number;
    coverage: "complete" | "partial" | "inaccessible";
    reason: string; atlas_href: "/aoe2war-os/storage-atlas";
  }>>;
}>;
export function sentinelPublicProjection(input: unknown, now = new Date()): SentinelPublicProjection {
  const empty: SentinelPublicProjection = {schema:SENTINEL_PUBLIC_SCHEMA,live:false,
    admission:"HOLD",last_ingested_at:null,unresolved:[]};
  if(!input || typeof input !== "object" || Array.isArray(input)) return empty;
  const v=input as Record<string,unknown>;
  if(v.schema !== "aoe2war.storage-sentinel.private-projection.v1" ||
      !Array.isArray(v.unresolved) || v.unresolved.length>32) return empty;
  const allowedPlane=["mac","hel1-root","hel1-volume-105319120"];
  const allowedRule=["storage_pressure","storage_regression","snapshot_admission_hold",
    "collector_stale","backup_failed","scan_incomplete","cleanup_candidate_review","build_generation_expired"];
  const allowedSeverity=["WATCH","CRITICAL","HOLD"];
  const out=[];
  for(const raw of v.unresolved){
    if(!raw||typeof raw!=="object"||Array.isArray(raw))return empty;
    const e=raw as Record<string,unknown>;
    const t=typeof e.observed_at==="string"?Date.parse(e.observed_at):NaN;
    if(!allowedPlane.includes(String(e.plane))||!allowedRule.includes(String(e.rule))||
       !allowedSeverity.includes(String(e.severity))||
       !["complete","partial","inaccessible"].includes(String(e.coverage))||
       !Number.isFinite(t)||t>now.getTime()+30000||
       typeof e.reason!=="string"||!/^[-A-Z0-9_]{1,80}$/.test(e.reason))return empty;
    out.push({plane:e.plane as SentinelPlane,rule:e.rule as SentinelRule,
      severity:e.severity as SentinelSeverity,observed_at:new Date(t).toISOString(),
      age_seconds:Math.max(0,Math.floor((now.getTime()-t)/1000)),
      coverage:e.coverage as "complete"|"partial"|"inaccessible",reason:e.reason,
      atlas_href:"/aoe2war-os/storage-atlas" as const});
  }
  const t=typeof v.last_ingested_at==="string"?Date.parse(v.last_ingested_at):NaN;
  return {schema:SENTINEL_PUBLIC_SCHEMA,live:false,admission:"HOLD",
    last_ingested_at:Number.isFinite(t)&&t<=now.getTime()+30000?new Date(t).toISOString():null,
    unresolved:out};
}
