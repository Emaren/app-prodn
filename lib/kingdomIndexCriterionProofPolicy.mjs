/**
 * Criterion-to-proof-kind admission gate for OFFLINE provisional submissions.
 * All rubric criterion IDs must be covered; unknown IDs refuse.
 * The kind is a claim and must be independently authenticated by a trusted
 * artifact inspector. Matching kind alone NEVER proves measured semantics.
 *
 * Do not weaken a browser/performance/production requirement to "source".
 */
export const CRITERION_PROOF_KINDS=Object.freeze({
 authoritative_data:Object.freeze(["database","production"]),
 business_invariants:Object.freeze(["ci","database"]),
 failure_semantics:Object.freeze(["ci","security"]),
 security_boundaries:Object.freeze(["security"]),
 critical_journeys:Object.freeze(["browser"]),
 state_consistency:Object.freeze(["browser"]),
 accessibility:Object.freeze(["browser"]),
 responsive:Object.freeze(["browser"]),
 measured_latency:Object.freeze(["performance"]),
 bounded_data:Object.freeze(["database","performance"]),
 render_efficiency:Object.freeze(["performance"]),
 sustained_load:Object.freeze(["performance"]),
 module_boundaries:Object.freeze(["source","ci"]),
 dependency_visibility:Object.freeze(["source"]),
 documentation:Object.freeze(["source"]),
 safe_extension:Object.freeze(["ci"]),
 domain_regressions:Object.freeze(["ci"]),
 integration:Object.freeze(["database"]),
 browser:Object.freeze(["browser"]),
 release_certification:Object.freeze(["production"])
});
export function verifyCriterionProofPolicy(rubric){
 const ids=Object.values(rubric?.dimensions??{}).flatMap(x=>x.criteria?.map(c=>c.id)??[]);
 const actual=Object.keys(CRITERION_PROOF_KINDS).sort();
 if(ids.length!==20||new Set(ids).size!==20||
  JSON.stringify([...ids].sort())!==JSON.stringify(actual))
  throw Error("KINGDOM CRITERION STOP: Proof policy/rubric drift");
 for(const kinds of Object.values(CRITERION_PROOF_KINDS)){
  if(!Array.isArray(kinds)||!kinds.length||new Set(kinds).size!==kinds.length)
   throw Error("KINGDOM CRITERION STOP: Invalid proof policy");
 }
 return true;
}
export function requiredProofKindsForCriterion(id){
 const policy=CRITERION_PROOF_KINDS[id];
 if(!policy)throw Error("KINGDOM CRITERION STOP: Missing proof policy: "+id);
 return policy;
}
