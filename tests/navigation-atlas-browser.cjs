#!/usr/bin/env node
"use strict";
/* Genuine authorized Chrome against isolated disposable PostgreSQL. No
 * test-mode authentication bypass, no production host or WOLO writes. */
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path");
const {createRequire}=require("node:module");
async function main(){
 const base=process.env.ATLAS_BROWSER_ORIGIN;
 assert.equal(base,"http://localhost:3137");
 assert.equal(process.env.ATLAS_BROWSER_FIXTURE_ALLOWED,"1");
 const output=process.env.ATLAS_BROWSER_OUT,pw=process.env.PW_HOME,chrome=process.env.CHROME_BIN;
 assert.ok(output&&path.isAbsolute(output)&&pw&&chrome&&fs.existsSync(chrome));
 const {chromium}=createRequire(__filename)(path.join(pw,"node_modules/playwright-core"));
 const axe=require(path.join(pw,"node_modules/axe-core"));
 const {SignJWT}=await import("jose");
 const secret=new TextEncoder().encode("isolated-ci-not-production");
 const jwt=uid=>new SignJWT({uid}).setProtectedHeader({alg:"HS256"}).setIssuer("aoe2hdbets").setIssuedAt().setExpirationTime("5m").sign(secret);
 const buildId=fs.readFileSync(".next/BUILD_ID","utf8").trim();
 const browser=await chromium.launch({headless:true,executablePath:chrome,args:["--no-sandbox","--disable-dev-shm-usage"]});
 const report={sourceSha:process.env.SOURCE_SHA,buildId,productionCertified:false,
  authenticatedSourceOnly:true,realChrome:true,results:[]};
 fs.mkdirSync(output,{recursive:true});
 try{
  // Next.js 15 can deliver an HTTP 200 streamed shell containing a
  // NEXT_REDIRECT instruction after headers have flushed. The security
  // assertion is actual browser navigation away from the admin route,
  // not a particular HTTP status code.
  const anonymous=await browser.newContext({baseURL:base,serviceWorkers:"block"});
  const anonPage=await anonymous.newPage();
  const anon=await anonPage.goto("/admin/aoe2war-os",{waitUntil:"domcontentloaded",timeout:30000});
  await anonPage.waitForURL(url=>url.pathname==="/",{timeout:20000});
  assert.equal(new URL(anonPage.url()).pathname,"/","anonymous reached protected Admin OS");
  assert.equal(await anonPage.locator("#navigation-atlas").count(),0,"anonymous saw Atlas");
  console.log("Q17_ANONYMOUS_REDIRECT",JSON.stringify({firstStatus:anon?.status(),finalPath:new URL(anonPage.url()).pathname}));
  // The newly accepted nested source has its own guard as well as the
  // containing private admin layout.
  await anonPage.goto("/admin/central-command/job-board",{waitUntil:"domcontentloaded",timeout:30000});
  await anonPage.waitForURL(url=>url.pathname==="/",{timeout:20000});
  assert.equal(await anonPage.getByRole("heading",{name:/THE JOB EXCHANGE/}).count(),0);
  for(const href of ["/admin/central-command/work-board","/admin/central-command/lanes"]){
   await anonPage.goto(href,{waitUntil:"domcontentloaded",timeout:30000});
   await anonPage.waitForURL(url=>url.pathname==="/",{timeout:20000});
   assert.equal(await anonPage.getByRole("heading",{name:/THE WORK BOARD|THE EVIDENCE LEDGER/}).count(),0,
     "Anonymous visitor saw G A3 private source "+href);
  }
  await anonymous.close();
  const noadmin=await jwt("fixture-scout"),admin=await jwt("fixture-admin");
  const bad=await browser.newContext({baseURL:base,serviceWorkers:"block"});
  await bad.addCookies([{name:"aoe2hdbets_session",value:noadmin,url:base,httpOnly:true,sameSite:"Lax"}]);
  const badPage=await bad.newPage();
  const badRes=await badPage.goto("/admin/aoe2war-os",{waitUntil:"domcontentloaded",timeout:30000});
  await badPage.waitForURL(url=>url.pathname==="/",{timeout:20000});
  assert.equal(new URL(badPage.url()).pathname,"/","nonadmin reached protected Admin OS");
  assert.equal(await badPage.locator("#navigation-atlas").count(),0,"nonadmin saw Atlas");
  console.log("Q17_NONADMIN_REDIRECT",JSON.stringify({firstStatus:badRes?.status(),finalPath:new URL(badPage.url()).pathname}));
  await badPage.goto("/admin/central-command/job-board",{waitUntil:"domcontentloaded",timeout:30000});
  await badPage.waitForURL(url=>url.pathname==="/",{timeout:20000});
  assert.equal(await badPage.getByRole("heading",{name:/THE JOB EXCHANGE/}).count(),0);
  for(const href of ["/admin/central-command/work-board","/admin/central-command/lanes"]){
   await badPage.goto(href,{waitUntil:"domcontentloaded",timeout:30000});
   await badPage.waitForURL(url=>url.pathname==="/",{timeout:20000});
   assert.equal(await badPage.getByRole("heading",{name:/THE WORK BOARD|THE EVIDENCE LEDGER/}).count(),0,
     "Nonadmin visitor saw G A3 private source "+href);
  }
  await bad.close();
  for(const width of [375,768,1440]){
   const context=await browser.newContext({baseURL:base,viewport:{width,height:900},reducedMotion:"reduce",serviceWorkers:"block"});
   await context.addCookies([{name:"aoe2hdbets_session",value:admin,url:base,httpOnly:true,sameSite:"Lax"}]);
   const page=await context.newPage(),errors=[];
   page.on("pageerror",e=>errors.push(String(e)));
   const res=await page.goto("/admin/aoe2war-os#navigation-atlas",{waitUntil:"domcontentloaded",timeout:45000});
   assert.equal(res.status(),200,"admin source page not served");
   const atlas=page.locator("#navigation-atlas");
   await atlas.getByRole("heading",{name:"Navigation Atlas"}).waitFor({timeout:20000});
   // Private command pages must not have a persistent five-pill overlay
   // covering the bottom of operator cards, but navigation stays keyboard
   // discoverable and can be restored without writing public nav preference.
   if (width < 1024) {
     const dockToggle=page.getByRole("button",{name:"Show app navigation"});
     await dockToggle.waitFor({state:"visible",timeout:15000});
     assert.equal(await page.locator('[data-mobile-floating-nav] nav:visible').count(),0,
       "persistent navigation obscures private command content");
     await dockToggle.focus();await page.keyboard.press("Enter");
     await page.locator('[data-mobile-floating-nav] nav:visible').waitFor({timeout:5000});
     assert.equal(await page.locator('[data-mobile-floating-nav] nav a').count(),5,
       "expanded command bar must retain all original links");
     await page.getByRole("button",{name:"Hide app navigation"}).click();
     await dockToggle.waitFor({state:"visible",timeout:5000});
   }
   // A streamed App Router shell may expose the heading before all cards
   // commit. Wait for actual DOM count; never infer coverage from the title.
   await page.waitForFunction(() => document.querySelectorAll('#navigation-atlas a[data-atlas-href]').length === 32,
     null, {timeout:20000});
   const routeCount=await atlas.locator('a[data-atlas-href]').count();
   assert.equal(routeCount,32,"must show every source-backed private route");
   assert.equal(await atlas.getByRole("status").first().innerText(),"32 of 32 source routes · LIVE STATUS UNVERIFIED");
   const input=atlas.getByRole("searchbox",{name:"Find a chamber"});
   await input.fill("storage");
   assert.equal(await atlas.locator('a[data-atlas-href]').count(),1,"route search must filter exactly");
   assert.ok((await atlas.locator('a[data-atlas-href]').first().getAttribute("href")).includes("/admin/storage-os"));
   await input.fill("");
   const people=atlas.getByRole("button",{name:"People",exact:true});
   await people.focus();await page.keyboard.press("Enter");
   assert.equal(await people.getAttribute("aria-pressed"),"true","keyboard cluster filter");
   assert.ok(await atlas.locator('a[data-atlas-href]').count()>0);
   await atlas.getByRole("button",{name:"All chambers"}).click();
   assert.equal(await atlas.locator('a[data-atlas-href]').count(),32);
   const boardEntry = atlas.locator('a[data-atlas-href="/admin/central-command/job-board"]');
   assert.equal(await boardEntry.count(),1,"new accepted Job Exchange must be linked exactly once");
   const boardSearch=atlas.getByRole("searchbox",{name:"Find a chamber"});
   await boardSearch.fill("living job exchange");
   assert.equal(await atlas.locator('a[data-atlas-href]').count(),1,
     "Job Exchange should be source-discoverable by name");
   await boardSearch.fill("");
   assert.equal(await atlas.locator('a[data-atlas-href="/admin/central-command/work-board"]').count(),1,
     "Accepted Work Board must appear once");
   assert.equal(await atlas.locator('a[data-atlas-href="/admin/central-command/lanes"]').count(),1,
     "Accepted Six Lanes must appear once");
   const box=await atlas.boundingBox();
   const layout=await page.evaluate(() => ({
     viewport: innerWidth,
     htmlScrollWidth: document.documentElement.scrollWidth,
     bodyScrollWidth: document.body.scrollWidth,
     horizontalScroll: window.scrollX,
   }));
   console.log("Q17_ATLAS_BOUNDS",JSON.stringify({width,box,layout}));
   assert.ok(box&&box.x>=-4&&box.x+box.width<=width+8,
     "atlas horizontal overflow at "+width+": "+JSON.stringify({box,layout}));
   await page.addScriptTag({content:axe.source});
   const violations=await page.evaluate(async()=>{
    const el=document.querySelector("#navigation-atlas");
    const result=await window.axe.run(el,{runOnly:{type:"tag",values:["wcag2a","wcag2aa","wcag21a","wcag21aa"]}});
    return result.violations.filter(v=>["serious","critical"].includes(v.impact))
      .map(v=>({id:v.id,impact:v.impact,targets:v.nodes.map(n=>n.target).slice(0,5)}));
   });
   assert.deepEqual(violations,[],"serious/critical axe findings");
   assert.deepEqual(errors,[],"uncaught browser errors");
   await page.screenshot({path:path.join(output,"navigation-atlas-"+width+".png"),fullPage:false});
   // G owns this page and verified-source event loader. Mock only the
   // remote source response inside this disposable browser, never fake a
   // successful agent wake or deployment in the application itself.
   await page.route("**/api/admin/central-command/events",route=>route.fulfill({
     status:200,contentType:"application/json",
     body:JSON.stringify({schema:"aoe2war.central-source-events.v1",
       status:"UNKNOWN",readAt:"2026-10-29T20:00:00Z",observedAt:null,
       sourceCoverage:{accepted:0,expected:27},
       history:"BOUNDED_FIXTURE_NO_DEPLOYMENT_PROOF",events:[]})
   }));
   await boardEntry.focus();
   await page.keyboard.press("Enter");
   await page.waitForURL("**/admin/central-command/job-board",{timeout:20000});
   await page.getByRole("heading",{name:/THE JOB EXCHANGE/}).waitFor({timeout:20000});
   await page.getByRole("heading",{name:"THE SIX BRAINS"}).waitFor({timeout:20000});
   const brains=page.getByRole("button",{name:/Inspect Session [BCDEFG] source evidence/});
   assert.equal(await brains.count(),6,"real G six-brain source components missing");
   const brainG=page.getByRole("button",{name:"Inspect Session G source evidence"});
   await brainG.scrollIntoViewIfNeeded();
   const brainGeometry=await page.evaluate(()=>{
     const core=document.querySelector('button[aria-label="Inspect Session G source evidence"]');
     core?.scrollIntoView({block:"center"});
     const rect=core?.getBoundingClientRect();
     const x=rect?Math.max(0,Math.min(innerWidth-1,rect.x+rect.width/2)):0;
     const y=rect?Math.max(0,Math.min(innerHeight-1,rect.y+rect.height/2)):0;
     const visibleAtCenter=document.elementFromPoint(x,y);
     return {rect:rect?{x:rect.x,y:rect.y,width:rect.width,height:rect.height}:null,
       width:innerWidth,docWidth:document.documentElement.scrollWidth,
       centerReachable:!!core&&(core===visibleAtCenter||core.contains(visibleAtCenter)),
       floatingDockPresent:!!document.querySelector('[data-mobile-floating-nav]'),
       persistentDockVisible:!!document.querySelector('[data-mobile-floating-nav] nav'),
       centerX:x,centerY:y};
   });
   console.log("Q17_G_BRAIN_GEOMETRY",JSON.stringify({width,...brainGeometry}));
   assert.ok(brainGeometry.centerReachable,"G brain center blocked by floating navigation or overlay");
   assert.ok(brainGeometry.docWidth<=width+4,"G board horizontal overflow");
   assert.equal(brainGeometry.floatingDockPresent,false,
     "Even the collapsed fixed Command bar obstructs G cards; use the existing page back-link and header instead");
   assert.equal(brainGeometry.persistentDockVisible,false,
     "A fixed overlay must not cover G brain cards");
   await brainG.focus();await page.keyboard.press("Enter");
   assert.equal(await brainG.getAttribute("aria-pressed"),"true");
   await page.addScriptTag({content:axe.source});
   const jobAxe=await page.evaluate(async()=>{
     const result=await window.axe.run(document,{runOnly:{type:"tag",values:["wcag2a","wcag2aa","wcag21a","wcag21aa"]}});
     return result.violations.filter(v=>["serious","critical"].includes(v.impact))
       .map(v=>({id:v.id,impact:v.impact,target:v.nodes[0]?.target}));
   });
   assert.deepEqual(jobAxe,[],"G Job Exchange serious/critical accessibility");
   await page.screenshot({path:path.join(output,"job-exchange-linked-"+width+".png"),fullPage:true});
   // Navigate through canonical Atlas edges to the genuine G A3 pages.
   // G owns both components. The endpoint stays UNKNOWN with no pretend wake,
   // and these checks operate against an isolated database + browser only.
   await page.goto("/admin/aoe2war-os#navigation-atlas",{waitUntil:"domcontentloaded",timeout:45000});
   await page.waitForFunction(()=>document.querySelectorAll('#navigation-atlas a[data-atlas-href]').length===32,null,{timeout:20000});
   for (const [href,heading,file,coreCount] of [
     ["/admin/central-command/work-board",/THE WORK BOARD/,"work-board",0],
     ["/admin/central-command/lanes",/THE EVIDENCE LEDGER/,"six-lanes",6]
   ]){
     await page.route("**/api/admin/central-command/work-ledger",r=>r.fulfill({
       status:503,contentType:"application/json",body:JSON.stringify({error:"ISOLATED_SOURCE_UNAVAILABLE"})
     }));
     const edge=page.locator('#navigation-atlas a[data-atlas-href="'+href+'"]');
     await edge.focus();await page.keyboard.press("Enter");
     await page.waitForURL(url=>url.pathname===href,{timeout:20000});
     await page.getByRole("heading",{name:heading}).waitFor({timeout:20000});
     await page.getByRole("navigation",{name:"Private Central Command views"}).waitFor();
     assert.equal(await page.locator("[data-mobile-floating-nav]").count(),0,
       "Even collapsed fixed dock must not overlap G A3 luminous source cards: "+href);
     const nativeWidth=await page.evaluate(()=>({html:document.documentElement.scrollWidth,viewport:innerWidth}));
     assert.ok(nativeWidth.html<=width+4,"A3 horizontal overflow "+JSON.stringify({href,width,nativeWidth}));
     if(coreCount){
       const cores=page.getByRole("button",{name:/Inspect core [BCDEFG] evidence/});
       assert.equal(await cores.count(),6,"G A3 six-core source layout changed");
       const core=page.getByRole("button",{name:"Inspect core G evidence"});
       await core.scrollIntoViewIfNeeded();await core.focus();await page.keyboard.press("Enter");
       assert.equal(await core.getAttribute("aria-pressed"),"true");
     }else{
       assert.equal(await page.locator('[data-stage]').count(),8,"Eight source milestone columns missing");
     }
     await page.addScriptTag({content:axe.source});
     const a3Axe=await page.evaluate(async()=>{
       const x=await window.axe.run(document,{runOnly:{type:"tag",values:["wcag2a","wcag2aa","wcag21a","wcag21aa"]}});
       return x.violations.filter(v=>["serious","critical"].includes(v.impact)).map(v=>({id:v.id,impact:v.impact,target:v.nodes[0]?.target}));
     });
     assert.deepEqual(a3Axe,[],"A3 serious/critical a11y violation "+href);
     await page.screenshot({path:path.join(output,file+"-linked-"+width+".png"),fullPage:true});
     await page.unroute("**/api/admin/central-command/work-ledger");
     await page.goto("/admin/aoe2war-os#navigation-atlas",{waitUntil:"domcontentloaded",timeout:45000});
     await page.waitForFunction(()=>document.querySelectorAll('#navigation-atlas a[data-atlas-href]').length===32,null,{timeout:20000});
   }
   if(width===1440){
     const tower=await page.goto("/admin/user-list",{waitUntil:"domcontentloaded",timeout:45000});
     assert.equal(tower.status(),200);
     await page.getByRole("navigation",{name:"Admin sections"}).waitFor({timeout:25000});
     const menu=page.getByRole("navigation",{name:"Admin sections"});
     assert.equal(await menu.locator("a").count(),32,"Command Tower incomplete");
     await page.getByRole("link",{name:/Navigation Atlas · All Command Links/}).first().focus();
     await page.keyboard.press("Enter");
     await page.waitForURL("**/admin/aoe2war-os#navigation-atlas",{timeout:20000});
     assert.equal(await page.locator("#navigation-atlas").count(),1);
   }
   report.results.push({width,privateAdmin200:true,adminNodes:32,jobExchangeLinked:true,workBoardLinked:true,lanesLinked:true,
     gSixBrains:6,brainUnobstructed:true,jobBoardDockSuppressed:true,jobBoardAxeSerious:0,jobBoardAxeCritical:0,
     workBoardDockSuppressed:true,lanesDockSuppressed:true,search:true,keyboardFilter:true,axeSerious:0,axeCritical:0,privacyRedirect:true});
   await context.close();
  }
  report.status="PASS";
 }finally{await browser.close();}
 fs.writeFileSync(path.join(output,"acceptance.json"),JSON.stringify(report,null,2)+"\n");
 console.log("Q17 REAL CHROME PASS",JSON.stringify(report));
}
main().catch(e=>{console.error("Q17_REAL_CHROME_HOLD",e.stack||e);process.exitCode=1;});
