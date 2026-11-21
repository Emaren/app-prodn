#!/usr/bin/env node
"use strict";
/* True isolated admin Chrome. NEVER mock Mac provenance, host adoption or signed data. */
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path");
const {createRequire}=require("node:module");
async function main(){
 const origin=process.env.STORAGE_BROWSER_ORIGIN;
 assert.equal(origin,"http://127.0.0.1:3137");
 assert.equal(process.env.STORAGE_BROWSER_FIXTURE_ALLOWED,"1");
 const output=process.env.STORAGE_BROWSER_OUT,home=process.env.PW_HOME,chrome=process.env.CHROME_BIN;
 assert.ok(output&&path.isAbsolute(output)&&home&&chrome&&fs.existsSync(chrome));
 const {chromium}=createRequire(__filename)(path.join(home,"node_modules/playwright-core"));
 const axe=require(path.join(home,"node_modules/axe-core"));
 const {SignJWT}=await import("jose");
 const secret=new TextEncoder().encode("isolated-storage-ci-not-production");
 const jwt=uid=>new SignJWT({uid}).setProtectedHeader({alg:"HS256"}).setIssuer("aoe2hdbets")
   .setIssuedAt().setExpirationTime("5m").sign(secret);
 const browser=await chromium.launch({headless:true,executablePath:chrome,args:["--no-sandbox","--disable-dev-shm-usage"]});
 const report={sourceSha:process.env.SOURCE_SHA,buildId:fs.readFileSync(".next/BUILD_ID","utf8").trim(),
   productionCertified:false,macHostAdopted:false,signedItemFeedProven:false,results:[]};
 fs.mkdirSync(output,{recursive:true});
 try{
   for(const [role,token] of [["guest",null],["nonadmin",await jwt("fixture-scout")]]){
     const ctx=await browser.newContext({baseURL:origin,serviceWorkers:"block"});
     if(token)await ctx.addCookies([{name:"aoe2hdbets_session",value:token,url:origin,httpOnly:true,sameSite:"Lax"}]);
     const page=await ctx.newPage();
     await page.goto("/admin/storage-os",{waitUntil:"domcontentloaded",timeout:45000});
     await page.waitForURL(url=>url.pathname==="/",{timeout:30000});
     assert.equal(await page.getByText("L2 OWNER PREVIEW").count(),0,role+" saw private storage review");
     await page.goto("/admin/storage-os/explorer",{waitUntil:"domcontentloaded",timeout:45000});
     await page.waitForURL(url=>url.pathname==="/",{timeout:30000});
     assert.equal(await page.getByRole("heading",{name:/Storage Explorer/}).count(),0,role+" saw private explorer");
     await ctx.close();
   }
   const admin=await jwt("fixture-admin");
   for(const width of [375,768,1440]){
     const ctx=await browser.newContext({baseURL:origin,viewport:{width,height:900},reducedMotion:"reduce",serviceWorkers:"block"});
     await ctx.addCookies([{name:"aoe2hdbets_session",value:admin,url:origin,httpOnly:true,sameSite:"Lax"}]);
     const page=await ctx.newPage(),errors=[];
     page.on("pageerror",e=>errors.push(String(e)));
     const response=await page.goto("/admin/storage-os",{waitUntil:"domcontentloaded",timeout:45000});
     assert.equal(response.status(),200);
     // Next App Router may transiently stream duplicate hidden server shells.
     // Require an actually visible, hydrated private panel, never just text in HTML.
     await page.waitForLoadState("load",{timeout:30000});
     const pane=page.locator('section[aria-label="L2 owner preview"]:visible').first();
     await pane.waitFor({state:"visible",timeout:30000});
     assert.equal(new URL(page.url()).pathname,"/admin/storage-os","admin redirected away from private Storage OS");
     assert.equal(await pane.getByText("L2 OWNER PREVIEW",{exact:true}).count(),1);
     assert.equal(await pane.getByText("LOCAL SESSION ONLY").count(),1);
     assert.equal(await pane.getByText(/NO INDIVIDUAL FILE IDENTITIES/).count(),1);
     assert.equal(await pane.getByText(/UNIQUE APFS RECOVERY: UNKNOWN/).count(),1);
     assert.equal(await pane.getByText(/L5 NEVER DELETE/).count(),1);
     // No signed Mac publisher is installed in CI; never create a fake authenticated hog.
     await pane.getByText(/NO CURRENT SIGNED L2 CATEGORIES/).waitFor({timeout:15000});
     assert.equal(await pane.getByRole("button",{name:/SELECT FOR PREVIEW/}).count(),0);
     assert.equal(await pane.getByRole("button",{name:/Delete|Approve|Apply/i}).count(),0);
     const bounds=await page.evaluate(()=>({viewport:innerWidth,documentWidth:document.documentElement.scrollWidth}));
     assert.ok(bounds.documentWidth<=width+4,"Storage OS horizontal overflow: "+JSON.stringify(bounds));
     await page.addScriptTag({content:axe.source});
     const violations=await page.evaluate(async()=>{
       const el=document.querySelector('section[aria-label="L2 owner preview"]');
       const r=await window.axe.run(el,{runOnly:{type:"tag",values:["wcag2a","wcag2aa","wcag21a","wcag21aa"]}});
       return r.violations.filter(v=>["serious","critical"].includes(v.impact)).map(v=>({id:v.id,impact:v.impact}));
     });
     assert.deepEqual(violations,[],"L2 owner preview serious/critical axe at "+width);
     assert.deepEqual(errors,[],"uncaught Storage OS errors at "+width);
     await page.screenshot({path:path.join(output,"storage-os-l2-"+width+".png"),fullPage:true});
     // Genuine page acceptance for the new radial Explorer (not just L2 preview).
     const explorerResponse=await page.goto("/admin/storage-os/explorer",{waitUntil:"domcontentloaded",timeout:45000});
     assert.equal(explorerResponse.status(),200);
     await page.waitForLoadState("load",{timeout:30000});
     const explorer=page.locator('main:visible').first();
     await explorer.getByRole("heading",{name:/Storage Explorer/}).waitFor({state:"visible",timeout:30000});
     const cards=explorer.locator('section[aria-label="Four independently verified storage planes"]');
     assert.equal(await cards.getByRole("button").count(),4,"three source planes plus gated Intel vault");
     for(const name of [/M1.*Development Mac/,/HEL1.*Root/,/HEL1.*Data volume/,/Intel.*Cold vault/]){
       assert.equal(await cards.getByRole("button",{name}).count(),1,"missing storage drive "+name);
     }
     await cards.getByRole("button",{name:/Intel.*Cold vault/}).click();
     await explorer.getByText(/No current verified Intel tenant inventory/).waitFor({state:"visible",timeout:15000});
     assert.equal(await explorer.getByText(/Intel classification and automated cleanup: HOLD/).count(),1);
     assert.equal(await explorer.getByText(/Signed free space is not signed used space/).count(),1);
     await cards.getByRole("button",{name:/M1.*Development Mac/}).click();
     await explorer.getByText(/No current signed hog inventory for this drive/).waitFor({state:"visible",timeout:15000});
     assert.equal(await explorer.getByText("Category inventory unknown",{exact:true}).count(),3);
     await explorer.getByRole("button",{name:/HEL1 · Data volume/}).click();
     await explorer.getByText("HEL1 / Data volume 105319120",{exact:true}).first().waitFor({state:"visible"});
     assert.equal(await explorer.getByText(/UUID.verified/i).count(),0);
     assert.equal(await explorer.getByRole("button",{name:/Record classification/i}).isDisabled(),true);
     assert.equal(await explorer.getByText(/Individual file coverage: NOT ADMITTED/).count(),1);
     assert.equal(await explorer.getByText(/No automated deletes/).count(),1);
     assert.equal(await explorer.getByText(/L5.*Never delete/).count(),1);
     const expBounds=await page.evaluate(()=>({viewport:innerWidth,documentWidth:document.documentElement.scrollWidth}));
     assert.ok(expBounds.documentWidth<=width+4,"Explorer horizontal overflow: "+JSON.stringify(expBounds));
     await page.addScriptTag({content:axe.source});
     const explorerViolations=await page.evaluate(async()=>{
       const el=document.querySelector('main');
       const r=await window.axe.run(el,{runOnly:{type:"tag",values:["wcag2a","wcag2aa","wcag21a","wcag21aa"]}});
       return r.violations.filter(v=>["serious","critical"].includes(v.impact)).map(v=>({
         id:v.id,impact:v.impact,nodes:v.nodes.slice(0,8).map(n=>({target:n.target,checks:n.any.map(a=>a.message).slice(0,2)}))
       }));
     });
     assert.deepEqual(explorerViolations,[],"Explorer serious/critical axe at "+width);
     assert.deepEqual(errors,[],"uncaught Explorer page errors at "+width);
     await page.screenshot({path:path.join(output,"storage-explorer-"+width+".png"),fullPage:true});
     report.results.push({width,adminAuthorized:true,guestDenied:true,nonadminDenied:true,
       noPhysicalMacEvidenceInvented:true,selectionBlockedWithoutSource:true,axeSeriousCritical:0,
       explorerRendered:true,explorerDriveCards:3,explorerUnverifiedCategoriesWithheld:true,
       explorerRecordDisabled:true,explorerAxeSeriousCritical:0,horizontalOverflow:false});
     await ctx.close();
   }
   report.status="PASS";
 }finally{await browser.close();}
 fs.writeFileSync(path.join(output,"acceptance.json"),JSON.stringify(report,null,2)+"\n");
 console.log("STORAGE_L2_REAL_CHROME",JSON.stringify(report));
}
main().catch(e=>{console.error("STORAGE_L2_REAL_CHROME_HOLD",e.stack||e);process.exitCode=1;});
