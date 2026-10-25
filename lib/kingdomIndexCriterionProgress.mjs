/**
 * UI projection ONLY. This module neither authenticates nor signs receipts.
 * `trustedCriteria` MUST originate exclusively from the successfully
 * verified 2-signer + operator-artifact + durable-nonce publication reader.
 * No candidate observations, historical reviews or caller-provided numbers may
 * reach this input. Absence of approved proof means earned:null (not zero).
 */
import {requiredProofKindsForCriterion,verifyCriterionProofPolicy}
 from "./kingdomIndexCriterionProofPolicy.mjs";

const MAX=100, HEX64=/^[a-f0-9]{64}$/;
const NEXT=Object.freeze({
 authoritative_data:"Reconcile immutable route output with canonical PostgreSQL and production records",
 business_invariants:"Review adversarial business-rule tests with independent database traces",
 failure_semantics:"Exercise missing, stale, malformed and contradictory inputs and inspect failure receipts",
 security_boundaries:"Independently exercise auth, privacy and hostile-input boundaries",
 critical_journeys:"Record actual desktop/mobile browser task completion on accepted build",
 state_consistency:"Record refresh, search, navigation, pagination and URL-state browser traces",
 accessibility:"Verify keyboard, focus, screen reader, zoom and reduced-motion receipts",
 responsive:"Capture accessible phone/desktop viewports including empty and error states",
 measured_latency:"Measure cold/warm P75/P95 against declared device/network budgets",
 bounded_data:"Inspect production-scale query plans, pagination bounds and cache behavior",
 render_efficiency:"Measure JS size, rerenders and heap behavior during interactions",
 sustained_load:"Obtain authorized bounded concurrency, error and resource-budget observations",
 module_boundaries:"Independently review import ownership and route-domain isolation",
 dependency_visibility:"Approve transitive emitted dependency and route source closure",
 documentation:"Central approves exact-source DocsV2 and up-to-date operator playbook",
 safe_extension:"Prove new behavior does not regress neighboring route contracts",
 domain_regressions:"Approve exact-head property, adversarial and regression suites",
 integration:"Inspect real API-to-PostgreSQL integration with fault-injection receipts",
 browser:"Inspect independent Chrome interactions, screenshots and accessibility receipts",
 release_certification:"Obtain approved protected release, build/assets parity, soak and rollback receipt"
});
const stop=msg=>{throw new Error("KINGDOM PROGRESS STOP: "+msg)};
export function projectKingdomCriterionProgress(rubric,trustedCriteria=null){
 verifyCriterionProofPolicy(rubric);
 if(rubric?.version!=="2026-10-18-v1"||rubric.maximum!==MAX)stop("Canonical rubric missing");
 const items=Object.entries(rubric.dimensions).flatMap(([dimension,block])=>
   block.criteria.map(c=>({id:c.id,dimension,maximum:c.max,requirement:c.requirement})));
 if(items.length!==20||new Set(items.map(x=>x.id)).size!==20||
    items.reduce((s,c)=>s+c.maximum,0)!==MAX||
    items.some(c=>!Object.hasOwn(NEXT,c.id)))stop("Canonical criteria drift");
 let approved=null;
 if(trustedCriteria!==null){
   if(!Array.isArray(trustedCriteria)||trustedCriteria.length!==20)stop("Incomplete verifier approval");
   approved=new Map();
   const digests=new Set();
   for(const row of trustedCriteria){
     const c=items.find(x=>x.id===row?.id);
     if(!c||approved.has(row.id)||
       Object.keys(row).sort().join(",")!=="dimension,earned,id,proofDigests,proofKinds"||
       row.dimension!==c.dimension||!Number.isInteger(row.earned)||
       row.earned<0||row.earned>c.maximum||
       !Array.isArray(row.proofKinds)||!Array.isArray(row.proofDigests)||
       row.proofKinds.length<1||row.proofKinds.length>8||
       row.proofKinds.length!==row.proofDigests.length||
       !row.proofKinds.some(x=>requiredProofKindsForCriterion(row.id).includes(x)))
       stop("Malformed verifier criterion");
     for(const digest of row.proofDigests){
       if(!HEX64.test(digest)||digests.has(digest))stop("Repeated/malformed verified digest");
       digests.add(digest);
     }
     approved.set(row.id,row);
   }
 }
 const criteria=items.map(c=>{
   const grant=approved?.get(c.id);
   return {
     ...c,earned:grant?grant.earned:null,
     status:grant?"APPROVED":"PENDING_INDEPENDENT_EVIDENCE",
     requiredProofKinds:[...requiredProofKindsForCriterion(c.id)],
     evidenceDigests:grant?[...grant.proofDigests]:[],
     missingEvidence:grant?[]:[...requiredProofKindsForCriterion(c.id)],
     nextAction:grant?"Reassess before signed approval expires, deployed source changes or evidence becomes stale":NEXT[c.id]
   };
 });
 return {
   maximum:100,
   authenticatedEarned:approved?criteria.reduce((s,c)=>s+c.earned,0):null,
   approvedCriteria:approved?20:0,pendingCriteria:approved?0:20,
   criteria,
   scoreAuthority:approved?"SIGNED_PUBLICATION_VERIFIED_OUTSIDE_PROJECTION":"NONE",
 };
}
