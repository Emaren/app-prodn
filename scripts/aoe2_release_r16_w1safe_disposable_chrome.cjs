#!/usr/bin/env node
"use strict";
/* R16 disposable-PG W1_SAFE browser review, NOT HEL1 or production certification.
 * Mount only the locally built candidate. Never navigate a live finance-capable
 * pre-W1 host or send mutating requests. Fail closed on missing identity.
 */
const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");
const { URL } = require("node:url");
const { execFileSync } = require("node:child_process");

function hold(message) { throw new Error("W1SAFE_CHROME_HOLD:" + message); }
const base = process.env.BROWSER_BASE_URL;
const home = process.env.PW_HOME;
const chrome = process.env.CHROME_BIN;
const buildFile = path.resolve(".next/BUILD_ID");
const expected = process.env.W1SAFE_CANDIDATE_BUILD_ID;
const outDir = path.resolve("renaissance-88-chrome/w1safe-r16");
if (base !== "http://127.0.0.1:3137") hold("DISPOSABLE_LOCAL_ORIGIN_REQUIRED");
if (!home || !path.isAbsolute(home) || !chrome || !path.isAbsolute(chrome)) hold("REVIEWED_CHROME_PATH_REQUIRED");
if (!expected || !/^[A-Za-z0-9_-]{10,128}$/.test(expected)) hold("MISSING_EXPECTED_BUILD_ID");
if (!fs.existsSync(buildFile) || fs.lstatSync(buildFile).isSymbolicLink() ||
    fs.readFileSync(buildFile, "utf8").trim() !== expected) hold("REAL_BUILT_ARTIFACT_ID_DRIFT");
const requirePw = createRequire(path.join(home, "package.json"));
const { chromium } = requirePw("playwright-core");
const axe = requirePw("axe-core");
const routes = ["/", "/lobby", "/bets", "/live-games", "/war-chest"];
const api = ["/api/lobby", "/api/bets", "/api/live-games", "/api/header-summary"];
const widths = [375, 768, 1440];
// R18: retain bounded redacted request provenance for B/F to classify.
// NEVER save cookies, tokens, headers, request bodies, query strings or fragments.
const where = raw => {
  try { const u=new URL(raw); return {origin:u.origin,pathname:u.pathname.slice(0,240)}; }
  catch { return {origin:"UNMEASURED",pathname:"UNMEASURED"}; }
};
const requestKey = (method,url) => method+"\\0"+url;
const cdpsafe = initiator => ({
  type:String(initiator?.type||"UNMEASURED").slice(0,48),
  frames:(initiator?.stack?.callFrames||[]).slice(0,4).map(f=>({
    script:where(f.url||""),
    function:String(f.functionName||"").slice(0,80),
    line:Number.isSafeInteger(f.lineNumber)?f.lineNumber:null,
    column:Number.isSafeInteger(f.columnNumber)?f.columnNumber:null,
  })),
});
// The only two background POST targets accepted as *blocked fixture attempts*.
// Every POST still returns route.abort(); no POST reaches even the disposable app.
// These are the exact immutable nonfinancial route + in-memory presence hub blobs
// independently inspected at F website #1061. An edited route/destination HOLDS.
const backgroundSourceBlobs = Object.freeze({
  "app/api/speed/sample/route.ts":"6c4a24250d12dc51a8fb8d9643eb69a1f8292776",
  "app/api/kingdom-presence/anonymous-state/route.ts":"5523f0f98107c6d04bfd40b1a2cdd21aa1709906",
  "lib/livingKingdom/hub.ts":"afb0bbcd9dd2ddc19281c807d23ff79871935a16",
});
function assertBackgroundSourceIdentity() {
  for (const [p,blob] of Object.entries(backgroundSourceBlobs)) {
    if (!fs.existsSync(p) || fs.lstatSync(p).isSymbolicLink()) hold("BACKGROUND_ROUTE_MISSING_OR_SYMLINK:"+p);
    let committed,working;
    try {
      committed=execFileSync("git",["rev-parse","HEAD:"+p],{encoding:"utf8",timeout:5000}).trim();
      working=execFileSync("git",["hash-object","--",p],{encoding:"utf8",timeout:5000}).trim();
    } catch {hold("BACKGROUND_ROUTE_HASH_UNMEASURED:"+p);}
    if (committed!==blob || working!==blob) hold("BACKGROUND_ROUTE_SOURCE_DRIFT:"+p);
  }
}
assertBackgroundSourceIdentity();

