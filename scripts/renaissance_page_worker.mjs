#!/usr/bin/env node
/**
 * Renaissance Campaign public page-work launcher.
 * Read-only assignment template. Does NOT lock a route, certify a score,
 * grant private access, approve changes, modify GitHub, or deploy anything.
 * Built against canonical public Index catalog + full campaign planning order.
 */
import { readFileSync, existsSync } from "node:fs";

import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const root=resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read=name=>JSON.parse(readFileSync(join(root,"config",name),"utf8"));
const stop=reason=>{throw Error("RENAISSANCE LAUNCH STOP: "+reason)};
const dims=[["correctness",30],["functionality",25],["performance",20],["maintainability",15],["tests",10]];
const routePattern=/^\/(?:[a-z0-9-]+(?:\/[a-z0-9-]+)*)?$/;
const shaPattern=/^[a-f0-9]{40}$/;
const routeFile=route=>join("app",...(route==="/"?[]:route.slice(1).split("/")),"page.tsx");

/** A pure redirect wrapper is a route alias, not an independently owned content page. */
export function redirectAliasDestination(source){
 if(typeof source!=="string")stop("page source unavailable for alias classification");
 const found=source.match(/export\s+default\s+(?:async\s+)?function\s+\w*\s*\([^)]*\)\s*\{\s*redirect\(\s*["'](\/[^"']+)["']\s*\)\s*;?\s*\}/);
 return found&&/from\s*["']next\/navigation["']/.test(source)?found[1]:null;
}


