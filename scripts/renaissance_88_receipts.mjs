#!/usr/bin/env node
/** Read-only verification and conservative assembly of candidate route receipts. */
import {readFile,writeFile,mkdir,realpath} from "node:fs/promises";
import {createHash} from "node:crypto";
import {resolve,join} from "node:path";
import {fileURLToPath} from "node:url";
import {execFileSync} from "node:child_process";

const HEX=/^[a-f0-9]{40}$/;
const BUILD=/^[a-zA-Z0-9_-]{5,128}$/;
const VALID=new Set(["PASS","FAIL","UNKNOWN"]);
function fail(message){throw new Error("RENAISSANCE 88 RECEIPT HOLD: "+message);}
function digest(data){return createHash("sha256").update(data).digest("hex");}
export function validateRouteReceipt(receipt,plan,expected){
 if(!receipt||typeof receipt!=="object"||!plan||!expected||!HEX.test(expected.sourceSha)||
  !BUILD.test(expected.buildId)||receipt.source_sha!==expected.sourceSha||
  receipt.build_id!==expected.buildId||
  receipt.route!==plan.route||
  receipt.phase!==plan.phase||receipt.profile!==plan.profile||
  !VALID.has(receipt.status)||!Array.isArray(receipt.views)||!receipt.criteria||
  receipt.criteria.production!=="UNKNOWN"||receipt.criteria.financial_nonmutation!=="UNKNOWN"||
  !Array.isArray(receipt.missing_criteria))
  fail("Route claim, provenance or scope mismatch");
 if(receipt.views.length<1||receipt.views.length>20)fail("Missing/out of bounds browser samples");
 const observed=new Set();
 for(const view of receipt.views){
  const key=view.viewport+"/"+view.sample;
  if(!["desktop","mobile"].includes(view.viewport)||!Number.isInteger(view.sample)||
   view.sample<1||view.sample>10||observed.has(key)||view.attempted!==true||
   !["OBSERVED","FAIL","UNKNOWN"].includes(view.browserStatus)||
   !Number.isInteger(view.privacyMutationAttempts)||view.privacyMutationAttempts<0)
   fail("Malformed, duplicate or incomplete view sample");
  observed.add(key);
 }
 if(!observed.has("desktop/1")||!observed.has("mobile/1"))fail("Both viewport baselines required");
 if(receipt.status==="PASS"&&receipt.views.some(v=>
    v.http!==200||v.sameOrigin!==true||v.rendered!==true||
    v.uncaughtErrors!==0||v.keyboardFocus!==true))
  fail("False successful browser verdict");
 const blocked=receipt.views.reduce((sum,view)=>sum+view.privacyMutationAttempts,0);
 if(!receipt.resource||receipt.resource.client_mutations_blocked!==blocked)
  fail("Unreconciled blocked browser mutation attempts");
 if(blocked>0 && receipt.criteria.client_mutation_attempts!=="OBSERVED_AND_BLOCKED_NOT_CLEARED")
  fail("Blocked client mutations must remain explicit UNKNOWN write evidence");
 if(receipt.performance?.gate!=="UNKNOWN")fail("Unqualified performance gate claimed");
 if(receipt.quality_score!==undefined||receipt.certified===true||
    receipt.production_certified===true)fail("Unauthorized point award/certification");
 return {route:receipt.route,status:receipt.status,
  criteria:receipt.criteria,missing:receipt.missing_criteria,
  browser_samples:receipt.views.length,domain:"UNMEASURED",
  live_production:"UNMEASURED",certified:false,score:null};
}
function cli(argv){
 const x={};
 if(argv.length%2)fail("Paired arguments required");
 for(let i=0;i<argv.length;i+=2){
  const k=argv[i];
  if(!["--plan","--directory","--out","--allow-partial"].includes(k)||Object.hasOwn(x,k))fail("Unknown/duplicate argument");
  x[k]=argv[i+1];
 }
 if(!x["--plan"]||!x["--directory"]||!x["--out"]||!["true","false"].includes(x["--allow-partial"]))fail("Required args absent");
 return x;
}
async function main(){
 const args=cli(process.argv.slice(2));
 const planBytes=await readFile(args["--plan"]);
 const plan=JSON.parse(planBytes.toString("utf8"));
 if(plan.schema!=="aoe2war.renaissance.public88.factory-plan.v1"||
   plan.routes?.length!==88||!HEX.test(plan.source_sha)||!BUILD.test(plan.build?.build_id))
   fail("Incorrect source/build public plan");
 const actual=execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim();
 if(actual!==plan.source_sha)fail("Local Git head disagrees with source plan");
 const currentBuild=(await readFile(".next/BUILD_ID","utf8")).trim();
 if(currentBuild!==plan.build.build_id)fail("Build identity changed");
 const directory=resolve(args["--directory"]),output=resolve(args["--out"]);
 if(!directory.includes("/"))fail("Unsafe evidence directory");
 const allowedRoutes=new Set(plan.routes.map(r=>r.route));
 if(allowedRoutes.size!==88)fail("Duplicate Index route plan");
 const dirList=await (await import("node:fs/promises")).readdir(directory);
 if(dirList.length>210)fail("Unbounded evidence directory");
 const perRoute=new Map();
 const evidenceDigests={};
 for(const file of dirList.filter(f=>/^route-[A-Za-z0-9_-]{1,130}\.json$/.test(f))){
  const bytes=await readFile(join(directory,file));
  if(bytes.length<30||bytes.length>500000)fail("Oversized or empty raw route receipt");
  const raw=bytes.toString("utf8");
  const parsed=JSON.parse(raw);
  if(raw!==JSON.stringify(parsed,null,2)+"\n")fail("Noncanonical route receipt");
  if(!allowedRoutes.has(parsed.route)||perRoute.has(parsed.route))fail("Unknown/duplicate route receipt");
  const scope=plan.routes.find(r=>r.route===parsed.route);
  perRoute.set(parsed.route,validateRouteReceipt(parsed,scope,
    {sourceSha:plan.source_sha,buildId:plan.build.build_id}));
  evidenceDigests[parsed.route]=digest(bytes);
 }
 const result=plan.routes.map(entry=>{
  const evidence=perRoute.get(entry.route);
  if(evidence)return {...evidence,profile_gates:entry.specialty_gates.map(g=>({
     id:g.id,state:"UNMEASURED",requirement:g.requirement}))};
  return {route:entry.route,status:"UNMEASURED",criteria:{},missing:[
     {criterion:"browser_cohort",state:"UNMEASURED"},
     {criterion:"domain",state:"UNMEASURED"},
     {criterion:"production",state:"UNMEASURED"}],
     browser_samples:0,profile_gates:entry.specialty_gates.map(g=>({
       id:g.id,state:"UNMEASURED",requirement:g.requirement})),
     certified:false,score:null};
 });
 if(args["--allow-partial"]==="false"&&perRoute.size!==88)fail("Expected all 88 real browser receipts");
 const summary={
  schema:"aoe2war.renaissance.public88.candidate-coverage.v1",
  source_sha:plan.source_sha,build_id:plan.build.build_id,
  manifest_sha256:plan.build.manifest_sha256,
  plan_sha256:digest(planBytes),route_digest_sha256:evidenceDigests,
  routes_required:88,routes_observed:perRoute.size,
  statuses:Object.fromEntries(["PASS","FAIL","UNKNOWN","UNMEASURED"].map(s=>
    [s,result.filter(r=>r.status===s).length])),
  unmeasured_routes:result.filter(r=>r.status==="UNMEASURED").map(r=>r.route),
  candidate_only:true,certified:false,score:null,domain_owner_review_required:true,
  production_release_authority:"NOT_PROVIDED",
  limitations:["Unmeasured is never zero or PASS",
    "JSON artifacts from CI alone are not independently signed production receipts",
    "Specialized financial, replay and admin gates not satisfied by public browser smoke"],
  routes:result
 };
 await mkdir(resolve(output,".."),{recursive:true});
 await writeFile(output,JSON.stringify(summary,null,2)+"\n");
 console.log("88 route coverage: "+JSON.stringify(summary.statuses)+" source="+plan.source_sha);
 if(summary.statuses.FAIL>0)process.exitCode=1;
}
const invoked=process.argv[1]?await realpath(resolve(process.argv[1])).catch(()=>null):null;
if(invoked===fileURLToPath(import.meta.url))
 main().catch(err=>{console.error(String(err));process.exitCode=2;});
