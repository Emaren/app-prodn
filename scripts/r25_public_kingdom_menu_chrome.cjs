#!/usr/bin/env node
"use strict";
/** Session B nonfinancial browser acceptance: read-only GET and menu click.
 * Never claims full production or financial release. Three viewport parity
 * must match the source-reviewed 39-route Kingdom catalog in order.
 */
const fs=require("node:fs"), path=require("node:path"), os=require("node:os");
const assert=require("node:assert/strict");
const {spawn}=require("node:child_process"),WebSocket=require("ws");
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const src=fs.readFileSync(path.resolve(__dirname,"../app/AppShell.tsx"),"utf8");
const match=src.match(/const KINGDOM_LINKS = \[([\s\S]*?)\] as const;/);
if(!match)throw new Error("MENU_CATALOG_MISSING");
const expected=[...match[1].matchAll(/href: "([^"]+)"/g)].map(m=>m[1]);
if(expected.length!==39)throw new Error("EXPECTED_39_CANONICAL_LINKS");
function validateOrigin(raw){
 const u=new URL(raw);
 if(u.href==="https://aoe2war.com/")return "https://aoe2war.com";
 if(u.href==="http://localhost:3137/")return "http://localhost:3137";
 if(u.protocol!=="http:"||u.hostname!=="127.0.0.1"||
     u.username||u.password||u.pathname!=="/"||u.search||u.hash||
     !u.port||[8092,8093,8094,8095].includes(Number(u.port)))
  throw new Error("HOLD_BROWSER_ORIGIN_NOT_ALLOWED");
 return u.origin;
}
function acceptMenu(state,expected){
 return state.open==="true"&&state.hrefs.length===expected.length&&
   JSON.stringify(state.hrefs)===JSON.stringify(expected)&&!state.collapsed;
}
if(process.argv.includes("--selftest")){
 const snap={open:"true",hrefs:[...expected],collapsed:false};
 assert.equal(acceptMenu(snap,expected),true);
 assert.equal(acceptMenu({...snap,hrefs:expected.slice(0,4),collapsed:true},expected),false);
 assert.equal(acceptMenu({...snap,hrefs:[...expected].reverse()},expected),false);
 assert.equal(acceptMenu({...snap,open:"false"},expected),false);
 assert.equal(validateOrigin("https://aoe2war.com"),"https://aoe2war.com");
 assert.equal(validateOrigin("http://127.0.0.1:3032"),"http://127.0.0.1:3032");
 assert.equal(validateOrigin("http://localhost:3137"),"http://localhost:3137");
 for(const invalid of ["https://example.com","http://127.0.0.1:8094",
    "http://127.0.0.1:3030/api/bets","http://127.0.0.2:3032"])
   assert.throws(()=>validateOrigin(invalid));
 console.log("PASS_PUBLIC_KINGDOM_MENU_GUARD_FIXTURES");
 process.exit(0);
}
const argPosition=process.argv.indexOf("--origin");
if(argPosition>=0&&(!process.argv[argPosition+1]||argPosition+2!==process.argv.length))
 throw Error("HOLD_BROWSER_ORIGIN_ARG");
