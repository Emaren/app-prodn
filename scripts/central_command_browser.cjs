#!/usr/bin/env node
"use strict";
/* True Chrome private acceptance against isolated disposable PG with two
 * synthetic JWT sessions. No production URL, credential, financial mutation. */
const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict");
const {createHash}=require("node:crypto");
const {createRequire}=require("node:module");
async function run(){
 const base=process.env.CENTRAL_BROWSER_ORIGIN;
 assert.equal(base,"http://localhost:3137","only disposable loopback");
 assert.equal(process.env.CENTRAL_BROWSER_FIXTURE_ALLOWED,"1");
 const chrome=process.env.CHROME_BIN,pw=process.env.PW_HOME,out=process.env.CENTRAL_BROWSER_OUT;
 assert.ok(chrome&&fs.existsSync(chrome)&&pw&&out&&path.isAbsolute(out));
 const build=fs.readFileSync(".next/BUILD_ID","utf8").trim();
 assert.match(build,/^[A-Za-z0-9_-]{10,128}$/);
 const {chromium}=createRequire(__filename)(path.join(pw,"node_modules/playwright-core"));
 const axe=require(path.join(pw,"node_modules/axe-core"));
 const {SignJWT}=await import("jose");
 const secret=new TextEncoder().encode("isolated-ci-not-production");
 const cookie=async(uid)=>new SignJWT({uid}).setProtectedHeader({alg:"HS256"}).setIssuer("aoe2hdbets").setIssuedAt().setExpirationTime("5m").sign(secret);
 const browser=await chromium.launch({executablePath:chrome,headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 const receipt={sourceSha:process.env.SOURCE_SHA,buildId:build,kind:"REAL_CHROME_PRIVATE_ISOLATED",
  production:false,tests:[],observedAt:new Date().toISOString()};
 fs.mkdirSync(out,{recursive:true});
 try{
  const context=await browser.newContext({baseURL:base,viewport:{width:1440,height:900},serviceWorkers:"block"});
  const anon=await context.request.get("/api/admin/central-command");assert.equal(anon.status(),401);
  assert.match(anon.headers()["cache-control"]||"",/no-store/);receipt.tests.push("ANONYMOUS_401_NO_STORE");
  const noadmin=await cookie("fixture-scout");
  await context.addCookies([{name:"aoe2hdbets_session",value:noadmin,url:base,httpOnly:true,sameSite:"Lax"}]);
  const non=await context.request.get("/api/admin/central-command");assert.equal(non.status(),403);
  assert.match(non.headers()["cache-control"]||"",/no-store/);receipt.tests.push("NONADMIN_403_NO_STORE");
  const admin=await cookie("fixture-admin");
  await context.addCookies([{name:"aoe2hdbets_session",value:admin,url:base,httpOnly:true,sameSite:"Lax"}]);
  const yes=await context.request.get("/api/admin/central-command");
  assert.equal(yes.status(),200);assert.match(yes.headers()["cache-control"]||"",/no-store/);
  const json=await yes.json();assert.equal(json.schema,"aoe2war.central-command.private.v1");
  assert.deepEqual(json.lanes.map(x=>x.id),["D","G","C","E","F","B"]);
  assert.ok(json.lanes.every(x=>x.verifiedNumerator===1&&x.denominator===6));
  assert.ok(json.lanes.every(x=>Object.entries(x.gateStates).filter(([k,v])=>k!=="ASSIGNED").every(([,v])=>v==="UNKNOWN")));
  assert.equal(json.w1.sourceSha,null);assert.equal(json.w1.buildId,null);
  // No CI HMAC keys or host observer are installed. All three source planes
  // must therefore be UNKNOWN, never green due to fresh GitHub issue clocks.
  assert.equal(json.signedStoragePulse.authority,"SIGNED_GROSS_STORAGE_OBSERVATION_ONLY_NOT_AGENT_LIVENESS");
  assert.equal(json.signedStoragePulse.ttlHours,36);
  assert.deepEqual(json.signedStoragePulse.planes.map(p=>p.id),[
    "mac","hel1-root","hel1-volume-105319120"]);
  assert.ok(json.signedStoragePulse.planes.every(p=>p.state==="UNKNOWN"&&
    p.reason==="NO_AUTHENTICATED_RECEIPT"&&p.observedAt===null));
  receipt.tests.push("NO_SIGNED_SOURCE_THREE_PLANES_UNKNOWN_NOT_AGENT_HEALTH");
  assert.doesNotMatch(JSON.stringify(json),/local_fixture_only|isolated-ci-not-production|\/Users\//);
  const post=await context.request.post("/api/admin/central-command",{data:{}});
  assert.equal(post.status(),405);receipt.tests.push("ADMIN_200_NO_STORE_AUTH_ONLY_NO_POST");
  const noAliasBody={plane:"mac",alias:"BUILD_0001",fingerprint:"a".repeat(64),sourceDigest:"b".repeat(64),
   sourceRevision:"c".repeat(40),decision:"SINGLE_CANDIDATE_APPROVAL",previousId:null};
  const originHeaders={Origin:base,"Content-Type":"application/json"};
  // No admin/session bypass and no owner action without source-owned C v2 contract.
  await context.addCookies([{name:"aoe2hdbets_session",value:noadmin,url:base,httpOnly:true,sameSite:"Lax"}]);
  const reviewNonAdmin=await context.request.post("/api/admin/storage-os/reviews",{data:noAliasBody,headers:originHeaders});
  assert.equal(reviewNonAdmin.status(),403);
  await context.addCookies([{name:"aoe2hdbets_session",value:admin,url:base,httpOnly:true,sameSite:"Lax"}]);
  await context.close();
  for(const width of [375,768,1440]){
   const c=await browser.newContext({baseURL:base,viewport:{width,height:820},serviceWorkers:"block",reducedMotion:"reduce"});
   await c.addCookies([{name:"aoe2hdbets_session",value:admin,url:base,httpOnly:true,sameSite:"Lax"}]);
   const page=await c.newPage();
   const errors=[];page.on("pageerror",e=>errors.push(e.message));
   const res=await page.goto("/admin/central-command",{waitUntil:"domcontentloaded",timeout:25000});
   assert.equal(res.status(),200);
   await page.getByRole("heading",{name:"Central Command",exact:true}).waitFor({timeout:15000});
   await page.getByRole("heading",{name:"Six-lane acceptance"}).waitFor({timeout:15000});
   const freshness=page.getByRole("region",{name:"Signed storage observation freshness"});
   await freshness.getByRole("heading",{name:"Signed source pulses · evidence freshness"}).waitFor({timeout:15000});
   await freshness.getByText("NO_AUTHENTICATED_RECEIPT").first().waitFor({timeout:15000});
   assert.equal(await freshness.getByText("UNKNOWN",{exact:true}).count(),3);
   await page.getByRole("article").first().waitFor({timeout:15000});
   assert.equal(await page.getByRole("article").count(),6);
   assert.equal(await page.getByRole("progressbar").count(),6);
   assert.equal(await page.getByRole("button",{name:"Copy handoff"}).count(),6);
   await page.keyboard.press("Tab");
   const focused=await page.evaluate(()=>document.activeElement!==document.body);
   assert.ok(focused);assert.equal(errors.length,0,"No uncaught JS errors");
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+5),"No horizontal overflow");
   await page.addScriptTag({content:axe.source});
   const violations=await page.evaluate(async()=>{const r=await window.axe.run(document,{runOnly:{type:"tag",values:["wcag2a","wcag2aa","wcag21a","wcag21aa"]}});return r.violations.filter(x=>["critical","serious"].includes(x.impact)).map(x=>({id:x.id,impact:x.impact,nodes:x.nodes.slice(0,6).map(n=>({target:n.target,summary:n.failureSummary}))}))});
   assert.deepEqual(violations,[],"No serious or critical axe findings");
   const screenshot=path.join(out,"central-command-"+width+".png");
   await page.screenshot({path:screenshot,fullPage:false});
   receipt.tests.push("AUTHENTICATED_CHROME_"+width+"_KEYBOARD_AXE");
   if(width===375){
    await page.route("**/api/admin/central-command",route=>route.fulfill({status:503,contentType:"application/json",body:"{}"}));
    await page.getByRole("button",{name:"Refresh"}).click();
    await page.getByText("No accepted live source").waitFor({timeout:12000});
    assert.equal(await page.getByRole("article").count(),0,"No stale success on loss");
    receipt.tests.push("HOST_LOSS_STALE_DATA_CLEARED");
   }
   if(width===375){
    // Actual private Storage UI must disclose source contract limit and show
    // no individual approval control, even while gross dashboard is available.
    const storageRes=await page.goto("/admin/storage-os",{waitUntil:"domcontentloaded",timeout:25000});
    assert.equal(storageRes.status(),200);
    await page.locator('section[aria-label="L1 to L5 storage governance"]:visible p[role="status"]:visible').filter({hasText:"INDIVIDUAL OWNER REVIEW UNAVAILABLE"}).first().waitFor({state:"visible",timeout:15000});
    assert.equal(await page.getByRole("button",{name:"Record this exact decision"}).count(),0);
    // A real page-origin browser fetch supplies its own Origin/Sec-Fetch-Site;
    // direct APIRequestContext doesn't establish browser CSRF provenance.
    const blocked=await page.evaluate(async body=>{
      const res=await fetch("/api/admin/storage-os/reviews",{
        method:"POST",credentials:"same-origin",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify(body)
      });
      return {status:res.status,cache:res.headers.get("cache-control"),detail:(await res.json()).detail};
    },noAliasBody);
    assert.deepEqual(blocked,{status:409,cache:"private, no-store, max-age=0",detail:"REVIEW_SOURCE_TRANSPORT_UNAVAILABLE"},
      "Authenticated same-origin browser POST must fail-closed on unadopted source transport");
    receipt.tests.push("STORAGE_OWNER_REAL_BROWSER_403_409_NO_STORE");
    await page.screenshot({path:path.join(out,"storage-owner-no-candidates-375.png"),fullPage:false});
    receipt.tests.push("STORAGE_OWNER_CHROME_375_C_V1_UNKNOWN_NO_APPROVAL");
   }
   await c.close();
  }
  receipt.status="PASS";
 }finally{await browser.close();}
 fs.writeFileSync(path.join(out,"receipt.json"),JSON.stringify(receipt,null,2)+"\n");
 console.log(JSON.stringify(receipt));
}
run().catch(e=>{console.error("CENTRAL_PRIVATE_BROWSER_FAIL",e.stack||e);process.exitCode=1});
