import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { census, compareCensus, gitHeadPaths, routeHref } from "../scripts/kingdom_index_full_inventory.mjs";
import publicIndex from "../config/kingdom-index-routes.json" with { type:"json" };
import inventory from "../config/kingdom-index-inventory.json" with { type:"json" };
import renaissance from "../config/renaissance-campaign.json" with { type:"json" };

const indexed = publicIndex.map(row=>row.href);
test("all 148 exact page templates and 284 handler templates match Git HEAD",()=>{
  const actual=census(gitHeadPaths(),indexed);
  assert.deepEqual(compareCensus(inventory,actual),{
    pageTemplates:148,adminTemplates:30,dynamicTemplates:20,publicIndexTemplates:88,
    excludedStaticTemplates:10,routeHandlerTemplates:284,apiHandlerTemplates:281,nonApiHandlerTemplates:3
  });
  assert.deepEqual(inventory.pages.map(p=>p.href).filter(h=>indexed.includes(h)).sort(),[...indexed].sort());
  assert.equal(inventory.pages.filter(p=>p.assurance!=="unverified").length,0);
  assert.equal(inventory.handlers.filter(h=>h.ownership!=="unassigned").length,0);
  for(const route of ["internal/mecha/funded-tick","user/war-satchel/auto-consent",
    "user/war-satchel/balance","user/war-satchel/credit-verified",
    "user/war-satchel/funding-quote","user/war-satchel/withdrawal"]){
    assert.ok(inventory.handlers.some(h=>h.entrypoint===`app/api/${route}/route.ts`&&h.scope==="api"));
  }
});
test("seven Renaissance phases assign each canonical template exactly once",()=>{
  const phases=renaissance.phases.flatMap(p=>p.routes);
  assert.equal(phases.length,148);
  assert.equal(new Set(phases).size,148);
  assert.deepEqual([...phases].sort(),inventory.pages.map(p=>p.href).sort());
  assert.deepEqual(renaissance.modules.map(m=>m.href).sort(),phases.filter(h=>h==="/renaissance"||h.startsWith("/renaissance/")).sort());
});
test("path scope is not an authorization claim or public detail disclosure",()=>{
  assert.equal(routeHref("app/page.tsx"),"/");
  assert.equal(routeHref("app/admin/page.tsx"),"/admin");
  assert.equal(routeHref("app/game-stats/[id]/page.tsx"),"/game-stats/[id]");
  assert.equal(inventory.pages.find(p=>p.href==="/market/invoices/[publicId]")?.scope,"dynamic-template");
  assert.equal(inventory.pages.find(p=>p.href==="/admin/auto-bets")?.scope,"admin-path");
  assert.equal(inventory.pages.find(p=>p.href==="/admin/living-kingdom")?.scope,"admin-path");
  assert.equal(inventory.pages.find(p=>p.href==="/admin/living-kingdom/[uid]")?.assurance,"unverified");
  assert.equal(inventory.handlers.filter(h=>h.entrypoint.startsWith("app/api/admin/living-kingdom/")).length,2);
  assert.equal(inventory.pages.find(p=>p.href==="/wallet")?.scope,"excluded-static");
  assert.equal(inventory.policy.includes("not authenticated access tests"),true);
  const lib=readFileSync(new URL("../lib/kingdomIndex.ts",import.meta.url),"utf8");
  assert.match(lib,/inventory\.counts/);
  assert.doesNotMatch(lib,/inventory\.pages|inventory\.handlers/);
});
test("duplicate, removed, forged and unindexed template paths fail closed",()=>{
  const paths=gitHeadPaths();
  assert.throws(()=>census([...paths,paths[0]],indexed),/Duplicate/);
  assert.throws(()=>census(paths,indexed.concat("/does-not-exist")),/Public Index source/);
  const missing=census(paths.filter(p=>p!=="app/admin/page.tsx"),indexed);
  assert.throws(()=>compareCensus(inventory,missing),/INVENTORY DRIFT/);
  const added=census([...paths,"app/newly-added/page.tsx"],indexed);
  assert.throws(()=>compareCensus(inventory,added),/INVENTORY DRIFT/);
});

test("the merged private storage owner handler remains source-indexed",()=>{
 assert.ok(inventory.handlers.some(h=>h.entrypoint==="app/api/admin/storage-os/reviews/route.ts"&&h.scope==="api"));
});
