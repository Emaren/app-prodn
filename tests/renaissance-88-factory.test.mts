import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const {classifyCandidateRoute}=require("../scripts/renaissance_88_verdict.cjs");
import {validateRouteReceipt} from "../scripts/renaissance_88_receipts.mjs";

const sha="a".repeat(40),build="candidateBuild123";
const plan={route:"/kingdom",profile:"general",phase:"I"};
function make(){
 return {source_sha:sha,build_id:build,route:"/kingdom",phase:"I",
 profile:"general",status:"PASS",views:[
 {viewport:"desktop",sample:1,attempted:true,browserStatus:"OBSERVED",
  http:200,sameOrigin:true,final_path:"/kingdom",rendered:true,uncaughtErrors:0,keyboardFocus:true,privacyMutationAttempts:0},
 {viewport:"mobile",sample:1,attempted:true,browserStatus:"OBSERVED",
  http:200,sameOrigin:true,rendered:true,uncaughtErrors:0,keyboardFocus:true,privacyMutationAttempts:0}
 ],criteria:{production:"UNKNOWN",financial_nonmutation:"UNKNOWN",client_mutation_attempts:"NONE_OBSERVED"},
 resource:{client_mutations_blocked:0},performance:{gate:"UNKNOWN"},missing_criteria:[{criterion:"production",state:"UNKNOWN"}]};
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

test("blocked telemetry never turns a valid GET smoke into a navigation failure",()=>{
 const view={http:200,sameOrigin:true,final_path:"/kingdom",rendered:true,body_title:true,landmark:true,
  keyboardFocus:true,uncaughtErrors:0,privacyMutationAttempts:4,browserStatus:"OBSERVED"};
 assert.equal(classifyCandidateRoute({route:"/kingdom",views:[view]},"UNAVAILABLE"),"PASS");
});
test("isolated missing PostgreSQL is UNKNOWN, but genuine browser error is FAIL",()=>{
 const broken={http:200,sameOrigin:true,final_path:"/kingdom",rendered:true,body_title:false,landmark:false,
  keyboardFocus:false,uncaughtErrors:1,dependencyUnavailable:true,browserStatus:"OBSERVED"};
 assert.equal(classifyCandidateRoute({route:"/kingdom",views:[broken]},"UNAVAILABLE"),"UNKNOWN");
 assert.equal(classifyCandidateRoute({views:[broken]},"REACHABLE"),"FAIL");
 assert.equal(classifyCandidateRoute({route:"/kingdom",views:[{...broken,dependencyUnavailable:false}]},"UNAVAILABLE"),"FAIL");
});
test("missing title/landmark, bad HTTP or no keyboard focus cannot be PASS",()=>{
 const baseline={http:200,sameOrigin:true,final_path:"/kingdom",rendered:true,body_title:true,landmark:true,
  keyboardFocus:true,uncaughtErrors:0,browserStatus:"OBSERVED"};
 for(const override of [{http:500},{landmark:false},{body_title:false},{keyboardFocus:false},{uncaughtErrors:1}]){
  assert.equal(classifyCandidateRoute({route:"/kingdom",views:[{...baseline,...override}]},"UNAVAILABLE"),"FAIL");
 }
});

test("blocked mutation attempts are visible but do not falsify a navigation PASS",()=>{
 const sample=make();
 sample.views[0].privacyMutationAttempts=2;
 sample.resource.client_mutations_blocked=2;
 sample.criteria.client_mutation_attempts="OBSERVED_AND_BLOCKED_NOT_CLEARED";
 assert.equal(validateRouteReceipt(sample,plan,expected).status,"PASS");
 sample.resource.client_mutations_blocked=0;
 assert.throws(()=>validateRouteReceipt(sample,plan,expected),/Unreconciled/);
});

test("route redirects and wrong final destinations fail even with HTTP 200",()=>{const x=make();x.views[0].final_path="/";assert.throws(()=>validateRouteReceipt(x,plan,expected),/False successful/);});
