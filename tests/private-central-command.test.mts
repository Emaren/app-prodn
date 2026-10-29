import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import registry from "../config/central-command-lanes.json" with {type:"json"};
const read=(p:string)=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
test("six fixed source-owned lanes and truthful 1/6 gate source",()=>{
 assert.deepEqual(registry.lanes.map(l=>l.id),["D","G","C","E","F","B"]);
 assert.deepEqual(registry.evidenceGates.map(x=>x.id),[
  "ASSIGNED","SOURCE_REVIEWED","HEAD_CI_PASSED","MERGED","NATIVE_ACCEPTED","LIVE_VERIFIED"]);
 const projection=read("lib/centralCommandPrivate.ts");
 assert.match(projection,/verifiedNumerator:1,denominator:6/);
 assert.match(projection,/g==="ASSIGNED"\?"ASSIGNED":"UNKNOWN"/);
 assert.match(projection,/GITHUB_METADATA_ONLY/);
 assert.match(projection,/GITHUB_UNAVAILABLE/);
 assert.match(projection,/NO_ACCEPTED_RUNTIME_RECEIPT/);
 assert.doesNotMatch(projection,/EXECUTE|approveDelete|deploy\(/);
});
test("admin page and API use existing session and never serve public status or writes",()=>{
 const page=read("app/admin/central-command/page.tsx");
 const api=read("app/api/admin/central-command/route.ts");
 const ui=read("components/central-command/CentralCommandView.tsx");
 assert.match(page,/requireServerAdmin\(\)/);
 assert.match(api,/requireAdmin\(request\)/);
 assert.match(api,/Cache-Control/);
 assert.match(api,/private, no-store/);
 assert.doesNotMatch(api,/export async function POST/);
 assert.match(api,/CENTRAL_COMMAND_SOURCE_HOLD/);
 assert.match(ui,/Central Command/);
 assert.match(ui,/aria-valuenow=\{lane\.verifiedNumerator\}/);
 assert.match(ui,/Copy handoff/);
 assert.match(ui,/sourceAuthority/);
 assert.match(ui,/W1 · ONE NONFINANCIAL ACTIVATION/);
 assert.match(ui,/releaseGates/);
 assert.match(ui,/aria-label="Six source-owned engineering lanes"/);
});
test("GitHub metadata collection is bounded, allowlisted and never trusts remote instructions",()=>{
 const source=read("lib/centralCommandPrivate.ts");
 assert.match(source,/AbortSignal\.timeout\(2500\)/);
 assert.match(source,/offset\+=3/);
 assert.match(source,/\.slice\(0,6\)/);
 assert.match(source,/\(issues\|pulls\)/);
 assert.doesNotMatch(source,/issueRecord\?\.body|prRecord\?\.body/);
 assert.doesNotMatch(source,/process\.env\.(SESSION_SECRET|NEXTAUTH_SECRET)/);
 assert.doesNotMatch(source,/execFile|child_process|spawn\(/);
 assert.match(source,/githubObservedAt/);
 assert.match(source,/sourceAuthority/);
});
test("public 88 routes remain unchanged, private route recorded as admin",()=>{
 const census=JSON.parse(read("config/kingdom-index-inventory.json"));
 assert.equal(census.pages.filter((x:{scope:string})=>x.scope==="public-index").length,88);
 assert.equal(census.pages.find((x:{href:string})=>x.href==="/admin/central-command").scope,"admin-path");
 assert.ok(census.handlers.some((x:{entrypoint:string})=>x.entrypoint==="app/api/admin/central-command/route.ts"));
 const os=read("app/admin/aoe2war-os/page.tsx");
 assert.match(os,/href="\/admin\/central-command"/);
});
