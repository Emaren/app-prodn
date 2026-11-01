#!/usr/bin/env node
"use strict";
/* R25 B3 genuine local Chrome, signed fixture, no real native/storage authority. */
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {chromium}=require(path.join(process.env.PW_HOME,"node_modules/playwright-core"));
const axe=require(path.join(process.env.PW_HOME,"node_modules/axe-core"));
const routes=[
 {path:"/admin/backup-os",heading:"Backup OS · Evidence",unknown:"Certified restores: UNKNOWN"},
 {path:"/admin/documents-os",heading:"Documents OS · Source Registry",unknown:"NOT a live external-docs-sync"},
 {path:"/admin/code-health",heading:"Code Health · Evidence",unknown:"Code Health scanner evidence"},
 {path:"/admin/storage-transfer",heading:"Storage Transfer · Evidence",unknown:"Transfer execution: NOT ENABLED"}
];
async function main(){
 const origin=process.env.B3_BROWSER_ORIGIN;
 assert.equal(origin,"http://127.0.0.1:3139");
 assert.equal(process.env.B3_BROWSER_FIXTURE_ALLOWED,"1");
 const {SignJWT}=await import("jose");
 const secret=new TextEncoder().encode("isolated-b3-browser-not-production");
 const token=uid=>new SignJWT({uid}).setProtectedHeader({alg:"HS256"}).setIssuer("aoe2hdbets").setIssuedAt().setExpirationTime("5m").sign(secret);
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN,args:["--no-sandbox","--disable-dev-shm-usage"]});
 const output=process.env.B3_BROWSER_OUT;fs.mkdirSync(output,{recursive:true});
 const report={sourceSha:process.env.SOURCE_SHA,buildId:fs.readFileSync(".next/BUILD_ID","utf8").trim(),productionCertified:false,restoresCertified:false,scannerCertified:false,transfersAuthorized:false,results:[]};
 try{
  for(const {path:route,heading} of routes)for(const [role,uid] of [["guest",null],["nonadmin","fixture-scout"]]){
   const ctx=await browser.newContext({baseURL:origin,serviceWorkers:"block"});
   if(uid)await ctx.addCookies([{url:origin,name:"aoe2hdbets_session",value:await token(uid),httpOnly:true,sameSite:"Lax"}]);
   const page=await ctx.newPage();
   await page.goto(route,{waitUntil:"domcontentloaded",timeout:45000});
   await page.waitForURL(u=>u.pathname==="/",{timeout:30000});
   assert.equal(await page.getByRole("heading",{name:heading,exact:true}).count(),0,role+" leaked "+route);
   await ctx.close();
  }
  const admin=await token("fixture-admin");
  for(const width of [375,768,1440])for(const {path:route,heading,unknown} of routes){
   const ctx=await browser.newContext({baseURL:origin,viewport:{width,height:900},serviceWorkers:"block",reducedMotion:"reduce"});
   await ctx.addCookies([{url:origin,name:"aoe2hdbets_session",value:admin,httpOnly:true,sameSite:"Lax"}]);
   const page=await ctx.newPage();const errors=[],adminMethods=[];
   page.on("pageerror",e=>errors.push(String(e)));
   page.on("request",req=>{if(new URL(req.url()).pathname.startsWith("/api/admin/"))adminMethods.push(req.method());});
   const res=await page.goto(route,{waitUntil:"domcontentloaded",timeout:45000});
   assert.equal(res.status(),200,"authenticated "+route);
   await page.getByRole("heading",{name:heading,exact:true}).waitFor({timeout:30000});
   assert.equal(new URL(page.url()).pathname,route);
   const main=page.locator("main").last();const visible=await main.innerText();
   if(route==="/admin/documents-os")assert.match(visible,/NOT a live external-docs-sync|NOT a live external-docs/, "DocsV2 is static");
   else assert.ok(visible.includes(unknown),"missing fail-closed status "+route);
   assert.ok(adminMethods.every(m=>m==="GET"),"non-GET admin request: "+adminMethods);
   assert.equal(await main.getByRole("button",{name:/deploy|transfer now|delete|approve release|sign transaction/i}).count(),0);
   const span=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
   assert.ok(span<=8,"horizontal overflow "+route+" width "+width+" "+span);
   await page.addScriptTag({content:axe.source});
   const violations=await page.evaluate(async()=>{
    const node=document.querySelector("main");const res=await window.axe.run(node,{runOnly:{type:"tag",values:["wcag2a","wcag2aa","wcag21a","wcag21aa"]}});
    return res.violations.filter(v=>["serious","critical"].includes(v.impact)).map(v=>({id:v.id,impact:v.impact}));
   });
   assert.deepEqual(violations,[],"axe severe "+route+" width "+width);
   assert.deepEqual(errors,[],"browser hydration "+route+" "+width);
   await page.screenshot({path:path.join(output,route.split("/").pop()+"-"+width+".png"),fullPage:true});
   report.results.push({route,width,guestDenied:true,nonadminDenied:true,signedAdmin:true,adminRequestMethods:adminMethods,readOnly:true,unknownNotRecastAsPass:true,axeSevere:0});
   await ctx.close();
  }
  report.status="PASS";
 } finally {await browser.close();}
 fs.writeFileSync(path.join(output,"acceptance.json"),JSON.stringify(report,null,2)+"\n");
 console.log("B3_REAL_CHROME_ACCEPTANCE",JSON.stringify(report));
}
main().catch(e=>{console.error("B3_BROWSER_HOLD",e.stack||e);process.exitCode=1;});
