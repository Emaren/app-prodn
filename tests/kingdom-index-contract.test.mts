import assert from "node:assert/strict";
import { readdirSync,existsSync,readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import catalog from "../config/kingdom-index-routes.json" with { type: "json" };
const root=process.cwd();
const omitted=new Set(["/profile","/wallet","/settings","/connect-wallet","/pending-bets","/offline","/contact-emaren","/past-earnings","/app","/upload","/uploads"]);
function walk(directory,parts=[]) {
  const rows=[];
  for(const child of readdirSync(directory,{withFileTypes:true})){
    if(child.name==="admin" && parts.length===0) continue;
    if(child.isDirectory()){
      if(child.name.startsWith("[")||child.name==="api")continue;
      rows.push(...walk(join(directory,child.name),[...parts,child.name]));
    }else if(child.name==="page.tsx"){
      const href="/"+parts.join("/");
      if(!omitted.has(href))rows.push(href);
    }
  }
  return rows;
}
test("every static public App Router page has exactly one nonprivate Kingdom Index address",()=>{
  const known=walk(join(root,"app")).sort();
  const actual=catalog.map(p=>p.href).filter(h=>h!=="/kingdom-index").sort();
  assert.deepEqual(actual,known);
  assert.equal(new Set(catalog.map(x=>x.href)).size,catalog.length);
  for(const item of catalog) {
    assert.match(item.href,/^\/(?!api\/|admin\/|profile\/|wallet\/)/);
    assert.ok(["citadel","arena","forge","bazaar","commons"].includes(item.district));
  }
});
test("public index uses actual source-attested scores and refuses guessed completion",()=>{
 const source=readFileSync(join(root,"lib/kingdomIndex.ts"),"utf8");
 assert.match(source,/sourceVersion===version/);
 assert.match(source,/status.*unmeasured/);
 assert.match(source,/AUDIT_TTL_MS/);
 assert.doesNotMatch(source,/score:\s*100/);
});
