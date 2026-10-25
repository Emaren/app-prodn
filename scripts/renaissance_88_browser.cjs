#!/usr/bin/env node
"use strict";
/**
 * Actual Chromium, 88 registered public routes, *isolated loopback only*.
 * Browser does not award scores or assert live deployment/production DB writes.
 * Client API GETs receive a fixed 503 fixture. External requests and all
 * mutation methods are aborted; source/server GET side effects are NOT proved.
 */
const fs=require("node:fs");
const path=require("node:path");
const assert=require("node:assert/strict");
const cp=require("node:child_process");
const {createHash}=require("node:crypto");
const ERROR_CODE=2;
const {classifyCandidateRoute}=require("./renaissance_88_verdict.cjs");
const net=require("node:net");
const {REAL_READONLY,classifyApiFixtureRequest}=require("./renaissance_88_api_policy.cjs");
function die(message){throw new Error("RENAISSANCE CHROME HOLD: "+message);}
function argsOf(argv){
 const allowed=new Set(["plan","out","cohort","cohorts","samples","route-ms","deadline-ms"]);
 const o={};
 for(let i=0;i<argv.length;i+=2){
  let key=argv[i],val=argv[i+1];
  if(!key||!key.startsWith("--")||!val||!allowed.has(key.slice(2))||Object.hasOwn(o,key.slice(2)))die("Invalid/duplicate argument");
  o[key.slice(2)]=val;
 }
 const integer=(key,defaultValue,min,max)=>{
  if(o[key]===undefined)return defaultValue;
  if(!/^(0|[1-9]\d*)$/.test(o[key]))die("Invalid "+key);
  const n=Number(o[key]);if(n<min||n>max)die("Out of range "+key);
  return n;
 };
 return {plan:o.plan,out:o.out,cohort:integer("cohort",0,0,87),
  cohorts:integer("cohorts",8,1,88),samples:integer("samples",1,1,10),
  routeMs:integer("route-ms",18000,3000,60000),
  deadlineMs:integer("deadline-ms",720000,60000,1800000)};
}
function percentiles(values){
 if(values.length===0)return null;
 let s=[...values].sort((a,b)=>a-b);
 const q=(p)=>{let x=(s.length-1)*p,l=Math.floor(x),h=Math.ceil(x);return Math.round((s[l]+(s[h]-s[l])*(x-l))*100)/100;};
 return {n:s.length,p75:q(.75),p95:q(.95),maximum:s.at(-1)};
}
function payloadDigest(obj){return createHash("sha256").update(JSON.stringify(obj)).digest("hex");}
function isValidPlan(plan){
 assert.equal(plan.schema,"aoe2war.renaissance.public88.factory-plan.v1");
 assert.match(plan.source_sha,/^[0-9a-f]{40}$/);
 assert.equal(plan.planned_public,88);
 assert.equal(plan.routes.length,88);
 assert.equal(new Set(plan.routes.map(r=>r.route)).size,88);
 assert.equal(plan.production_certified,false);
}
function safeOutput(dir){
 if(!dir||dir.includes("..")||!path.isAbsolute(dir))die("Output requires absolute non-traversing path");
 fs.mkdirSync(dir,{recursive:true});
 if(fs.lstatSync(dir).isSymbolicLink())die("Output directory symlink");
}
async function localDatabaseFixture(){
 const root=process.env.REN88_PG_ROOT;
 const intended="postgresql://renaissance_reader:local_fixture_only@127.0.0.1:55437/renaissance88";
 if(process.env.RENAISSANCE_88_FIXTURE_ALLOWED!=="1"||!root||
    process.env.DATABASE_URL!==intended||!fs.existsSync(path.join(root,"before.sha256")))
   return "UNAVAILABLE";
 const hash=fs.readFileSync(path.join(root,"before.sha256"),"utf8").trim();
 if(!/^[0-9a-f]{64}$/.test(hash))return "UNAVAILABLE";
 return new Promise(resolve=>{
  const socket=new net.Socket();let finished=false;
  const finish=value=>{if(finished)return;finished=true;socket.destroy();resolve(value);};
  socket.setTimeout(350);
  socket.once("connect",()=>finish("REACHABLE"));
  socket.once("error",()=>finish("UNAVAILABLE"));
  socket.once("timeout",()=>finish("UNAVAILABLE"));
  socket.connect(55437,"127.0.0.1");
 });
}
async function run(){
 const opts=argsOf(process.argv.slice(2));
 if(opts.cohort>=opts.cohorts)die("Cohort exceeds cohort count");
 const base=process.env.BROWSER_BASE_URL;
 if(base!=="http://127.0.0.1:3137")die("Only isolated loopback 3137 is permitted");
 if(process.env.AOE2WAR_PROD_DB_PREVIEW==="true")die("Production-data preview forbidden");
 if(!opts.plan||!opts.out)die("Require --plan and --out");
 const plan=JSON.parse(fs.readFileSync(opts.plan,"utf8"));
 isValidPlan(plan);
 const sha=cp.execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim();
 if(plan.source_sha!==sha)die("Source/plan mismatch");
 const buildId=fs.readFileSync(".next/BUILD_ID","utf8").trim();
 if(!buildId||plan.build?.build_id!==buildId||plan.build?.status!=="CANDIDATE_BUILD_ONLY")
  die("Exact build/plan mismatch");
 const manifestBytes=fs.readFileSync(".next/server/app-paths-manifest.json");
 if(plan.build.manifest_sha256!==createHash("sha256").update(manifestBytes).digest("hex"))
  die("Build path manifest changed after plan");
 const pwHome=process.env.PW_HOME;
 if(!pwHome||!path.isAbsolute(pwHome))die("Need pinned isolated playwright-core directory");
 const {chromium}=require(path.join(pwHome,"node_modules","playwright-core"));
 const axe=require(path.join(pwHome,"node_modules","axe-core"));
 const chrome=process.env.CHROME_BIN;
 if(!chrome||!fs.existsSync(chrome))die("Pinned real Chrome executable required");
 safeOutput(opts.out);
 const started=Date.now();
 const databaseFixture=await localDatabaseFixture();
 const receipt={
  schema:"aoe2war.renaissance.public88.chrome.v1",
  source_sha:sha,build_id:buildId,manifest_sha256:plan.build.manifest_sha256,
  plan_sha256:createHash("sha256").update(fs.readFileSync(opts.plan)).digest("hex"),
  browser_name:"Google Chrome/Chromium via playwright-core 1.57.0",
  origin:base,cohort:opts.cohort,cohorts:opts.cohorts,samples:opts.samples,
  isolated_loopback:true,database_fixture:databaseFixture,production_certified:false,score:null,criterion_points_awarded:null,
  anonymous_only:true,api_mode:"AUDITED_REAL_LOCAL_GET_PLUS_SYNTHETIC_503",
  server_get_no_mutation:"PENDING_POST_BROWSER_SNAPSHOT",
  notes:["Actual browser/document navigation; remote/live production never accessed",
    "API GET responses are deterministic synthetic 503 fixtures, NOT real API/domain tests",
    "No authenticated fixture, replay corpus, real database, real failure recovery or live release attestation",
    "Performance sample size less than 10 is exploratory and NEVER qualifies P75/P95 gate",
    "Speed readiness is only observed when explicit same-route proof appears; retained prior-route proof is insufficient"],
  routes:[],started_at:new Date(started).toISOString()
 };
 const selected=plan.routes.filter((_,i)=>i%opts.cohorts===opts.cohort);
 const write=(suffix,data)=>{
  const filename=path.join(opts.out,suffix);
  fs.writeFileSync(filename,JSON.stringify(data,null,2)+"\n",{flag:"w"});
 };
 const browser=await chromium.launch({headless:true,executablePath:chrome,args:["--no-sandbox","--disable-dev-shm-usage"]});
 try{
  for(const route of selected){
   const record={route:route.route,redirect_to:route.redirect_to??null,phase:route.phase,profile:route.profile,
    source_sha:sha,build_id:buildId,plan_policy:route.overlay_source_policy,
    views:[],status:"UNKNOWN",database_fixture:databaseFixture,criteria:{
     navigation:"UNKNOWN",render:"UNKNOWN",keyboard:"UNKNOWN",
     accessibility:"UNKNOWN",api_real:"UNKNOWN",api_failure:"UNKNOWN",
     speed_readiness:"UNKNOWN",gray_notice:"UNKNOWN",living_presence:"UNKNOWN",
     seasonal_theme:"UNKNOWN",p75_p95:"UNKNOWN",heap:"UNKNOWN",
     domain:"UNKNOWN",production:"UNKNOWN",financial_nonmutation:"UNKNOWN",
     client_mutation_attempts:"UNKNOWN"},
    resource:{total_requests:0,api_503:0,api_real_requested:0,api_real_statuses:{},
              external_blocked:0,client_mutations_blocked:0},errors:[],missing_criteria:[]};
   const timings=[];
   for(const viewport of [{name:"desktop",width:1440,height:900},{name:"mobile",width:390,height:844}]){
    for(let attempt=0;attempt<opts.samples;attempt++){
     if(Date.now()-started>opts.deadlineMs){
      record.errors.push("Global deadline reached; remaining samples UNMEASURED");
      break;
     }
     let context=null,page=null;
     const view={viewport:viewport.name,sample:attempt+1,attempted:true,
        http:null,final_path:null,sameOrigin:false,rendered:false,
        keyboardFocus:null,uncaughtErrors:0,nav_ms:null,heap_mb:null,
        speed_chip:"UNKNOWN",speed_ready:"UNKNOWN",body_title:false,
        landmark:false,images_missing_alt:0,api_503:0,
        privacyMutationAttempts:0,dependencyUnavailable:false,browserStatus:"UNKNOWN",
        accessibilityScan:{status:"NOT_RUN",violations:[],seriousOrCritical:0},screenshot:null};
     try{
      context=await browser.newContext({viewport:{width:viewport.width,height:viewport.height},
        reducedMotion:"reduce",serviceWorkers:"block",colorScheme:"dark"});
      await context.route("**/*",async intercepted=>{
       const request=intercepted.request();
       const method=request.method();
       let parsed;
       try{parsed=new URL(request.url());}catch{return intercepted.abort("blockedbyclient");}
       record.resource.total_requests++;
       if(method!=="GET"&&method!=="HEAD"){
        view.privacyMutationAttempts++;record.resource.client_mutations_blocked++;
        return intercepted.abort("blockedbyclient");
       }
       if(parsed.origin!==base){record.resource.external_blocked++;return intercepted.abort("blockedbyclient");}
       if(parsed.pathname.startsWith("/api/")){
        const policy=classifyApiFixtureRequest(request.url(),method,base,databaseFixture);
        if(policy==="LOCAL_AUDITED_READONLY"){
          record.resource.api_real_requested++;
          return intercepted.continue();
        }
        record.resource.api_503++;view.api_503++;
        return intercepted.fulfill({status:503,contentType:"application/json",
          headers:{"Cache-Control":"no-store"},
          body:JSON.stringify({available:false,reason:"isolated_fixture_unavailable"})});
       }
       return intercepted.continue();
      });
      page=await context.newPage();
      page.on("response",response=>{
       try{
        const url=new URL(response.url());
        if(url.origin===base&&REAL_READONLY.has(url.pathname)&&
           classifyApiFixtureRequest(response.url(),response.request().method(),base,databaseFixture)==="LOCAL_AUDITED_READONLY"){
          const status=String(response.status());
          record.resource.api_real_statuses[status]=(record.resource.api_real_statuses[status]??0)+1;
        }
       }catch{}
      });
      const errs=[];
      page.on("pageerror",e=>{if(errs.length<12)errs.push(String(e.message).slice(0,160));});
      page.setDefaultTimeout(Math.min(6000,opts.routeMs));
      const response=await page.goto(base+route.route,{waitUntil:"domcontentloaded",timeout:opts.routeMs});
      await page.waitForTimeout(450);
      const observed=await page.evaluate(()=>{
       const timing=performance.getEntriesByType("navigation")[0];
       const body=document.body;
       const chip=document.querySelector("[data-speed-proof]");
       return {
        pathname:location.pathname,origin:location.origin,
        title:document.title.trim().length>0,
        rendered:!!body&&body.innerText.trim().length>12,
        landmark:!!document.querySelector("main,[role=main],h1"),
        imagesMissingAlt:[...document.querySelectorAll("img")].filter(x=>!x.hasAttribute("alt")).length,
        navMs:timing&&Number.isFinite(timing.duration)?Math.max(0,timing.duration):null,
        heapMb:performance.memory&&Number.isFinite(performance.memory.usedJSHeapSize)?
          Math.round(performance.memory.usedJSHeapSize/1048576*100)/100:null,
        speedChip:chip?"OBSERVED":"NOT_OBSERVED",
        speedReady:chip&&/ready in/i.test(chip.getAttribute("aria-label")||"")?
          "EXPLICIT_CANDIDATE_CHIP":"UNPROVEN"
       };
      });
      view.http=response?response.status():null;
      view.final_path=observed.pathname;
      view.sameOrigin=observed.origin===base;
      view.body_title=observed.title;
      view.rendered=observed.rendered;
      view.landmark=observed.landmark;
      view.images_missing_alt=observed.imagesMissingAlt;
      view.nav_ms=observed.navMs;view.heap_mb=observed.heapMb;
      view.speed_chip=observed.speedChip;view.speed_ready=observed.speedReady;
      view.uncaughtErrors=errs.length;
      view.dependencyUnavailable=errs.some(message=>/Server Components render/i.test(message))&&
        (databaseFixture==="UNAVAILABLE"||view.api_503>0||record.resource.external_blocked>0);
      if(errs.length)record.errors.push(viewport.name+" uncaught: "+errs.join("; "));
      // Actual keyboard interaction, not a claimed screen-reader WCAG audit.
      await page.keyboard.press("Tab");
      const keyboard=await page.evaluate(()=>{
       const focus=document.activeElement;
       return focus&&focus!==document.body&&focus!==document.documentElement;
      });
      view.keyboardFocus=keyboard;
      if(attempt===0){
       const safeName=route.route==="/"? "root":route.route.slice(1).replace(/[^A-Za-z0-9_-]/g,"_");
       const screenshot="capture-"+safeName+"-"+viewport.name+".jpg";
       await page.screenshot({path:path.join(opts.out,screenshot),type:"jpeg",quality:54,fullPage:false,animations:"disabled"});
       view.screenshot=screenshot;
       try{
        await page.addScriptTag({content:axe.source});
        const scan=await Promise.race([
         page.evaluate(async()=>{
          const output=await window.axe.run(document,{runOnly:{type:"tag",values:["wcag2a","wcag2aa","wcag21a","wcag21aa"]}});
          return output.violations.map(v=>({
           id:v.id,impact:v.impact,nodes:v.nodes.length,
           // Anonymous synthetic candidate only. Bounded machine-readable
           // selectors; no innerText, cookies, user IDs or unrestricted HTML.
           selectors:v.nodes.slice(0,30).map(node=>({
             target:(Array.isArray(node.target)?node.target:[])
               .filter(x=>typeof x==="string").slice(0,3).map(x=>x.slice(0,240)),
             failureSummary:typeof node.failureSummary==="string"?
               node.failureSummary.slice(0,300):"",
             related:(node.any||[]).slice(0,2).flatMap(check=>
               (check.relatedNodes||[]).slice(0,2).flatMap(n=>
                 (Array.isArray(n.target)?n.target:[]).filter(x=>typeof x==="string").slice(0,1).map(x=>x.slice(0,160))
               )).slice(0,4)
           }))
          }));
         }),
         new Promise((_,reject)=>setTimeout(()=>reject(new Error("Axe scan deadline")),10000))
        ]);
        view.accessibilityScan={status:"MEASURED",violations:scan.slice(0,25),
         seriousOrCritical:scan.filter(x=>x.impact==="serious"||x.impact==="critical").length};
       }catch(e){
        view.accessibilityScan={status:"UNKNOWN_SCAN_FAILED",violations:[],seriousOrCritical:0};
        record.errors.push(viewport.name+" axe scan not measured: "+String(e.message||e).slice(0,100));
       }
      }
      view.browserStatus=view.http===200&&view.sameOrigin&&view.rendered?
         "OBSERVED":"FAIL";
      if(Number.isFinite(view.nav_ms))timings.push(view.nav_ms);
      if(observed.imagesMissingAlt>0)record.errors.push(viewport.name+
         ": "+observed.imagesMissingAlt+" img missing alt attributes");
     }catch(error){
      view.browserStatus="FAIL";
      record.errors.push(viewport.name+": "+String(error&&error.message||error).slice(0,280));
     }finally{
      record.views.push(view);
      if(page)await page.close().catch(()=>{});
      if(context)await context.close().catch(()=>{});
     }
    }
   }
   record.status=classifyCandidateRoute(record,databaseFixture);
   record.criteria.navigation=record.views.every(v=>v.http===200&&v.sameOrigin&&
     v.final_path===(route.redirect_to||route.route))?"PASS":"FAIL";
   const dependencyGap=databaseFixture==="UNAVAILABLE"&&record.views.some(v=>v.dependencyUnavailable);
   record.criteria.render=dependencyGap?"UNKNOWN":record.views.every(v=>v.rendered&&v.landmark&&v.body_title)?"PASS":"FAIL";
   record.criteria.keyboard=dependencyGap?"UNKNOWN":record.views.every(v=>v.keyboardFocus===true)?"PASS":"FAIL";
   record.criteria.client_mutation_attempts=record.resource.client_mutations_blocked>0?
     "OBSERVED_AND_BLOCKED_NOT_CLEARED":"NONE_OBSERVED";
   const measuredAxe=record.views.filter(v=>v.accessibilityScan.status==="MEASURED");
   record.criteria.accessibility=dependencyGap?"UNKNOWN":
     record.views.some(v=>v.images_missing_alt>0||v.accessibilityScan.seriousOrCritical>0)?"FAIL":
     measuredAxe.length===2?"OBSERVED_AXE_AUTOMATED_ONLY":"UNKNOWN";
   record.criteria.api_failure=record.views.some(v=>v.api_503>0)?"OBSERVED_SYNTHETIC_503":"UNKNOWN";
   record.criteria.api_real=record.resource.api_real_requested>0?
     "LOCAL_READONLY_GET_OBSERVED_NOT_DOMAIN_CERTIFIED":"UNKNOWN";
   // A retained Speed reading does not qualify current-route explicit readiness.
   record.criteria.speed_readiness=route.overlay_source_policy.speed_explicit_route?
      (record.views.some(v=>v.speed_ready==="EXPLICIT_CANDIDATE_CHIP")?
       "OBSERVED_CLIENT_ONLY":"UNKNOWN"):
      "NO_BY_POLICY";
   record.criteria.living_presence=route.overlay_source_policy.living_eligibility==="NO_BY_POLICY"?
     "NO_BY_POLICY":"UNKNOWN";
   record.criteria.gray_notice=route.overlay_source_policy.gray_enrolled?
     "SOURCE_ONLY":"NO_BY_POLICY";
   record.criteria.seasonal_theme="UNKNOWN";
   record.performance={navigation_ms:percentiles(timings),
      sample_count:timings.length,controlled_fixture:false,
      qualified_minimum_samples:10,gate:"UNKNOWN"};
   record.missing_criteria=Object.entries(record.criteria)
     .filter(([,value])=>!["PASS","NO_BY_POLICY"].includes(value))
     .map(([key,value])=>({criterion:key,state:value}));
   const name=route.route==="/"?"root":route.route.slice(1).replace(/[^A-Za-z0-9_-]/g,"_");
   write("route-"+name+".json",record);
   receipt.routes.push({route:record.route,status:record.status,
       passed:Object.entries(record.criteria).filter(([,v])=>v==="PASS").length,
       unknown:record.missing_criteria.length,
       receipt:"route-"+name+".json"});
   console.log("CHROME "+record.route+" "+record.status+" "+receipt.routes.length+"/"+selected.length);
  }
 }finally{await browser.close();}
 receipt.finished_at=new Date().toISOString();
 receipt.elapsed_seconds=Math.round((Date.now()-started)/1000);
 receipt.status=receipt.routes.length===selected.length?
   (receipt.routes.some(r=>r.status==="FAIL")?"FAIL":
    receipt.routes.every(r=>r.status==="PASS")?"CANDIDATE_SMOKE_OBSERVED":"PARTIAL_UNKNOWN"):
   "INCOMPLETE";
 write("cohort.json",receipt);
 write("digest.json",{source_sha:sha,build_id:buildId,cohort:opts.cohort,
    count:receipt.routes.length,expected_count:selected.length,
    receipt_sha256:payloadDigest(receipt),
    route_status_counts:Object.fromEntries(["PASS","FAIL","UNKNOWN"].map(x=>
      [x,receipt.routes.filter(r=>r.status===x).length])),
    budget_note:"Actual local Chrome worker; no production or full domain certification"});
 if(receipt.routes.length!==selected.length||receipt.routes.some(r=>r.status==="FAIL")){
  process.exitCode=1;
 }else console.log("CHROME COMPLETE candidate observations, score=NULL, production=UNMEASURED");
}
run().catch(e=>{console.error(e&&e.stack||String(e));process.exitCode=ERROR_CODE;});
