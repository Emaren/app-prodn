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
   // A streamed App Router shell may expose the heading before all cards
   // commit. Wait for actual DOM count; never infer coverage from the title.
   await page.waitForFunction(() => document.querySelectorAll('#navigation-atlas a[data-atlas-href]').length === 29,
     null, {timeout:20000});
   const routeCount=await atlas.locator('a[data-atlas-href]').count();
   assert.equal(routeCount,29,"must show every source-backed private route");
   assert.equal(await atlas.getByRole("status").first().innerText(),"29 of 29 source routes · LIVE STATUS UNVERIFIED");
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
   assert.equal(await atlas.locator('a[data-atlas-href]').count(),29);
   assert.equal(await atlas.locator('a[href*="job-board"]').count(),0,"G future route must not leak");
   const box=await atlas.boundingBox();
   assert.ok(box&&box.x>=-4&&box.x+box.width<=width+8,"atlas horizontal overflow at "+width);
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
   if(width===1440){
     const tower=await page.goto("/admin/user-list",{waitUntil:"domcontentloaded",timeout:45000});
     assert.equal(tower.status(),200);
     await page.getByRole("navigation",{name:"Admin sections"}).waitFor({timeout:25000});
     const menu=page.getByRole("navigation",{name:"Admin sections"});
     assert.equal(await menu.locator("a").count(),29,"Command Tower incomplete");
     await page.getByRole("link",{name:/Navigation Atlas · All Command Links/}).first().focus();
     await page.keyboard.press("Enter");
     await page.waitForURL("**/admin/aoe2war-os#navigation-atlas",{timeout:20000});
     assert.equal(await page.locator("#navigation-atlas").count(),1);
   }
   report.results.push({width,privateAdmin200:true,adminNodes:29,search:true,keyboardFilter:true,axeSerious:0,axeCritical:0,noFutureGLink:true,privacyRedirect:true});
   await context.close();
  }
  report.status="PASS";
 }finally{await browser.close();}
 fs.writeFileSync(path.join(output,"acceptance.json"),JSON.stringify(report,null,2)+"\n");
 console.log("Q17 REAL CHROME PASS",JSON.stringify(report));
}
main().catch(e=>{console.error("Q17_REAL_CHROME_HOLD",e.stack||e);process.exitCode=1;});
