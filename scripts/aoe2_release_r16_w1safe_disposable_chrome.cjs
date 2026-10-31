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
            overflow:null,mutations_blocked:0,foreign_blocked:0,errors:[],
            axe_serious_or_critical:[],screenshot:null,verdict:"HOLD"};
          const page = await context.newPage();
          page.on("pageerror", e=>entry.errors.push(e.message.slice(0,200)));
          await page.route("**/*", async route=>{
            const req=route.request(); const u=new URL(req.url());
            if (u.origin!==base) {entry.foreign_blocked++;return route.abort();}
            if (!["GET","HEAD"].includes(req.method())) {
              entry.mutations_blocked++; return route.abort();
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
          entry.verdict=entry.status===200 && entry.final_pathname===pathname && Boolean(entry.heading) &&
            entry.nav && entry.overflow===false && entry.errors.length===0 &&
            entry.axe_serious_or_critical.length===0 && entry.mutations_blocked===0?"PASS":"HOLD";
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
  console.log("W1SAFE_R16_DISPOSABLE_CHROME="+report.status+
    " pages="+report.pages.filter(x=>x.verdict==="PASS").length+"/15"+
    " api="+report.api.filter(x=>x.verdict==="PASS").length+"/8");
  process.exitCode=report.status==="PASS"?0:2;
})().catch(e=>{
  fs.mkdirSync(outDir,{recursive:true});
  report.error=String(e.message||e);report.status="HOLD";
  fs.writeFileSync(path.join(outDir,"review.json"),JSON.stringify(report,null,2)+"\n");
  console.error(report.error);process.exitCode=2;
});
