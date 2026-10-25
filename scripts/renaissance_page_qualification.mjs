#!/usr/bin/env node
/** Read-only repeatable page worklists. CI browser smoke never awards Index points. */
import {readFile,writeFile,realpath} from "node:fs/promises";
import {execFileSync} from "node:child_process";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
const SHA=/^[a-f0-9]{40}$/;
const HASH=/^[a-f0-9]{64}$/;
const BUILD=/^[A-Za-z0-9_-]{5,128}$/;
const STATES=["PASS","FAIL","UNKNOWN","UNMEASURED"];
const fail=why=>{throw Error("RENAISSANCE QUALIFICATION HOLD: "+why);};
const ok=(yes,why)=>{if(!yes)fail(why);};
const obj=x=>!!x&&typeof x==="object"&&!Array.isArray(x);
const pilot=["/kingdom-index","/requests","/","/kingdom-intelligence","/workshop",
 "/academy","/library","/download","/watch","/betting-mechanics"];

function criteriaFrom(rubric){
 ok(rubric?.schema===1&&rubric.maximum===100&&obj(rubric.dimensions),"Invalid rubric");
 const criteria=[],seen=new Set();let total=0;
 for(const [dimension,group] of Object.entries(rubric.dimensions)){
  ok(Number.isSafeInteger(group.weight)&&group.weight>0&&Array.isArray(group.criteria),"Invalid rubric dimension");
  let subtotal=0;
  for(const c of group.criteria){
   ok(typeof c.id==="string"&&/^[a-z_]+$/.test(c.id)&&!seen.has(c.id)&&
      Number.isSafeInteger(c.max)&&c.max>0&&typeof c.requirement==="string"&&c.requirement.length>10,
      "Invalid/duplicate rubric criterion");
   seen.add(c.id);subtotal+=c.max;
   criteria.push({id:c.id,dimension,maximum:c.max,requirement:c.requirement});
  }
  ok(subtotal===group.weight,"Rubric group total mismatch");total+=group.weight;
 }
 ok(criteria.length===20&&total===100,"Expected 20 canonical criteria / 100 points");
 return criteria;
}
/** This is deliberately NOT the Index's independently authenticated scorer. */
export function buildQualificationPackets({coverage,catalog,rubric,profiles,currentSha}){
 ok(obj(coverage)&&coverage.schema==="aoe2war.renaissance.public88.candidate-coverage.v1","Unrecognized Chrome summary");
 ok(SHA.test(coverage.source_sha)&&BUILD.test(coverage.build_id)&&
    HASH.test(coverage.manifest_sha256)&&HASH.test(coverage.plan_sha256),
    "Missing source/build evidence identity");
 ok(coverage.candidate_only===true&&coverage.certified===false&&coverage.score===null&&
    coverage.production_release_authority==="NOT_PROVIDED"&&
    coverage.routes_required===88&&Array.isArray(coverage.routes)&&coverage.routes.length===88,
    "Browser evidence improperly claims authority or lacks 88 routes");
 ok(Array.isArray(catalog)&&catalog.length===88&&profiles?.schema===1&&
    obj(profiles.profiles)&&obj(profiles.routeProfiles)&&
    Object.keys(profiles.routeProfiles).length===88&&
    obj(coverage.route_digest_sha256),"Canonical profile and evidence catalog required");
 ok(SHA.test(currentSha),"No independent current Git HEAD");
 const criteria=criteriaFrom(rubric),catalogMap=new Map();
 for(const r of catalog){
  ok(typeof r.href==="string"&&r.href.startsWith("/")&&!catalogMap.has(r.href)&&
     typeof r.label==="string"&&typeof r.sourceTree==="string","Invalid registered route");
  catalogMap.set(r.href,r);
 }
 ok(Object.keys(coverage.route_digest_sha256).length===88&&
    Object.keys(profiles.routeProfiles).every(p=>catalogMap.has(p)),"Incomplete 88-route source inventory");
 const sameSource=coverage.source_sha===currentSha,seen=new Set();
 const counts={PASS:0,FAIL:0,UNKNOWN:0,UNMEASURED:0},packets=[];
 for(const r of coverage.routes){
  ok(obj(r)&&catalogMap.has(r.route)&&!seen.has(r.route)&&STATES.includes(r.status)&&
     r.certified===false&&r.score===null&&!Object.hasOwn(r,"quality_score")&&
     !Object.hasOwn(r,"approved_points"),"Duplicated/unapproved scoring claim");
  seen.add(r.route);counts[r.status]++;
  const digest=coverage.route_digest_sha256[r.route];
  ok(r.status==="UNMEASURED"?digest===undefined:HASH.test(digest),
     "Unmeasured/missing candidate route digest");
  ok(Number.isSafeInteger(r.browser_samples)&&r.browser_samples>=0&&r.browser_samples<=20&&
     (r.status==="UNMEASURED"?r.browser_samples===0:r.browser_samples>=2),
     "Invalid desktop/mobile sample count");
  const name=profiles.routeProfiles[r.route],profile=profiles.profiles[name];
  ok(typeof name==="string"&&obj(profile)&&Array.isArray(profile.gates)&&
     Array.isArray(r.profile_gates)&&r.profile_gates.length===profile.gates.length,
     "Unknown or incomplete specialized gate set");
  const wanted=new Set(profile.gates.map(g=>g.id)),observed=new Set();
  for(const gate of r.profile_gates){
   ok(obj(gate)&&wanted.has(gate.id)&&!observed.has(gate.id)&&
      gate.state==="UNMEASURED","Specialized gates cannot be certified by Chrome");
   observed.add(gate.id);
  }
  const src=catalogMap.get(r.route);
  packets.push({
   href:r.route,label:src.label,source_tree:src.sourceTree,
   assurance_profile:name,
   candidate_navigation:{status:r.status,samples:r.browser_samples,
      receipt_sha256:digest??null,source_sha:coverage.source_sha,
      build_id:coverage.build_id,same_git_checkout:sameSource},
   criteria:criteria.map(c=>({...c,evidence_state:"NOT_INDEPENDENTLY_ADMITTED",earned_points:null})),
   specialty_gates:profile.gates.map(g=>({
      id:g.id,dimension:g.dimension,requirement:g.requirement,state:"UNVERIFIED"})),
   operator_next_actions:[
    ...(r.status!=="PASS"?["Repair/retest exact route navigation with disposable browser"]:[]),
    "Collect independently authenticated criterion-by-criterion evidence",
    "Qualify route specialty gates with original producer receipts",
    "Verify production Git SHA / Next BUILD_ID / rollback and review freshness"
   ],
   measured_score:null,certified:false,deployed_release_verified:false,
   status:sameSource?"CANDIDATE_AWAITING_INDEPENDENT_APPROVAL":"HISTORICAL_CANDIDATE_SOURCE"
  });
 }
 ok(seen.size===88&&coverage.routes_observed===88-counts.UNMEASURED,"Incomplete route observations");
 for(const status of STATES)ok(coverage.statuses?.[status]===counts[status],"Aggregate contradicts route receipts");
 const order=packets.sort((a,b)=>{
  const ai=pilot.indexOf(a.href),bi=pilot.indexOf(b.href);
  if(ai!==-1||bi!==-1)return (ai<0?999:ai)-(bi<0?999:bi);
  return a.href<b.href?-1:a.href>b.href?1:0;
 });
 const batches=[];
 for(let i=0;i<order.length;i+=10)batches.push({
  number:batches.length+1,pages:order.slice(i,i+10).map(p=>p.href),
  state:"AWAITING_CRITERION_ADMISSION",authenticated_certificates_in_browser_evidence:0
 });
 return{
  schema:"aoe2war.renaissance.public88.qualification-worklist.v1",
  source_sha:coverage.source_sha,build_id:coverage.build_id,
  current_checkout_sha:currentSha,source_matches_checkout:sameSource,
  underlying_candidate_plan_sha256:coverage.plan_sha256,
  candidate_navigation:counts,
  navigation_checkpoint:counts.FAIL+counts.UNKNOWN+counts.UNMEASURED===0?
    "CANDIDATE_NAVIGATION_88_PASS":"CANDIDATE_NAVIGATION_NOT_ALL_PASS",
  total_pages:88,criteria_per_page:20,total_criterion_obligations:1760,
  authenticated_grade_in_candidate_evidence:false,independently_approved_points:null,
  certified_page_count_from_browser_evidence:0,quality_scores_authorized:false,
  production_release_authority:"NOT_PROVIDED",
  limitation:"Passing CI navigation is not criterion admission, an independent operator approval, or deployed production certification.",
  batches,packets:order
 };
}
async function readJson(name,limit){
 const bytes=await readFile(name);
 ok(bytes.length>10&&bytes.length<=limit,"Missing/oversized source JSON");
 return JSON.parse(bytes.toString("utf8"));
}
async function main(){
 const args=process.argv.slice(2);
 ok(args.length===4&&args[0]==="--coverage"&&args[2]==="--out",
  "Usage: node scripts/renaissance_page_qualification.mjs --coverage coverage.json --out report.json");
 const [coverage,catalog,rubric,profiles]=await Promise.all([
  readJson(args[1],3_000_000),readJson("config/kingdom-index-routes.json",100_000),
  readJson("config/kingdom-index-quality-rubric.json",50_000),
  readJson("config/kingdom-index-assurance-profiles.json",50_000)
 ]);
 const sha=execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim();
 const report=buildQualificationPackets({coverage,catalog,rubric,profiles,currentSha:sha});
 await writeFile(args[3],JSON.stringify(report,null,2)+"\n",{flag:"wx",mode:0o600});
 process.stdout.write(JSON.stringify({
  candidate_git:report.source_sha,current_git:sha,
  current_source_match:report.source_matches_checkout,
  smoke:report.candidate_navigation,
  criterion_obligations:report.total_criterion_obligations,
  certified_pages_from_candidate_evidence:0,output:resolve(args[3])})+"\n");
}
const invoked=process.argv[1]?await realpath(resolve(process.argv[1])).catch(()=>null):null;
if(invoked===fileURLToPath(import.meta.url))
 main().catch(err=>{console.error(String(err));process.exitCode=2;});
