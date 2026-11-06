import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
const read=(p:string)=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const pages=["app/admin/backup-os/page.tsx","app/admin/code-health/page.tsx","app/admin/storage-transfer/page.tsx","app/admin/documents-os/page.tsx"];
test("four actual operator pages inherit the server signed admin layout",()=>{
 const layout=read("app/admin/layout.tsx");
 assert.match(layout,/requireServerAdmin/);
 for(const path of pages){const source=read(path);assert.match(source,/export default (?:async )?function/);assert.doesNotMatch(source,/child_process|execSync|fetch\([^)]*POST/);}
});
test("operator evidence only invokes existing authenticated no-store GET readers",()=>{
 const source=read("components/admin/operational-evidence/OperatorEvidence.tsx");
 assert.match(source,/method:"GET"/);assert.match(source,/credentials:"same-origin"/);
 assert.match(source,/cache:"no-store"/);assert.match(source,/signedAdmission/);
 assert.doesNotMatch(source,/method:"POST"|rmSync|unlinkSync|execSync|writeFileSync|VACUUM/);
 assert.match(source,/UNKNOWN/);assert.match(source,/Certified restores: UNKNOWN/);
});
test("documents are real DocsV2 registry records, never fixture scores",()=>{
 const source=read("app/admin/documents-os/page.tsx");
 assert.match(source,/document-registry.json/);assert.match(source,/registry.documents.map/);
 assert.match(source,/await requireServerAdmin\(\)/);
 assert.ok(source.indexOf("await requireServerAdmin()") < source.indexOf("registry.documents.map"));
 assert.doesNotMatch(source,/100\/100|autonomous workers|lastUpdated: new Date/);
});
