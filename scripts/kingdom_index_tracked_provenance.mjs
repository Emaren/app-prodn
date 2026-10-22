#!/usr/bin/env node
/**
 * Read-only tracked Git source mutation inspector for the Index emitted build.
 * Never authorizes tracked mutations. All tracked changes after an exact-head
 * build are evidence of drift until reconciled and rebuilt from clean source.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
const HEX40=/^[a-f0-9]{40}$/;
const PHASES=new Set(["checkout","dependencies","built","emitted"]);
const TYPES=Object.freeze({
  "lib/pageChangeManifest.generated.ts":"TRACKED_GENERATED_COMPILE_INPUT_REQUIRES_RESEAL",
  "next-env.d.ts":"NEXT_GENERATED_TRACKED_DECLARATION_REQUIRES_RESEAL"
});
function stop(s){throw Error("KINGDOM SOURCE PROVENANCE STOP: "+s)}
const git=(cwd,...args)=>execFileSync("git",args,{
  cwd,encoding:"utf8",maxBuffer:4*1024*1024,timeout:12000
}).trim();
export function classifyTrackedChanges(changes){
  if(!Array.isArray(changes)||changes.length>1000)stop("Invalid changed path count");
  return changes.map(row=>{
    const {path,status,beforeBlob,afterBlob}=row??{};
    if(typeof path!=="string"||path.length>1000||!path||
       path.includes("\u0000")||path.startsWith("/")||path.startsWith("../")||
       path.includes("/../")||!(/^[AMDTCU]$/.test(status??"")))
       stop("Unsafe git status record");
    return {path,status,classification:TYPES[path]??"UNCLASSIFIED_TRACKED_SOURCE_MUTATION",
      beforeBlob:HEX40.test(beforeBlob??"")?beforeBlob:null,
      afterBlob:HEX40.test(afterBlob??"")?afterBlob:null,
      authorized:false};
  }).sort((a,b)=>a.path.localeCompare(b.path,"en"));
}
function parseNameStatus(output){
  if(!output)return [];
  const fields=output.split("\0");if(fields.at(-1)==="")fields.pop();
  if(fields.length%2)stop("Malformed git diff --name-status -z output");
  const records=[];
  for(let i=0;i<fields.length;i+=2){
    const status=fields[i],path=fields[i+1];
    if(!/^[AMDTCU]$/.test(status))stop("Unsupported tracked diff status "+status);
    records.push({path,status});
  }
  return records;
}
export function captureTrackedProvenance({cwd,expectedSha,phase}){
  if(!HEX40.test(expectedSha)||!PHASES.has(phase))stop("Invalid exact source SHA or phase");
  const root=resolve(cwd);
  const actual=git(root,"rev-parse","HEAD");
  if(actual!==expectedSha)stop("Source HEAD drift");
  const tree=git(root,"rev-parse","HEAD^{tree}");
  const output=execFileSync("git",["diff","--name-status","-z","--no-renames","HEAD","--"],{
    cwd:root,encoding:"utf8",maxBuffer:4*1024*1024,timeout:12000
  });
  const changes=parseNameStatus(output).map(({path,status})=>{
    let beforeBlob=null,afterBlob=null;
    try{beforeBlob=git(root,"rev-parse","HEAD:"+path)}catch{}
    if(status!=="D")try{afterBlob=git(root,"hash-object","--",path)}catch{}
    return {path,status,beforeBlob,afterBlob};
  });
  const files=classifyTrackedChanges(changes);
  const finding={
    kind:"aoe2war.kingdom-index.tracked-source-provenance.v1",
    schema:1,expectedSha,headSha:actual,headTreeSha:tree,phase,
    trackedClean:files.length===0,trackedChangedFiles:files,
    sourceIdentity:"GIT_HEAD_EXACT_BUT_POST_BUILD_SOURCE_DRIFT"
  };
  finding.sourceIdentity=files.length===0?"HEAD_AND_TRACKED_CONTENT_AGREE":finding.sourceIdentity;
  return {...finding,sha256:createHash("sha256").update(JSON.stringify(finding)).digest("hex")};
}
async function main(){
  const args=process.argv.slice(2);
  if(args.length!==4||args[0]!=="--expected-sha"||args[2]!=="--phase")
    stop("Usage: --expected-sha <SHA> --phase checkout|dependencies|built|emitted");
  const result=captureTrackedProvenance({cwd:process.cwd(),expectedSha:args[1],phase:args[3]});
  process.stdout.write(JSON.stringify(result,null,2)+"\n");
  if(!result.trackedClean)process.exitCode=2;
}
const called=process.argv[1]?await import("node:fs/promises").then(x=>x.realpath(resolve(process.argv[1]))).catch(()=>null):null;
if(called===fileURLToPath(import.meta.url))
 main().catch(e=>{console.error(e.message);process.exitCode=2;});
