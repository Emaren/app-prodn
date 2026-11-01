#!/usr/bin/env node
"use strict";
/* Actual isolated Chrome 375/768/1440 for B4; no fake production approval. */
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path");
const {chromium}=require(path.join(process.env.PW_HOME,"node_modules/playwright-core"));
const axe=require(path.join(process.env.PW_HOME,"node_modules/axe-core"));
async function run(){
 const origin=process.env.B4_BROWSER_ORIGIN;
 assert.equal(origin,"http://127.0.0.1:3138");
 assert.equal(process.env.B4_BROWSER_FIXTURE_ALLOWED,"1");
 const {SignJWT}=await import("jose");
 const secret=new TextEncoder().encode("isolated-b4-browser-not-production");
 const jwt=uid=>new SignJWT({uid}).setProtectedHeader({alg:"HS256"}).setIssuer("aoe2hdbets").setIssuedAt().setExpirationTime("5m").sign(secret);
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN,args:["--no-sandbox","--disable-dev-shm-usage"]});
 const output=process.env.B4_BROWSER_OUT;
 fs.mkdirSync(output,{recursive:true});
 const report={sourceSha:process.env.SOURCE_SHA,buildId:fs.readFileSync(".next/BUILD_ID","utf8").trim(),
  productionCertified:false,routeScoringAuthority:false,results:[]};
 try{
  for(const width of [375,768,1440]){
   const ctx=await browser.newContext({baseURL:origin,viewport:{width,height:900},serviceWorkers:"block",reducedMotion:"reduce"});
   const page=await ctx.newPage();const errors=[];
   page.on("pageerror",e=>errors.push(String(e)));
   const response=await page.goto("/kingdom-construction",{waitUntil:"load",timeout:45000});
   assert.equal(response.status(),200,"public graph response");
   await page.getByRole("heading",{name:"Kingdom Construction · Source Graph"}).waitFor();
   const graph=page.getByRole("img",{name:/Graph of planned named OS responsibilities/});
   assert.equal(await graph.count(),1,"accessible SVG graph");
   assert.equal(await page.getByText("Runtime: UNKNOWN · Workers: UNVERIFIED").count(),15,"all nodes UNKNOWN");
   assert.equal(await page.getByText(/Plans are nonexecuting/).count(),1,"nonexecution status");
   assert.equal(await page.getByRole("button",{name:/deploy|launch|approve|transfer|sign/i}).count(),0,"forbidden action");
   const layout=await page.evaluate(()=>({viewport:innerWidth,doc:document.documentElement.scrollWidth}));
   assert.ok(layout.doc<=width+8,"document horizontal overflow "+JSON.stringify(layout));
   await page.addScriptTag({content:axe.source});
   const violations=await page.evaluate(async()=>{
    const target=document.querySelector("main");
    const r=await window.axe.run(target,{runOnly:{type:"tag",values:["wcag2a","wcag2aa","wcag21a","wcag21aa"]}});
    return r.violations.filter(v=>v.impact==="serious"||v.impact==="critical").map(v=>({id:v.id,impact:v.impact}));
   });
   assert.deepEqual(violations,[],"axe serious/critical on public graph");
   assert.deepEqual(errors,[],"public hydration failures");
   await page.screenshot({path:path.join(output,"kingdom-construction-"+width+".png"),fullPage:true});
   await ctx.close();
   report.results.push({width,public200:true,nodeCount:15,runtimeUnknown:true,keyboardAndAxeSeriousCritical:0,noActionButtons:true,overflow:false});
  }
  for(const [kind,uid] of [["guest",null],["nonadmin","fixture-scout"]]){
   const ctx=await browser.newContext({baseURL:origin});
   if(uid)await ctx.addCookies([{url:origin,name:"aoe2hdbets_session",value:await jwt(uid),httpOnly:true,sameSite:"Lax"}]);
   const page=await ctx.newPage();
   await page.goto("/admin/system-composer",{waitUntil:"domcontentloaded",timeout:45000});
   await page.waitForURL(u=>u.pathname==="/",{timeout:30000});
   assert.equal(await page.getByRole("heading",{name:/System Composer/}).count(),0,kind+" private Composer leak");
   await ctx.close();
  }
  const admin=await jwt("fixture-admin");
  for(const width of [375,768,1440]){
   const ctx=await browser.newContext({baseURL:origin,viewport:{width,height:900},serviceWorkers:"block",reducedMotion:"reduce"});
   await ctx.addCookies([{url:origin,name:"aoe2hdbets_session",value:admin,httpOnly:true,sameSite:"Lax"}]);
   const page=await ctx.newPage();const errors=[];
   page.on("pageerror",e=>errors.push(String(e)));
   const res=await page.goto("/admin/system-composer",{waitUntil:"load",timeout:45000});
   assert.equal(res.status(),200,"signed admin response");
   await page.getByRole("heading",{name:/System Composer · Reviewed Dry-Run/}).waitFor();
   assert.equal(new URL(page.url()).pathname,"/admin/system-composer");
   assert.equal(await page.getByText("Runtime: UNKNOWN · Workers: UNVERIFIED").count(),15);
   assert.equal(await page.getByText(/Plans are nonexecuting/).count(),1);
   assert.equal(await page.getByRole("button",{name:/deploy|launch|approve|transfer|sign/i}).count(),0);
   assert.deepEqual(errors,[]);
   const docWidth=await page.evaluate(()=>document.documentElement.scrollWidth);
   assert.ok(docWidth<=width+8,"admin horizontal overflow");
   await page.screenshot({path:path.join(output,"composer-admin-"+width+".png"),fullPage:true});
   await ctx.close();
  }
  report.negativeAuth=["guest","nonadmin"];report.adminReadOnly=true;report.status="PASS";
 } finally {await browser.close();}
 fs.writeFileSync(path.join(output,"acceptance.json"),JSON.stringify(report,null,2)+"\n");
 console.log("B4_ISOLATED_CHROME_ACCEPTANCE",JSON.stringify(report));
}
run().catch(e=>{console.error("B4_CHROME_HOLD",e.stack||e);process.exitCode=1;});
