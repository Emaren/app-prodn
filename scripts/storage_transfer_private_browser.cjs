#!/usr/bin/env node
"use strict";
/* Genuine Chrome/axe acceptance in disposable localhost PG only.
 * Synthetic fixture identities are NEVER production login evidence.
 */
const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict");
const {createRequire}=require("node:module");
async function main(){
 const origin=process.env.STORAGE_TRANSFER_CHROME_ORIGIN;
 assert.equal(origin,"http://localhost:3137","ISOLATED_LOOPBACK_ONLY");
 assert.equal(process.env.STORAGE_TRANSFER_FIXTURE_ALLOWED,"1");
 assert.equal(process.env.AOE2WAR_PROD_DB_PREVIEW,"false");
 const pw=process.env.PW_HOME, chrome=process.env.CHROME_BIN, out=process.env.STORAGE_TRANSFER_BROWSER_OUT;
 assert.ok(pw&&chrome&&out&&path.isAbsolute(out)&&fs.existsSync(chrome),"Pinned Chrome + output required");
 const {chromium}=createRequire(__filename)(path.join(pw,"node_modules/playwright-core"));
 const axe=require(path.join(pw,"node_modules/axe-core"));
 const {SignJWT}=await import("jose");
 const secret=new TextEncoder().encode("isolated-ci-not-production");
 const session=async uid=>new SignJWT({uid}).setProtectedHeader({alg:"HS256"}).setIssuer("aoe2hdbets").setIssuedAt().setExpirationTime("5m").sign(secret);
 const browser=await chromium.launch({executablePath:chrome,headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 const receipt={schema:"aoe2war.storage-transfer.chrome.isolated.v1",
  source_sha:process.env.SOURCE_SHA||null,origin,build_id:fs.readFileSync(".next/BUILD_ID","utf8").trim(),
  fixture:true,production:false,admin_auth:[],viewports:[],status:"HOLD",observed_at:new Date().toISOString()};
 fs.mkdirSync(out,{recursive:true});
 try{
  for(const [role,cookie,expected] of [
   ["anonymous",null,401],["nonadmin",await session("fixture-scout"),403],
   ["admin",await session("fixture-admin"),200]]){
    const ctx=await browser.newContext({baseURL:origin,serviceWorkers:"block"});
    try{
     if(cookie)await ctx.addCookies([{name:"aoe2hdbets_session",value:cookie,url:origin,httpOnly:true,sameSite:"Lax"}]);
     const res=await ctx.request.get("/api/admin/storage-transfer",{timeout:15000});
     assert.equal(res.status(),expected,role+" requires exact status");
     assert.match(res.headers()["cache-control"]||"",/no-store/,role+" cache control");
     if(role==="admin"){
      const body=await res.json();
      assert.equal(body.schema,"aoe2war.storage-transfer.control-room.v1");
      assert.equal(body.transferReceipt,null,"uninstalled C/Intel producer MUST NOT invent transfer");
      assert.equal(body.storage.schema,"aoe2war.private-storage-command-center.v1");
      const post=await ctx.request.post("/api/admin/storage-transfer",{data:{delete:true}});
      assert.equal(post.status(),405,"no transfer/delete action route");
     }
     receipt.admin_auth.push({role,status:res.status(),no_store:true,verdict:"PASS"});
    }finally{await ctx.close()}
  }
  const admin=await session("fixture-admin");
  for(const width of [375,768,1440]){
   const ctx=await browser.newContext({baseURL:origin,viewport:{width,height:840},
     serviceWorkers:"block",reducedMotion:"reduce"});
   await ctx.addCookies([{name:"aoe2hdbets_session",value:admin,url:origin,httpOnly:true,sameSite:"Lax"}]);
   const page=await ctx.newPage();
   const errors=[];page.on("pageerror",e=>errors.push(e.message));
   try{
    await page.route("**/*",async route=>{
     const url=new URL(route.request().url());
     if(url.origin!==origin||!["GET","HEAD"].includes(route.request().method()))return route.abort();
     return route.continue();
    });
    const response=await page.goto("/admin/storage-transfer",{waitUntil:"domcontentloaded",timeout:30000});
    assert.equal(response.status(),200,"real admin private page");
    await page.getByRole("heading",{name:/STORAGE TRANSFER/i}).first().waitFor({timeout:15000});
    await page.getByRole("region",{name:"Storage transfer host topology"}).waitFor({timeout:12000});
    await page.getByRole("region",{name:"Transfer mission control"}).waitFor({timeout:12000});
    await page.getByRole("region",{name:"Signed cargo manifests"}).waitFor({timeout:12000});
    await page.getByText("Awaiting authenticated sender and Intel receipts",{exact:false}).first().waitFor({timeout:12000});
    assert.equal(await page.getByRole("progressbar").count(),0,"unsigned source has no numeric progress");
    const body=await page.locator("body").innerText();
    assert.doesNotMatch(body,/\/Users\/|\/home\/tony\/|age1[0-9a-z]{20,}|PRIVATE_KEY|BEGIN PRIVATE KEY/);
    const nav=page.getByRole("link",{name:"WAROS",exact:true});
    await nav.waitFor({timeout:10000});
    assert.match(await nav.getAttribute("href"),/\/admin\/aoe2war-os/);
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(()=>document.activeElement!==document.body),true,"keyboard focus");
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+5),true,"no horizontal overflow");
    await page.addScriptTag({content:axe.source});
    const violations=await page.evaluate(async()=>{
      const r=await window.axe.run(document,{runOnly:{type:"tag",values:["wcag2a","wcag2aa","wcag21a","wcag21aa"]}});
      return r.violations.filter(v=>v.impact==="critical"||v.impact==="serious")
        .map(v=>({id:v.id,impact:v.impact,target:v.nodes.slice(0,3).map(n=>n.target)}));
    });
    assert.deepEqual(violations,[],"axe serious/critical");
    assert.deepEqual(errors,[],"uncaught runtime errors");
    await page.screenshot({path:path.join(out,"storage-transfer-"+width+".png"),fullPage:false});
    receipt.viewports.push({width,real_chrome:true,admin_auth_fixture:true,empty_receipt_honest:true,
      no_overflow:true,axe_violations:0,js_errors:0,verdict:"PASS"});
   }finally{await ctx.close()}
  }
  assert.equal(receipt.viewports.length,3);
  receipt.status="PASS";
 }finally{
  await browser.close();
  fs.writeFileSync(path.join(out,"receipt.json"),JSON.stringify(receipt,null,2)+"\n");
 }
 console.log(JSON.stringify(receipt));
}
main().catch(e=>{console.error("STORAGE_TRANSFER_CHROME_HOLD",e.stack||e);process.exitCode=1});
