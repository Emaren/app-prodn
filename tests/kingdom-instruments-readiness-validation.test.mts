import test from "node:test";
import assert from "node:assert/strict";
import { validReportedInspectionReadiness } from "../lib/kingdomInstrumentsInspectionValidity.mjs";

const ids = ["speed","documentation","organization","tests","release","security","data"];
const fresh = () => ({
  schema:1,
  overallScore:80,
  categories:ids.map(id => ({id,title:id,maxScore:100,score:80,checks:[{id:"evidence"}]})),
});

test("genuine seven-source readiness aggregate is displayable, but not a certificate",()=>{
  assert.equal(validReportedInspectionReadiness(fresh()),true);
});
test("empty categories plus a claimed 100 never become a numeric score",()=>{
  assert.equal(validReportedInspectionReadiness({schema:1,categories:[],overallScore:100}),false);
});
test("null and malformed rows cannot supply a claimed 100",()=>{
  for(const rows of [[null],[{}],["unverified"],[{id:"speed",score:100}]]){
    assert.equal(validReportedInspectionReadiness({schema:1,categories:rows,overallScore:100}),false);
  }
});
test("incomplete, duplicate, unexpected or damaged readiness categories fail",()=>{
  for(const fn of [
    x=>x.categories.pop(),x=>{x.categories[6].id="speed"},x=>{x.categories[0].id="fake"},
    x=>{x.categories[0].score=101},x=>{x.categories[0].maxScore=99},
    x=>{x.categories[0].checks=[]},x=>{x.categories[0].title=""}
  ]){const x=fresh();fn(x);assert.equal(validReportedInspectionReadiness(x),false);}
});
test("numeric aggregate must equal the actual rounded category average",()=>{
  const x=fresh();x.overallScore=100;
  assert.equal(validReportedInspectionReadiness(x),false);
  x.overallScore=80.5;
  assert.equal(validReportedInspectionReadiness(x),false);
});
test("schema-only, noninteger, off-boundary and hostile objects fail",()=>{
  for(const x of [null,undefined,{},[],{schema:1},{...fresh(),schema:2},{...fresh(),overallScore:NaN},
  {...fresh(),categories:"reported"}]) assert.equal(validReportedInspectionReadiness(x),false);
});
