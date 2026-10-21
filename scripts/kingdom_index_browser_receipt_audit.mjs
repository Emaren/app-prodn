#!/usr/bin/env node
/**
 * Offline audit of an existing REAL SpeedOS Chrome receipt. No network,
 * Chrome launch, application calls, DB actions, financial actions or mutation.
 * A valid audit still requires independent receipt origin + release attestation
 * and is NEVER a Kingdom grade/certification.
 *
 * Example:
 * node scripts/kingdom_index_browser_receipt_audit.mjs \\
 *   --input /private/speedos/receipt.json \\
 *   --url https://aoe2war.com/kingdom-index \\
 *   --release-sha <exact-live-git-sha> \\
 *   --build-version <exact-live-version> \\
 *   --collector-sha <git-blob-sha-of-SpeedOS-collector> --viewport desktop
 */
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { resolve } from "node:path";
import { inspectKingdomColdBrowserReceipt } from "../lib/kingdomIndexBrowserReceipt.mjs";

function argsFrom(argv){
 const expected=new Set(["input","url","release-sha","build-version","collector-sha","viewport"]);
 const args={};
 if(argv.length!==12)throw Error("Exactly six named options required");
 for(let i=0;i<argv.length;i+=2){
  const key=argv[i]?.startsWith("--")?argv[i].slice(2):"";
  if(!expected.has(key)||Object.hasOwn(args,key)||!argv[i+1]||argv[i+1].startsWith("--"))
   throw Error("Missing, duplicated or unsupported argument");
  args[key]=argv[i+1];
 }
 if(Object.keys(args).length!==6)throw Error("Incomplete command options");
 return args;
}
async function main(){
 const argv=argsFrom(process.argv.slice(2));
 const file=resolve(argv.input);
 const fd=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 let bytes;
 try{
  const st=await fd.stat();
  if(!st.isFile()||st.nlink!==1||st.size<1000||st.size>6000000)
   throw Error("Unsafe evidence file size/type");
  bytes=Buffer.alloc(st.size);
  const {bytesRead}=await fd.read(bytes,0,bytes.length,0);
  if(bytesRead!==st.size)throw Error("Short browser receipt read");
 }finally{await fd.close();}
 const result=inspectKingdomColdBrowserReceipt(bytes,{
  url:argv.url,releaseSha:argv["release-sha"],
  buildVersion:argv["build-version"],
  collectorSha:argv["collector-sha"],viewport:argv.viewport,
 });
 process.stdout.write(JSON.stringify(result,null,2)+"\n");
}
main().catch(e=>{process.stderr.write("KINGDOM BROWSER AUDIT REFUSED: "+e.message+"\n");process.exitCode=2;});
