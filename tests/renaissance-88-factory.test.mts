import test from "node:test";
import assert from "node:assert/strict";
import {validateRouteReceipt} from "../scripts/renaissance_88_receipts.mjs";

const sha="a".repeat(40),build="candidateBuild123";
const plan={route:"/kingdom",profile:"general",phase:"I"};
function make(){
 return {source_sha:sha,build_id:build,route:"/kingdom",phase:"I",
 profile:"general",status:"PASS",views:[
 {viewport:"desktop",sample:1,attempted:true,browserStatus:"OBSERVED",
  http:200,sameOrigin:true,rendered:true,uncaughtErrors:0,keyboardFocus:true,privacyMutationAttempts:0},
 {viewport:"mobile",sample:1,attempted:true,browserStatus:"OBSERVED",
  http:200,sameOrigin:true,rendered:true,uncaughtErrors:0,keyboardFocus:true,privacyMutationAttempts:0}
 ],criteria:{production:"UNKNOWN",financial_nonmutation:"UNKNOWN"},
 performance:{gate:"UNKNOWN"},missing_criteria:[{criterion:"production",state:"UNKNOWN"}]};
}
const expected={sourceSha:sha,buildId:build};
test("valid candidate browser observations never award points",()=>{
 const ok=validateRouteReceipt(make(),plan,expected);
 assert.equal(ok.status,"PASS");assert.equal(ok.score,null);
 assert.equal(ok.certified,false);assert.equal(ok.live_production,"UNMEASURED");
});
test("unobserved or single-viewport receipts cannot masquerade as complete",()=>{
 const x=make();x.views.pop();
 assert.throws(()=>validateRouteReceipt(x,plan,expected),/Both viewport/);
});
test("source/build mismatch, duplicate browser samples and false pass rejected",()=>{
 const a=make();a.build_id="old";assert.throws(()=>validateRouteReceipt(a,plan,expected),/mismatch/);
 const b=make();b.views.push({...b.views[0]});
 assert.throws(()=>validateRouteReceipt(b,plan,expected),/duplicate/);
 const c=make();c.views[0].http=500;
 assert.throws(()=>validateRouteReceipt(c,plan,expected),/False successful/);
});
test("cannot mark production or performance gate passed from CI fixture",()=>{
 const a=make();a.criteria.production="PASS";
 assert.throws(()=>validateRouteReceipt(a,plan,expected),/mismatch/);
 const b=make();b.performance.gate="PASS";
 assert.throws(()=>validateRouteReceipt(b,plan,expected),/performance/);
 const c=make();c.certified=true;
 assert.throws(()=>validateRouteReceipt(c,plan,expected),/Unauthorized/);
});
test("raw malformed history and fabricated route identity rejected",()=>{
 const a=make();a.route="/admin";
 assert.throws(()=>validateRouteReceipt(a,plan,expected),/mismatch/);
 const b=make();b.status="CERTIFIED";
 assert.throws(()=>validateRouteReceipt(b,plan,expected),/mismatch/);
});
