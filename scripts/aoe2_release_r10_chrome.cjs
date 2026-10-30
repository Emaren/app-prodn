#!/usr/bin/env node
"use strict";
/* Read-only AUTHENTICATED PRODUCTION Chrome acceptance.
 * No synthetic cookies, no production DB fixture, no mutations.
 * Browser-only PASS is NEVER a release certification.
 */
const fs=require("node:fs");
const path=require("node:path");
const assert=require("node:assert/strict");
const {createHash}=require("node:crypto");
const {createRequire}=require("node:module");
const NAMES=["Storage OS","Backup OS","Documents OS","General Inspections",
             "Kingdom Intelligence","Work Board","Navigation"];
const PINNED_ROUTES={
 "Storage OS":"/admin/storage-os",
 "General Inspections":"/general-inspections",
 "Kingdom Intelligence":"/kingdom-intelligence",
 "Work Board":"/admin/central-command",
 "Navigation":"/admin/aoe2war-os"
};
function hold(code){throw new Error("R10_CHROME_HOLD:"+code)}
function args(argv){
 const allowed=new Set(["admin-state","nonadmin-state","surfaces","host-receipt",
 "expected-train","expected-sha","expected-build-id","expected-version","out","chrome","pw-home"]);
 const o={};
 for(let i=0;i<argv.length;i+=2){
  const k=argv[i],v=argv[i+1];if(!k||!k.startsWith("--")||!v||
   !allowed.has(k.slice(2))||Object.hasOwn(o,k.slice(2)))hold("BAD_ARGUMENT");
  o[k.slice(2)]=v;
 }
 for(const key of allowed)if(!o[key])hold("MISSING_"+key.toUpperCase());
 const trains={W1:"b46a51f1592c9f296839924ae55e722618b10d35",
  POST_W1:"fa5c350b35cba7ace8d4515a7ad52ba4e1534295"};
 if(!Object.hasOwn(trains,o["expected-train"])||
    trains[o["expected-train"]]!==o["expected-sha"])hold("UNAPPROVED_SOURCE_TRAIN");
 if(!/^[a-f0-9]{40}$/.test(o["expected-sha"])||
    !/^[A-Za-z0-9_-]{8,128}$/.test(o["expected-build-id"])||
    o["expected-version"]==="unknown")hold("EXPECTED_IDENTITY_INVALID");
 for(const k of ["admin-state","nonadmin-state","surfaces","host-receipt","out","chrome","pw-home"])
  if(!path.isAbsolute(o[k]))hold("REQUIRE_ABSOLUTE_"+k);
 return o;
}
function jsonFile(p,max=262144){
 const st=fs.lstatSync(p);
 if(!st.isFile()||st.isSymbolicLink()||st.size<=0||st.size>max)hold("UNSAFE_INPUT_FILE");
 return JSON.parse(fs.readFileSync(p,"utf8"));
}
function loadSurfaces(file){
 const manifest=jsonFile(file,65536);
 if(manifest.schema!=="aoe2war.g.seven-surfaces.v1"||
  !Array.isArray(manifest.surfaces)||manifest.surfaces.length!==7 ||
  JSON.stringify(manifest.surfaces.map(x=>x.name))!==JSON.stringify(NAMES))
  hold("SEVEN_SURFACE_MANIFEST_UNAVAILABLE");
 for(const item of manifest.surfaces){
  if(typeof item.path!=="string"||!/^\/(?!\/)[^\s?#]*$/.test(item.path)||
   typeof item.heading!=="string"||item.heading.length<3||
   typeof item.selector!=="string"||!item.selector.trim())hold("SURFACE_PATH_OR_SELECTOR_MISSING:"+item.name);
  if(PINNED_ROUTES[item.name] && PINNED_ROUTES[item.name] !== item.path)
   hold("CANONICAL_ROUTE_SUBSTITUTION:"+item.name);
 }
 return manifest.surfaces;
}
function noStore(res){return /no-store/i.test(res.headers()["cache-control"]||"")}
async function getVersion(context){
 const res=await context.request.get("https://aoe2war.com/api/deployment-version",
  {maxRedirects:0,timeout:10000});
 if(res.status()!==200||!noStore(res))hold("PUBLIC_VERSION_HTTP_CACHE_HOLD");
 const val=await res.json();if(typeof val.buildVersion!=="string"||!val.buildVersion||
  val.buildVersion==="unknown")hold("PUBLIC_VERSION_UNKNOWN");
 return val.buildVersion;
}
async function authGates(browser,adminState,nonadminState){
 const results=[];
 for(const [role,state,expected] of [
   ["anonymous",undefined,401],["nonadmin",nonadminState,403],["admin",adminState,200]]){
  const ctx=await browser.newContext({baseURL:"https://aoe2war.com",
   ...(state?{storageState:state}:{}) ,serviceWorkers:"block",ignoreHTTPSErrors:false});
  try{
   for(const url of ["/api/admin/central-command","/api/admin/storage-os"]){
    const res=await ctx.request.get(url,{maxRedirects:0,timeout:12000});
    const ok=res.status()===expected && noStore(res);
    results.push({role,path:url,status:res.status(),no_store:noStore(res),
      verdict:ok?"PASS":"HOLD"});
   }
   if(role==="admin"){
    const r=await ctx.request.post("/api/admin/central-command",{data:{},
        maxRedirects:0,timeout:12000});
    results.push({role,method:"POST",path:"/api/admin/central-command",
      status:r.status(),verdict:r.status()===405?"PASS":"HOLD"});
   }
  }finally{await ctx.close();}
 }
 return results;
}
async function main(){
 const opts=args(process.argv.slice(2));
 if(!fs.existsSync(opts.chrome)||!fs.statSync(opts.chrome).isFile())hold("CHROME_MISSING");
 for(const key of ["admin-state","nonadmin-state"]){
  const st=fs.lstatSync(opts[key]);
  if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077)!==0||
     (typeof process.getuid==="function"&&st.uid!==process.getuid()))
   hold("PRIVATE_SESSION_STATE_PERMISSIONS:"+key);
 }
 const surfaces=loadSurfaces(opts.surfaces);
 const host=jsonFile(opts["host-receipt"]);
 if(host.schema!=="aoe2war.g.r10.host-postflight.v1"||
   host.status!=="PASS"||host.production_certified!==false||
   host.expected?.source_sha!==opts["expected-sha"]||
   host.expected?.build_id!==opts["expected-build-id"]||
   host.expected?.compiled_version!==opts["expected-version"]||
   host.expected?.train!==opts["expected-train"]||
   !host.checks||Object.values(host.checks).some(x=>x?.verdict!=="PASS"))
  hold("F_ROOT_SIGNED_HOST_POSTFLIGHT_NOT_YET_ACCEPTED");
 // This host JSON is not an independently signed trust envelope. Even a
 // browser-only PASS must NEVER be labeled a combined live release PASS.
 const pw=opts["pw-home"],chromium=require(path.join(pw,"node_modules/playwright-core")).chromium;
 const axe=require(path.join(pw,"node_modules/axe-core"));
 const out={schema:"aoe2war.g.r10.production-chrome.v1",
   origin:"https://aoe2war.com",source_sha:opts["expected-sha"],
   build_id:opts["expected-build-id"],compiled_version:opts["expected-version"],
   host_receipt_sha256:createHash("sha256").update(fs.readFileSync(opts["host-receipt"])).digest("hex"),
   genuine_browser:true,fixture:false,production_certified:false,
   report_scope:"BROWSER_ONLY_NEVER_COMBINED_PRODUCTION_AUTHORIZATION",
   observed_at:new Date().toISOString(),auth:[],surfaces:[],
   browser_status:"HOLD",failure_codes:[]};
 const browser=await chromium.launch({headless:true,executablePath:opts.chrome,
   args:["--disable-dev-shm-usage"]});
 try{
  out.auth=await authGates(browser,opts["admin-state"],opts["nonadmin-state"]);
  if(out.auth.some(x=>x.verdict!=="PASS"))out.failure_codes.push("ADMIN_AUTH_401_403_200_OR_405_FAIL");
  const context=await browser.newContext({baseURL:"https://aoe2war.com",
    storageState:opts["admin-state"],serviceWorkers:"block",
    ignoreHTTPSErrors:false,reducedMotion:"reduce"});
  const vBefore=await getVersion(context);
  if(vBefore!==opts["expected-version"])out.failure_codes.push("PUBLIC_COMPILED_VERSION_MISMATCH");
  for(const width of [375,768,1440]){
   for(const surface of surfaces){
    const rec={surface:surface.name,path:surface.path,viewport:width,
      verdict:"HOLD",http:null,final_path:null,heading:false,selector:false,
      keyboard_focus:false,overflow:false,page_errors:[],axe_serious_or_critical:[],
      blocked_mutations:0,blocked_external:0,diagnostics:[]};
    const page=await context.newPage();
    await page.setViewportSize({width,height:840});
    page.on("pageerror",err=>rec.page_errors.push(String(err.message).slice(0,180)));
    await page.route("**/*",async route=>{
     const req=route.request();let url;
     try{url=new URL(req.url())}catch{rec.blocked_external++;return route.abort()}
     if(req.method()!=="GET"&&req.method()!=="HEAD"){
      rec.blocked_mutations++;return route.abort();
     }
     if(url.origin!=="https://aoe2war.com"&&url.protocol!=="data:"){
      rec.blocked_external++;return route.abort();
     }
     return route.continue();
    });
    try{
     const res=await page.goto(surface.path,{waitUntil:"domcontentloaded",timeout:30000});
     rec.http=res?.status()||null;
     const final=new URL(page.url());
     rec.final_path=final.pathname;
     if(final.origin!=="https://aoe2war.com"||final.pathname!==surface.path)
      rec.diagnostics.push("REDIRECT_OR_CROSS_ORIGIN");
     if(rec.http!==200)rec.diagnostics.push("HTTP_NOT_200");
     try{
      await page.getByRole("heading",{name:surface.heading,exact:true})
        .first().waitFor({timeout:14000});
      rec.heading=true;
     }catch{rec.diagnostics.push("EXPECTED_HEADING_MISSING")}
     try{
      await page.locator(surface.selector).first().waitFor({state:"visible",timeout:12000});
      rec.selector=true;
     }catch{rec.diagnostics.push("SURFACE_SPECIFIC_SELECTOR_MISSING")}
     await page.keyboard.press("Tab");
     rec.keyboard_focus=await page.evaluate(()=>document.activeElement!==document.body);
     if(!rec.keyboard_focus)rec.diagnostics.push("KEYBOARD_FOCUS_MISSING");
     rec.overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+5);
     if(rec.overflow)rec.diagnostics.push("HORIZONTAL_OVERFLOW");
     await page.addScriptTag({content:axe.source});
     rec.axe_serious_or_critical=await page.evaluate(async()=>{
      const result=await window.axe.run(document,{runOnly:{
       type:"tag",values:["wcag2a","wcag2aa","wcag21a","wcag21aa"]}});
      return result.violations.filter(v=>["critical","serious"].includes(v.impact))
       .map(v=>({id:v.id,impact:v.impact,targets:v.nodes.slice(0,3).map(n=>n.target)}));
     });
     if(rec.axe_serious_or_critical.length)rec.diagnostics.push("SERIOUS_AXE_VIOLATION");
     if(rec.page_errors.length)rec.diagnostics.push("BROWSER_UNCAUGHT_ERROR");
     if(rec.blocked_mutations)rec.diagnostics.push("CLIENT_ATTEMPTED_MUTATION");
     if(surface.name==="Navigation"){
      const routeLinks=await page.locator('#navigation-atlas a[data-atlas-href]').evaluateAll(
       nodes=>nodes.map(n=>n.getAttribute("data-atlas-href")));
      if(opts["expected-train"]==="POST_W1" &&
         (routeLinks.length!==33||new Set(routeLinks).size!==33||
          !routeLinks.includes("/admin/storage-transfer")))
       rec.diagnostics.push("POST_W1_PRIVATE_ATLAS_33_UNVERIFIED");
      if(opts["expected-train"]==="W1")
       rec.diagnostics.push("W1_PRIVATE_ATLAS_NOT_IN_SOURCE_SCOPE");
     }
    }catch(e){rec.diagnostics.push(("NAV_OR_SCAN_ERROR:"+String(e.message)).slice(0,250))}
    rec.verdict=rec.diagnostics.length?"HOLD":"PASS";
    out.surfaces.push(rec);
    await page.close();
   }
  }
  const vAfter=await getVersion(context);
  if(vAfter!==vBefore||vAfter!==opts["expected-version"])
   out.failure_codes.push("PUBLIC_VERSION_CHANGED_DURING_BROWSER");
  await context.close();
  if(out.surfaces.length!==21)out.failure_codes.push("INCOMPLETE_VIEWPORT_COVERAGE");
  if(out.surfaces.some(x=>x.verdict!=="PASS"))out.failure_codes.push("SURFACE_OR_AXE_FAILURE");
  out.browser_status=out.failure_codes.length?"HOLD":"PASS";
 }finally{await browser.close();}
 const dir=path.dirname(opts.out);
 if(!fs.existsSync(dir))hold("OUTPUT_DIRECTORY_MISSING");
 const fd=fs.openSync(opts.out,fs.constants.O_WRONLY|fs.constants.O_CREAT|
  fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);
 try{fs.writeFileSync(fd,JSON.stringify(out,null,2)+"\n")}finally{fs.closeSync(fd)}
 console.log(JSON.stringify({schema:out.schema,status:out.browser_status,
   failure_codes:out.failure_codes,coverage:out.surfaces.length,
   source_sha:out.source_sha,build_id:out.build_id,
   evidence_path:opts.out,production_certified:false}));
 if(out.browser_status!=="PASS")process.exitCode=2;
}
main().catch(err=>{
 const code=String(err.message||err).replace(/[\r\n]/g," ").slice(0,240);
 console.error("R10_CHROME_HOLD:"+code);
 const at=process.argv.indexOf("--out");
 const out=at>=0?process.argv[at+1]:null;
 if(typeof out==="string"&&path.isAbsolute(out)){
  try{
   const fd=fs.openSync(out,fs.constants.O_WRONLY|fs.constants.O_CREAT|
    fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);
   try{fs.writeFileSync(fd,JSON.stringify({
     schema:"aoe2war.g.r10.production-chrome.v1",browser_status:"HOLD",
     failure_codes:[code],genuine_browser:false,fixture:false,
     production_certified:false,observed_at:new Date().toISOString()
   },null,2)+"\n")}finally{fs.closeSync(fd)}
  }catch{/* no clobbering any previous evidence */}
 }
 process.exitCode=2;
});
