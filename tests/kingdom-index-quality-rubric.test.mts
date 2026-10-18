import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import rubric from "../config/kingdom-index-quality-rubric.json" with {type:"json"};

const dimensions = rubric.dimensions;
test("every Kingdom Index route uses one versioned 100-point engineering rubric",()=>{
  assert.equal(rubric.maximum,100);
  assert.equal(Object.keys(dimensions).length,5);
  assert.deepEqual(
    Object.fromEntries(Object.entries(dimensions).map(([name, d])=>[name,d.weight])),
    {correctness:30,functionality:25,performance:20,maintainability:15,tests:10}
  );
  assert.equal(Object.values(dimensions).reduce((total,d)=>total+d.weight,0),100);
  for(const [name,d] of Object.entries(dimensions)){
    assert.equal(d.criteria.reduce((n,c)=>n+c.max,0),d.weight,name);
    assert.ok(d.criteria.every(c=>c.id&&c.requirement&&c.max>0));
  }
  assert.equal(new Set(Object.values(dimensions).flatMap(d=>d.criteria.map(c=>c.id))).size,20);
});
test("readiness is evidence-scoped, and never awarded by source census alone",()=>{
  assert.equal(rubric.certification.provisional_is_not_certification,true);
  assert.equal(rubric.certification.source_fingerprint_is_not_transitive_proof,true);
  const source=readFileSync(new URL("../lib/kingdomIndex.ts",import.meta.url),"utf8");
  assert.match(source,/qualityRubric\.dimensions/);
  assert.match(source,/r\.score===100 && r\.kind!=="certified"/);
});
