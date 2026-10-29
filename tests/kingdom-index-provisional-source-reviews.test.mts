import assert from "node:assert/strict";
import test from "node:test";
import rubric from "../config/kingdom-index-quality-rubric.json" with {type:"json"};
import catalog from "../config/kingdom-index-routes.json" with {type:"json"};
import baseline from "../config/kingdom-index-baseline.json" with {type:"json"};
import ledger from "../config/kingdom-index-provisional-source-reviews.json" with {type:"json"};

test("four historical source estimates remain bound to reviewed provenance, not current route fingerprints",()=>{
 assert.equal(ledger.authority,"AI_ASSISTED_ESTIMATE_NOT_AN_INDEPENDENT_SCORE");
 assert.equal(ledger.reviews.length,4);
 const expected=Object.entries(rubric.dimensions).flatMap(([dimension,d])=>d.criteria.map(c=>({id:c.id,dimension,max:c.max})));
 assert.equal(expected.length,20);
 for(const review of ledger.reviews){
  const route=catalog.find(r=>r.href===review.href);
  assert.ok(route,review.href);
  const observation=baseline.observations.find(r=>r.href===review.href);
  assert.ok(observation,review.href);
  assert.equal(observation.kind,"source-review");
  // The ledger is a *historical, unauthenticated estimate*, not a
  // current-source certificate. Rewriting its SHA to match a new deployable
  // route would silently transfer old evidence to unreviewed code.
  assert.equal(review.routeSourceVersion,observation.sourceVersion,review.href);
  assert.match(review.sourceCommit,/^[0-9a-f]{40}$/);
  assert.ok(review.evidenceRefs.some(ref=>ref.includes(review.sourceCommit)),
    "Original source commit must remain attached to historical review: "+review.href);
  const matchesCurrentSource=review.routeSourceVersion===route.sourceTree;
  if(review.href==="/kingdom-index"){
   assert.equal(review.routeSourceVersion,"src-5f39cd7bf91a196b");
   assert.notEqual(route.sourceTree,review.routeSourceVersion,
     "Historical Index review is not current certification");
  }
  if(review.href==="/kingdom-intelligence"){
   assert.equal(review.routeSourceVersion,"src-d35c2832feb098e2");
   assert.equal(review.sourceCommit,"f234ad56be826b5edd351091d9a91cc950ba10b0");
   assert.match(route.sourceTree,/^src-[a-f0-9]{16}$/);
   assert.notEqual(route.sourceTree,review.routeSourceVersion);
   assert.equal(matchesCurrentSource,false,
     "Prior Intelligence source estimate cannot qualify the revised source");
  }
  assert.equal(observation.score,review.score);
  assert.ok(review.score<100);
  assert.deepEqual(observation.dimensions,review.dimensions);
  assert.deepEqual(observation.evidenceRefs,review.evidenceRefs);
  assert.equal(review.criteria.length,20);
  for(let i=0;i<20;i++){
   assert.equal(review.criteria[i].id,expected[i].id);
   assert.equal(review.criteria[i].dimension,expected[i].dimension);
   assert.equal(review.criteria[i].maximum,expected[i].max);
   assert.ok(review.criteria[i].estimated>=0 && review.criteria[i].estimated<=expected[i].max);
   assert.match(review.criteria[i].evidenceLevel,/UNVERIFIED/);
  }
  const total=review.criteria.reduce((sum,c)=>sum+c.estimated,0);
  assert.equal(total,review.score);
 }
 assert.equal(baseline.observations.length,5,"Do not invent ratings for other 84 public routes");
});
