import {NextRequest,NextResponse} from "next/server";
import {createHash} from "node:crypto";
import {constants,promises as fs} from "node:fs";
import path from "node:path";
import {requireAdmin} from "@/lib/adminSession";
import {readAoe2OsStorageEvidence} from "@/lib/aoe2Os";
import {readAuthenticatedStorageAtlas} from "@/lib/aoe2StorageAtlasServer";
import {projectPrivateStorage} from "@/lib/storageCommandCenterProjection";
import {readPrivateStorageVisual,verifyVisualReceipt} from "@/lib/storageVisualPrivate";
import {EMPTY_INTEL_COLD,readIntelColdEvidence} from "@/lib/intelColdStorageEvidence";
import {projectStorageBaeTopology,type VerifiedAck} from "@/lib/storageBaeReadContract";

export const dynamic="force-dynamic";
export const runtime="nodejs";
const HEADERS={"Cache-Control":"private, no-store, max-age=0","Vary":"Cookie"};
const ID=/^[a-f0-9]{64}$/;
const EXPECTED=["mac","hel1-root","hel1-volume-105319120"] as const;
type Json=Record<string,unknown>;
const obj=(v:unknown):Json|null=>
 v!==null&&typeof v==="object"&&!Array.isArray(v)?v as Json:null;
const absent=(e:unknown)=>
 ["ENOENT","EACCES","EPERM","ENOTDIR"].includes((e as NodeJS.ErrnoException).code??"");
/** Bounded original root-ledger metadata, NOT a new ACK signer or replay challenge.
 * Existing readPrivateStorageVisual() must have independently authenticated the
 * actual source snapshot before this helper can report an ACK.
 */
async function lastDurableAck(genuineVisual:boolean,now:Date):Promise<VerifiedAck|null>{
 if(!genuineVisual)return null;
 const root=process.env.AOE2WAR_OS_STORE_DIR?.trim()||
  (process.env.NODE_ENV==="production"?"/var/lib/aoe2war-storage-visual-web-v1":
   path.join(process.cwd(),"storage","aoe2war-os"));
 const state=path.join(root,"state"),acks=path.join(state,"storage-visual-bridge-acks.v1");
 try{
  const dir=await fs.lstat(acks);
  if(!dir.isDirectory()||dir.isSymbolicLink()||(dir.mode&0o077))return null;
  const names=(await fs.readdir(acks)).filter(n=>/^ack-[a-f0-9]{64}\.json$/.test(n));
  if(names.length===0||names.length>256)return null;
  const stateFile=path.join(state,"storage-visual.v1.json");
  const handle=await fs.open(stateFile,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  let bytes:Buffer;
  try{
   const before=await handle.stat();
   if(!before.isFile()||before.nlink!==1||before.size<100||before.size>65536||
     (before.mode&0o077))return null;
   bytes=await handle.readFile();
   const after=await handle.stat();
   if(before.ino!==after.ino||before.mtimeMs!==after.mtimeMs||before.size!==after.size)return null;
  }finally{await handle.close();}
  const envelope=JSON.parse(bytes.toString("utf8"));
  const visual=obj(envelope),payload=obj(visual?.payload);
  const hmacKey=process.env.AOE2WAR_STORAGE_VISUAL_HMAC_KEY;
  if(!hmacKey)return null;
  // Recheck the *exact bytes* of the snapshot we will hash against the ACK.
  // The earlier validated projection may have raced a newer atomic write.
  const reverified=verifyVisualReceipt(envelope,hmacKey,now);
  if(reverified.source!=="SIGNED_PRIVATE_RECEIPT"||
    visual?.schema!=="aoe2war.storage-visual.signed.v1"||
    !payload||payload.schema!=="aoe2war.storage-visual.private.v1"||
    !Array.isArray(payload.planes)||payload.planes.length!==3||
    payload.planes.some((p,i)=>obj(p)?.id!==EXPECTED[i]))return null;
  const hash=createHash("sha256").update(bytes).digest("hex");
  let best:VerifiedAck|null=null;
  for(const filename of names){
   const fh=await fs.open(path.join(acks,filename),
     constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
   let raw:string;
   try{
    const before=await fh.stat();
    if(!before.isFile()||before.nlink!==1||(before.mode&0o077)||
      before.size<100||before.size>2048)continue;
    raw=await fh.readFile("utf8");
    const after=await fh.stat();
    if(before.ino!==after.ino||before.mtimeMs!==after.mtimeMs||before.size!==after.size)continue;
   }finally{await fh.close();}
   const record=obj(JSON.parse(raw));
   if(!record||Object.keys(record).sort().join("|")!==
      ["at","schema","stored_sha256","submission_id"].sort().join("|"))continue;
   if(record.schema!=="aoe2war.storage-visual.ack-history.v1"||
      typeof record.submission_id!=="string"||!ID.test(record.submission_id)||
      filename!=="ack-"+record.submission_id+".json"||
      record.stored_sha256!==hash||record.at!==payload.generated_at||
      typeof record.at!=="string"||!Number.isFinite(Date.parse(record.at))||
      Date.parse(record.at)>now.getTime()+60_000)continue;
   const item:VerifiedAck={
    submissionId:record.submission_id,receivedAt:record.at,storedSha256:hash,
    acceptedSourceIds:EXPECTED,
    evidence:"ROOT_RECEIVER_LEDGER_AND_HMAC_STATE_HASH_MATCH",
    replayProtection:"DURABLE_UNIQUE_SUBMISSION_LEDGER_PRESENT_REPLAY_DENIAL_NOT_CHALLENGED",
   };
   if(!best||item.receivedAt>best.receivedAt)best=item;
  }
  return best;
 }catch(e){
  // Fail closed with no local path, body, key, or signing material disclosure.
  if(absent(e))return null;
  return null;
 }
}
/** Admin-only one-shot private read. No SSH, filesystem traversal, writes,
 * network calls, workers, copy, restore or admission authority.
 */
export async function GET(request:NextRequest){
 const admin=await requireAdmin(request);
 if("error" in admin){
  admin.error.headers.set("Cache-Control","private, no-store, max-age=0");
  return admin.error;
 }
 const now=new Date();
 try{
  const [dashboard,signed,visual]=await Promise.all([
   readAoe2OsStorageEvidence(),readAuthenticatedStorageAtlas(),
   readPrivateStorageVisual(now),
  ]);
  const projected=projectPrivateStorage(dashboard,signed,now,visual);
  // Intel has an INDEPENDENT Ed25519 derived root trust gate, not the
  // ordinary three-source HMAC receiver credential.
  const intel=process.env.AOE2WAR_INTEL_STATUS_CONTRACT_ADMITTED==="WE2_ED25519_DERIVED_V1"
   ?await readIntelColdEvidence(now).catch(()=>EMPTY_INTEL_COLD)
   :EMPTY_INTEL_COLD;
  const ack=await lastDurableAck(visual.source==="SIGNED_PRIVATE_RECEIPT",now);
  return NextResponse.json(projectStorageBaeTopology(projected,intel,ack,now),{headers:HEADERS});
 }catch{
  return NextResponse.json({detail:"BAE_SOURCE_EVIDENCE_UNAVAILABLE",
   authority:"NO_TOPOLOGY_ADMISSION"},{status:503,headers:HEADERS});
 }
}
