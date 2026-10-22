#!/usr/bin/env node
/**
 * Renaissance PR collision audit. READ ONLY. Never locks files or approves merges.
 * Live mode uses authenticated GitHub CLI's read-only gh pr list query.
 * A snapshot is useful for local tests, never sufficient for release approval.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SHA40=/^[a-f0-9]{40}$/;
const VALID_REPO=/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;
const SAFE_PATH=/^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*[\u0000-\u001f\\])[\w.+@(), \-[\]\/]+$/;
const error=reason=>{throw Error("RENAISSANCE OWNERSHIP STOP: "+reason)};
const sensitive=path=>
  /^(?:config\/|\.github\/workflows\/|docs\/document-registry\.json$|docs\/DOCUMENTATION_CONTROL_PLANE\.md$|package\.json$|yarn\.lock$|app\/api\/|components\/kingdom-instruments\/|lib\/(?:kingdomIndex|aoe2Os)|scripts\/kingdom_index_)/.test(path);

function normalizePulls(pulls){
 if(!Array.isArray(pulls)||pulls.length===0)error("nonempty open-PR census required");
 const seen=new Set();
 return pulls.map(pr=>{
  if(!Number.isSafeInteger(pr.number)||pr.number<1||seen.has(pr.number))error("duplicate/invalid PR number");
  seen.add(pr.number);
  if(typeof pr.title!=="string"||typeof pr.headRefOid!=="string"||!SHA40.test(pr.headRefOid))
   error("PR "+pr.number+" lacks title or exact head commit");
  if(!Number.isSafeInteger(pr.changedFiles)||pr.changedFiles<0||!Array.isArray(pr.files))
   error("PR "+pr.number+" lacks complete changed-file count and paths");
  if(pr.files.length!==pr.changedFiles)
   error("PR "+pr.number+" file list incomplete ("+pr.files.length+"/"+pr.changedFiles+"); refuse false CLEAR");
  const files=pr.files.map(row=>{
   const path=row?.path;
   if(typeof path!=="string"||!SAFE_PATH.test(path)||path.length>512||path.includes("//"))
    error("PR "+pr.number+" has unsafe file path");
   return path;
  });
  if(new Set(files).size!==files.length)error("PR "+pr.number+" has duplicate file paths");
  return {number:pr.number,title:pr.title,headRefOid:pr.headRefOid,files};
 });
}
/**
 * GitHub CLI's `gh pr list --json files` may return only the first 100 changed
 * paths for a single PR. Complete ONLY those truncated lists through the
 * paginated Pull Request Files REST endpoint. The source list is never enough
 * to authorize writes or merges.
 */
