#!/usr/bin/env node
"use strict";
/* All browser tests fail before Chrome import or network. No production access. */
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const cp=require("node:child_process");
const script=path.resolve(__dirname,"../scripts/aoe2_release_r10_chrome.cjs");
const names=["Storage OS","Backup OS","Documents OS","General Inspections",
             "Kingdom Intelligence","Work Board","Navigation"];
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"g-chrome-adversarial-"));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const admin=path.join(root,"admin.json"),non=path.join(root,"non.json");
 for(const p of [admin,non]){fs.writeFileSync(p,"{}");fs.chmodSync(p,0o600)}
 const host=path.join(root,"host.json");
 fs.writeFileSync(host,JSON.stringify({schema:"aoe2war.g.r10.host-postflight.v1",
   status:"PASS",expected:{train:"POST_W1",source_sha:"fa5c350b35cba7ace8d4515a7ad52ba4e1534295",build_id:"build_1234567",compiled_version:"test"},
   checks:{receipt:{verdict:"PASS"}},production_certified:false}));
 const routes=path.join(root,"routes.json");
 const surfaces=names.map((name)=>({name,path:"/admin/storage-os",
   heading:"Central Command",selector:"main"}));
 const argv=["--admin-state",admin,"--nonadmin-state",non,"--surfaces",routes,
   "--host-receipt",host,"--expected-train","POST_W1","--expected-sha","fa5c350b35cba7ace8d4515a7ad52ba4e1534295",
   "--expected-build-id","build_1234567","--expected-version","test",
   "--out",path.join(root,"browser.json"),"--chrome",process.execPath,
   "--pw-home",root];
 const run=()=>cp.spawnSync(process.execPath,[script,...argv],{
   cwd:path.resolve(__dirname,".."),encoding:"utf8",timeout:12000});
 return {root,admin,non,routes,surfaces,run,argv};
}
test("mandatory real owner session state: missing arguments HOLD",()=>{
 const p=cp.spawnSync(process.execPath,[script],{encoding:"utf8",timeout:12000});
 assert.equal(p.status,2);
 assert.match(p.stderr,/FINAL_CHROME_HOLD:MISSING_/);
});
test("all seven names cannot mask a substituted official route",t=>{
 const f=fixture(t);
 fs.writeFileSync(f.routes,JSON.stringify({schema:"aoe2war.g.seven-surfaces.v1",surfaces:f.surfaces}));
 const p=f.run();
 assert.equal(p.status,2);
 assert.match(p.stderr,/CANONICAL_ROUTE_SUBSTITUTION/);
 const evidence=JSON.parse(fs.readFileSync(path.join(f.root,"browser.json"),"utf8"));
 assert.equal(evidence.browser_status,"HOLD");
 assert.equal(evidence.production_certified,false);
 assert.equal(JSON.stringify(evidence).includes("admin.json"),false);
});
test("missing Backup OS route is not silently substituted",t=>{
 const f=fixture(t);
 f.surfaces[0].path="/admin/storage-os";
 f.surfaces[1].path=null;
 fs.writeFileSync(f.routes,JSON.stringify({schema:"aoe2war.g.seven-surfaces.v1",surfaces:f.surfaces}));
 const p=f.run();
 assert.equal(p.status,2);
 assert.match(p.stderr,/SURFACE_PATH_OR_SELECTOR_MISSING/);
});
test("world-readable admin state rejected before any network",t=>{
 const f=fixture(t);
 fs.chmodSync(f.admin,0o644);
 fs.writeFileSync(f.routes,JSON.stringify({schema:"aoe2war.g.seven-surfaces.v1",surfaces:f.surfaces}));
 const p=f.run();
 assert.equal(p.status,2);
 assert.match(p.stderr,/PRIVATE_SESSION_STATE_PERMISSIONS/);
});
