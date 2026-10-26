/**
 * Read-only, unscored Kingdom Index runtime counters (issue #918).
 *
 * The source of this file is an operator-managed least-privilege producer,
 * NOT independent issuer/reviewer authority. These receipts can update
 * between website deploys but can NEVER award rubric points, pass a gate,
 * or claim a verified operating-system result.
 */
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import path from "node:path";
export const RUNTIME_SCHEMA="aoe2war.kingdom-index.runtime-readings.v1";
const HEX40=/^[0-9a-f]{40}$/;
const HEX64=/^[0-9a-f]{64}$/;
const MAX_BYTES=48_000;
const MAX_AGE_MS=48*60*60*1000;
const IDENTITIES=Object.freeze({
 navigation:{producer:"chromium-collector",denominator:88,label:"Candidate navigation tested"},
 accessibility:{producer:"axe-observer",denominator:88,label:"Candidate accessibility routes affected"},
 doctor:{producer:"kingdom-doctor",denominator:100,label:"Doctor producer-reported score"},
 inspections:{producer:"general-inspections",denominator:100,label:"Inspections producer-reported score"},
 releaseParity:{producer:"website-release-observer",denominator:1,label:"Website release parity reported"}
});
const fail=reason=>{throw Error("KINGDOM RUNTIME STOP: "+reason)};
const exact=(x,fields,name)=>{
 if(!x||typeof x!=="object"||Array.isArray(x)||
    JSON.stringify(Object.keys(x).sort())!==JSON.stringify([...fields].sort()))
   fail("Invalid "+name);
};
const iso=x=>typeof x==="string"&&x.length===24&&
 /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(x)&&
 Number.isFinite(Date.parse(x))&&new Date(Date.parse(x)).toISOString()===x;
const sha256=s=>createHash("sha256").update(s).digest("hex");
export function parseKingdomRuntimeTelemetry(raw,{expectedGitSha,expectedBuildId,nowMs}){
 if(!HEX40.test(expectedGitSha)||typeof expectedBuildId!=="string"||
  expectedBuildId.length<5||expectedBuildId.length>128||
  !Number.isSafeInteger(nowMs))fail("Independent deployed source/build identity missing");
 if(typeof raw!=="string"||Buffer.byteLength(raw,"utf8")>MAX_BYTES)fail("Oversized or missing snapshot");
 let doc;try{doc=JSON.parse(raw)}catch{fail("Malformed JSON")}
 exact(doc,["schema","source","revisionSha256","capturedAt","readings"],"snapshot");
 exact(doc.source,["gitSha","buildId"],"source");
 if(doc.schema!==RUNTIME_SCHEMA||doc.source.gitSha!==expectedGitSha||
    doc.source.buildId!==expectedBuildId||!iso(doc.capturedAt)||
    !HEX64.test(doc.revisionSha256)||!Array.isArray(doc.readings)||
    doc.readings.length<1||doc.readings.length>5)fail("Source/schema mismatch");
 // Integrity checksum detects torn/inconsistent operator snapshots. It is
 // NOT a signature and never establishes original-producer authenticity.
 const canonical=JSON.stringify({
  schema:doc.schema,source:doc.source,capturedAt:doc.capturedAt,readings:doc.readings
 });
 if(doc.revisionSha256!==sha256(canonical))fail("Snapshot checksum mismatch");
 const captured=Date.parse(doc.capturedAt);
 if(captured>nowMs+60_000||captured<nowMs-MAX_AGE_MS)
   fail("Invalid captured timestamp");
 const seen=new Set(),out=[];
 for(const row of doc.readings){
  exact(row,["id","producer","numerator","denominator","observedAt","expiresAt","receiptSha256"],"reading");
  const type=IDENTITIES[row.id];
  if(!type||seen.has(row.id)||row.producer!==type.producer||
     row.denominator!==type.denominator||
     !Number.isInteger(row.numerator)||row.numerator<0||row.numerator>type.denominator||
     !iso(row.observedAt)||!iso(row.expiresAt)||!HEX64.test(row.receiptSha256))
    fail("Invalid or duplicate reading");
  const observed=Date.parse(row.observedAt),expires=Date.parse(row.expiresAt);
  if(observed>captured||observed>nowMs+60_000||
     observed<nowMs-MAX_AGE_MS||expires<=observed||
     expires-observed>24*60*60*1000||captured>expires+MAX_AGE_MS)
    fail("Invalid reading freshness");
  seen.add(row.id);
  out.push(Object.freeze({
   id:row.id,label:type.label,numerator:row.numerator,
   denominator:row.denominator,producer:row.producer,
   observedAt:row.observedAt,expiresAt:row.expiresAt,
   receiptSha256:row.receiptSha256,
   status:expires<=nowMs?"STALE":"REPORTED_UNVERIFIED",
   // Deliberately no score, certification, approval, gate or signer fields.
  }));
 }
 return Object.freeze({
  schema:1,sourceSha:expectedGitSha,buildId:expectedBuildId,
  revisionSha256:doc.revisionSha256,capturedAt:doc.capturedAt,
  authority:"OPERATOR_REPORTED_UNCERTIFIED",
  readings:Object.freeze(out)
 });
}
/** Read bounded private file only; no source scan or observer work on GET. */
export async function readKingdomRuntimeTelemetry({file,expectedGitSha,expectedBuildId,nowMs}){
 if(!file)return null;
 try{
  if(typeof file!=="string"||file.length>512||!path.isAbsolute(file))
    fail("Private absolute path required");
  const dir=path.dirname(file);
  // The operator-owned final directory and file must not be symlinks. Disallow
  // any intermediate directory symlink, protecting against path retargeting.
  let current=path.parse(dir).root;
  for(const component of dir.slice(current.length).split(path.sep).filter(Boolean)){
   current=path.join(current,component);
   const st=await lstat(current);
   if(!st.isDirectory()||st.isSymbolicLink())fail("Unsafe directory");
  }
  const dst=await lstat(dir);
  const owner=typeof process.getuid==="function"?process.getuid():null;
  if((dst.mode&0o077)!==0||(owner!==null&&dst.uid!==owner))
    fail("Private directory ownership or mode");
  const pre=await lstat(file);
  if(!pre.isFile()||pre.isSymbolicLink()||pre.nlink!==1||
     (pre.mode&0o077)!==0||(owner!==null&&pre.uid!==owner)||
     pre.size<30||pre.size>MAX_BYTES)fail("Unsafe snapshot file");
  const handle=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  try{
   const st=await handle.stat();
   if(st.ino!==pre.ino||st.dev!==pre.dev||st.size!==pre.size||
      !st.isFile()||(st.mode&0o077)!==0)fail("Snapshot changed");
   const data=Buffer.alloc(st.size+1);
   const {bytesRead}=await handle.read(data,0,data.length,0);
   if(bytesRead!==st.size)fail("Torn snapshot");
   return parseKingdomRuntimeTelemetry(data.subarray(0,bytesRead).toString("utf8"),
     {expectedGitSha,expectedBuildId,nowMs});
  }finally{await handle.close()}
 }catch{return null} // failure becomes UNKNOWN; never updates approved scores
}
