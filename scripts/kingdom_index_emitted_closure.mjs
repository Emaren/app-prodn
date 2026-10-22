#!/usr/bin/env node
/**
 * Read-only exact-build closure CAPTURE, never certification or release authority.
 *
 * Use after a clean approved build: node scripts/kingdom_index_emitted_closure.mjs
 *   --expected-sha "$(git rev-parse HEAD)" > /private/operator/index-emitted.json
 *
 * Claims are limited to inspected Next output/trace/static/Prisma bytes. A trace
 * listing zero missing files cannot prove coverage of runtime dynamic imports,
 * production parity, source/asset identity, or a passing source-closure gate.
 */
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
const SHA40=/^[a-f0-9]{40}$/;
const stop=m=>{throw Error("KINGDOM EMITTED STOP: "+m)};
const PER_FILE_MAX=128*1024*1024;
const TOTAL_MAX=768*1024*1024;
const FILE_MAX=6000;
const TRACES=[
  ".next/server/app/kingdom-index/page.js.nft.json",
  ".next/server/app/api/kingdom-index/route.js.nft.json"
];
const REQUIRED=[
  ".next/BUILD_ID",".next/server/app/kingdom-index/page.js",
  ".next/server/app/api/kingdom-index/route.js",
  ".next/server/app-paths-manifest.json",".next/build-manifest.json",
  ".next/required-server-files.json",
  ...TRACES,
  "node_modules/.prisma/client/index.js"
];
function inside(root,file){
  const r=relative(root,file);
  return r===""||r!==".."&&!r.startsWith(".."+sep)&&!isAbsolute(r);
}
async function digestFile(root,path,budget){
  if(typeof path!=="string"||path.includes("\0")||!path||isAbsolute(path))stop("Unsafe artifact path");
  const absolute=resolve(root,path);
  if(!inside(root,absolute))stop("Artifact path traversal");
  const actual=await realpath(absolute);
  if(!inside(root,actual))stop("Symlink escaped working tree");
  const stat=await lstat(actual);
  if(!stat.isFile()||stat.size>PER_FILE_MAX||stat.size>budget.remaining)
    stop("Artifact byte budget or regular-file check failed: "+path);
  budget.remaining-=stat.size;
  const sha=createHash("sha256");
  let count=0;
  for await (const chunk of createReadStream(actual)){
    count+=chunk.length; if(count>stat.size)stop("Artifact changed while reading");
    sha.update(chunk);
  }
  if(count!==stat.size)stop("Artifact read truncated");
  return {path,bytes:stat.size,sha256:sha.digest("hex")};
}
async function findStatic(root,rel,paths,budget){
  if(paths.size>=FILE_MAX)stop("Static asset count exceeds bound");
  const dir=resolve(root,rel);
  if(!inside(root,dir))stop("Unsafe static directory");
  for(const row of await readdir(dir,{withFileTypes:true})){
    if(row.name==="."||row.name===".."||row.name.includes("\0"))stop("Invalid static entry");
    const path=rel+"/"+row.name;
    if(row.isDirectory())await findStatic(root,path,paths,budget);
    else if(row.isFile()||row.isSymbolicLink())paths.add(path);
    else stop("Unexpected static device/socket");
    if(paths.size>FILE_MAX)stop("Too many static files");
  }
}
function parsedJson(bytes,label){
  let data;
  try{data=JSON.parse(bytes)}catch{stop("Invalid JSON: "+label)}
  return data;
}
export async function collectIndexEmittedClosure(root,head,expectedSha){
  if(!SHA40.test(head)||head!==expectedSha)stop("Expected exact source SHA mismatch");
  root=await realpath(root);
  const budget={remaining:TOTAL_MAX};
  const paths=new Set(REQUIRED),missing=[],invalidTraces=[];
  for(const trace of TRACES){
    let doc;
    try{
      const trstat=await lstat(join(root,trace));
      if(!trstat.isFile()||trstat.size>1024*1024)stop("Oversize/nonregular trace");
      doc=parsedJson(await readFile(join(root,trace),"utf8"),trace);
    }
    catch(error){
      // Required trace paths are checked again by the shared file-hash loop.
      // Avoid reporting each absent .nft.json twice, while preserving a
      // distinct invalid-trace signal for malformed/unreadable existing files.
      if(error?.code!=="ENOENT")invalidTraces.push(trace+":invalid-or-unreadable");
      continue;
    }
    if(!doc||!Array.isArray(doc.files)||doc.files.length>FILE_MAX||
      doc.files.some(x=>typeof x!=="string"||x.length>800))
      {invalidTraces.push(trace);continue;}
    const anchor=dirname(join(root,trace));
    for(const f of doc.files){
      const absolute=resolve(anchor,f);
      if(!inside(root,absolute)){invalidTraces.push(trace+":outside-root");continue;}
      paths.add(relative(root,absolute).replaceAll("\\","/"));
    }
  }
  try{
    await findStatic(root,".next/static",paths,budget);
  }catch{missing.push(".next/static (missing or invalid enumeration)");}
  const verified=[];
  for(const p of [...paths].sort()){
    try{verified.push(await digestFile(root,p,budget))}
    catch(e){missing.push(p+": "+String(e.message).slice(0,120))}
  }
  const buildFile=verified.find(x=>x.path===".next/BUILD_ID");
  let buildId=null;
  if(buildFile){
    try{buildId=(await readFile(join(root,".next/BUILD_ID"),"utf8")).trim()}
    catch{}
  }
  if(typeof buildId!=="string"||buildId.length<5||buildId.length>128)
    missing.push("Exact Next BUILD_ID unavailable");
  const report={
    schema:1,kind:"aoe2war.kingdom-index.emitted-source-capture.v1",
    route:"/kingdom-index",sourceSha:head,buildId,
    limitations:[
      "CAPTURE ONLY: Next emitted route traces are not independently proven exhaustive.",
      "No actual server request, dynamic-import execution, database query, signed reviewer, production parity or certification gate is established.",
      "Generated Prisma file presence and hashes do not prove runtime Prisma authority."
    ],
    files:verified,
    missing:[...new Set(missing)].sort(),
    invalidTraces:[...new Set(invalidTraces)].sort(),
    budget:{maxFiles:FILE_MAX,maxBytes:TOTAL_MAX,remainingBytes:budget.remaining},
    status:missing.length||invalidTraces.length?"INCOMPLETE":"OBSERVED_NOT_CERTIFIED",
    certified:false,
    publicationAuthorized:false
  };
  const digestPayload=JSON.stringify(report);
  return { ...report,receiptSha256:createHash("sha256").update(digestPayload).digest("hex") };
}
async function main(){
  const args=process.argv.slice(2);
  if(args.length!==2||args[0]!=="--expected-sha"||!SHA40.test(args[1]))stop("Require --expected-sha <40-char Git SHA>");
  const root=process.cwd();
  const head=execFileSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8"}).trim();
  const dirty=execFileSync("git",["status","--porcelain","--untracked-files=no"],{cwd:root,encoding:"utf8"}).trim();
  if(dirty)stop("Tracked checkout dirty, exact-source evidence impossible");
  const output=await collectIndexEmittedClosure(root,head,args[1]);
  process.stdout.write(JSON.stringify(output,null,2)+"\n");
  if(output.status!=="OBSERVED_NOT_CERTIFIED")process.exitCode=2;
}
// macOS /var -> /private/var and symlinked temporary entrypoints must
// resolve to the same physical file; a lexical comparison silently skipped main().
const invokedScript=process.argv[1]
  ? await realpath(resolve(process.argv[1])).catch(()=>null)
  : null;
if(invokedScript===fileURLToPath(import.meta.url))
  main().catch(err=>{console.error(String(err.message));process.exitCode=2;});
