#!/usr/bin/env node
"use strict";
/** REAL Chromium+axe on disposable loopback + isolated postgres fixture.
 * Never a live Mac/HEL1 signature, owner permit or site BUILD_ID witness. */
const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict");
const {createRequire}=require("node:module");
async function main(){
 const base=process.env.C_FRESHNESS_BROWSER_ORIGIN;
 assert.equal(base,"http://localhost:3137");
 assert.equal(process.env.C_FRESHNESS_FIXTURE_ALLOWED,"1");
 const chrome=process.env.CHROME_BIN,pw=process.env.PW_HOME,out=process.env.C_FRESHNESS_BROWSER_OUT;
 assert.ok(chrome&&fs.existsSync(chrome)&&pw&&out&&path.isAbsolute(out));
 const {chromium}=createRequire(__filename)(path.join(pw,"node_modules/playwright-core"));
 const axe=require(path.join(pw,"node_modules/axe-core"));
 const {SignJWT}=await import("jose");
 const key=new TextEncoder().encode("isolated-ci-not-production");
 const token=uid=>new SignJWT({uid}).setProtectedHeader({alg:"HS256"}).setIssuer("aoe2hdbets").setIssuedAt().setExpirationTime("5m").sign(key);
 const receipt={schema:"aoe2war.c-q15.chrome.v1",sourceSha:process.env.SOURCE_SHA,
  buildId:fs.readFileSync(".next/BUILD_ID","utf8").trim(),production:false,
  hostSignedCycleEvidence:false,tests:[],screenshots:[]};
 fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({executablePath:chrome,headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 try{
  const ctx=await browser.newContext({baseURL:base,serviceWorkers:"block"});
  const url="/api/admin/storage-os/freshness";
  const anon=await ctx.request.get(url);
  assert.equal(anon.status(),401);
  assert.match(anon.headers()["cache-control"]||"",/no-store/);
  receipt.tests.push("ANONYMOUS_401_NO_STORE");
  const scout=await token("fixture-scout"),admin=await token("fixture-admin");
  await ctx.addCookies([{name:"aoe2hdbets_session",value:scout,url:base,httpOnly:true,sameSite:"Lax"}]);
  const non=await ctx.request.get(url);assert.equal(non.status(),403);
  assert.match(non.headers()["cache-control"]||"",/no-store/);
  receipt.tests.push("NONADMIN_403_NO_STORE");
  await ctx.addCookies([{name:"aoe2hdbets_session",value:admin,url:base,httpOnly:true,sameSite:"Lax"}]);
  const yes=await ctx.request.get(url);
  assert.equal(yes.status(),200);assert.match(yes.headers()["cache-control"]||"",/no-store/);
  const data=await yes.json();
  assert.equal(data.schema,"aoe2war.storage-os.signed-freshness.v1");
  assert.equal(data.decision,"NOT_ADOPTED");
  assert.deepEqual(data.planes.map(p=>p.status),["UNKNOWN","UNKNOWN","UNKNOWN"]);
  assert.equal(data.macNaturalCyclesVerified,0);
  assert.equal(data.hel1NaturalCyclesVerified,0);
  assert.equal(data.bridgeAck,"UNKNOWN_NOT_IN_SIGNED_VISUAL_CONTRACT");
  const denied=await ctx.request.post(url,{data:{}});
  assert.equal(denied.status(),405);
  receipt.tests.push("ADMIN_200_UNKNOWN_NO_STORE_POST_405");
  await ctx.close();
  for(const width of [375,768,1440]){
   const context=await browser.newContext({baseURL:base,viewport:{width,height:850},serviceWorkers:"block",reducedMotion:"reduce"});
   await context.addCookies([{name:"aoe2hdbets_session",value:admin,url:base,httpOnly:true,sameSite:"Lax"}]);
   const page=await context.newPage();
   const errors=[];page.on("pageerror",e=>errors.push(e.message));
   const pageRes=await page.goto("/admin/storage-os",{waitUntil:"domcontentloaded",timeout:25000});
   assert.equal(pageRes.status(),200);
   const panel=page.locator('[data-testid="c-signed-freshness"]:visible').first();
   await panel.waitFor({state:"visible",timeout:15000});
   await panel.locator('[data-testid="c-adoption-state"]:visible').first().waitFor({timeout:10000});
   for(const id of ["mac","hel1-root","hel1-volume-105319120"]){
    const p=panel.getByTestId("c-freshness-"+id).first();await p.waitFor();
    await p.getByTestId("c-status-"+id).first().waitFor({timeout:15000});
    assert.equal((await p.getByTestId("c-status-"+id).first().textContent()).trim(),"UNKNOWN");
    await p.getByText("NO VERIFIED READING").waitFor();
   }
   assert.equal(await panel.getByText("0/2 VERIFIED").count(),2);
   assert.equal(errors.length,0,"No browser JS errors");
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+5),"No horizontal overflow");
   await page.keyboard.press("Tab");
   assert.ok(await page.evaluate(()=>document.activeElement!==document.body),"Keyboard navigable");
   await page.addScriptTag({content:axe.source});
   const serious=await page.evaluate(async()=>{
    const roots=Array.from(document.querySelectorAll('[data-testid="c-signed-freshness"]'));
    const root=roots.find(e=>e.getBoundingClientRect().height>0&&getComputedStyle(e).visibility!=="hidden");
    if(!root)throw Error("C_FRESHNESS_VISIBLE_PANEL_MISSING");
    const r=await window.axe.run(root,{runOnly:{type:"tag",values:["wcag2a","wcag2aa","wcag21a","wcag21aa"]}});
    return r.violations.filter(x=>["critical","serious"].includes(x.impact))
      .map(x=>({id:x.id,impact:x.impact,nodes:x.nodes.slice(0,5).map(n=>n.target)}));
   });
   assert.deepEqual(serious,[],"Real WCAG axe serious/critical findings");
   const shot=path.join(out,"storage-freshness-"+width+".png");
   await page.screenshot({path:shot,fullPage:false});
   receipt.screenshots.push(path.basename(shot));
   receipt.tests.push("REAL_ADMIN_CHROME_"+width+"_AXE_UNKNOWN_NOT_ADOPTED");
   if(width===375){
    await page.route("**/api/admin/storage-os/freshness",r=>r.fulfill({status:503,
      headers:{"Cache-Control":"private, no-store, max-age=0"},contentType:"application/json",body:"{}"}));
    await page.reload({waitUntil:"domcontentloaded"});
    await panel.getByRole("alert").waitFor({timeout:15000});
    await panel.getByText("UNKNOWN",{exact:true}).first().waitFor();
    assert.equal(await panel.getByText("SERVER SIGNED",{exact:true}).count(),0);
    receipt.tests.push("REAL_CHROME_HTTP_503_FAIL_CLOSED");
   }
   await context.close();
  }
  receipt.status="PASS";
 }finally{await browser.close();}
 fs.writeFileSync(path.join(out,"receipt.json"),JSON.stringify(receipt,null,2)+"\n");
 console.log(JSON.stringify(receipt));
}
main().catch(e=>{console.error("C_FRESHNESS_BROWSER_FAIL",e.stack||e);process.exitCode=1});
