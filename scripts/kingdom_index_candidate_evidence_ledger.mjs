#!/usr/bin/env node
/** Read-only 20-criterion evidence coverage ledger.
 * Requires a self-consistent exact candidate Chrome/API/build bundle, but
 * never awards points, signs, consumes a nonce or upgrades any Index gate.
 * The operator/reviewer provenance enrollment and live release remain external.
 */
import {readFile,realpath} from "node:fs/promises";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {verifyIndexCandidateBundle} from "./kingdom_index_candidate_bundle_verify.mjs";

const fail=m=>{throw Error("KINGDOM LEDGER STOP: "+m)};
const COVERAGE=Object.freeze({
 authoritative_data:[],
 business_invariants:[],
 failure_semantics:[],
 security_boundaries:[],
 critical_journeys:["chrome-desktop/receipt.json","chrome-phone/receipt.json"],
 state_consistency:["api-loopback.json"],
 accessibility:[],
 responsive:["chrome-desktop/receipt.json","chrome-phone/receipt.json"],
 measured_latency:["chrome-desktop/receipt.json","chrome-phone/receipt.json","api-loopback.json"],
 bounded_data:["api-loopback.json"],
 render_efficiency:[],
 sustained_load:["concurrent-loopback.json"],
 module_boundaries:[],
 dependency_visibility:["emitted-closure.json"],
 documentation:[],
 safe_extension:[],
 domain_regressions:[],
 integration:["api-loopback.json"],
 browser:["chrome-desktop/receipt.json","chrome-phone/receipt.json"],
 release_certification:["emitted-closure.json"]
});
const LIMITS=Object.freeze({
 critical_journeys:"Cold page navigation only; no complete interactive workflows or failure paths.",
 state_consistency:"Twelve consistent API GETs; no navigation/filter/refresh/interaction state.",
 responsive:"Desktop and phone HTTP 200 and LCP; no layout-overflow, touch or accessibility assertions.",
 measured_latency:"Cold Chrome LCP and sequential API response only; warm-cache network, defined performance budgets and runtime parity missing.",
 bounded_data:"API response byte size observed; database queries/plans and production-scale rows missing.",
 sustained_load:"40 isolated concurrent GETs at concurrency 4; burst only, not sustained or representative infrastructure capacity.",
 dependency_visibility:"710 emitted file hashes observed; transitive runtime/production closure independently unverified.",
 integration:"Real Next API GETs; no authoritative database correctness or real database access proven.",
 browser:"Real Chrome loaded the page; no keyboard, focus, screen-reader or visual layout assertions.",
 release_certification:"Exact-head clean Next candidate build; no protected production activation, rollback or live observation."
});
export async function candidateEvidenceLedger({root,sourceSha,buildId,collectorSha,rubric,profile}){
 const evidence=await verifyIndexCandidateBundle(root,{sourceSha,buildId,collectorSha});
 if(rubric?.maximum!==100||rubric?.version!=="2026-10-18-v1"||
    !rubric.dimensions||!Array.isArray(profile?.gates))fail("Canonical rubric/Index assurance profile missing");
 const weights={correctness:30,functionality:25,performance:20,maintainability:15,tests:10};
 const names=Object.keys(weights);
 if(JSON.stringify(Object.keys(rubric.dimensions))!==JSON.stringify(names)||
    JSON.stringify(profile.gates.map(g=>g.id).sort())!==
    JSON.stringify(["source-closure","score-verification","staleness"].sort()))
   fail("Changed rubric or mandatory gate contract");
 const criteria=[],seen=new Set();
 for(const dimension of names){
  const block=rubric.dimensions[dimension];
  if(block?.weight!==weights[dimension]||!Array.isArray(block.criteria)||
    block.criteria.reduce((n,c)=>n+c.max,0)!==block.weight)fail("Canonical weight mismatch");
  for(const c of block.criteria){
   if(seen.has(c.id)||!Object.hasOwn(COVERAGE,c.id)||
      !Number.isSafeInteger(c.max)||c.max<=0)fail("Unknown, repeated or invalid criterion");
   seen.add(c.id);
   const observed=COVERAGE[c.id];
   criteria.push({
    id:c.id,dimension,maximum:c.max,earned:null,status:"UNKNOWN_INDEPENDENT_APPROVAL",
    candidateObservation:observed.length?"PARTIAL_CANDIDATE_ONLY":"NOT_COLLECTED",
    candidateProofPaths:[...observed],
    candidateSourceSha:sourceSha,candidateBuildId:buildId,
    independentIssuer:null,approvedArtifactSha256:null,authorizedAt:null,
    approvalExpiresAt:null,
    limitations:LIMITS[c.id]??"No independently authenticated qualifying raw evidence in candidate bundle."
   });
  }
 }
 if(criteria.length!==20||seen.size!==20)fail("Incomplete canonical criteria");
 const gateEntries=profile.gates.map(x=>({
  id:x.id,observed:x.id==="source-closure"?"PARTIAL_CANDIDATE_ONLY":"NOT_COLLECTED",
  status:"UNKNOWN",independentIssuer:null,approvedArtifactSha256:null,
  expiresAt:null
 }));
 return {
  schema:1,kind:"aoe2war.kingdom-index.candidate-evidence-ledger.v1",
  route:"/kingdom-index",sourceSha,buildId,
  evidenceInspection:"SELF_CONSISTENT_CANDIDATE_EVIDENCE_ONLY",
  emittedReceiptSha256:evidence.emitted.receiptSha256,
  desktopReceiptSha256:evidence.chrome.desktop.sha256,
  phoneReceiptSha256:evidence.chrome.phone.sha256,
  apiReceiptSha256:evidence.api.sha256,
  concurrentReceiptSha256:evidence.concurrent.sha256,
  rubricVersion:rubric.version,weights,maximum:100,
  earned:null,grade:null,certified:false,publicationAuthorized:false,
  criteria,gates:gateEntries,
  nextRequirements:[
   "Independently authenticate GitHub run origin and emitted asset bytes outside the source declaration",
   "Obtain real keyboard/a11y, warm-cache, sustained-load, DB and failure-state receipts against exact integrated source",
   "Review each raw artifact against fixed thresholds; sign criterion assignments with independently enrolled and unexpired issuers",
   "Consume durable nonce once; obtain dual approvals and separate protected #665 release authorization",
   "Prove actual deployed Git SHA, Next BUILD_ID, assets, approved release receipt, public API and browser parity"
  ],
  limitation:"UNKNOWN is not zero. Partial candidate observations receive no independent criterion points, do not satisfy any gate, and never authorize deployment."
 };
}
async function main(){
 const argv=process.argv.slice(2),options={};
 if(argv.length!==8)fail("Require --evidence-dir --expected-source --expected-build-id --collector-sha");
 for(let i=0;i<argv.length;i+=2){
  const key=argv[i]?.startsWith("--")?argv[i].slice(2):"";
  if(!["evidence-dir","expected-source","expected-build-id","collector-sha"].includes(key)||
     Object.hasOwn(options,key))fail("Unsupported or duplicate parameter");
  options[key]=argv[i+1];
 }
 const rubric=JSON.parse(await readFile("config/kingdom-index-quality-rubric.json","utf8"));
 const all=JSON.parse(await readFile("config/kingdom-index-assurance-profiles.json","utf8"));
 const report=await candidateEvidenceLedger({root:options["evidence-dir"],
  sourceSha:options["expected-source"],buildId:options["expected-build-id"],
  collectorSha:options["collector-sha"],rubric,profile:all.profiles.index});
 process.stdout.write(JSON.stringify(report,null,2)+"\n");
}
if(process.argv[1]&&await realpath(resolve(process.argv[1])).catch(()=>null)===fileURLToPath(import.meta.url))
 main().catch(e=>{console.error(String(e.message));process.exitCode=2});
