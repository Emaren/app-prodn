import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import rubric from "../config/kingdom-index-quality-rubric.json" with {type:"json"};
import catalog from "../config/kingdom-index-routes.json" with {type:"json"};
import profiles from "../config/kingdom-index-assurance-profiles.json" with {type:"json"};
import {requiredProofKindsForCriterion} from "../lib/kingdomIndexCriterionProofPolicy.mjs";
import {projectKingdomCriterionProgress} from "../lib/kingdomIndexCriterionProgress.mjs";

const hash=x=>createHash("sha256").update(x).digest("hex");
function independentlyVerifiedFixture(){
 return Object.entries(rubric.dimensions).flatMap(([dimension,block])=>
   block.criteria.map(row=>({
     id:row.id,dimension,earned:row.max,
     proofKinds:[requiredProofKindsForCriterion(row.id)[0]],
     proofDigests:[hash("synthetic-only:"+row.id)]
   })));
}
test("all 88 registered routes retain 20 independent null-earned proof requirements and gate profiles",()=>{
 assert.equal(catalog.length,88);
 const pending=projectKingdomCriterionProgress(rubric);
 assert.equal(pending.maximum,100);
 assert.equal(pending.authenticatedEarned,null);
 assert.equal(pending.approvedCriteria,0);
 assert.equal(pending.pendingCriteria,20);
 assert.equal(pending.criteria.length,20);
 assert.equal(pending.criteria.reduce((s,x)=>s+x.maximum,0),100);
 for(const row of catalog){
   assert.ok(profiles.routeProfiles[row.href]);
   assert.ok(pending.criteria.every(x=>x.status==="PENDING_INDEPENDENT_EVIDENCE"&&
     x.earned===null&&x.evidenceDigests.length===0&&x.missingEvidence.length>0&&
     x.nextAction.length>12));
 }
 assert.equal(profiles.profiles.index.gates.length,3);
});
test("presentation projection preserves real authenticated zero separately from withheld null",()=>{
 const fixture=independentlyVerifiedFixture();
 fixture.find(x=>x.id==="authoritative_data").earned=0;
 const p=projectKingdomCriterionProgress(rubric,fixture);
 assert.equal(p.authenticatedEarned,90);
 assert.equal(p.approvedCriteria,20);
 assert.equal(p.pendingCriteria,0);
 assert.equal(p.criteria.find(x=>x.id==="authoritative_data").earned,0);
 assert.equal(p.criteria.find(x=>x.id==="authoritative_data").status,"APPROVED");
 assert.equal(projectKingdomCriterionProgress(rubric).criteria.find(x=>x.id==="authoritative_data").earned,null);
});
test("fake scoring fields, omitted criteria, altered weights and repeated receipt digests refuse",()=>{
 const base=independentlyVerifiedFixture();
 assert.throws(()=>projectKingdomCriterionProgress(rubric,base.slice(0,19)),/Incomplete/);
 assert.throws(()=>projectKingdomCriterionProgress(rubric,[...base.slice(0,19),base[0]]),/Malformed/);
 const altered=structuredClone(rubric);altered.dimensions.correctness.criteria[0].max=11;
 assert.throws(()=>projectKingdomCriterionProgress(altered),/Canonical criteria drift|Invalid|Proof policy/);
 assert.throws(()=>projectKingdomCriterionProgress(rubric,base.map((x,i)=>i===0?{...x,score:100}:x)),/Malformed/);
 assert.throws(()=>projectKingdomCriterionProgress(rubric,base.map((x,i)=>i===1?{...x,proofDigests:base[0].proofDigests}:x)),/Repeated/);
 assert.throws(()=>projectKingdomCriterionProgress(rubric,base.map((x,i)=>i===0?{...x,proofKinds:["source"]}:x)),/Malformed/);
 assert.throws(()=>projectKingdomCriterionProgress(rubric,base.map((x,i)=>i===0?{...x,earned:-1}:x)),/Malformed/);
});
