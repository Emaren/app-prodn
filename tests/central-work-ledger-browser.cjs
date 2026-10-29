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
 const sign=async uid=>new SignJWT({uid}).setProtectedHeader({alg:"HS256"}).setIssuer("aoe2hdbets").setIssuedAt().setExpirationTime("5m").sign(key);
 const admin=await sign("fixture-admin"),scout=await sign("fixture-scout"),root="/admin/central-command";
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN,args:["--no-sandbox","--disable-dev-shm-usage"]});
 const dir="work-ledger-browser";fs.mkdirSync(dir,{recursive:true});
 const receipt={sourceSha:process.env.SOURCE_SHA,buildId:fs.readFileSync(".next/BUILD_ID","utf8").trim(),production:false,screens:[]};
 const e=(id,kind,laneId,sourceUrl,sha=null,state=null)=>({id:"github:Emaren/app-prodn:"+id,kind,at:"2026-10-29T21:00:00.000Z",laneId,repo:"Emaren/app-prodn",sourceUrl,sha,state});
 const full="a".repeat(40),merged="b".repeat(40),pr="https://github.com/Emaren/app-prodn/pull/999";
 const dispatch=e("comment:99","DISPATCH_PUBLISHED","G","https://github.com/Emaren/app-prodn/issues/976#issuecomment-99");
 const opened=e("pr:999:opened","PR_OPENED","G",pr,full);
 const committed=e("commit:"+full,"SOURCE_COMMIT_OBSERVED","G","https://github.com/Emaren/app-prodn/commit/"+full,full);
 const review=e("review:3","REVIEW_SUBMITTED","G",pr+"#pullrequestreview-3",full,"APPROVED");
 const merge=e("pr:999:merge:"+merged,"MERGE_ACCEPTED","G",pr,merged,"MERGED_SOURCE_NOT_LIVE");
 const ci=e("run:3","HEAD_CI_CONCLUDED",null,"https://github.com/Emaren/app-prodn/actions/runs/3",full,"SUCCESS");
 const events=[dispatch,committed,opened,ci,review,merge];
 const lanes=["D","G","C","E","F","B"].map(id=>({id,label:"Session "+id,owner:"Session "+id,issueUrl:"https://github.com/Emaren/app-prodn/issues/976",lastEvent:id==="G"?dispatch:null,events:id==="G"?[dispatch,committed,opened,review,merge]:[],prCount:id==="G"?1:0,proof:"GITHUB_SOURCE_ONLY",agentPresence:"UNKNOWN",nativeWitness:"UNKNOWN",deployedBuildId:null}));
 const item={id:"github:Emaren/app-prodn/999",laneId:"G",repo:"Emaren/app-prodn",number:999,sourceUrl:pr,headSha:full,lastEvidenceAt:dispatch.at,
  milestones:{PR_OPENED:opened,SOURCE_COMMIT_OBSERVED:committed,HEAD_CI_CONCLUDED:ci,REVIEW_SUBMITTED:review,MERGE_ACCEPTED:merge},ci:"SUCCESS",review:"APPROVED",merge:"MERGED_SOURCE_NOT_LIVE",deployment:"UNKNOWN",sourceDepth:"BOUNDED_NOT_DURABLE"};
 const fixture={schema:"aoe2war.central-work-ledger.v1",status:"FRESH",readAt:"2026-10-29T23:00:00Z",observedAt:dispatch.at,sourceCoverage:{accepted:33,expected:33},errorCode:null,history:"BOUNDED_GITHUB_WINDOW_NOT_DURABLE",
  queueAuthority:{url:"https://github.com/Emaren/app-prodn/issues/984",eligibility:"UNKNOWN",writeAccess:false},host:{deployedBuildId:null,state:"UNKNOWN",w1:"HELD_UNVERIFIED",postW1:"SOURCE_ONLY",fundedWolo:"SEPARATE_HELD"},events,lanes,items:[item],counts:{observedEvents:events.length,observedPRs:1,observedMerges:1,successfulConcludedCI:1,sourceDepth:"BOUNDED_ONLY"}};
 try{
  const guest=await browser.newContext({baseURL:base});const p=await guest.newPage();
  for(const route of [root+"/work-board",root+"/lanes"]){
   await p.goto(route,{waitUntil:"domcontentloaded",timeout:30000});
   await p.waitForURL(u=>new URL(u).pathname!==route,{timeout:18000});
   assert.equal(await p.getByRole("heading",{name:/THE (WORK BOARD|EVIDENCE LEDGER)/}).count(),0,"guest never receives protected contents");
  }
  await guest.addCookies([{name:"aoe2hdbets_session",value:scout,url:base}]);
  for(const route of [root+"/work-board",root+"/lanes"]){
   await p.goto(route,{waitUntil:"domcontentloaded",timeout:30000});await p.waitForURL(u=>new URL(u).pathname!==route,{timeout:18000});
   assert.equal(await p.getByRole("heading",{name:/THE (WORK BOARD|EVIDENCE LEDGER)/}).count(),0);
  }
  assert.equal((await guest.request.get("/api/admin/central-command/work-ledger")).status(),403);
  await guest.clearCookies();assert.equal((await guest.request.get("/api/admin/central-command/work-ledger")).status(),401);
  await guest.close();
  for(const width of [375,768,1440]){
   const context=await browser.newContext({baseURL:base,viewport:{width,height:920},reducedMotion:"reduce",serviceWorkers:"block"});
   await context.addCookies([{name:"aoe2hdbets_session",value:admin,url:base}]);
   const checked=await context.request.get("/api/admin/central-command/work-ledger");assert.equal(checked.status(),200);assert.match(checked.headers()["cache-control"],/no-store/);
   const original=await checked.json();assert.equal(original.schema,"aoe2war.central-work-ledger.v1");assert.equal(original.host.deployedBuildId,null);
   assert.equal((await context.request.post("/api/admin/central-command/work-ledger",{data:{move:true}})).status(),405);
   const page=await context.newPage();
   await page.route("**/api/admin/central-command/work-ledger",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(fixture)}));
   for(const [slug,heading] of [["work-board","THE WORK BOARD"],["lanes","THE EVIDENCE LEDGER"]]){
    const resp=await page.goto(root+"/"+slug,{waitUntil:"domcontentloaded",timeout:30000});assert.equal(resp.status(),200);
    await page.getByRole("heading",{name:heading}).waitFor({timeout:15000});
    await page.getByText("FRESH",{exact:true}).first().waitFor({timeout:15000});
    assert.equal(await page.getByText("PRODUCTION BUILD_ID").first().count(),1);
    if(slug==="work-board"){
      assert.equal(await page.locator('section[aria-label="Source-milestone evidence columns"] > div').count(),8);
      await page.getByText("PR #999",{exact:false}).first().waitFor();
      assert.equal(await page.getByText("A return comment is not classified").count(),1);
    }else{
      assert.equal(await page.getByRole("button",{name:/Inspect core .* evidence/}).count(),6);
      await page.getByRole("button",{name:"Inspect core C evidence"}).click();
      assert.equal(await page.getByRole("button",{name:"Inspect core C evidence"}).getAttribute("aria-pressed"),"true");
      await page.getByText("No lane receipt in this bounded GitHub window.").first().waitFor({timeout:10000});
      await page.getByRole("button",{name:"Inspect core G evidence"}).click();
      await page.getByText("DISPATCH PUBLISHED").first().waitFor();
    }
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+4),slug+" overflow");
    await page.keyboard.press("Tab");assert.ok(await page.evaluate(()=>document.activeElement!==document.body));
    await page.addScriptTag({content:axe.source});
    const violations=await page.evaluate(async()=>{const x=await window.axe.run(document,{runOnly:{type:"tag",values:["wcag2a","wcag2aa","wcag21a","wcag21aa"]}});return x.violations.filter(y=>["serious","critical"].includes(y.impact)).map(y=>({id:y.id,target:y.nodes[0]?.target}))});
    assert.deepEqual(violations,[],slug+" axe");
    await page.screenshot({path:path.join(dir,slug+"-"+width+".png"),fullPage:true});
    receipt.screens.push({slug,width,authenticated:true,sourceFixture:true,axeSeriousCritical:0,pageOverflow:0,agentWake:"UNKNOWN",production:false});
   }
   await context.close();
  }
  receipt.status="PASS";fs.writeFileSync(path.join(dir,"receipt.json"),JSON.stringify(receipt,null,2)+"\n");
  console.log("Q09 A3 WORK BOARD AND LANES REAL CHROME PASS "+JSON.stringify(receipt));
 }finally{await browser.close();}
}
run().catch(e=>{console.error("Q09_A3_CHROME_FAIL",e.stack||e);process.exitCode=1;});
