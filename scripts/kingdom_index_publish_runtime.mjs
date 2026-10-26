#!/usr/bin/env node
/**
 * OPERATOR-ONLY local publisher for issue #918, never imported by web GET.
 * It promotes an existing bounded operator-reported snapshot into the private
 * website inbox only after the exact installed release identity matches.
 *
 * Does not execute a measurement, create claims, sign criterion approvals,
 * write to financial storage, or schedule its own timer.
 */
import {readFile,stat,lstat,open,rename,unlink} from "node:fs/promises";
import {constants} from "node:fs";
import {randomBytes} from "node:crypto";
import path from "node:path";
import {readKingdomRuntimeTelemetry} from "../lib/kingdomIndexRuntimeTelemetry.mjs";
const stop=s=>{throw Error("RUNTIME PUBLISH STOP: "+s)};
function readArgs(){
 const [input,output,...rest]=process.argv.slice(2);
 if(rest.length||!input||!output||!path.isAbsolute(input)||!path.isAbsolute(output)||input===output)
  stop("Usage: node scripts/kingdom_index_publish_runtime.mjs /private/inbox/original.json /private/web-read/latest.json");
 return {input,output};
}
async function safeOutputParent(filename){
 const dir=path.dirname(filename);let current=path.parse(dir).root;
 for(const part of dir.slice(current.length).split(path.sep).filter(Boolean)){
  current=path.join(current,part);
  const st=await lstat(current);
  if(!st.isDirectory()||st.isSymbolicLink())stop("Symlink/non-directory on output ancestry");
 }
 const st=await stat(dir),uid=typeof process.getuid==="function"?process.getuid():null;
 if((st.mode&0o077)!==0||(uid!==null&&st.uid!==uid))stop("Output directory must be owned 0700");
 try {
  const existing=await lstat(filename);
  if(!existing.isFile()||existing.isSymbolicLink()||existing.nlink!==1||
     (existing.mode&0o077)!==0||(uid!==null&&existing.uid!==uid))
   stop("Unsafe old snapshot target");
 }catch(error){if(error.code!=="ENOENT")throw error}
 return dir;
}
async function main(){
 const {input,output}=readArgs();
 const gitSha=process.env.KINGDOM_INDEX_DEPLOYED_GIT_SHA??"";
 const bound=process.env.KINGDOM_INDEX_DEPLOYED_BUILD_ID??"";
 const actual=(await readFile(".next/BUILD_ID","utf8")).trim();
 if(actual!==bound||!actual||!/^[a-f0-9]{40}$/.test(gitSha))
  stop("Current emitted Next build or deployed SHA not independently configured");
 const nowMs=Date.now();
 const options={file:input,expectedGitSha:gitSha,expectedBuildId:actual,nowMs};
 const tested=await readKingdomRuntimeTelemetry(options);
 if(!tested||tested.readings.some(x=>x.status!=="REPORTED_UNVERIFIED"))
  stop("Source-mismatched, stale, untrusted or malformed private input");
 const sourceBytes=await readFile(input);
 if(sourceBytes.length>48_000)stop("Input changed or exceeded bounds");
 // Reject races between the checked original and the copied bytes.
 const reread=await readKingdomRuntimeTelemetry(options);
 if(!reread||reread.revisionSha256!==tested.revisionSha256)stop("Input changed during admission");
 const outputDir=await safeOutputParent(output);
 const tmp=path.join(outputDir,"."+path.basename(output)+"."+randomBytes(8).toString("hex")+".tmp");
 const fh=await open(tmp,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o600);
 let renamed=false;
 try{
  await fh.writeFile(sourceBytes);await fh.sync();await fh.close();
  // Check the staged file itself: options contains file:input, so staged path must be last.
  const checked=await readKingdomRuntimeTelemetry({...options,file:tmp});
  if(!checked||checked.revisionSha256!==tested.revisionSha256)stop("Staged bytes invalid");
  await rename(tmp,output);renamed=true;
  const dh=await open(outputDir,constants.O_RDONLY);
  try{await dh.sync()}finally{await dh.close()}
 }finally{
  await fh.close().catch(()=>{});
  if(!renamed)await unlink(tmp).catch(()=>{});
 }
 console.log(JSON.stringify({
  status:"OPERATOR_REPORTED_UNCERTIFIED",publishedRevision:tested.revisionSha256,
  sourceSha:gitSha,buildId:actual,readings:tested.readings.length,
  note:"No signed grade, certification or independent producer semantics were created."
 }));
}
main().catch(e=>{console.error(String(e.message));process.exitCode=2});
