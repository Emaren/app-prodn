#!/usr/bin/env node
/**
 * Non-crediting 88-route evidence intake PRE-FLIGHT.
 *
 * This is a bounded source/shape/freshness planner, NOT a trust root, score
 * verifier, public API or signer. All candidate observations are untrusted.
 * The only mechanism permitted to award Index points remains the separately
 * approved Ed25519/artifact/nonce/deployed-build publication boundary.
 * Other routes require their OWN route-scoped equivalent before any score.
 */
import {requiredProofKindsForCriterion,verifyCriterionProofPolicy}
  from "../lib/kingdomIndexCriterionProofPolicy.mjs";

const SHA40=/^[0-9a-f]{40}$/;
const SHA64=/^[0-9a-f]{64}$/;
const SRC=/^src-[0-9a-f]{16}$/;
const TYPES=new Set(["source","ci","database","browser","performance","security","production"]);
const fail=message=>{throw Error("KINGDOM INTAKE STOP: "+message)};
function exact(v,keys,label){
 if(!v||Array.isArray(v)||typeof v!=="object"||
   JSON.stringify(Object.keys(v).sort())!==JSON.stringify([...keys].sort()))
  fail("Invalid "+label+" fields");
 return v;
}
function stamp(s){
 return typeof s==="string"&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(s)&&
 Number.isFinite(Date.parse(s))&&new Date(Date.parse(s)).toISOString()===s;
}
function contract({catalog,inventory,routeProfiles,profiles,rubric}){
 if(!Array.isArray(catalog)||catalog.length!==88||!Array.isArray(inventory?.pages)||
  !routeProfiles||typeof routeProfiles!=="object"||!profiles||
  !rubric||rubric.maximum!==100||rubric.version!=="2026-10-18-v1")
  fail("Canonical 88-route source/rubric inventory missing");
 verifyCriterionProofPolicy(rubric);
 const canonical=new Map();
 for(const [dimension,block] of Object.entries(rubric.dimensions)){
  if(!Array.isArray(block.criteria)||!Number.isInteger(block.weight)||
    block.criteria.reduce((n,c)=>n+c.max,0)!==block.weight)
   fail("Invalid canonical dimension");
  for(const c of block.criteria){
   if(canonical.has(c.id)||!Number.isInteger(c.max)||c.max<=0)
    fail("Repeated or invalid criterion");
   canonical.set(c.id,{dimension,maximum:c.max,requirement:c.requirement});
  }
 }
 if(canonical.size!==20||[...canonical.values()].reduce((n,c)=>n+c.maximum,0)!==100)
  fail("Canonical 20-criterion rubric drift");
 const entries=new Map();
 for(const row of catalog){
  if(!row||typeof row.href!=="string"||entries.has(row.href)||
    !SRC.test(row.sourceTree)||!Object.hasOwn(routeProfiles,row.href))
   fail("Unregistered, duplicated or malformed public route");
  const template=inventory.pages.find(x=>x.href===row.href&&x.scope==="public-index");
  if(!template||typeof template.entrypoint!=="string")
   fail("Public route lacks registered source template");
  const profileId=routeProfiles[row.href],profile=profiles[profileId];
  if(!profile||!Array.isArray(profile.gates)||
    new Set(profile.gates.map(x=>x.id)).size!==profile.gates.length)
   fail("Missing or duplicate specialized route gate");
  entries.set(row.href,{row,template:template.entrypoint,profileId,gates:profile.gates});
 }
 return {entries,canonical};
}
function validSource(source,expected,entry){
 exact(source,["gitSha","sourceTree","buildId","closureSha256","assetsSha256","releaseSha256"],"source");
 exact(expected,["gitSha","sourceTree","buildId","closureSha256","assetsSha256","releaseSha256"],"independent expectation");
 if(!SHA40.test(source.gitSha)||!SRC.test(source.sourceTree)||
    typeof source.buildId!=="string"||source.buildId.length<5||source.buildId.length>128||
    ![source.closureSha256,source.assetsSha256,source.releaseSha256].every(x=>SHA64.test(x)))
  fail("Invalid candidate source identity");
 if(source.sourceTree!==entry.row.sourceTree)
  fail("Wrong route-local source fingerprint");
 for(const field of Object.keys(source))
  if(source[field]!==expected[field])fail("Candidate/independent source mismatch: "+field);
}
/**
 * Build an all-public-pages, NO-SCORE dossier. Optional candidate rows are
 * source-bound *claims*, never proof approvals. The caller must furnish the
 * expectedByHref mapping separately from candidate metadata. Even an exact
 * match is NOT independent build attestation or a scored criterion.
 */
