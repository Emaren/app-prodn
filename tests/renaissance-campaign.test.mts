import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,existsSync} from "node:fs";
const data=JSON.parse(readFileSync(new URL("../config/renaissance-campaign.json",import.meta.url),"utf8"));
const routes=data.phases.flatMap((p:{id:string;routes:string[]})=>p.routes);
test("all 132 source templates have one canonical campaign assignment",()=>{
 assert.equal(routes.length,132);assert.equal(new Set(routes).size,132);assert.equal(data.phases.length,7);
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
