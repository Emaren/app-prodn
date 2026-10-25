#!/usr/bin/env node
/** Headless Chrome CDP, read-only source-bound interaction evidence.
 * Keyboard, AX names and warm navigation are real candidate observations,
 * NOT full screen-reader testing, deployment identity or a scored criterion.
 */
import {spawn} from "node:child_process";
import {mkdtemp,readFile,writeFile,rm,realpath} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {createHash} from "node:crypto";
import {fileURLToPath} from "node:url";
const stop=m=>{throw Error("KINGDOM INTERACTION STOP: "+m)};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const pct=(arr,q)=>{
 const b=[...arr].sort((a,c)=>a-c),at=(b.length-1)*q,lo=Math.floor(at),hi=Math.ceil(at);
 return Math.round((b[lo]+(b[hi]-b[lo])*(at-lo))*1000)/1000;
};
// CDP rawKeyDown without text produces keydown+keyup but no keypress/click
// for native HTML buttons in Chromium. Enter must include its character text
// on keyDown to exercise actual browser activation semantics.
export function chromeEnterKeyEvents(){
 const common={key:"Enter",code:"Enter",windowsVirtualKeyCode:13,nativeVirtualKeyCode:13};
 return [{...common,type:"keyDown",text:"\r"},
         {...common,type:"keyUp"}];
}
export function inspectInteractionReceipt(doc,{sourceSha,buildId}){
 if(!/^[a-f0-9]{40}$/.test(sourceSha)||typeof buildId!=="string"||
    doc?.kind!=="aoe2war.kingdom-index.real-interaction.v1"||
    doc.sourceSha!==sourceSha||doc.buildId!==buildId||
    doc.origin!=="LOOPBACK_ONLY"||doc.route!=="/kingdom-index"||
    doc.certified!==false||doc.criterionPointsAwarded!==null||
    !Array.isArray(doc.viewports)||doc.viewports.length!==2)
    stop("Missing exact-source unscored Chrome authority");
 const visited=new Set();
 for(const row of doc.viewports){
  if(!["desktop","phone"].includes(row.viewport)||visited.has(row.viewport)||
     row.url!=="http://127.0.0.1:3030/kingdom-index"||row.documentStatus!==200||
     !Number.isInteger(row.viewportWidth)||row.viewportWidth<300||
     !Number.isInteger(row.scrollWidth)||row.scrollWidth<0||
     row.reducedMotionEmulated!==true||
     !row.keyboard||!row.accessibility||!row.warm||!row.criterionCoverage||
     !["ledgerActivated","mapRestored","detailOpened","detailClosed","focusRestored"].every(k=>typeof row.keyboard[k]==="boolean")||
     row.criterionCoverage.apiRoutes!==88||
     row.criterionCoverage.canonicalCriteria!==20||
     row.criterionCoverage.canonicalMaximum!==100||
     row.criterionCoverage.indexSpecializedGates!==3||
     row.criterionCoverage.sourceCensusRows!==88||
     row.criterionCoverage.completePendingRoutes!==88||
     row.criterionCoverage.profiledRoutes!==88||
     row.criterionCoverage.sourceFingerprintedRoutes!==88||
     row.criterionCoverage.detailRows!==20||
     row.criterionCoverage.pendingDetailRows!==20||
     row.criterionCoverage.approvedDetailRows!==0||
     row.criterionCoverage.approvedRoutes!==0||
     row.criterionCoverage.nullScoreRoutes!==88||
     row.criterionCoverage.indexOfficialScoreNull!==true||
     row.criterionCoverage.indexAuthenticatedEarnedNull!==true||
     row.criterionCoverage.expandedByKeyboard!==true||
     !/^src-[a-f0-9]{16}$/.test(row.criterionCoverage.routeFingerprint)||
     !Number.isInteger(row.accessibility.axNodeCount)||row.accessibility.axNodeCount<1||
     !Number.isInteger(row.accessibility.namedButtons)||row.accessibility.namedButtons<1||
     !Number.isInteger(row.accessibility.unnamedButtons)||row.accessibility.unnamedButtons<0||
     !Array.isArray(row.warm.samplesMs)||row.warm.samplesMs.length!==10||
     row.warm.samplesMs.some(x=>!Number.isFinite(x)||x<=0||x>120000)||
     Math.abs(row.warm.p75Ms-pct(row.warm.samplesMs,.75))>0.002||
     Math.abs(row.warm.p95Ms-pct(row.warm.samplesMs,.95))>0.002)
    stop("Invalid keyboard, AX, viewport or Chrome warm cohort");
  visited.add(row.viewport);
 }
 return {valid:true,keyboardInteractionsObserved:doc.viewports.every(v=>Object.values(v.keyboard).every(Boolean)),
  horizontalOverflowObserved:doc.viewports.some(v=>v.scrollWidth>v.viewportWidth+2),
  certified:false,score:null};
}
async function capture(chrome,viewport,screenshotsDir){
 const profile=await mkdtemp(join(tmpdir(),"aoe2war-index-interaction-"));
 const child=spawn(chrome,["--headless=new","--remote-debugging-port=0",
  "--user-data-dir="+profile,"--no-first-run","--disable-default-apps",
  "--disable-background-networking","about:blank"],{stdio:"ignore"});
 let ws;
 try{
  let port;
  for(let n=0;n<200;n++){
   try{const raw=await readFile(join(profile,"DevToolsActivePort"),"utf8");
    const found=Number(raw.split("\n")[0]);if(Number.isInteger(found)&&found>0){port=found;break}}
   catch{}
   if(child.exitCode!==null)stop("Chrome exited before CDP connection");
   await sleep(50);
  }
  if(!port)stop("Chrome DevTools unavailable");
  const tab=await fetch("http://127.0.0.1:"+port+"/json/new?about:blank",{method:"PUT"}).then(x=>x.json());
  ws=new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((ok,bad)=>{ws.onopen=ok;ws.onerror=bad});
  let seq=0;const pending=new Map(),events=[];
  ws.onmessage=event=>{
   let item;try{item=JSON.parse(event.data)}catch{return}
   const p=pending.get(item.id);
   if(p){clearTimeout(p.timer);pending.delete(item.id);
    item.error?p.bad(Error(item.error.message)):p.ok(item.result);
   }else if(events.length<2500)events.push(item);
  };
  const command=(method,params={})=>new Promise((ok,bad)=>{
   const id=++seq,timer=setTimeout(()=>{pending.delete(id);bad(Error("CDP timeout "+method))},12000);
   pending.set(id,{ok,bad,timer});ws.send(JSON.stringify({id,method,params}));
  });
  await command("Page.enable");await command("Runtime.enable");
  await command("Network.enable");await command("Accessibility.enable");
  await command("Emulation.setDeviceMetricsOverride",{
   width:viewport==="desktop"?1440:390,height:viewport==="desktop"?900:844,
   deviceScaleFactor:1,mobile:viewport==="phone"
  });
  await command("Emulation.setEmulatedMedia",{features:[{name:"prefers-reduced-motion",value:"reduce"}]});
  const url="http://127.0.0.1:3030/kingdom-index";
  async function navigate(){
   const start=events.length;await command("Page.navigate",{url});
   for(let n=0;n<140;n++){
    if(events.slice(start).some(e=>e.method==="Page.loadEventFired")){
     const document=events.slice(start).find(e=>e.method==="Network.responseReceived"&&
       e.params?.type==="Document"&&e.params?.response?.url===url);
     return document?.params?.response?.status??0;
    }
    await sleep(50);
   }
   stop("Real Chrome did not load Index");
  }
  const evaluate=async expression=>{
   const result=await command("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});
   if(result.exceptionDetails)stop("Chrome script exception");
   return result.result?.value;
  };
  const key=async (name,number)=>{
   if(name!=="Enter"||number!==13)stop("Only tested native Enter activation supported");
   for(const event of chromeEnterKeyEvents())await command("Input.dispatchKeyEvent",event);
   await sleep(250);
  };
  const initialStatus=await navigate();await sleep(500);
  const info=await evaluate("({url:location.href,scrollWidth:document.documentElement.scrollWidth,viewportWidth:innerWidth,reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches})");
  const ax=await command("Accessibility.getFullAXTree");
  const meaningful=(ax.nodes??[]).filter(x=>x.ignored!==true),buttons=meaningful.filter(x=>x.role?.value==="button");
  const named=buttons.filter(x=>typeof x.name?.value==="string"&&x.name.value.trim().length>0);

  const snapshots=[],screenshots=[];
  const snapshot=async phase=>{
   const observation=await evaluate(`(()=>{
    const get=name=>document.querySelector('button[aria-label="'+name+'"]');
    const describe=element=>{
     if(!element)return {exists:false};
     const style=getComputedStyle(element);
     return {exists:true,tag:element.tagName,role:element.getAttribute('role')||'button',
       name:element.getAttribute('aria-label'),pressed:element.getAttribute('aria-pressed'),
       focused:document.activeElement===element,disabled:element.disabled===true,
       connected:element.isConnected,
       visible:style.display!=='none'&&style.visibility!=='hidden'&&element.getClientRects().length>0};
    };
    const focus=document.activeElement;
    return {href:location.href,readyState:document.readyState,
      focus:{tag:focus?.tagName||null,name:focus?.getAttribute?.('aria-label')||null,
        role:focus?.getAttribute?.('role')||null},
      map:describe(get('Kingdom map')),ledger:describe(get('Performance ledger')),
      inspect:describe(get('Inspect Kingdom Index')),close:describe(get('Close details')),
      realmVisible:!!document.querySelector('div[aria-label="Kingdom map"]'),
      ledgerVisible:!!document.querySelector('section[aria-label="Engineering ledger"]'),
      detailVisible:!!document.querySelector('section[aria-label="Kingdom Index engineering evidence"]')};
   })()`);
   snapshots.push({phase,...observation});
  };
  const screenshot=async phase=>{
   if(!screenshotsDir)return;
   const result=await command("Page.captureScreenshot",{format:"png",captureBeyondViewport:false});
   const bytes=Buffer.from(result.data,"base64");
   if(bytes.length<1000||bytes.length>4000000)stop("Invalid bounded screenshot capture");
   const name="interaction-"+viewport+"-"+phase+".png";
   await writeFile(join(screenshotsDir,name),bytes,{flag:"wx"});
   screenshots.push({phase,name,bytes:bytes.length,
     sha256:createHash("sha256").update(bytes).digest("hex")});
  };
  const keyboard={ledgerActivated:false,mapRestored:false,detailOpened:false,detailClosed:false,focusRestored:false};
  // Exact built API read in a real Chrome session. It proves only candidate
  // route/proof UI coherence, not independent source or release authority.
  const criterionCoverage=await evaluate(`(async()=>{
    const response=await fetch('/api/kingdom-index',{cache:'no-store'});
    if(!response.ok)return {apiError:response.status};
    const snapshot=await response.json();
    const rows=Array.isArray(snapshot.pages)?snapshot.pages:[];
    const rubric=Array.isArray(snapshot.criterionRubric)?snapshot.criterionRubric:[];
    const idx=rows.find(row=>row.href==='/kingdom-index');
    return {
      apiRoutes:rows.length,sourceCensusRows:new Set(rows.map(row=>row.href)).size,
      completePendingRoutes:rows.filter(row=>row.criterionProgress?.maximum===100&&
        row.criterionProgress?.approvedCriteria===0&&
        row.criterionProgress?.pendingCriteria===20&&
        row.criterionProgress?.authenticatedEarned===null&&
        Array.isArray(row.criterionProgress?.approvals)&&row.criterionProgress.approvals.length===0).length,
      profiledRoutes:rows.filter(row=>typeof row.specializedAssurance?.profile==='string'&&
        Array.isArray(row.specializedAssurance?.gates)).length,
      sourceFingerprintedRoutes:rows.filter(row=>/^src-[a-f0-9]{16}$/.test(row.sourceVersion)).length,
      canonicalCriteria:rubric.length,
      canonicalMaximum:rubric.reduce((sum,row)=>sum+(Number(row.maximum)||0),0),
      indexSpecializedGates:idx?.specializedAssurance?.gates?.length??-1,
      approvedRoutes:rows.filter(row=>row.criterionProgress?.approvedCriteria>0).length,
      nullScoreRoutes:rows.filter(row=>row.score===null).length,
      indexOfficialScoreNull:idx?.score===null,
      indexAuthenticatedEarnedNull:idx?.criterionProgress?.authenticatedEarned===null,
      routeFingerprint:idx?.sourceVersion??null
    };
  })()`);

  await snapshot("initial");
  await evaluate("document.querySelector('button[aria-label=\"Performance ledger\"]')?.focus()");
  await key("Enter",13);
  await snapshot("after-ledger-enter");
  keyboard.ledgerActivated=!!(await evaluate("document.querySelector('button[aria-label=\"Performance ledger\"]')?.getAttribute('aria-pressed')==='true'&&!!document.querySelector('[aria-label=\"Engineering ledger\"]')"));
  await evaluate("document.querySelector('button[aria-label=\"Kingdom map\"]')?.focus()");
  await key("Enter",13);
  await snapshot("after-map-enter");
  await screenshot("after-map-enter");
  keyboard.mapRestored=!!(await evaluate("document.querySelector('button[aria-label=\"Kingdom map\"]')?.getAttribute('aria-pressed')==='true'"));
  await evaluate("document.querySelector('button[aria-label=\"Inspect Kingdom Index\"]')?.focus()");
  await key("Enter",13);
  await snapshot("after-inspect-enter");
  await screenshot("after-inspect-enter");
  keyboard.detailOpened=!!(await evaluate("!!document.querySelector('section[aria-label=\"Kingdom Index engineering evidence\"]')"));
  // Exercise real keyboard disclosure of the 20-criterion matrix on BOTH
  // desktop and mobile Chrome. Count pending/approved UI rows, separately
  // from authenticated JSON and from the official score.
  const criterionDetails=await evaluate(`(()=>{
    const panel=document.querySelector('section[aria-label="Kingdom Index twenty-criterion source-bound progress"]');
    const details=panel?.querySelector('details');
    const summary=details?.querySelector('summary');
    if(summary)summary.focus();
    return {found:!!panel,focus:document.activeElement===summary};
  })()`);
  if(!criterionDetails.found||!criterionDetails.focus)stop("Criterion disclosure inaccessible");
  await key("Enter",13);
  const rubricDetail=await evaluate(`(()=>{
    const panel=document.querySelector('section[aria-label="Kingdom Index twenty-criterion source-bound progress"]');
    const details=panel?.querySelector('details');
    const rows=[...(panel?.querySelectorAll('article[data-verified]')??[])];
    return {
      expandedByKeyboard:details?.open===true,
      detailRows:rows.length,
      pendingDetailRows:rows.filter(row=>row.getAttribute('data-verified')==='false').length,
      approvedDetailRows:rows.filter(row=>row.getAttribute('data-verified')==='true').length
    };
  })()`);
  Object.assign(criterionCoverage,rubricDetail);
  await snapshot("after-criterion-enter");
  await evaluate("document.querySelector('button[aria-label=\"Close details\"]')?.focus()");
  await key("Enter",13);
  await snapshot("after-close-enter");
  keyboard.detailClosed=keyboard.detailOpened&&!!(await evaluate("!document.querySelector('section[aria-label=\"Kingdom Index engineering evidence\"]')"));
  keyboard.focusRestored=keyboard.detailClosed&&!!(await evaluate("document.activeElement?.tagName==='BUTTON'&&document.activeElement?.getAttribute('aria-label')==='Inspect Kingdom Index'"));
  const samples=[];
  for(let i=0;i<10;i++){
   if(await navigate()!==200)stop("Warm document returned non-200");
   const ms=await evaluate("(performance.getEntriesByType('navigation')[0]?.responseEnd??null)");
   if(typeof ms!=="number"||!Number.isFinite(ms)||ms<=0)stop("Missing measured warm response end");
   samples.push(Math.round(ms*1000)/1000);
  }
  return {viewport,url,documentStatus:initialStatus,
   viewportWidth:info.viewportWidth,scrollWidth:info.scrollWidth,
   reducedMotionEmulated:info.reducedMotion,
   accessibility:{axNodeCount:meaningful.length,namedButtons:named.length,
     unnamedButtons:buttons.length-named.length},
   keyboard,criterionCoverage,diagnostics:{snapshots,screenshots,
    chromeExceptions:events.filter(e=>e.method==="Runtime.exceptionThrown").map(e=>({
     text:String(e.params?.exceptionDetails?.text||"Chrome exception").slice(0,180)
    })).slice(0,20)},
   warm:{samplesMs:samples,p75Ms:pct(samples,.75),p95Ms:pct(samples,.95)}};
 }finally{
  try{ws?.close()}catch{}
  if(child.exitCode===null){child.kill("SIGTERM");await sleep(250);if(child.exitCode===null)child.kill("SIGKILL")}
  await rm(profile,{recursive:true,force:true,maxRetries:8,retryDelay:100});
 }
}
async function main(){
 const a=process.argv.slice(2),v={};
 if(a.length!==8)stop("Require --source-sha --build-id --chrome --screenshots-dir");
 for(let i=0;i<a.length;i+=2){
  const k=a[i]?.startsWith("--")?a[i].slice(2):"";
  if(!["source-sha","build-id","chrome","screenshots-dir"].includes(k)||Object.hasOwn(v,k))stop("Unsupported/duplicate parameter");
  v[k]=a[i+1];
 }
 if(!/^[a-f0-9]{40}$/.test(v["source-sha"])||
    (await readFile(".next/BUILD_ID","utf8")).trim()!==v["build-id"])
   stop("Wrong independently expected local source/build");
 const viewports=[];
 for(const viewport of ["desktop","phone"])viewports.push(await capture(v.chrome,viewport,v["screenshots-dir"]));
 const report={schema:1,kind:"aoe2war.kingdom-index.real-interaction.v1",
  sourceSha:v["source-sha"],buildId:v["build-id"],
  origin:"LOOPBACK_ONLY",route:"/kingdom-index",viewports,
  certified:false,criterionPointsAwarded:null,
  limitations:"Read-only actual Chrome keyboard, AX-name and warm candidate observations. Not full screen-reader, production, real mobile hardware, independent source proof, or score."};
 inspectInteractionReceipt(report,{sourceSha:v["source-sha"],buildId:v["build-id"]});
 return {...report,sha256:createHash("sha256").update(JSON.stringify(report)).digest("hex")};
}
if(process.argv[1]&&await realpath(resolve(process.argv[1])).catch(()=>null)===fileURLToPath(import.meta.url))
 main().then(x=>process.stdout.write(JSON.stringify(x,null,2)+"\n"))
  .catch(e=>{console.error(String(e.message));process.exitCode=2});