const origin=validateOrigin(argPosition>=0?process.argv[argPosition+1]:"https://aoe2war.com");
console.log('EXPECTED_MENU_ENTRIES',expected.length);
// The Q17 job already installs and successfully launches playwright-core on
// genuine Chrome. Use its known-good browser transport rather than the fragile
// raw DevToolsActivePort bootstrap. The CDP path below remains for the local
// manual public-edge negative control where Playwright is not installed.
if(process.env.PW_HOME){
 (async()=>{
  const {createRequire}=require("node:module");
  const playwright=createRequire(__filename)(
   path.join(process.env.PW_HOME,"node_modules/playwright-core")
  );
  const executablePath=process.env.CHROME_BIN;
  if(!executablePath || !fs.existsSync(executablePath))
   throw Error("HOLD_CHROME_BINARY_UNAVAILABLE");
  const output=process.env.ATLAS_BROWSER_OUT;
  if(!output || !path.isAbsolute(output))
   throw Error("HOLD_BROWSER_RECEIPT_OUTPUT_REQUIRED");
  fs.mkdirSync(output,{recursive:true});
  const browser=await playwright.chromium.launch({
   headless:true,executablePath,args:["--no-sandbox","--disable-dev-shm-usage"]
  });
  const results=[];
  try{
   for(const width of [375,768,1440]){
    const context=await browser.newContext({
     viewport:{width,height:900},serviceWorkers:"block",reducedMotion:"reduce"
    });
    try{
     const page=await context.newPage();
     const response=await page.goto(origin+"/?sb-menu-verification="+width,{
      waitUntil:"domcontentloaded",timeout:45000
     });
     if(response?.status()!==200)throw Error("HOLD_KINGDOM_PAGE_NOT_HTTP200");
     const button='button[aria-haspopup="menu"][data-presence-door="kingdom"]';
     await page.locator(button).first().waitFor({state:"visible",timeout:20000});
     // Wait for real hydration before invoking a DOM click. Avoid browser
     // pointer-hover preopening the menu then toggling it closed on click.
     await page.waitForTimeout(1200);
     const clicked=await page.evaluate(`(()=>{const b=[...document.querySelectorAll('button[aria-haspopup="menu"][data-presence-door="kingdom"]')].find(x=>x.getBoundingClientRect().width>0);b?.click();return !!b})()`);
     let state={};
     for(let i=0;i<18;i++){
      await page.waitForTimeout(200);
      state=await page.evaluate(menuState)||{};
      if(state.hrefs?.length>0)break;
     }
     const passed=clicked&&acceptMenu(state,expected);
     results.push({width,passed});
     console.log("KINGDOM_CHROME",JSON.stringify({
      width,passed,opened:state.open,items:state.hrefs?.length||0,
      collapsed:state.collapsed,orderMatches:JSON.stringify(state.hrefs)===JSON.stringify(expected)
     }));
     await page.screenshot({path:path.join(output,"public-kingdom-menu-"+width+".png")});
    }finally{await context.close();}
   }
  }finally{await browser.close();}
  const accepted=results.length===3&&results.every(x=>x.passed);
  console.log("R25_KINGDOM_MENU_VERDICT",JSON.stringify({
   schema:"aoe2war.r25.public-kingdom-menu.v1",status:accepted?
   "PASS_PUBLIC_KINGDOM_MENU":"HOLD_PUBLIC_KINGDOM_MENU_COLLAPSED_OR_REORDERED",
   widths:results,expectedEntries:expected.length,readOnly:true,
   financialAuthorized:false,productionMutation:false,fullSiteRelease:false
  }));
  if(!accepted)process.exitCode=2;
 })().catch(e=>{console.error("HOLD_PLAYWRIGHT_KINGDOM_MENU",e.message);process.exitCode=4});
}else{
const profile=fs.mkdtempSync(path.join(os.tmpdir(),"sb-kingdom-cdp-"));
const chrome=spawn(process.env.CHROME_BIN||"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",[
 "--headless=new","--no-first-run","--no-default-browser-check","--disable-extensions",
 "--no-sandbox","--disable-dev-shm-usage","--disable-background-networking",
 "--remote-debugging-port=0","--remote-allow-origins=http://localhost",
 "--user-data-dir="+profile,"about:blank"],{stdio:"ignore"});
let ws,id=0;const requests=new Map();
function send(method,params={}){return new Promise((ok,fail)=>{const n=++id;requests.set(n,{ok,fail});ws.send(JSON.stringify({id:n,method,params}));setTimeout(()=>{const p=requests.get(n);if(p){requests.delete(n);fail(Error("CDP_TIMEOUT "+method))}},18000)})}
async function evaluate(expression){const x=await send("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});if(x.result?.exceptionDetails)throw Error("EVAL_EXCEPTION");return x.result?.result?.value;}
const menuState=`(()=>{const b=[...document.querySelectorAll('button[aria-haspopup="menu"][data-presence-door="kingdom"]')].find(x=>x.getBoundingClientRect().width>0);const all=[...document.querySelectorAll('[role="menu"]')].filter(x=>x.getBoundingClientRect().width>0);const menu=all.find(x=>x.getAttribute("aria-label"))||all[0];return {hasButton:!!b,open:b?.getAttribute("aria-expanded"), menuCount:all.length, hrefs:menu?[...menu.querySelectorAll('a[role="menuitem"]')].map(x=>new URL(x.href).pathname):[], collapsed:menu?.textContent?.includes("Explore all Kingdom chambers")??false}})()`;
(async()=>{
 const results=[];
 for(let i=0;i<200&&!fs.existsSync(path.join(profile,"DevToolsActivePort"));i++)await pause(100);
 if(!fs.existsSync(path.join(profile,"DevToolsActivePort")))throw Error("CHROME_PORT_NOT_READY");
 const [port]=fs.readFileSync(path.join(profile,"DevToolsActivePort"),"utf8").split("\n");
 const targets=await(await fetch("http://127.0.0.1:"+port+"/json/list")).json();
 const page=targets.find(x=>x.type==="page");if(!page)throw Error("CHROME_PAGE_MISSING");
 ws=new WebSocket(page.webSocketDebuggerUrl,{headers:{Origin:"http://localhost"}});
 await new Promise((ok,fail)=>{ws.once("open",ok);ws.once("error",fail)});
 ws.on("message",data=>{const msg=JSON.parse(data.toString());if(!msg.id)return;const p=requests.get(msg.id);if(!p)return;requests.delete(msg.id);msg.error?p.fail(Error(JSON.stringify(msg.error))):p.ok(msg)});
 await send("Page.enable");await send("Runtime.enable");
 for(const width of [375,768,1440]){
  await send("Emulation.setDeviceMetricsOverride",{width,height:900,deviceScaleFactor:1,mobile:width<=768});
  await send("Emulation.setTouchEmulationEnabled",{enabled:width<=768});
  await send("Page.navigate",{url:origin+"/?sb-menu-verification="+width});
  let state={};
  for(let i=0;i<75;i++){await pause(150);state=await evaluate(menuState)||{};if(state.hasButton)break;}
  await pause(1900);
  const clicked=await evaluate(`(()=>{const b=[...document.querySelectorAll('button[aria-haspopup="menu"][data-presence-door="kingdom"]')].find(x=>x.getBoundingClientRect().width>0);b?.click();return !!b})()`);
  for(let i=0;i<15;i++){await pause(200);state=await evaluate(menuState)||{};if(state.hrefs.length>0)break;}
  const passed=clicked&&acceptMenu(state,expected);
  results.push({width,passed});
  console.log("KINGDOM_CHROME",JSON.stringify({width,passed,opened:state.open,menuCount:state.menuCount,items:state.hrefs.length,collapsed:state.collapsed,orderMatches:JSON.stringify(state.hrefs)===JSON.stringify(expected)}));
 }
 const accepted=results.length===3&&results.every(r=>r.passed);
 console.log("R25_KINGDOM_MENU_VERDICT",JSON.stringify({
  schema:"aoe2war.r25.public-kingdom-menu.v1",
  status:accepted?"PASS_PUBLIC_KINGDOM_MENU":"HOLD_PUBLIC_KINGDOM_MENU_COLLAPSED_OR_REORDERED",
  widths:results, expectedEntries:expected.length, readOnly:true,
  financialAuthorized:false, productionMutation:false, fullSiteRelease:false
 }));
 if(!accepted)process.exitCode=2;
})().catch(e=>{console.log("HOLD_BROWSER",e.message);process.exitCode=4}).finally(async()=>{try{ws?.close()}catch{};try{chrome.kill("SIGTERM")}catch{};await pause(500);try{fs.rmSync(profile,{recursive:true,force:true})}catch{}});

}
