import test from "node:test";
import assert from "node:assert/strict";
import {makeReleaseSmokePlan} from "../scripts/renaissance_88_release_regression.mjs";

const required=["/","/kingdom-index","/requests","/kingdom-intelligence","/workshop",
 "/betting-mechanics","/watch","/kingdom","/leaderboard","/players",
 "/library","/speed","/traffic","/hd-replay-engine","/replay-parser","/wolochain"];
const routes=[...required,...Array.from({length:72},(_,i)=>"/fixture-"+i)];
const plan={schema:"aoe2war.renaissance.public88.factory-plan.v1",
 source_sha:"a".repeat(40),build:{build_id:"candidate_fixtureBUILD"},
 routes:routes.map(route=>({route}))};
test("postrelease checklist includes critical paths but does not run them",()=>{
 const out=makeReleaseSmokePlan(plan);
 assert.equal(out.smoke_routes.length,16);
 assert.equal(out.plan_status,"NOT_EXECUTED_UNAUTHORIZED");
 assert.equal(out.release_build_id,null);
 assert.equal(out.all_public_routes_covered_by_factory,88);
 assert.equal(out.constraints.performance_gate,"UNMEASURED");
 assert.ok(out.smoke_routes.every(x=>x.acceptance==="NOT_EXECUTED"));
 assert.ok(out.smoke_routes.every(x=>x.method==="GET"&&x.auth==="ANONYMOUS_ONLY"));
});
test("sensitive interactions always remain prohibited",()=>{
 const p=makeReleaseSmokePlan(plan);
 for(const r of p.smoke_routes){
  for(const action of ["bet","payout","sign","fund","broadcast","login","reconcile"]){
   assert.ok(r.forbidden_actions.includes(action),r.route+" missing "+action);
  }
  assert.equal(r.actual_release_build_id,null);
 }
});
test("unregistered/protected candidate route never enters production shortlist",()=>{
 const b=structuredClone(plan);b.routes=b.routes.filter(r=>r.route!=="/watch");
 b.routes.push({route:"/admin"});
 assert.throws(()=>makeReleaseSmokePlan(b),/HOLD/);
 const c=structuredClone(plan);c.source_sha="unverified";
 assert.throws(()=>makeReleaseSmokePlan(c),/HOLD/);
});