export function recoverTruncatedPullFiles(pulls,fetchAllFiles){
 if(!Array.isArray(pulls)||typeof fetchAllFiles!=="function")error("PR census/fetcher unavailable");
 return pulls.map(pr=>{
  if(!Number.isSafeInteger(pr?.changedFiles)||pr.changedFiles<0||!Array.isArray(pr.files))
   error("open PR census is malformed");
  if(pr.files.length===pr.changedFiles)return pr;
  if(pr.files.length>pr.changedFiles)error("PR "+pr.number+" reports more files than changed count");
  const paths=fetchAllFiles(pr);
  if(!Array.isArray(paths)||paths.length!==pr.changedFiles)
   error("PR "+pr.number+" paginated file list incomplete ("+(paths?.length??"invalid")+"/"+pr.changedFiles+")");
  if(paths.some(p=>typeof p!=="string"||!SAFE_PATH.test(p)||p.length>512||p.includes("//")))
   error("PR "+pr.number+" paginated file path malformed");
  if(new Set(paths).size!==paths.length)error("PR "+pr.number+" paginated files have duplicates");
  const full=new Set(paths);
  if(pr.files.some(f=>!full.has(f?.path)))
   error("PR "+pr.number+" file census changed while paginating");
  return {...pr,files:paths.map(path=>({path}))};
 });
}
function ghJson(args){
 try{
  return JSON.parse(execFileSync("gh",args,{
   encoding:"utf8",timeout:120000,maxBuffer:32*1024*1024,stdio:["ignore","pipe","pipe"]
  }));
 }catch(e){error("GitHub metadata pagination failed; no ownership clearance ("+String(e?.message||e).slice(0,180)+")");}
}
function fetchCompletePrFiles(repo,pr){
 // Fetch full paginated REST file list. Slurp preserves page boundaries as
 // arrays, avoiding unsafe newline-splitting of filenames.
 const pages=ghJson(["api","--paginate","--slurp",
  "repos/"+repo+"/pulls/"+pr.number+"/files?per_page=100"]);
 if(!Array.isArray(pages)||pages.length===0||pages.some(page=>!Array.isArray(page)))
  error("PR "+pr.number+" REST pagination yielded invalid pages");
 const paths=pages.flatMap(page=>page.map(f=>f?.filename));
 const detail=ghJson(["api","repos/"+repo+"/pulls/"+pr.number]);
 if(detail?.state!=="open"||detail?.head?.sha!==pr.headRefOid||detail?.changed_files!==pr.changedFiles)
  error("PR "+pr.number+" head/changed-files moved during paginated inspection");
 return paths;
}
export function auditOpenPulls({pulls,targetNumber,source="fixture",maxResults=500}){
 if(!Number.isSafeInteger(targetNumber)||targetNumber<1)error("target PR number required");
 if(!Number.isSafeInteger(maxResults)||maxResults<1)error("invalid enumeration bound");
 const list=normalizePulls(pulls);
 if(list.length>=maxResults)error("open PR enumeration reached its limit; pagination not proven");
 const target=list.find(p=>p.number===targetNumber);
 if(!target)error("target PR absent from open census; do not assume it was merged");
 const targetPaths=new Set(target.files);
 const overlaps=[];
 for(const other of list){
  if(other.number===targetNumber)continue;
  const paths=other.files.filter(p=>targetPaths.has(p)).sort();
  if(paths.length)overlaps.push({pr:other.number,headSha:other.headRefOid,files:paths});
 }
 overlaps.sort((a,b)=>a.pr-b.pr);
 const governedFiles=target.files.filter(sensitive).sort();
 return {
  schema:1,kind:"aoe2war.renaissance.pr-overlap.v1",mode:source,
  targetPr:target.number,targetHead:target.headRefOid,openPrsInspected:list.length,
  filesInspected:target.files.length,exactOverlaps:overlaps,
  centrallyGovernedFiles:governedFiles,
  result:overlaps.length?"EXACT_OVERLAP":"NO_EXACT_OVERLAP_OBSERVED",
  mergeApproved:false,writeLease:false,sourceCertified:false,releaseAuthorized:false,
  limitations:"Read-only snapshot; no atomic lock, GitHub merge conflict check, rename-history completeness, semantic dependency closure, source certificate, or production authorization."
 };
}
export function formatAudit(report){
 const lines=[
  "Renaissance PR ownership inspection (not approval)",
  "Target #"+report.targetPr+" @ "+report.targetHead,
  "Open PRs inspected: "+report.openPrsInspected,
  "Changed files inspected: "+report.filesInspected,
  "Status: "+report.result,
  ...report.exactOverlaps.map(row=>"OVERLAP #"+row.pr+" @ "+row.headSha+": "+row.files.join(", ")),
  "Centrally governed files: "+(report.centrallyGovernedFiles.length?report.centrallyGovernedFiles.join(", "):"none"),
  "Merge approved: NO. Write lease: NO. Release authorized: NO.",
  report.limitations
 ];
 return lines.join("\n")+"\n";
}
function parseCli(args){
 const opts={};
 for(let i=0;i<args.length;i+=2){
  const key=args[i],value=args[i+1];
  if(!["--repo","--target-pr","--snapshot","--format"].includes(key)||!value||opts[key])
   error("usage: --repo OWNER/REPO --target-pr N [--snapshot local.json] [--format text|json]");
  opts[key]=value;
 }
 if(!VALID_REPO.test(opts["--repo"]||""))error("specific OWNER/REPO required");
 const raw=opts["--target-pr"];
 if(!/^[1-9]\d*$/.test(raw||""))error("valid numeric target PR required");
 const format=opts["--format"]||"text";
 if(!["text","json"].includes(format))error("unsupported format");
 return {repo:opts["--repo"],number:Number(raw),snapshot:opts["--snapshot"],format};
}
export function readLivePulls(repo){
 if(!VALID_REPO.test(repo))error("invalid GitHub repository");
 try{
  const output=execFileSync("gh",[
    "pr","list","--repo",repo,"--state","open","--limit","500",
    "--json","number,title,headRefOid,changedFiles,files"
  ],{encoding:"utf8",timeout:120000,maxBuffer:16*1024*1024,stdio:["ignore","pipe","pipe"]});
  return recoverTruncatedPullFiles(JSON.parse(output),pr=>fetchCompletePrFiles(repo,pr));
 }catch(e){
  error("GitHub PR list failed or unavailable; no ownership clearance ("+String(e?.message||e).slice(0,180)+")");
 }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const opts=parseCli(process.argv.slice(2));
  const source=opts.snapshot?"UNTRUSTED_LOCAL_SNAPSHOT":"LIVE_GITHUB_QUERY";
  const data=opts.snapshot?JSON.parse(readFileSync(opts.snapshot,"utf8")):readLivePulls(opts.repo);
  const report=auditOpenPulls({pulls:data,targetNumber:opts.number,source});
  process.stdout.write(opts.format==="json"?JSON.stringify(report,null,2)+"\n":formatAudit(report));
  if(report.exactOverlaps.length)process.exitCode=3;
 }catch(e){console.error(e.message);process.exitCode=2;}
}
