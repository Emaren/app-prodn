import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,existsSync} from "node:fs";
const data=JSON.parse(readFileSync(new URL("../config/renaissance-campaign.json",import.meta.url),"utf8"));
const routes=data.phases.flatMap((p:{id:string;routes:string[]})=>p.routes);
test("all 144 source templates have one canonical campaign assignment",()=>{
 assert.equal(routes.length,144);assert.equal(new Set(routes).size,144);assert.equal(data.phases.length,7);
 assert.equal(data.modules.length,12);
 for(const r of routes){const path=new URL("../app"+(r==="/"?"/":r+"/")+"page.tsx",import.meta.url);assert.ok(existsSync(path),r);}
});
test("ordered phases and intentional independent views",()=>{
 assert.deepEqual(data.phases.map((p:{id:string})=>p.id),["I","II","III","IV","V","VI","VII"]);
 assert.equal(routes[0],"/kingdom-intelligence");assert.equal(routes.at(-1),"/");
 for(const m of data.modules){const target=m.slug==="command"?"../app/renaissance/page.tsx":"../app/renaissance/"+m.slug+"/page.tsx";assert.ok(existsSync(new URL(target,import.meta.url)),m.slug);}
});
test("public visibility explicitly separates admin, private, invoice and public index",()=>{
 assert.equal(routes.filter((r:string)=>r==="/admin"||r.startsWith("/admin/")).length,26);
 assert.equal(routes.filter((r:string)=>r.includes("[")).length,20);
 const view=readFileSync(new URL("../lib/renaissance/registry.ts",import.meta.url),"utf8");
 assert.match(view,/isRestricted/);assert.match(view,/market\/invoices/);
});

test("one Renaissance Campaign doorway in both castle and account menus",()=>{
 const shell=readFileSync(new URL("../app/AppShell.tsx",import.meta.url),"utf8");
 const account=readFileSync(new URL("../components/HeaderMenu.tsx",import.meta.url),"utf8");
 for(const [name,source,start,end] of [
  ["castle",shell,"const KINGDOM_LINKS = [","function KingdomNavItem("],
  ["account",account,"const menuEntries = useMemo<MenuEntry[]>(","const visibleEntries ="],
 ] as const){
  const startAt=source.indexOf(start);
  assert.ok(startAt>=0,name+" menu start");
  const endAt=source.indexOf(end,startAt);
  assert.ok(endAt>startAt,name+" menu end");
  const entries=source.slice(startAt,endAt);
  const matches=[...entries.matchAll(/href:\s*"\/renaissance(?:\/[^"]*)?"/g)];
  assert.equal(matches.length,1,name+" has exactly one Renaissance door");
  assert.match(entries,/href:\s*"\/renaissance",\s*label:\s*"Renaissance Campaign"/);
 }
});

test("Renaissance Campaign gallery links to every original destination without replacing views",()=>{
 const source=readFileSync(new URL("../components/renaissance/RenaissanceCanvas.tsx",import.meta.url),"utf8");
 const css=readFileSync(new URL("../app/renaissance/renaissance.css",import.meta.url),"utf8");
 assert.equal(data.modules.length,12);
 assert.equal(new Set(data.modules.map((m:{href:string})=>m.href)).size,12);
 for(const entry of data.modules){assert.ok(entry.href.startsWith("/renaissance"),entry.href);}
 assert.match(source,/import campaign from "@\/config\/renaissance-campaign.json"/);
 assert.match(source,/mode==="command"&&<section className="rx-campaign-portal"/);
 assert.match(source,/campaign\.modules\.map\(/);
 assert.match(source,/data-campaign-destination=/);
 assert.match(source,/aria-label="Renaissance instruments"/);
 assert.match(css,/\.rx-campaign-gallery\{display:grid/);
 assert.match(css,/@media\(max-width:490px\)/);
 assert.match(css, /prefers-reduced-motion:reduce/);
});