export function prepareKingdomRouteIntake({
 catalog,inventory,routeProfiles,profiles,rubric,
 candidates=[],expectedByHref=new Map(),nowMs=Date.now()
}){
 const {entries,canonical}=contract({catalog,inventory,routeProfiles,profiles,rubric});
 if(!Array.isArray(candidates)||candidates.length>88||
   !(expectedByHref instanceof Map)||!Number.isSafeInteger(nowMs))
  fail("Unbounded batch or no independently supplied expected-source map");
 const byRoute=new Map(),seenDigests=new Set();
 for(const candidate of candidates){
  exact(candidate,["href","source","observations"],"candidate");
  const entry=entries.get(candidate.href);
  if(!entry||byRoute.has(candidate.href))fail("Private, unknown or repeated candidate route");
  const expected=expectedByHref.get(candidate.href);
  if(!expected)fail("Missing independent source for "+candidate.href);
  validSource(candidate.source,expected,entry);
  if(!Array.isArray(candidate.observations)||candidate.observations.length>192)
   fail("Unbounded candidate observations");
  const seenTargets=new Set(),byTarget=new Map();
  for(const item of candidate.observations){
   exact(item,["target","id","kind","sha256","measuredAt","originRef"],"observation");
   if(!["criterion","gate"].includes(item.target)||typeof item.id!=="string"||
     !TYPES.has(item.kind)||!SHA64.test(item.sha256)||!stamp(item.measuredAt)||
     typeof item.originRef!=="string"||item.originRef.length>600||
     !/^https:\/\/github\.com\/Emaren\/(?:app-prodn|aoe2-watcher)\//.test(item.originRef))
    fail("Invalid untrusted observation provenance");
   const maxAge=["browser","performance","production"].includes(item.kind)?
      48*3600000:30*86400000,age=nowMs-Date.parse(item.measuredAt);
   if(age<0||age>maxAge)fail("Future or stale evidence, not eligible for intake");
   if(seenDigests.has(item.sha256))fail("Duplicate proof bytes across criteria/routes");
   seenDigests.add(item.sha256);
   if(item.target==="criterion"){
    if(!canonical.has(item.id)||
      !requiredProofKindsForCriterion(item.id).includes(item.kind))
     fail("Criterion requires a different domain proof kind");
   }else if(!entry.gates.some(x=>x.id===item.id)){
    fail("Gate belongs to a different assurance profile");
   }
   const target=item.target+":"+item.id;
   const count=seenTargets.has(target)?byTarget.get(target).length:0;
   if(count>=8)fail("Excessive repeated proofs for one target");
   seenTargets.add(target);
   if(!byTarget.has(target))byTarget.set(target,[]);
   byTarget.get(target).push({kind:item.kind,sha256:item.sha256,ageHours:Math.round(age/360000)/10});
  }
  byRoute.set(candidate.href,byTarget);
 }
 const routes=[...entries].map(([href,entry])=>{
  const observed=byRoute.get(href)??new Map();
  const status=(target,id)=>observed.has(target+":"+id)?
    "CANDIDATE_ONLY_INDEPENDENT_APPROVAL_REQUIRED":"MISSING_INDEPENDENT_EVIDENCE";
  return {
   href,template:entry.template,profile:entry.profileId,
   sourceTree:entry.row.sourceTree,
   score:null,blockedPoints:100,certified:false,
   status:"UNMEASURED",
   criteria:[...canonical].map(([id,c])=>({
    id,dimension:c.dimension,maximum:c.maximum,earned:null,
    status:status("criterion",id),
    evidence:observed.get("criterion:"+id)??[],
    nextAction:"Authenticate exact artifact bytes, measurement origin and independent criterion approval"
   })),
   gates:entry.gates.map(g=>({
    id:g.id,status:status("gate",g.id),verified:false,
    evidence:observed.get("gate:"+g.id)??[],
    nextAction:"Obtain separate route-specialized independent gate proof and approval"
   }))
  };
 });
 return Object.freeze({
  schema:1,kind:"aoe2war.kingdom-index.88-route-noncrediting-intake.v1",
  totalPublicRoutes:routes.length,withUntrustedCandidates:byRoute.size,
  totalCertified:0,totalAwardedPoints:null,
  scoreAuthority:"NONE_UNTIL_SEPARATELY_AUTHENTICATED_PUBLICATION",
  routes,
  limitations:"Candidate shape, age, kind and declared SHA equality are not cryptographic origin, measured truth, trusted issuer approval, nonce commitment, deployed build or certification. Public pages and desktop Watcher require separate authority."
 });
}
