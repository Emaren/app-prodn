#!/usr/bin/env node
"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {createRequire}=require("node:module");
async function run(){
 const base=process.env.BROWSER_BASE_URL;assert.equal(base,"http://127.0.0.1:3137");
 const {chromium}=createRequire(__filename)(path.join(process.env.PW_HOME,"node_modules/playwright-core"));
 const axe=require(path.join(process.env.PW_HOME,"node_modules/axe-core"));
 const {SignJWT}=await import("jose");
 const key=new TextEncoder().encode("isolated-q09-ci-not-production");
 const token=async uid=>new SignJWT({uid}).setProtectedHeader({alg:"HS256"}).setIssuer("aoe2hdbets").setIssuedAt().setExpirationTime("5m").sign(key);
 const admin=await token("fixture-admin"),non=await token("fixture-scout");
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN,args:["--no-sandbox","--disable-dev-shm-usage"]});
 const dir="job-exchange-browser";fs.mkdirSync(dir,{recursive:true});
 const receipt={sourceSha:process.env.SOURCE_SHA,buildId:fs.readFileSync(".next/BUILD_ID","utf8").trim(),production:false,views:[]};
 try{
  const nobody=await browser.newContext({baseURL:base});
  const anonPage=await nobody.newPage();
  await anonPage.goto("/admin/central-command/job-board",{waitUntil:"domcontentloaded"});
  assert.notEqual(new URL(anonPage.url()).pathname,"/admin/central-command/job-board","Guest must redirect");
  await nobody.addCookies([{name:"aoe2hdbets_session",url:base,value:non}]);
  await anonPage.goto("/admin/central-command/job-board",{waitUntil:"domcontentloaded"});
  assert.notEqual(new URL(anonPage.url()).pathname,"/admin/central-command/job-board","Nonadmin must redirect");
  await nobody.close();
  for(const width of [375,768,1440]){
   const ctx=await browser.newContext({baseURL:base,viewport:{width,height:860},serviceWorkers:"block",reducedMotion:"reduce"});
   await ctx.addCookies([{name:"aoe2hdbets_session",url:base,value:admin}]);
   const p=await ctx.newPage();
   await p.route("**/api/admin/central-command/events",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({
    schema:"aoe2war.central-source-events.v1",status:"FRESH",readAt:"2026-10-29T20:00:00Z",observedAt:"2026-10-29T20:00:00Z",
    sourceCoverage:{accepted:27,expected:27},history:"BOUNDED_GITHUB_WINDOW_NOT_DURABLE",
    events:[{id:"github:Emaren/app-prodn:commit:"+"a".repeat(40),kind:"SOURCE_COMMIT_OBSERVED",at:"2026-10-29T20:00:00Z",repo:"Emaren/app-prodn",laneId:"G",sha:"a".repeat(40),sourceUrl:"https://github.com/Emaren/app-prodn/commit/"+"a".repeat(40),state:null,authority:"GITHUB_SOURCE"}]
   })}));
   const res=await p.goto("/admin/central-command/job-board",{waitUntil:"domcontentloaded",timeout:30000});
   assert.equal(res.status(),200);
   await p.getByRole("heading",{name:/THE JOB EXCHANGE/}).waitFor({timeout:16000});
   await p.getByRole("heading",{name:"THE SIX BRAINS"}).waitFor({timeout:16000});
   assert.equal(await p.getByRole("button",{name:/Inspect Session .* source evidence/}).count(),6);
   assert.equal(await p.getByText("COMMIT WITNESSED").count(),1,"Source glow requires actual supplied event");
   assert.equal(await p.getByText("UNKNOWN",{exact:true}).count()>0,true,"No forged deployed BUILD_ID");
   await p.getByRole("button",{name:"Inspect Session C source evidence"}).click();
   assert.equal(await p.getByRole("button",{name:"Inspect Session C source evidence"}).getAttribute("aria-pressed"),"true");
   await p.getByText("No event currently evidenced for this lane").waitFor({timeout:4000});
   assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+4),"horizontal overflow");
   await p.keyboard.press("Tab");assert.ok(await p.evaluate(()=>document.activeElement!==document.body));
   await p.addScriptTag({content:axe.source});
   const v=await p.evaluate(async()=>{const x=await window.axe.run(document,{runOnly:{type:"tag",values:["wcag2a","wcag2aa","wcag21a","wcag21aa"]}});return x.violations.filter(y=>["serious","critical"].includes(y.impact)).map(y=>({id:y.id,target:y.nodes[0]?.target}))});
   assert.deepEqual(v,[],"serious/critical accessibility");
   await p.screenshot({path:path.join(dir,"exchange-"+width+".png"),fullPage:true});
   receipt.views.push({width,sixCores:"RENDERED",sourceWitness:"REAL_EVENT_FIXTURE",noFakeLive:true,keyboard:true,axeSeriousCritical:0,overflow:0});
   await ctx.close();
  }
  receipt.status="PASS";
  fs.writeFileSync(path.join(dir,"receipt.json"),JSON.stringify(receipt,null,2)+"\n");
  console.log("Q09 JOB EXCHANGE REAL CHROME PASS "+JSON.stringify(receipt));
 }finally{await browser.close();}
}
run().catch(e=>{console.error("Q09_JOB_EXCHANGE_CHROME_FAIL",e.stack||e);process.exitCode=1;});
