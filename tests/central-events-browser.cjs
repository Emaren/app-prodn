#!/usr/bin/env node
"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {createRequire}=require("node:module");
async function main(){
 const base=process.env.BROWSER_BASE_URL;assert.equal(base,"http://127.0.0.1:3137");
 const {chromium}=createRequire(__filename)(path.join(process.env.PW_HOME,"node_modules/playwright-core"));
 const axe=require(path.join(process.env.PW_HOME,"node_modules/axe-core"));
 const {SignJWT}=await import("jose");
 const secret=new TextEncoder().encode("isolated-q09-ci-not-production");
 const cookie=async uid=>new SignJWT({uid}).setProtectedHeader({alg:"HS256"}).setIssuer("aoe2hdbets").setIssuedAt().setExpirationTime("5m").sign(secret);
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN,args:["--no-sandbox","--disable-dev-shm-usage"]});
 const dir="central-events-browser";fs.mkdirSync(dir,{recursive:true});
 const result={sourceSha:process.env.SOURCE_SHA,buildId:fs.readFileSync(".next/BUILD_ID","utf8").trim(),production:false,views:[]};
 try{
  const anon=await browser.newContext({baseURL:base});
  assert.equal((await anon.request.get("/api/admin/central-command/events")).status(),401);
  const non=await cookie("fixture-scout");await anon.addCookies([{name:"aoe2hdbets_session",value:non,url:base}]);
  assert.equal((await anon.request.get("/api/admin/central-command/events")).status(),403);
  await anon.close();
  const admin=await cookie("fixture-admin");
  for(const width of [375,768,1440]){
   const ctx=await browser.newContext({baseURL:base,viewport:{width,height:900},reducedMotion:"reduce",serviceWorkers:"block"});
   await ctx.addCookies([{name:"aoe2hdbets_session",value:admin,url:base}]);
   const post=await ctx.request.post("/api/admin/central-command/events",{data:{}});
   assert.equal(post.status(),405);
   const get=await ctx.request.get("/api/admin/central-command/events");assert.equal(get.status(),200);
   assert.match(get.headers()["cache-control"],/no-store/);
   const json=await get.json();assert.equal(json.schema,"aoe2war.central-source-events.v1");
   assert.ok(["FRESH","PARTIAL","STALE","UNKNOWN"].includes(json.status));
   assert.ok(json.events.length<=60);assert.doesNotMatch(JSON.stringify(json),/GITHUB_TOKEN|isolated-q09-ci-not-production|\/Users\//);
   const page=await ctx.newPage();
   // A deterministic source fixture tests the actual rendered authenticated DOM.
   await page.route("**/api/admin/central-command/events",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({
    schema:"aoe2war.central-source-events.v1",status:"FRESH",readAt:"2026-10-29T20:00:00Z",
    observedAt:"2026-10-29T20:00:00Z",sourceCoverage:{accepted:2,expected:2},
    history:"BOUNDED_GITHUB_WINDOW_NOT_DURABLE",
    events:[{id:"github:Emaren/app-prodn:run:40952916496",kind:"HEAD_CI_CONCLUDED",at:"2026-10-29T20:00:00Z",repo:"Emaren/app-prodn",laneId:null,sha:"a".repeat(40),state:"SUCCESS",sourceUrl:"https://github.com/Emaren/app-prodn/actions/runs/40952916496",authority:"GITHUB_SOURCE"}]
   })}));
   const res=await page.goto("/admin/central-command",{waitUntil:"domcontentloaded",timeout:30000});
   assert.equal(res.status(),200);await page.getByRole("heading",{name:"Verified source activity"}).waitFor({timeout:15000});
   await page.getByText("HEAD CI CONCLUDED").waitFor({timeout:15000});
   assert.equal(await page.getByRole("link",{name:/HEAD CI CONCLUDED/}).count(),1);
   await page.getByRole("article").first().waitFor({timeout:25000});
   await page.getByRole("article").nth(5).waitFor({timeout:25000});
   assert.equal(await page.getByRole("article").count(),6);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+5));
   await page.addScriptTag({content:axe.source});
   const violations=await page.evaluate(async()=>{const e=await window.axe.run(document,{runOnly:{type:"tag",values:["wcag2a","wcag2aa","wcag21a","wcag21aa"]}});return e.violations.filter(x=>x.impact==="serious"||x.impact==="critical").map(x=>x.id)});
   assert.deepEqual(violations,[]);
   await page.screenshot({path:path.join(dir,"events-"+width+".png"),fullPage:false});
   result.views.push({width,sourceStrip:"RENDERED",axeSeriousCritical:0,horizontalOverflow:0});
   await ctx.close();
  }
  result.status="PASS";fs.writeFileSync(path.join(dir,"receipt.json"),JSON.stringify(result,null,2)+"\n");console.log("Q09 VERIFIED EVENTS REAL CHROME PASS "+JSON.stringify(result));
 }finally{await browser.close();}
}
main().catch(e=>{console.error("Q09_EVENTS_CHROME_FAIL",e.stack||e);process.exitCode=1;});
