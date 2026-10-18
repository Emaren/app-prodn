import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import catalog from "@/config/kingdom-index-routes.json";
import baseline from "@/config/kingdom-index-baseline.json";
import { PAGE_CHANGE_MANIFEST } from "@/lib/pageChangeManifest.generated";

export type District = "citadel" | "arena" | "forge" | "bazaar" | "commons";
export type PageAuditKind = "certified" | "agent" | "source-review";
export type PageObservation = {
  href: string;
  score: number;
  checkedAt: string;
  sourceVersion: string;
  kind: PageAuditKind;
  dimensions?: { correctness: number; functionality: number; performance: number; maintainability: number; tests: number };
  history?: { at: string; score: number }[];
  loadMs?: number;
  bytes?: number;
  notes?: string;
};
export type KingdomIndexEntry = {
  href: string;
  label: string;
  district: District;
  sourceVersion: string | null;
  measuredVersion: string | null;
  score: number | null;
  checkedAt: string | null;
  kind: PageAuditKind | null;
  status: "unmeasured" | "current" | "drifted" | "stale" | "provisional";
  history: { at: string; score: number }[];
  loadMs: number | null;
  bytes: number | null;
  dimensions: PageObservation["dimensions"] | null;
  notes: string | null;
};
export type KingdomIndexSnapshot = {
  schema: 1;
  generatedAt: string;
  pages: KingdomIndexEntry[];
  observed: number;
  certified: number;
  drifted: number;
  source: "file" | "review-baseline";
};
// Values are evidence-bound, not AI-guessed. 100 requires independent certification.
const PAGE_VERSIONS = new Map<string,string>(PAGE_CHANGE_MANIFEST.map(r=>[r.href,r.version]));
const MAX_LEDGER_BYTES = 256_000;
const AUDIT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
function dateValue(raw: unknown): number | null {
  if(typeof raw !== "string" || raw.length>50) return null;
  const ms=Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}
function scoreValue(raw: unknown): raw is number {
  return typeof raw==="number" && Number.isInteger(raw) && raw>=0 && raw<=100;
}
function validRecord(raw: unknown, allowSet: Set<string>): raw is PageObservation {
  if(!raw || typeof raw!=="object" || Array.isArray(raw)) return false;
  const r=raw as Record<string,unknown>;
  return typeof r.href==="string" && allowSet.has(r.href) &&
    scoreValue(r.score) && typeof r.sourceVersion==="string" && r.sourceVersion.length>4 &&
    dateValue(r.checkedAt)!==null &&
    (r.kind==="certified" || r.kind==="agent" || r.kind==="source-review") &&
    (!r.history || (Array.isArray(r.history) && r.history.length<=60 &&
      r.history.every(item=>!!item && typeof item==="object" && scoreValue((item as {score?:unknown}).score) &&
        dateValue((item as {at?:unknown}).at)!==null)));
}
async function observations(): Promise<{ rows: PageObservation[]; source: KingdomIndexSnapshot["source"] }> {
  const allow=new Set(catalog.map(r=>r.href));
  const original=(baseline.observations as PageObservation[]).filter(r=>validRecord(r,allow));
  // An operator-controlled, sanitized public snapshot, outside the deploy tree.
  // The visitor never selects this path and cannot submit an audit.
  const file=process.env.KINGDOM_INDEX_EVIDENCE_PATH;
  if(!file) return {rows:original,source:"review-baseline"};
  try {
    const safePath=path.resolve(file);
    const stat=await import("node:fs/promises").then(fs=>fs.lstat(safePath));
    if(!stat.isFile() || stat.isSymbolicLink() || stat.size>MAX_LEDGER_BYTES) throw new Error("Invalid evidence file");
    const json=JSON.parse(await readFile(safePath,"utf8")) as {schema?:unknown;observations?:unknown};
    if(json.schema!==1 || !Array.isArray(json.observations) || json.observations.length>250) throw new Error("Invalid evidence schema");
    const verified=json.observations.filter(r=>validRecord(r,allow)) as PageObservation[];
    // Operator evidence supersedes a review baseline for the exact route.
    const merged=new Map(original.map(r=>[r.href,r]));
    for(const row of verified) {
      const prev=merged.get(row.href);
      if(!prev || (dateValue(row.checkedAt)??0) > (dateValue(prev.checkedAt)??0)) merged.set(row.href,row);
    }
    return {rows:[...merged.values()],source:"file"};
  } catch {
    // No false certified status if the operator source cannot be read.
    return {rows:original,source:"review-baseline"};
  }
}
export async function loadKingdomIndex(): Promise<KingdomIndexSnapshot> {
  const now=Date.now();
  const proof=await observations();
  const byRoute=new Map(proof.rows.map(r=>[r.href,r]));
  const pages: KingdomIndexEntry[]=catalog.map(route=>{
    const version=PAGE_VERSIONS.get(route.href)??route.sourceTree;
    const obs=byRoute.get(route.href);
    const measuredVersion=obs?.sourceVersion??null;
    // Historical evidence can be inspected but cannot count as current if the
    // deployed route version or exact source version is unavailable.
    const versionAligned=Boolean(obs && version && measuredVersion===version);
    const stale=Boolean(obs && (now-(dateValue(obs.checkedAt)??0)>AUDIT_TTL_MS || (dateValue(obs.checkedAt)??0)>now+300_000));
    const status:KingdomIndexEntry["status"]=!obs?"unmeasured":!versionAligned?"drifted":stale?"stale":obs.kind==="source-review"?"provisional":"current";
    return {
      href:route.href,label:route.label,district:route.district as District,
      sourceVersion:version??null,measuredVersion,
      // Keep a historical score visible only with an explicit noncurrent state.
      score:obs?.score??null, checkedAt:obs?.checkedAt??null,
      kind:obs?.kind??null,status,
      history:obs?.history?.slice(-40)??[],
      loadMs:typeof obs?.loadMs==="number"&&Number.isFinite(obs.loadMs)&&obs.loadMs>=0?obs.loadMs:null,
      bytes:typeof obs?.bytes==="number"&&Number.isFinite(obs.bytes)&&obs.bytes>=0?obs.bytes:null,
      dimensions:obs?.dimensions??null,
      notes:typeof obs?.notes==="string"?obs.notes.slice(0,500):null,
    };
  });
  return {
    schema:1,generatedAt:new Date(now).toISOString(),pages,
    observed:pages.filter(p=>p.score!==null).length,
    certified:pages.filter(p=>p.status==="current"&&p.kind==="certified").length,
    drifted:pages.filter(p=>p.status==="drifted"||p.status==="stale").length,
    source:proof.source,
  };
}