const backgroundRules = Object.freeze({
  "/api/speed/sample":{count:2,initiatorPrefix:"/_next/static/chunks/app/layout-"},
  "/api/kingdom-presence/anonymous-state":{count:1,initiatorPrefix:"/_next/static/chunks/"},
});
const foreignFixtureScripts = Object.freeze({
  "https://plausible.io":"/js/script.js",
  "https://traffic.tokentap.ca":"/api/beacon.js",
});
function classifyBlockedFixture(pagePath,blocked) {
  const counts={"/api/speed/sample":0,"/api/kingdom-presence/anonymous-state":0};
  const unknown=[];
  const foreignCounts={"https://plausible.io":0,"https://traffic.tokentap.ca":0};
  for(const request of blocked) {
    const target=request.location;
    const frame=request.frame;
    const stack=request.initiator;
    if (request.reason==="NON_READ_METHOD" && request.method==="POST" &&
        target.origin===base && Object.hasOwn(backgroundRules,target.pathname) &&
        request.resource_type==="fetch" && frame.origin===base &&
        frame.pathname===pagePath && stack.type==="script" &&
        stack.frames.some(f=>f.script.origin===base &&
          f.script.pathname.startsWith(backgroundRules[target.pathname].initiatorPrefix))) {
      counts[target.pathname]++;
      request.fixture_class="BLOCKED_SOURCE_BOUND_BACKGROUND_POST_NOT_DISPATCHED";
      continue;
    }
    if(request.reason==="FOREIGN_ORIGIN" && request.method==="GET" &&
       Object.hasOwn(foreignFixtureScripts,target.origin) &&
       target.pathname===foreignFixtureScripts[target.origin] &&
       request.resource_type==="script" && frame.origin===base &&
       frame.pathname===pagePath && stack.type==="script") {
      foreignCounts[target.origin]++;
      request.fixture_class="BLOCKED_KNOWN_FOREIGN_GET_NOT_DISPATCHED";
      continue;
    }
    request.fixture_class="UNKNOWN_BLOCKED_REQUEST_HOLD";
    unknown.push({method:request.method,location:target,reason:request.reason});
  }
  const pass=unknown.length===0 &&
    Object.entries(backgroundRules).every(([p,rule])=>counts[p]===rule.count) &&
    Object.values(foreignCounts).every(n=>n===1);
  return {
    verdict:pass?"PASS_BLOCKED_BACKGROUND_ONLY":"HOLD",
    source_blobs:backgroundSourceBlobs,
    background_post_attempts:counts,
    blocked_external_gets:foreignCounts,
    unknown,
    all_post_attempts_aborted:true,
    server_post_mutation_proven:false,
    production_accepted:false,
  };
}
const report = {
  schema:"aoe2war.g.r16.w1safe.disposable-chrome.v1",
  source_sha:process.env.SOURCE_SHA || "UNKNOWN",
  build_id:expected, scope:"LOCAL_DISPOSABLE_POSTGRESQL_NOT_PRODUCTION",
  production_certified:false, host_signed:false, financial_noninterference_certified:false,
  witnessed_signed_producers:false, status:"HOLD", pages:[], api:[],
};
(async () => {
  fs.mkdirSync(outDir, { recursive:true });
  const browser = await chromium.launch({headless:true, executablePath:chrome,
    args:["--disable-dev-shm-usage"]});
  try {
    for (const width of widths) {
      const context = await browser.newContext({
        baseURL:base, viewport:{width,height:900},
        serviceWorkers:"block", reducedMotion:"reduce",
      });
      try {
        for (const pathname of routes) {
          const entry={width,pathname,status:null,heading:null,nav:false,
            overflow:null,mutations_blocked:0,foreign_blocked:0,blocked_requests:[],blocked_request_overflow:0,
            fixture_classification:null,errors:[],
            axe_serious_or_critical:[],screenshot:null,verdict:"HOLD"};
          const page = await context.newPage();
          page.on("pageerror", e=>entry.errors.push(e.message.slice(0,200)));
          const cdp = await context.newCDPSession(page);
          const initiators = new Map();
          cdp.on("Network.requestWillBeSent", ev=>{
            const method=ev.request?.method, url=ev.request?.url;
            if (!method || !url) return;
            const location=where(url);
            if (location.origin===base && ["GET","HEAD"].includes(method)) return;
            const key=requestKey(method,url);
            const list=initiators.get(key)||[];
            if (list.length<32) list.push(cdpsafe(ev.initiator));
            initiators.set(key,list);
          });
          await cdp.send("Network.enable");
          const intercepted = [];
          await page.route("**/*", async route=>{
            const req=route.request(); const u=new URL(req.url());
            const foreign=u.origin!==base;
            const mutating=!["GET","HEAD"].includes(req.method());
            if (foreign || mutating) {
              if (foreign) entry.foreign_blocked++;
              if (mutating) entry.mutations_blocked++;
              let frame={origin:"UNMEASURED",pathname:"UNMEASURED"};
              try {frame=where(req.frame().url());} catch {}
              const record={
                reason:foreign?"FOREIGN_ORIGIN": "NON_READ_METHOD",
                method:req.method(),
                location:where(req.url()),
                resource_type:req.resourceType(),
                frame,
                initiator:{type:"CDP_PENDING",frames:[]},
              };
              if (entry.blocked_requests.length<32) {
                entry.blocked_requests.push(record);
                intercepted.push({record,key:requestKey(req.method(),req.url())});
              } else entry.blocked_request_overflow++;
              return route.abort();
            }
            return route.continue();
          });
          try {
            const response=await page.goto(pathname,{waitUntil:"domcontentloaded",timeout:30000});
            entry.status=response?.status()??null;
            entry.final_pathname=new URL(page.url()).pathname;
            entry.heading=await page.locator("h1").first().textContent({timeout:10000}).catch(()=>null);
            entry.nav=(await page.locator("header,nav,[role=navigation]").count())>0;
            entry.overflow=await page.evaluate(()=>document.documentElement.scrollWidth >
              window.innerWidth+2);
            const violations = await page.evaluate(axe.source).catch(()=>null);
            // axe.source is injected, not evaluated as the return value of a function.
          } catch (e) {entry.errors.push(String(e.message||e).slice(0,240));}
          try {
            await page.addScriptTag({content:axe.source});
            const a=await page.evaluate(async()=>window.axe.run(document,{
              runOnly:{type:"tag",values:["wcag2a","wcag2aa","wcag21a","wcag21aa"]},
            }));
            entry.axe_serious_or_critical=a.violations
              .filter(v=>v.impact==="serious"||v.impact==="critical")
              .map(v=>v.id).slice(0,12);
          } catch(e) {entry.errors.push("AXE_UNMEASURED:"+String(e.message||e).slice(0,140));}
          entry.screenshot="w"+width+"-"+(pathname==="/"
            ?"home":pathname.slice(1).replace(/[^a-z0-9-]/g,"-"))+".png";
          await page.screenshot({path:path.join(outDir,entry.screenshot),fullPage:false})
            .catch(e=>entry.errors.push("SCREENSHOT_UNMEASURED:"+String(e.message||e).slice(0,100)));
          // Correlate CDP initiator stack with the blocked Playwright request.
          // Never weaken the network block because a caller looks familiar.
          for (const {record,key} of intercepted) {
            const observed=initiators.get(key);
            record.initiator=observed?.shift()||{type:"CDP_UNMEASURED",frames:[]};
          }
          entry.fixture_classification=classifyBlockedFixture(pathname,entry.blocked_requests);
          if (entry.blocked_requests.length) {
            console.log("W1SAFE_R19_BLOCKED_REQUESTS "+JSON.stringify({
              width,pathname,blocked:entry.blocked_requests,
              overflow:entry.blocked_request_overflow,
              classification:entry.fixture_classification.verdict,
            }));
          }
          entry.verdict=entry.status===200 && entry.final_pathname===pathname && Boolean(entry.heading) &&
            entry.nav && entry.overflow===false && entry.errors.length===0 &&
            entry.axe_serious_or_critical.length===0 &&
            entry.blocked_request_overflow===0 && entry.mutations_blocked===3 &&
            entry.foreign_blocked===2 &&
            entry.fixture_classification.verdict==="PASS_BLOCKED_BACKGROUND_ONLY"?"PASS":"HOLD";
          report.pages.push(entry);
          await page.close();
        }
      } finally { await context.close(); }
    }
    const context=await browser.newContext({baseURL:base,serviceWorkers:"block"});
    try {
      for (const pathname of api) for(const method of ["GET","HEAD"]) {
        let status=null,error=null;
        try {
          const resp=await context.request.fetch(pathname,{method,timeout:15000,maxRedirects:0});
          status=resp.status();
        } catch(e) {error=String(e.message||e).slice(0,200);}
        report.api.push({pathname,method,status,error,
          verdict:status===200&&!error?"PASS":"HOLD"});
      }
    } finally { await context.close(); }
  } finally { await browser.close(); }
  report.status=report.pages.length===15 && report.api.length===8 &&
    report.pages.every(x=>x.verdict==="PASS") &&
    report.api.every(x=>x.verdict==="PASS")?"PASS":"HOLD";
  fs.writeFileSync(path.join(outDir,"review.json"),JSON.stringify(report,null,2)+"\n");
  console.log("W1SAFE_R19_DISPOSABLE_CHROME="+report.status+
    " pages="+report.pages.filter(x=>x.verdict==="PASS").length+"/15"+
    " api="+report.api.filter(x=>x.verdict==="PASS").length+"/8");
  process.exitCode=report.status==="PASS"?0:2;
})().catch(e=>{
  fs.mkdirSync(outDir,{recursive:true});
  report.error=String(e.message||e);report.status="HOLD";
  fs.writeFileSync(path.join(outDir,"review.json"),JSON.stringify(report,null,2)+"\n");
  console.error(report.error);process.exitCode=2;
});
