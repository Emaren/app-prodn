import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import registry from "../config/aoe2war-os-registry.v1.json" with {type:"json"};
const read=(p:string)=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
test("fifteen subordinate planning identities and three distinct non-OS roles",()=>{
 assert.equal(registry.subordinate_os.length,15);
 assert.equal(registry.supervisory_roles.length,3);
 assert.equal(registry.visual_modes.length,7);
 assert.ok(registry.subordinate_os.every(o=>o.independent_live_worker_proven===false));
});
test("public graph is real route, bounded source contracts, never a claimed live node",()=>{
 const source=read("components/kingdom-construction/KingdomConstruction.tsx");
 const page=read("app/kingdom-construction/page.tsx");
 assert.match(page,/KingdomConstruction/);assert.match(source,/<svg/);
 assert.match(source,/Runtime: UNKNOWN/);
 assert.doesNotMatch(source,/fetch\(|execSync|writeFileSync|method:"POST"|LIVE_VERIFIED=PASS|autonomous_running/);
});
test("composer view inherits admin guard and cannot grant release authority",()=>{
 assert.match(read("app/admin/system-composer/page.tsx"),/requireServerAdmin/);
 const source=read("components/kingdom-construction/KingdomConstruction.tsx");
 assert.match(source,/Plans are nonexecuting/);
 assert.doesNotMatch(source,/submit|signTransaction|POST/);
});

test("new graph is a separate unscored source route pending explicit browser admission",()=>{
 const routes=JSON.parse(read("config/kingdom-index-routes.json"));
 const inventory=JSON.parse(read("config/kingdom-index-inventory.json"));
 const campaign=JSON.parse(read("config/renaissance-campaign.json"));
 assert.equal(routes.length,88);
 assert.equal(routes.some((r:{href:string})=>r.href==="/kingdom-construction"),false);
 const graph=inventory.pages.find((r:{href:string})=>r.href==="/kingdom-construction");
 assert.equal(graph?.entrypoint,"app/kingdom-construction/page.tsx");
 assert.equal(graph?.scope,"excluded-static");
 assert.equal(graph?.assurance,"unverified");
 assert.ok(campaign.phases.some((p:{routes:string[]})=>p.routes.includes("/kingdom-construction")));
});
