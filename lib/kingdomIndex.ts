import "server-only";
import { open } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import catalog from "@/config/kingdom-index-routes.json";
import inventory from "@/config/kingdom-index-inventory.json";
import baseline from "@/config/kingdom-index-baseline.json";
import qualityRubric from "@/config/kingdom-index-quality-rubric.json";
import assuranceProfiles from "@/config/kingdom-index-assurance-profiles.json";
import companionCatalog from "@/config/kingdom-index-companions.json";
import { classifyPublicKingdomAuditStatus, publicObservedKingdomScore, isKingdomObservationStale } from "@/lib/kingdomIndexAuditStatus";
import { selectKingdomScoreLineage } from "@/lib/kingdomIndexScoreLineage";
import { loadCurrentKingdomIndexTrustedPublication } from "@/lib/kingdomIndexTrustedPublicationRead.mjs";

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
  evidenceRefs?: string[];
};
export type KingdomIndexEntry = {
  href: string;
  label: string;
  district: District;
  sourceVersion: string | null;
  sourceVersionAuthority: "route-local-git-census";
  measuredVersion: string | null;
  score: number | null;
  lastReviewScore: number | null;
  checkedAt: string | null;
  kind: PageAuditKind | null;
  status: "unmeasured" | "current" | "drifted" | "stale" | "provisional";
  history: { at: string; score: number }[];
  loadMs: number | null;
  bytes: number | null;
  dimensions: PageObservation["dimensions"] | null;
  notes: string | null;
  specializedAssurance: { profile: string; gates: { id: string; requirement: string; status: "unverified" | "verified" }[] };
  authenticatedPublication: null | { evidenceSha256:string; gitSha:string; buildId:string; releaseSha256:string; issuedAt:string; expiresAt:string };
};
export type KingdomCompanion = {
  id: string;
  label: string;
  version: string;
  sourceSha: string;
  sourceAuthority: "published-release-source";
  repositoryUrl: string;
  downloadHref: string;
  status: "unmeasured";
  score: null;
  gates: { id: string; dimension: string; requirement: string; status: "unverified" }[];
};
export type KingdomIndexSnapshot = {
  schema: 1;
  generatedAt: string;
  // Counts only. Protected/admin route names remain server-side and are NEVER
  // serialized to the unauthenticated public Kingdom Index consumer.
  estate: { pageTemplates:number; adminTemplates:number; dynamicTemplates:number;
    publicIndexTemplates:number; excludedStaticTemplates:number;
    routeHandlerTemplates:number; apiHandlerTemplates:number; nonApiHandlerTemplates:number };
  pages: KingdomIndexEntry[];
  companions: KingdomCompanion[];
  observed: number;
  certified: number;
  drifted: number;
  source: "file" | "review-baseline";
};
// Values are evidence-bound, not AI-guessed. 100 requires independent certification.
const MAX_LEDGER_BYTES = 256_000;
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
  // A provisional source review or agent observation must never claim 100.
  if(r.score===100 && r.kind!=="certified") return false;
  // An agent score must carry full dimension evidence; an audited 100 cannot
  // be manufactured from a caller-supplied number alone.
  if(r.kind==="agent" || r.kind==="certified"){
    if(!r.dimensions || typeof r.dimensions!=="object" || Array.isArray(r.dimensions)) return false;
    const d=r.dimensions as Record<string,unknown>;
    const weights:Record<string,number>=Object.fromEntries(Object.entries(qualityRubric.dimensions).map(([key,dimension])=>[key,dimension.weight]));
    if(!Object.entries(weights).every(([key,max])=>typeof d[key]==="number" &&
      Number.isInteger(d[key]) && (d[key] as number)>=0 && (d[key] as number)<=max)) return false;
    if(Object.keys(weights).reduce((sum,key)=>sum+(d[key] as number),0)!==r.score) return false;

    if(!Array.isArray(r.evidenceRefs) || r.evidenceRefs.length < (r.kind==="certified"?2:1) ||
      r.evidenceRefs.length>12 || !r.evidenceRefs.every(ref=>typeof ref==="string" &&
        /^https:\/\/github\.com\/Emaren\//.test(ref) && ref.length<400)) return false;
  }
  return typeof r.href==="string" && allowSet.has(r.href) &&
    scoreValue(r.score) && typeof r.sourceVersion==="string" && r.sourceVersion.length>4 &&
    dateValue(r.checkedAt)!==null &&
    (r.kind==="source-review" || /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(String(r.checkedAt))) &&
    (r.kind==="certified" || r.kind==="agent" || r.kind==="source-review") &&
    (!r.history || (Array.isArray(r.history) && r.history.length<=60 &&
      r.history.every(item=>!!item && typeof item==="object" && scoreValue((item as {score?:unknown}).score) &&
        dateValue((item as {at?:unknown}).at)!==null)));
}
async function observations(): Promise<{ rows: PageObservation[]; source: KingdomIndexSnapshot["source"] }> {
  const allow=new Set(catalog.map(r=>r.href));
  const original=(baseline.observations as unknown[]).filter(r=>validRecord(r,allow)) as PageObservation[];
  // An operator-controlled, sanitized public snapshot, outside the deploy tree.
  // The visitor never selects this path and cannot submit an audit.
  const file=process.env.KINGDOM_INDEX_EVIDENCE_PATH;
  if(!file) return {rows:original,source:"review-baseline"};
  try {
    if(!path.isAbsolute(file)) throw new Error("Evidence path must be absolute");
    const handle=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
    let rawText="";
    try {
      const stat=await handle.stat();
      if(!stat.isFile() || stat.size<2 || stat.size>MAX_LEDGER_BYTES) throw new Error("Invalid evidence file");
      const bytes=Buffer.alloc(stat.size+1);
      const {bytesRead}=await handle.read(bytes,0,bytes.length,0);
      if(bytesRead!==stat.size) throw new Error("Evidence file changed during read");
      rawText=bytes.subarray(0,bytesRead).toString("utf8");
    } finally { await handle.close(); }
    const json=JSON.parse(rawText) as {schema?:unknown;observations?:unknown};
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
  // The operator feed may replace a current observation, but may not rewrite
  // or relabel the independent historical baseline. Keep both lineages.
  const allowed = new Set(catalog.map(r=>r.href));
  const reviews = new Map(
    (baseline.observations as unknown[])
      .filter((r): r is PageObservation => validRecord(r,allowed) && r.kind==="source-review")
      .map(r=>[r.href,r] as const),
  );
  // The optional source-bound publication reader is fail-closed. It verifies
  // actual private evidence bytes, independent signers, nonce commitment and
  // emitted BUILD_ID; ordinary operator observations can never populate scores.
  const publication=await loadCurrentKingdomIndexTrustedPublication({
    rubric:qualityRubric,profile:assuranceProfiles.profiles.index,nowMs:now,
  });
  const pages: KingdomIndexEntry[]=catalog.map(route=>{
    // All 88 public routes use the same CI-regenerated source census. The older
    // PAGE_CHANGE_MANIFEST uses a separate algorithm and only covers a subset;
    // mixing those versions could claim a source match for obsolete code.
    // This is a route-local fingerprint, NOT complete transitive provenance.
    const version = /^src-[a-f0-9]{16}$/.test(route.sourceTree) ? route.sourceTree : null;
    const obs=byRoute.get(route.href);
    const measuredVersion=obs?.sourceVersion??null;
    // Historical evidence can be inspected but cannot count as current if the
    // deployed route version or exact source version is unavailable.
    const versionAligned=Boolean(obs && version && measuredVersion===version);
    const stale=Boolean(obs && isKingdomObservationStale({kind:obs.kind,checkedAtMs:dateValue(obs.checkedAt),nowMs:now}));
    const status:KingdomIndexEntry["status"]=classifyPublicKingdomAuditStatus({
      kind:obs?.kind??null, versionAligned, stale,
    });
    const liveScore=publicObservedKingdomScore({status,kind:obs?.kind??null,score:obs?.score??null});
    const lineage=selectKingdomScoreLineage(reviews.get(route.href)??null,obs??null,liveScore);
    const profile = (assuranceProfiles.routeProfiles as Record<string,string>)[route.href] ?? "unclassified";
    const specialty = (assuranceProfiles.profiles as Record<string,{gates: {id:string;requirement:string}[]}>)[profile]
      ?? {gates:[{id:"missing-assurance-profile",requirement:"No independently reviewed engineering assurance profile exists for this public route."}]};
    return {
      href:route.href,label:route.label,district:route.district as District,
      specializedAssurance: {profile, gates: specialty.gates.map(gate=>({id:gate.id,requirement:gate.requirement,status:"unverified" as const}))},
      sourceVersion:version,sourceVersionAuthority:"route-local-git-census",measuredVersion,
      // Keep a historical score visible only with an explicit noncurrent state.
      score: liveScore,
      lastReviewScore:lineage.lastReviewScore, checkedAt:obs?.checkedAt??null,
      kind:obs?.kind??null,status,
      // Signed-JSON ingress does not itself verify benchmark artifacts or
      // historical measurements. Keep all readout metrics unknown until a
      // separately authenticated per-criterion/per-build verifier exists.
      history:[],
      loadMs:null,
      bytes:null,
      dimensions:lineage.dimensions,
      notes:typeof obs?.notes==="string"?obs.notes.slice(0,500):null,
      authenticatedPublication:null,
    };
  });
  // A raw 100 cannot be shown when a single mandatory gate fails.
  // All other rows retain their established unmeasured/provisional status.
  if(publication){
    const entry=pages.find(page=>page.href==="/kingdom-index");
    if(entry){
      const gateMap=new Map(publication.gates.map(g=>[g.id,g.result]));
      entry.specializedAssurance.gates=entry.specializedAssurance.gates.map(g=>({
        ...g,status:gateMap.get(g.id)==="pass"?"verified":"unverified",
      }));
      if(publication.certified||publication.score<100){
        entry.score=publication.score;
        entry.kind="certified";
        entry.status=publication.certified?"current":"provisional";
        entry.checkedAt=publication.issuedAt;
        entry.measuredVersion=entry.sourceVersion;
        entry.dimensions={...publication.dimensions};
      }
      entry.authenticatedPublication={
        evidenceSha256:publication.evidenceSha256,gitSha:publication.source.gitSha,
        buildId:publication.source.buildId,releaseSha256:publication.source.releaseSha256,
        issuedAt:publication.issuedAt,expiresAt:publication.expiresAt,
      };
    }
  }
  return {
    schema:1,generatedAt:new Date(now).toISOString(),estate:inventory.counts,pages,
    // Desktop companions are not web routes: a Git release SHA is source
    // provenance, NOT an installed binary, field benchmark, or certified score.
    companions: companionCatalog.companions.map(companion=>({
      id:companion.id,label:companion.label,version:companion.version,
      sourceSha:companion.releaseSourceSha,sourceAuthority:"published-release-source" as const,
      repositoryUrl:companion.repositoryUrl,downloadHref:companion.downloadHref,
      status:"unmeasured" as const,score:null,
      gates:companion.gates.map(gate=>({...gate,status:"unverified" as const})),
    })),
    observed:pages.filter(p=>p.kind!==null).length,
    certified:pages.filter(p=>p.status==="current"&&p.kind==="certified").length,
    drifted:pages.filter(p=>p.status==="drifted"||p.status==="stale").length,
    source:proof.source,
  };
}
