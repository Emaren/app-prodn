#!/usr/bin/env node
/**
 * Renaissance Command source/CI handoff snapshot.
 * Authenticated read-only GitHub queries; NEVER a merge, release, or score authority.
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const SHA=/^[a-f0-9]{40}$/;
const REPO=/^[\w.-]+\/[\w.-]+$/;
const stop=reason=>{throw Error("RENAISSANCE SNAPSHOT STOP: "+reason)};
function validSha(s){return typeof s==="string"&&SHA.test(s)}
export function parseSnapshotArgs(argv){
 const seen=new Set(),o={};
 for(let i=0;i<argv.length;i+=2){
  const k=argv[i],v=argv[i+1];
  if(!["--repo","--prs","--format"].includes(k)||seen.has(k)||typeof v!=="string"||!v)
   stop("usage: --repo OWNER/REPO --prs 802,805,807,808 [--format markdown|json]");
  seen.add(k);o[k]=v;
 }
 if(!REPO.test(o["--repo"]||""))stop("specific GitHub OWNER/REPO required");
 if(!/^[1-9]\d*(,[1-9]\d*)*$/.test(o["--prs"]||""))stop("comma-separated positive PR numbers required");
 const prs=o["--prs"].split(",").map(Number);
 if(prs.length>20||prs.some(n=>!Number.isSafeInteger(n))||new Set(prs).size!==prs.length)
  stop("one to twenty distinct valid PR numbers required");
 const format=o["--format"]||"markdown";
 if(!["markdown","json"].includes(format))stop("unknown snapshot format");
 return {repo:o["--repo"],prs,format};
}
export function validateRenaissanceSnapshot({repo,mainBefore,mainAfter,requested,prs,runsByPr,confirmedHeads}){
 if(!REPO.test(repo)||!validSha(mainBefore?.sha)||!validSha(mainAfter?.sha))
  stop("GitHub main commit identity missing");
 if(mainBefore.sha!==mainAfter.sha)stop("main changed during inspection; rerun against new main");
 if(!Array.isArray(requested)||!requested.length||requested.length>20||new Set(requested).size!==requested.length)
  stop("invalid requested PR census");
 if(!Array.isArray(prs)||prs.length!==requested.length||!Array.isArray(runsByPr)||runsByPr.length!==requested.length||
    !Array.isArray(confirmedHeads)||confirmedHeads.length!==requested.length)
  stop("incomplete snapshot inputs");
 const rows=prs.map((p,i)=>{
  const n=requested[i],r=runsByPr[i],confirm=confirmedHeads[i];
  if(!Number.isSafeInteger(n)||n<1||p?.number!==n||!validSha(p?.head?.sha)||
    !validSha(p?.base?.sha)||!["open","closed"].includes(p?.state)||typeof p?.draft!=="boolean")
   stop("incomplete PR metadata for #"+n);
  if(confirm?.number!==n||confirm?.head?.sha!==p.head.sha||confirm?.state!==p.state)
   stop("PR #"+n+" changed during inspection; rerun");
  if(!Number.isSafeInteger(r?.total_count)||r.total_count<0||r.total_count>=100||
    !Array.isArray(r.workflow_runs)||r.workflow_runs.length!==r.total_count)
   stop("PR #"+n+" incomplete exact-head workflow history");
  const flows=r.workflow_runs.map(x=>{
   if(!Number.isSafeInteger(x.id)||!["queued","in_progress","completed","requested","waiting","pending"].includes(x.status)||
       x.head_sha!==p.head.sha||typeof x.name!=="string"||!x.name)
    stop("PR #"+n+" invalid or mismatched workflow run");
   return {id:x.id,name:x.name,status:x.status,conclusion:x.conclusion??null};
  }).sort((a,b)=>b.id-a.id);
  const workflowObservation=flows.length===0?"NO_EXACT_HEAD_RUN_OBSERVED":
   flows.some(x=>x.status!=="completed")?"INCOMPLETE":
   flows.some(x=>x.conclusion!=="success")?"HAS_NON_SUCCESS_RUNS":
   "OBSERVED_RUNS_SUCCESS";
  return {
   pr:n,title:typeof p.title==="string"?p.title:"",headSha:p.head.sha,baseSha:p.base.sha,
   baseBranch:p.base.ref??null,state:p.state,draft:p.draft,mergeable:p.mergeable??null,
   changedFiles:Number.isSafeInteger(p.changed_files)?p.changed_files:null,
   workflowObservation,runs:flows
  };
 });
 return {
  schema:1,kind:"aoe2war.renaissance.command-snapshot.v1",
  repo,mainSha:mainBefore.sha,prs:rows,
  score:null,independentlyCertified:false,mergeAuthorized:false,releaseAuthorized:false,
  limitations:"Read-only non-atomic GitHub API observation. Workflow names/results are not a complete policy or branch-protection evaluation; green CI is not independent certification. No deployed SHA/BUILD_ID or financial authority is attested."
 };
}
export function renderSnapshot(snapshot){
 const tick=String.fromCharCode(96);
 const s=[
  "# ⚔️ Renaissance Command — GitHub source/CI snapshot",
  "",
  "Repository: "+snapshot.repo+" · main: "+tick+snapshot.mainSha+tick,
  "",
  "| PR | Head SHA | Base | State | Exact-head workflow observation |",
  "|---|---|---|---|---|"
 ];
 for(const p of snapshot.prs){
  s.push("| #"+p.pr+" | "+tick+p.headSha+tick+" | "+tick+(p.baseBranch??"UNKNOWN")+tick+" @ "+tick+p.baseSha.slice(0,12)+tick+" | "+
    p.state+(p.draft?"/draft":"/review")+" | "+p.workflowObservation+" |");
 }
 s.push("","## Exact-head workflow observations");
 for(const p of snapshot.prs){
  s.push("","**PR #"+p.pr+"**");
  if(!p.runs.length)s.push("- No exact-head workflow runs observed");
  for(const run of p.runs){
   const safeName=run.name.replace(/[\r\n|<>]/g," ").slice(0,120);
   s.push("- Run "+run.id+": "+safeName+" — "+run.status+"/"+(run.conclusion??"UNKNOWN"));
  }
 }
 s.push("","**Score: UNKNOWN · No merge, certification or production release approved.**",
  "",snapshot.limitations);
 return s.join("\n")+"\n";
}
function liveApi(repo,suffix){
 try{return JSON.parse(execFileSync("gh",["api","repos/"+repo+"/"+suffix],
  {encoding:"utf8",timeout:120000,maxBuffer:24*1024*1024,stdio:["ignore","pipe","pipe"]}));}
 catch(e){stop("GitHub API unavailable/incomplete: "+String(e?.message||e).slice(0,180))}
}
export function collectLiveSnapshot({repo,prs},api=liveApi){
 const mainBefore=api(repo,"commits/main");
 const primary=prs.map(n=>api(repo,"pulls/"+n));
 const runsByPr=primary.map((p,i)=>{
  if(p?.number!==prs[i]||!validSha(p?.head?.sha))stop("PR head unavailable for #"+prs[i]);
  return api(repo,"actions/runs?head_sha="+p.head.sha+"&per_page=100");
 });
 const confirmedHeads=prs.map(n=>api(repo,"pulls/"+n));
 const mainAfter=api(repo,"commits/main");
 return validateRenaissanceSnapshot({
  repo,mainBefore,mainAfter,requested:prs,prs:primary,runsByPr,confirmedHeads
 });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const opts=parseSnapshotArgs(process.argv.slice(2));
  const snapshot=collectLiveSnapshot(opts);
  process.stdout.write(opts.format==="json"?JSON.stringify(snapshot,null,2)+"\n":renderSnapshot(snapshot));
 }catch(e){console.error(String(e?.message||e));process.exitCode=2}
}
