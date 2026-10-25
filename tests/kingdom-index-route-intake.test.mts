import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import rubric from "../config/kingdom-index-quality-rubric.json" with {type:"json"};
import assurance from "../config/kingdom-index-assurance-profiles.json" with {type:"json"};
import catalog from "../config/kingdom-index-routes.json" with {type:"json"};
import inventory from "../config/kingdom-index-inventory.json" with {type:"json"};
import {prepareKingdomRouteIntake} from "../scripts/kingdom_index_route_intake.mjs";

const nowMs=Date.parse("2026-10-25T14:00:00.000Z");
const base={catalog,inventory,routeProfiles:assurance.routeProfiles,
 profiles:assurance.profiles,rubric,nowMs};
const sha=x=>createHash("sha256").update(x).digest("hex");
const source=href=>({
 gitSha:"a".repeat(40),sourceTree:catalog.find(x=>x.href===href).sourceTree,
 buildId:"candidate-only-next-build",closureSha256:"b".repeat(64),
 assetsSha256:"c".repeat(64),releaseSha256:"d".repeat(64)
});
const proof=(id,target="criterion",kind="source",bytes="unique")=>({
 target,id,kind,sha256:sha(bytes+id),measuredAt:"2026-10-25T13:00:00.000Z",
 originRef:"https://github.com/Emaren/app-prodn/actions/runs/40199570843"
});
const input=(href="/kingdom-index",observations=[])=>({
 href,source:source(href),observations
});
const inspect=(candidates,expectedByHref=new Map(candidates.map(c=>[c.href,source(c.href)])),extra={})=>
 prepareKingdomRouteIntake({...base,candidates,expectedByHref,...extra});

test("every one of 88 routes has its own 20 unknown criteria and its specialized profile",()=>{
 const out=inspect([]);
 assert.equal(out.totalPublicRoutes,88);
 assert.equal(out.totalCertified,0);
 assert.equal(out.totalAwardedPoints,null);
 assert.equal(new Set(out.routes.map(x=>x.href)).size,88);
 for(const row of out.routes){
  assert.equal(row.score,null);
  assert.equal(row.blockedPoints,100);
  assert.equal(row.status,"UNMEASURED");
  assert.equal(row.criteria.length,20);
  assert.equal(row.criteria.reduce((n,c)=>n+c.maximum,0),100);
  assert.ok(row.criteria.every(x=>x.earned===null&&x.status==="MISSING_INDEPENDENT_EVIDENCE"));
  assert.equal(row.gates.length,assurance.profiles[assurance.routeProfiles[row.href]].gates.length);
  assert.ok(row.gates.every(g=>g.verified===false));
 }
 assert.equal(out.routes.find(x=>x.href==="/kingdom-index").gates.length,3);
});
test("properly pinned candidate artifacts are pending, never 100, and do not spill into other routes",()=>{
 const candidate=input("/kingdom-index",[
  proof("dependency_visibility","criterion","source","first"),
  proof("source-closure","gate","source","second")
 ]);
 const out=inspect([candidate]);
 const self=out.routes.find(x=>x.href==="/kingdom-index");
 const other=out.routes.find(x=>x.href==="/leaderboard");
 assert.equal(out.withUntrustedCandidates,1);
 assert.equal(self.criteria.find(x=>x.id==="dependency_visibility").status,
  "CANDIDATE_ONLY_INDEPENDENT_APPROVAL_REQUIRED");
 assert.equal(self.gates.find(x=>x.id==="source-closure").status,
  "CANDIDATE_ONLY_INDEPENDENT_APPROVAL_REQUIRED");
 assert.equal(self.criteria.find(x=>x.id==="dependency_visibility").earned,null);
 assert.equal(other.criteria.find(x=>x.id==="dependency_visibility").status,
  "MISSING_INDEPENDENT_EVIDENCE");
 assert.equal(out.totalAwardedPoints,null);
});
test("source spoof, duplicate route, private route, and self-awarded score refuse",()=>{
 const c=input();
 assert.throws(()=>inspect([c],new Map()),/Missing independent source/);
 assert.throws(()=>inspect([c,c]),/repeated candidate/);
 assert.throws(()=>inspect([{...input(),href:"/admin/users"}]),/Private, unknown/);
 assert.throws(()=>inspect([{...c,score:100}]),/Invalid candidate fields/);
 assert.throws(()=>inspect([{...c,source:{...c.source,gitSha:"f".repeat(40)}}]),/independent source mismatch/);
 assert.throws(()=>inspect([{...c,source:{...c.source,sourceTree:"src-0000000000000000"}}]),/route-local source/);
});
test("stale, future, swapped assurance, duplicate evidence and miscategorized proof refuse",()=>{
 const a=input("/kingdom-index",[proof("critical_journeys","criterion","source","bad")]);
 assert.throws(()=>inspect([a]),/different domain proof kind/);
 const b=input("/kingdom-index",[proof("source-closure","gate","source","x")]);
 b.observations[0].measuredAt="2026-10-26T12:00:00.000Z";
 assert.throws(()=>inspect([b]),/Future or stale/);
 b.observations[0].measuredAt="2026-08-01T12:00:00.000Z";
 assert.throws(()=>inspect([b]),/Future or stale/);
 const c=input("/kingdom-index",[proof("rank-pagination","gate","source","x")]);
 assert.throws(()=>inspect([c]),/different assurance profile/);
 const same=proof("dependency_visibility","criterion","source","unique");
 const d=input("/kingdom-index",[same]);
 const e=input("/leaderboard",[{...same}]);
 assert.throws(()=>inspect([d,e]),/Duplicate proof bytes across criteria\/routes/);
});
test("unsupported extra assumptions, unregistered catalog and changed canonical weights refuse",()=>{
 const c=input();
 assert.throws(()=>inspect([c],new Map([[c.href,{...c.source,extra:"claimed"}]])),/Invalid independent expectation/);
 const fakeCatalog=[...catalog,{...catalog[0],href:"/fake"}];
 assert.throws(()=>inspect([] ,new Map(),{catalog:fakeCatalog}),/88-route/);
 const changed=structuredClone(rubric);
 changed.dimensions.correctness.weight=31;
 assert.throws(()=>inspect([],new Map(),{rubric:changed}),/Invalid canonical dimension/);
});
