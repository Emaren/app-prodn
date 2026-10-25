import test from "node:test";
import assert from "node:assert/strict";
import {makeAxeTriage} from "../scripts/renaissance_88_accessibility_triage.mjs";

const sha="a".repeat(40),build="safeLocalBUILD_12345";
const paths=["/","/academy",...Array.from({length:86},(_,i)=>"/probe-"+i)];
const plan={schema:"aoe2war.renaissance.public88.factory-plan.v1",source_sha:sha,
 build:{build_id:build},routes:paths.map(route=>({route}))};
const clean=()=>paths.map(route=>({route,source_sha:sha,build_id:build,status:"PASS",
 views:["desktop","mobile"].map(viewport=>({
  viewport,sample:1,accessibilityScan:{status:"MEASURED",violations:[]}}))}));
test("88 real-route slots, bound identity, complete scans do not invent scores",()=>{
 const x=makeAxeTriage(plan,clean());
 assert.equal(x.route_count,88);assert.equal(x.viewport_observations,176);
 assert.equal(x.affected_routes,0);assert.equal(x.score,null);assert.equal(x.certified,false);
 assert.equal(x.gates.length,88);
});
test("affected selectors and rule groups survive desktop/mobile with no WCAG certificate",()=>{
 const rows=clean();
 for(const v of rows[1].views)v.accessibilityScan.violations.push({
  id:"nested-interactive",impact:"serious",nodes:1,
  selectors:[{target:["#advisor-card > a"],failureSummary:"Fix nested link",related:[]}]});
 const x=makeAxeTriage(plan,rows);
 assert.equal(x.affected_routes,1);assert.equal(x.serious_or_critical_rule_observations,2);
 assert.equal(x.groups[0].routes[0],"/academy");
 assert.deepEqual(x.findings[0].selectors[0].target,["#advisor-card > a"]);
 assert.equal(x.gates[1].accessibility,"ACTION_REQUIRED");
 assert.equal(x.findings[0].owner_verified,false);
});
test("absent a11y scan, forged page, false selector and incorrect BUILD_ID fail closed",()=>{
 const a=clean();a[0].views[0].accessibilityScan.status="NOT_RUN";
 assert.equal(makeAxeTriage(plan,a).unmeasured_scans.length,1);
 const b=clean();b[0].source_sha="b".repeat(40);
 assert.throws(()=>makeAxeTriage(plan,b),/stale/);
 const c=clean();c[1].views[0].accessibilityScan.violations=[{
  id:"link-name",impact:"serious",nodes:2}];
 assert.throws(()=>makeAxeTriage(plan,c),/selector/);
 const d=clean();d[0].views[1].viewport="desktop";
 assert.throws(()=>makeAxeTriage(plan,d),/viewport/);
});
