#!/usr/bin/env node
/**
 * Public route source-census evidence. It never invents a quality score.
 * Run against committed HEAD; --write refreshes the catalog and --check
 * rejects unregistered public static pages or unrefreshed route fingerprints.
 */
import { execFileSync } from "node:child_process";
import { readdirSync,readFileSync,writeFileSync } from "node:fs";
import path from "node:path";
const root=process.cwd();
const target=path.join(root,"config/kingdom-index-routes.json");
const current=JSON.parse(readFileSync(target,"utf8"));
const excluded=new Set(["/profile","/wallet","/settings","/connect-wallet","/pending-bets","/offline","/contact-emaren","/past-earnings","/app","/upload","/uploads"]);
function discover(dir=path.join(root,"app"),parts=[]) {
 const result=[];
 for(const row of readdirSync(dir,{withFileTypes:true})){
  if(row.isDirectory()){
   if(row.name==="admin"&&parts.length===0)continue;
   if(row.name.startsWith("[")||row.name==="api")continue;
   result.push(...discover(path.join(dir,row.name),[...parts,row.name]));
  } else if(row.name==="page.tsx") {
   const href="/"+parts.join("/");
   if(!excluded.has(href)) result.push(href);
  }
 }
 return result.sort();
}
const inventory=discover();
const actual=current.map(row=>row.href).sort();
const missing=inventory.filter(href=>!actual.includes(href));
const obsolete=actual.filter(href=>!inventory.includes(href));
if(missing.length||obsolete.length){
 console.error("KINGDOM INDEX CENSUS DRIFT",JSON.stringify({missing,obsolete}));
 process.exit(2);
}
const raw=execFileSync("git",["ls-tree","-r","HEAD","--","app","components","lib"],{encoding:"utf8",maxBuffer:16_000_000});
const files=raw.split("\n").map(line=>{
 const m=line.match(/^\d+ blob ([a-f0-9]{40})\t(.+)$/);
 return m?{sha:m[1],path:m[2]}:null;
}).filter(Boolean);
function versionOf(href) {
 const direct=href.slice(1);
 const directory="app/"+direct+(direct?"/":"");
 const prefixes=direct?[directory,"components/"+direct+"/","lib/"+direct+"/"]:[];
 const exact=direct?new Set(["lib/"+direct+".ts","lib/"+direct+".tsx",...(href==="/kingdom-bettors"?["lib/kingdomBettors.ts"]:[])]):new Set(["app/page.tsx","app/HomePageClient.tsx"]);
 const selected=files.filter(file=>
  (direct?prefixes.some(prefix=>file.path.startsWith(prefix)):false)||exact.has(file.path)
 ).filter(file=>!file.path.includes("/__tests__/")&&!file.path.endsWith(".map")).sort((a,b)=>a.path.localeCompare(b.path));
 let hash=14695981039346656037n;
 for(const file of selected) {
  const value=file.path+"\\0"+file.sha+"\\0";
  for(let i=0;i<value.length;i++){
   hash^=BigInt(value.charCodeAt(i));
   hash=BigInt.asUintN(64,hash*1099511628211n);
  }
 }
 return "src-"+hash.toString(16).padStart(16,"0");
}
const next=current.map(row=>({...row,sourceTree:versionOf(row.href)}));
const drift=next.filter((row,index)=>row.sourceTree!==current[index].sourceTree).map(row=>row.href);
const report={schema:1,commit:execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim(),pages:next.length,drift,checkedAt:new Date().toISOString(),scoreAuthority:"none",note:"Source-census/fingerprint only; NOT an engineering-score or production certificate"};
if(process.argv.includes("--write")){
 writeFileSync(target,JSON.stringify(next,null,2)+"\n");
 console.log(JSON.stringify(report,null,2));
}else{
 console.log(JSON.stringify(report,null,2));
 if(drift.length)process.exitCode=1;
}