export function buildPublicPageAssignment({route,sourceSha,catalog,campaign,rubric,profiles,sourceExists=()=>true,sourceText=()=>null}){
 if(typeof route!=="string"||!routePattern.test(route))stop("invalid literal public route");
 if(typeof sourceSha!=="string"||!shaPattern.test(sourceSha))stop("exact 40-character Git SHA required");
 if(!Array.isArray(catalog)||!Array.isArray(campaign?.phases))stop("canonical catalogs missing");
 const enrolled=catalog.find(row=>row.href===route);
 const phases=campaign.phases.filter(phase=>phase.routes?.includes(route));
 const modules=campaign.modules?.filter(candidate=>candidate.href===route)??[];
 const isUnphasedModule=phases.length===0&&modules.length===1&&route.startsWith("/renaissance");
 if(!enrolled||(phases.length!==1&&!isUnphasedModule))stop("not a uniquely registered public page or Renaissance module; protected/dynamic/unknown pages require private assignment");
 if(typeof enrolled.sourceTree!=="string"||!/^src-[a-f0-9]{16}$/.test(enrolled.sourceTree))stop("route-local source census missing");
 const entrypoint=routeFile(route);
 if(!sourceExists(entrypoint))stop("source page template not found");
 const alias=redirectAliasDestination(sourceText(entrypoint));
 if(alias)stop("redirect-only alias "+route+" -> "+alias+"; assign the canonical owning page instead");
 const profileId=profiles?.routeProfiles?.[route],profile=profiles?.profiles?.[profileId];
 if(!profileId||!profile||!Array.isArray(profile.gates))stop("missing route-specific assurance profile");
 if(rubric?.maximum!==100||!rubric?.version)stop("unrecognized canonical rubric");
 const criteria=[],seen=new Set();
 for(const [dimension,max] of dims){
  const row=rubric.dimensions?.[dimension];
  if(row?.weight!==max||!Array.isArray(row.criteria)||row.criteria.reduce((n,c)=>n+c.max,0)!==max)
   stop("rubric dimension/criteria mismatch: "+dimension);
  for(const c of row.criteria){
   if(typeof c.id!=="string"||!c.id||seen.has(c.id)||!Number.isInteger(c.max)||c.max<=0||typeof c.requirement!=="string"||!c.requirement)
    stop("invalid or duplicated rubric criterion");
   seen.add(c.id);
   criteria.push({id:c.id,dimension,maximum:c.max,requirement:c.requirement,earned:null,status:"INDEPENDENT_EVIDENCE_REQUIRED"});
  }
 }
 if(criteria.length!==20||criteria.reduce((s,c)=>s+c.maximum,0)!==100)stop("canonical 20-criterion total mismatch");
 const gates=profile.gates.map(g=>({id:g.id,requirement:g.requirement,status:"UNVERIFIED"}));
 if(gates.some(g=>typeof g.id!=="string"||!g.id||typeof g.requirement!=="string"||!g.requirement)||new Set(gates.map(g=>g.id)).size!==gates.length)stop("invalid assurance gates");
 const slug=route==="/"?"home":route.slice(1).replaceAll("/","-");
 return Object.freeze({
  schema:1,kind:"aoe2war.renaissance.public-page-worker.v1",route,
  entrypoint,phase:isUnphasedModule?"I":phases[0].id,scope:"public-index",
  candidateSourceSha:sourceSha,routeLocalSourceTree:enrolled.sourceTree,
  sourceTreeIsTransitiveProof:false,assuranceProfile:profileId,rubricVersion:rubric.version,
  criteria,gates,maximum:100,score:null,certified:false,releaseAuthorized:false,
  suggestedBranch:"feature/renaissance-page-"+slug+"-"+sourceSha.slice(0,10),
  authorization:"COORDINATOR_REVIEW_REQUIRED",
  limitations:"Not a source-lock, criterion proof, security review, real-browser measurement, merged code, or production permission."
 });
}
export function renderPublicPagePrompt(c){
 const lines=[
  "# ⚔️ AoE2WAR Renaissance — Page Specialist: "+c.route,"",
  "**Route:** \x60"+c.route+"\x60  **Entrypoint:** \x60"+c.entrypoint+"\x60",
  "**Phase:** "+c.phase+"  **Source to reverify:** \x60"+c.candidateSourceSha+"\x60",
  "**Route-local fingerprint:** \x60"+c.routeLocalSourceTree+"\x60 (NOT transitive closure)",
  "**Suggested unique branch:** \x60"+c.suggestedBranch+"\x60 (confirm availability)",
  "**Assurance profile:** "+c.assuranceProfile+"  **Current earned points:** UNKNOWN (not zero)",
  "",
  "## Boundaries",
  "Own this page only. Check active GitHub issues/PR file overlap and reserve scope with the Renaissance coordinator before writing.",
  "Use a draft PR; no direct main writes, force pushes, resets, deployments, scoring publication, global infrastructure edits, WoloChain/financial changes, or credential access.",
  "Coordinate shared components, Brain, Intelligence, Sensors, Agents, API/schema, registry, scoring and release-controller changes centrally.",
  "Keep public, dynamic, authenticated and admin pages separate. This contract is ONLY public static page scope.",
  "Handoffs are snapshots; verify current main, production, browser state, live services and CI independently.",
  "",
  "## Canonical criteria — 100 possible, NONE yet awarded"
 ];
 for(const [dimension,max] of dims){
  lines.push("", "### "+dimension.toUpperCase()+" / "+max);
  for(const c0 of c.criteria.filter(r=>r.dimension===dimension))
   lines.push("- "+c0.id+" ("+c0.maximum+"): "+c0.requirement);
 }
 lines.push("", "## Mandatory route gates (no bonus points)");
 for(const gate of c.gates)lines.push("- "+gate.id+": "+gate.requirement);
 lines.push("","## Sprint (aim 5–10 turns; no false certification)",
  "1. Reconcile exact current source, route behavior, domain authorities, shared dependency closure, previous dossier and overlapping files. Record real defects/unknowns.",
  "2. Build the highest-value page-local improvements: correctness/privacy/security, safe errors, accessibility, resource/performance budgets and useful low-overhead telemetry.",
  "3. Run unit/adversarial, integration, TS/build, desktop/mobile browser, cold/warm P75/P95, DB and sustained-load tests as appropriate; record raw receipts, conditions, provenance and limits.",
  "4. Deliver exact-sha scoped draft PR, verified evidence per criterion and gate, changes/risks, gaps and integration/rollback proposal. If not measured, report UNKNOWN.",
  "5. Central coordinator independently owns signed evidence ingestion, production source/build parity, authenticated score publication, release approval and final certification.",
  "",
  "**NO GRADE OR LIVE RELEASE AUTHORIZED BY THIS TEMPLATE.**");
 return lines.join("\n")+"\n";
}
export function publicCandidateQueue({catalog,campaign,sourceText=()=>null}){
 if(!Array.isArray(catalog)||!Array.isArray(campaign?.phases))stop("canonical catalogs missing");
 const included=new Set(catalog.map(row=>row.href)),seen=new Set(),queue=[];
 const append=(route,phase)=>{
  if(!included.has(route))return;
  if(seen.has(route))stop("duplicate public route assignment");
  seen.add(route);
  const alias=redirectAliasDestination(sourceText(routeFile(route)));
  queue.push({route,phase,kind:alias?"REDIRECT_ALIAS":"PAGE",canonicalTarget:alias||null});
 };
 // Keep the original Phase I order intact. Later Renaissance instruments
 // are explicitly enumerated in campaign.modules until the 144-template
 // Phase I census branch lands. Do not pretend the old 132-plan covers 88.
 for(const phase of campaign.phases){
  for(const route of phase.routes||[])append(route,phase.id);
  if(phase.id==="I"){
   for(const registered of campaign.modules||[]){
    if(typeof registered.href!=="string"||!registered.href.startsWith("/renaissance"))
     stop("invalid Renaissance module registration");
    if(!seen.has(registered.href))append(registered.href,"I");
   }
  }
 }
 if(seen.size!==included.size)stop("public campaign coverage drift: "+[...included].filter(x=>!seen.has(x)).join(","));
 return queue;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const args=process.argv.slice(2),options={};
  for(let i=0;i<args.length;i+=2){
   const k=args[i],v=args[i+1];
   if(!["--route","--sha","--format"].includes(k)||!v||options[k])stop("usage: --route /kingdom-index --sha <40hex> [--format markdown|json|queue]");
   options[k]=v;
  }
  const catalog=read("kingdom-index-routes.json"),campaign=read("renaissance-campaign.json");
  const format=options["--format"]||"markdown";
  if(format==="queue"){
   if(options["--route"]||options["--sha"])stop("queue mode takes no route/SHA");
   process.stdout.write(JSON.stringify(publicCandidateQueue({catalog,campaign,sourceText:relative=>readFileSync(join(root,relative),"utf8")}),null,2)+"\n");
  }else{
   if(!["json","markdown"].includes(format))stop("unknown output format");
   const c=buildPublicPageAssignment({route:options["--route"],sourceSha:options["--sha"],catalog,campaign,
    rubric:read("kingdom-index-quality-rubric.json"),profiles:read("kingdom-index-assurance-profiles.json"),
    sourceExists:relative=>existsSync(join(root,relative)),
    sourceText:relative=>readFileSync(join(root,relative),"utf8")});
   process.stdout.write(format==="json"?JSON.stringify(c,null,2)+"\n":renderPublicPagePrompt(c));
  }
 }catch(e){console.error(e.message);process.exitCode=2;}
}
