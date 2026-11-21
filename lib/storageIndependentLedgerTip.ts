/** WE2-root-signed, independently stored monotonic ledger tips.
 * This module holds if the protected signer, tip or separate witness is missing.
 * Never accept internally linked HMAC records as proof of an intact final tail.
 */
import {createHash,createPublicKey,verify} from "node:crypto";
import {constants,promises as fs} from "node:fs";
import {request} from "node:http";
import path from "node:path";

export type TipKind="archive"|"teaching";
export type TipEvent={id:string;digestSha256:string;ownerBinding?:string};
export const TIP_SCHEMA="aoe2war.storage-owner-independent-tip.v1" as const;
const SIGNED_SCHEMA="aoe2war.storage-owner-independent-tip.ed25519.v1";
const SHA=/^[0-9a-f]{64}$/;
const UUID=/^[a-f0-9-]{36}$/;
const DOMAINS={
 archive:"AOE2WAR:STORAGE:ARCHIVE:INDEPENDENT-TIP:V1\0",
 teaching:"AOE2WAR:STORAGE:TEACHING:INDEPENDENT-TIP:V1\0",
} as const;
const PURPOSES={
 archive:"AOE2WAR_STORAGE_ARCHIVE_INDEPENDENT_TIP_V1",
 teaching:"AOE2WAR_STORAGE_TEACHING_INDEPENDENT_TIP_V1",
} as const;
const SETTINGS={
 archive:{pem:"AOE2WAR_STORAGE_ARCHIVE_TIP_PUBLIC_PEM",
  pin:"AOE2WAR_STORAGE_ARCHIVE_TIP_PUBLIC_PEM_SHA256",
  file:"AOE2WAR_STORAGE_ARCHIVE_TIP_PATH",
  fallback:"/var/lib/aoe2war-storage-independent-tip/archive-tip.json"},
 teaching:{pem:"AOE2WAR_STORAGE_TEACHING_TIP_PUBLIC_PEM",
  pin:"AOE2WAR_STORAGE_TEACHING_TIP_PUBLIC_PEM_SHA256",
  file:"AOE2WAR_STORAGE_TEACHING_TIP_PATH",
  fallback:"/var/lib/aoe2war-storage-independent-tip/teaching-tip.json"},
} as const;
export type IndependentTip={
 schema:typeof TIP_SCHEMA;purpose:string;sequence:number;
 headId:string|null;headDigestSha256:string|null;
 ownerBinding:string;signedAtUtc:string;
};
export function stable(value:unknown):string{
 if(Array.isArray(value))return "["+value.map(stable).join(",")+"]";
 if(value&&typeof value==="object"){
  const v=value as Record<string,unknown>;
  return "{"+Object.keys(v).sort().map(k=>JSON.stringify(k)+":"+stable(v[k])).join(",")+"}";
 }
 return JSON.stringify(value);
}
export function tipPreimage(kind:TipKind,payload:IndependentTip){
 return Buffer.concat([Buffer.from(DOMAINS[kind],"utf8"),Buffer.from(stable(payload),"utf8")]);
}
export function verifyIndependentTip(envelope:unknown,pem:string,pin:string,
 kind:TipKind,events:readonly TipEvent[],expectedOwner:string,clock=new Date()){
 if(!SHA.test(pin)||!SHA.test(expectedOwner)||!pem.startsWith("-----BEGIN PUBLIC KEY-----")||
    createHash("sha256").update(pem).digest("hex")!==pin)
  throw Error("STORAGE_TIP_PUBLIC_KEY_PIN_HOLD");
 if(!envelope||typeof envelope!=="object"||Array.isArray(envelope))
  throw Error("STORAGE_TIP_ENVELOPE_INVALID");
 const e=envelope as Record<string,unknown>;
 if(e.schema!==SIGNED_SCHEMA||typeof e.signature_base64!=="string"||
    typeof e.public_pem_sha256!=="string"||e.public_pem_sha256!==pin||
    !/^[A-Za-z0-9+/]{86}==?$/.test(e.signature_base64))
  throw Error("STORAGE_TIP_SIGNATURE_OR_KEY_HOLD");
 const p=e.payload;
 if(!p||typeof p!=="object"||Array.isArray(p))throw Error("STORAGE_TIP_BODY_INVALID");
 const x=p as Record<string,unknown>;
 if(Object.keys(x).sort().join(",")!==
    ["schema","purpose","sequence","headId","headDigestSha256","ownerBinding","signedAtUtc"].sort().join(",")||
    x.schema!==TIP_SCHEMA||x.purpose!==PURPOSES[kind]||
    !Number.isSafeInteger(x.sequence)||Number(x.sequence)<0||
    !(x.headId===null||(typeof x.headId==="string"&&UUID.test(x.headId)))||
    !(x.headDigestSha256===null||(typeof x.headDigestSha256==="string"&&SHA.test(x.headDigestSha256)))||
    x.ownerBinding!==expectedOwner||typeof x.signedAtUtc!=="string"||
    !Number.isFinite(Date.parse(x.signedAtUtc))||
    Date.parse(x.signedAtUtc)>clock.getTime()+60_000)
  throw Error("STORAGE_TIP_FIELDS_OR_OWNER_HOLD");
 const signature=Buffer.from(e.signature_base64,"base64");
 if(signature.length!==64||!verify(null,tipPreimage(kind,x as IndependentTip),
    createPublicKey(pem),signature))
  throw Error("STORAGE_TIP_ED25519_SIGNATURE_INVALID");
 const last=events.at(-1);
 if(x.sequence!==events.length||
    x.headId!==(last?.id??null)||
    x.headDigestSha256!==(last?.digestSha256??null)||
    events.some(ev=>ev.ownerBinding!==undefined&&ev.ownerBinding!==expectedOwner))
  throw Error("STORAGE_TIP_TRUNCATED_OR_ROLLED_BACK");
 return {sequence:x.sequence as number,headId:x.headId as string|null,
  headDigestSha256:x.headDigestSha256 as string|null};
}
async function rootOwnedRead(filename:string){
 if(!path.isAbsolute(filename)||(process.env.NODE_ENV!=="test"&&
    !filename.startsWith("/var/lib/aoe2war-storage-independent-tip/")))
  throw Error("STORAGE_TIP_UNTRUSTED_PATH");
 const dir=path.dirname(filename),stat=await fs.lstat(dir);
 if(!stat.isDirectory()||stat.isSymbolicLink()||(stat.mode&0o022)||
    (process.env.NODE_ENV==="production"&&stat.uid!==0))
  throw Error("STORAGE_TIP_DIRECTORY_UNSAFE");
 const fh=await fs.open(filename,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try{
  const a=await fh.stat();
  if(!a.isFile()||a.nlink!==1||a.size<100||a.size>2500||(a.mode&0o022)||
     (process.env.NODE_ENV==="production"&&a.uid!==0))
   throw Error("STORAGE_TIP_ROOT_FILE_UNSAFE");
  const raw=await fh.readFile("utf8"),b=await fh.stat();
  if(a.ino!==b.ino||a.size!==b.size||a.mtimeMs!==b.mtimeMs)
   throw Error("STORAGE_TIP_FILE_RACE");
  return JSON.parse(raw) as unknown;
 }finally{await fh.close();}
}
export async function assertIndependentTip(kind:TipKind,
 events:readonly TipEvent[],expectedOwner:string){
 const cfg=SETTINGS[kind];
 const pem=process.env[cfg.pem],pin=process.env[cfg.pin];
 if(!pem||!pin)throw Error("STORAGE_TIP_KEY_NOT_ENROLLED");
 const value=await rootOwnedRead(process.env[cfg.file]??cfg.fallback);
 return verifyIndependentTip(value,pem,pin,kind,events,expectedOwner);
}
/** Only WE2's separate root-owned Unix socket can sign/write the next tip.
 * No in-web key generation; after a non-acknowledged write the API holds until
 * WE2 independently reconciles that durable tail. It must never claim success.
 */
export async function witnessIndependentTip(kind:TipKind,events:readonly TipEvent[],
 expectedOwner:string){
 const socket=process.env.AOE2WAR_STORAGE_OWNER_TIP_WITNESS_SOCKET;
 if(!socket||(process.env.NODE_ENV!=="test"&&
     socket!=="/run/aoe2war-storage-independent-tip/witness.sock"))
  throw Error("STORAGE_TIP_WITNESS_NOT_ENROLLED");
 const last=events.at(-1);
 const body=JSON.stringify({schema:"aoe2war.storage-tip-witness-request.v1",
  kind,sequence:events.length,headId:last?.id??null,
  headDigestSha256:last?.digestSha256??null,ownerBinding:expectedOwner});
 await new Promise<void>((resolve,reject)=>{
  const req=request({socketPath:socket,path:"/v1/witness",method:"POST",
   headers:{"Content-Type":"application/json","Content-Length":Buffer.byteLength(body)},
   timeout:4000},res=>{
    const chunks:Buffer[]=[];let bytes=0;
    res.on("data",(part:Buffer)=>{bytes+=part.length;
     if(bytes>1024){req.destroy(Error("STORAGE_TIP_ACK_OVERSIZE"));return;}
     chunks.push(part);});
    res.on("end",()=>{
     try{const ack=JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if(res.statusCode!==201||ack.schema!=="aoe2war.storage-tip-witness-ack.v1"||
         ack.kind!==kind||ack.sequence!==events.length||
         ack.headDigestSha256!==(last?.digestSha256??null))
       throw Error("STORAGE_TIP_UNWITNESSED");
      resolve();
     }catch(e){reject(e);}
    });
  });
  req.on("timeout",()=>req.destroy(Error("STORAGE_TIP_WITNESS_TIMEOUT")));
  req.on("error",reject);req.end(body);
 });
 await assertIndependentTip(kind,events,expectedOwner);
}
export function enrolledOwnerBinding(){
 const uid=process.env.AOE2WAR_STORAGE_TEACHING_OWNER_UID;
 if(!uid||uid.trim()!==uid||uid.length>100)throw Error("STORAGE_OWNER_NOT_ENROLLED");
 return createHash("sha256").update("AOE2WAR:STORAGE-TEACHING-ACCOUNT:V1\0")
  .update(uid).digest("hex");
}
