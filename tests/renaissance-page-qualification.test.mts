import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buildQualificationPackets} from "../scripts/renaissance_page_qualification.mjs";
const get=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),"utf8"));
const catalog=get("../config/kingdom-index-routes.json");
const rubric=get("../config/kingdom-index-quality-rubric.json");
const profiles=get("../config/kingdom-index-assurance-profiles.json");
const source="a".repeat(40);
const make=()=>{
 const routes=catalog.map(p=>({route:p.href,status:"PASS",certified:false,score:null,
  browser_samples:2,profile_gates:profiles.profiles[profiles.routeProfiles[p.href]].gates.map(g=>({
   id:g.id,state:"UNMEASURED"}))}));
 return{schema:"aoe2war.renaissance.public88.candidate-coverage.v1",
  source_sha:source,build_id:"ExampleBld_012",manifest_sha256:"b".repeat(64),
  plan_sha256:"c".repeat(64),candidate_only:true,certified:false,score:null,
  routes_required:88,routes_observed:88,production_release_authority:"NOT_PROVIDED",
  route_digest_sha256:Object.fromEntries(catalog.map(p=>[p.href,"d".repeat(64)])),
  statuses:{PASS:88,FAIL:0,UNKNOWN:0,UNMEASURED:0},routes
 };
};
const run=(c,currentSha=source)=>buildQualificationPackets({
 coverage:c,catalog,rubric,profiles,currentSha});
test("88 real candidate smoke records create nine 20-criterion batches with no numeric grades",()=>{
 const x=run(make());
 assert.equal(x.navigation_checkpoint,"CANDIDATE_NAVIGATION_88_PASS");
 assert.equal(x.total_pages,88);assert.equal(x.total_criterion_obligations,1760);
 assert.equal(x.batches.length,9);assert.equal(x.batches[0].pages[0],"/kingdom-index");
 assert.equal(x.packets.length,88);
 for(const r of x.packets){
  assert.equal(r.criteria.length,20);
  assert.equal(r.criteria.reduce((n,c)=>n+c.maximum,0),100);
  assert.ok(r.criteria.every(c=>c.earned_points===null));
  assert.equal(r.measured_score,null);assert.equal(r.certified,false);
  assert.equal(r.deployed_release_verified,false);
  assert.ok(r.specialty_gates.every(g=>g.state==="UNVERIFIED"));
 }
});
test("a different checkout preserves history but refuses to imply current source certification",()=>{
 const x=run(make(),"f".repeat(40));
 assert.equal(x.source_matches_checkout,false);
 assert.equal(x.packets[0].status,"HISTORICAL_CANDIDATE_SOURCE");
 assert.equal(x.packets[0].candidate_navigation.same_git_checkout,false);
 assert.equal(x.certified_page_count_from_browser_evidence,0);
});
test("an illegitimate browser-assigned 100 fails closed",()=>{
 const c=make();c.routes[0].quality_score=100;
 assert.throws(()=>run(c),/scoring claim/);
 delete c.routes[0].quality_score;c.certified=true;
 assert.throws(()=>run(c),/improperly claims authority/);
});
test("counts, profiles, duplicate routes, and specialty promotions all fail closed",()=>{
 const a=make();a.statuses.PASS=87;
 assert.throws(()=>run(a),/Aggregate/);
 const b=make();b.routes[1].route=b.routes[0].route;
 assert.throws(()=>run(b),/Duplicated/);
 const c=make();
 const restricted=c.routes.find(r=>r.profile_gates.length);
 assert.ok(restricted);
 restricted.profile_gates[0].state="VERIFIED";
 assert.throws(()=>run(c),/Specialized gates/);
});
test("rubric tampering cannot mint excess points",()=>{
 const broken=structuredClone(rubric);
 broken.dimensions.correctness.criteria[0].max+=1;
 assert.throws(()=>buildQualificationPackets({coverage:make(),catalog,rubric:broken,profiles,currentSha:source}),
  /Rubric group total/);
});
test("a missing digest, sample or route is not a PASS",()=>{
 const a=make();delete a.route_digest_sha256[a.routes[0].route];
 assert.throws(()=>run(a),/route digest/);
 const b=make();b.routes[0].browser_samples=0;
 assert.throws(()=>run(b),/sample count/);
 const c=make();c.routes.pop();
 assert.throws(()=>run(c),/88 routes/);
});
