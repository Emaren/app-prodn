import assert from "node:assert/strict";
import test from "node:test";
import rubric from "../config/kingdom-index-quality-rubric.json" with {type:"json"};
import catalog from "../config/kingdom-index-routes.json" with {type:"json"};
import baseline from "../config/kingdom-index-baseline.json" with {type:"json"};
import ledger from "../config/kingdom-index-provisional-source-reviews.json" with {type:"json"};

test("four historical source estimates retain authentic reviewed fingerprints and identical 20-criterion arithmetic",()=>{
 assert.equal(ledger.authority,"AI_ASSISTED_ESTIMATE_NOT_AN_INDEPENDENT_SCORE");
 assert.equal(ledger.reviews.length,4);
 const expected=Object.entries(rubric.dimensions).flatMap(([dimension,d])=>d.criteria.map(c=>({id:c.id,dimension,max:c.max})));
 assert.equal(expected.length,20);
 for(const review of ledger.reviews){
  const route=catalog.find(r=>r.href===review.href);
  assert.ok(route,review.href);
  assert.match(review.routeSourceVersion,/^src-[a-f0-9]{16}$/);
  const observation=baseline.observations.find(r=>r.href===review.href);
  assert.ok(observation,review.href);
  assert.equal(observation.kind,"source-review");
  // Never rewrite a historical source review to match newly edited routes: it
  // would silently launder old estimates into apparent current-source proof.
  assert.equal(review.routeSourceVersion,observation.sourceVersion,review.href);
  if (review.href==="/kingdom-index") {
   assert.notEqual(review.routeSourceVersion,route.sourceTree,"old Index review must remain source-drifted after the Watcher companion correction");
  } else {
   assert.equal(review.routeSourceVersion,route.sourceTree,review.href);
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
