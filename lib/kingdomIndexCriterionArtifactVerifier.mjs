/**
 * Offline, operator-approved CONTENT verifier for Kingdom Index criterion proof.
 *
 * Caller supplies a separately governed Ed25519 public key, a freshly signed
 * manifest of exact expected source/build and per-proof metadata, and a private,
 * process-owned 0700 local artifact directory OUTSIDE web/deploy trees.
 *
 * Approval MUST follow independent examination of CI/browser/DB/production
 * provenance. Signatures prove approval and hashed bytes prove integrity;
 * this code does NOT by itself authenticate GitHub or verify measurement truth,
 * build closure, production deployment, finances, or public score authority.
 */
import { createHash, createPublicKey, verify } from "node:crypto";
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

export const ARTIFACT_MANIFEST_SCHEMA = "aoe2war.kingdom-index.operator-approved-proofs.v1";
const HEX40=/^[a-f0-9]{40}$/,HEX64=/^[a-f0-9]{64}$/;
const stop = msg => {throw Error("KINGDOM PROOF STOP: "+msg);};
const exact = (x,keys,name) => {
 if(!x||typeof x!=="object"||Array.isArray(x)||
   JSON.stringify(Object.keys(x).sort())!==JSON.stringify([...keys].sort()))
   stop("Invalid "+name+" fields");
 return x;
};
const b64 = s => {
 if(typeof s!=="string"||s.length>200000||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(s))
   stop("Invalid canonical base64");
 const out=Buffer.from(s,"base64");
 if(out.toString("base64")!==s)stop("Ambiguous base64");
 return out;
};
const SOURCE=["route","template","gitSha","closureSha256","buildId","releaseSha256"];
const PROOF=["url","sha256","kind","measuredAt","conditions"];
const stamp=x=>typeof x==="string"&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(x)&&
 Number.isFinite(Date.parse(x))&&new Date(Date.parse(x)).toISOString()===x;
const sourceOk=x=>typeof x.route==="string"&&x.route.startsWith("/")&&x.route.length<=200&&
 typeof x.template==="string"&&x.template.length>0&&x.template.length<=300&&
 HEX40.test(x.gitSha)&&HEX64.test(x.closureSha256)&&
 typeof x.buildId==="string"&&x.buildId.length>0&&x.buildId.length<=128&&HEX64.test(x.releaseSha256);
const URL=/^https:\/\/github\.com\/Emaren\/(?:app-prodn|api-prodn|aoe2-watcher|wolochain)\//;

/**
 * No networking and no mutable authority side effects. Returns an async
 * verifyArtifact(proof,payload)=>boolean callback for the signed scorer.
 * The independent manifest/key are inputs; this cannot enroll its own key.
 */
export function createApprovedCriterionArtifactVerifier({root,operatorPublicKeyPem,envelope,nowMs}) {
 if(typeof root!=="string"||!isAbsolute(root)||root.includes("\0"))stop("Private archive root must be absolute");
 if(typeof operatorPublicKeyPem!=="string"||operatorPublicKeyPem.length>16000||
   !Number.isSafeInteger(nowMs))stop("Independent operator authority required");
 exact(envelope,["schema","manifestBase64","signatureBase64"],"signed artifact envelope");
 if(envelope.schema!==ARTIFACT_MANIFEST_SCHEMA)stop("Artifact schema mismatch");
 const bytes=b64(envelope.manifestBase64),sig=b64(envelope.signatureBase64);
 if(bytes.length<150||bytes.length>128000||sig.length!==64)stop("Manifest signature bounds");
 let key;
 try{key=createPublicKey(operatorPublicKeyPem);}catch{stop("Invalid operator key");}
 if(key.asymmetricKeyType!=="ed25519"||!verify(null,bytes,key,sig))stop("Operator manifest signature failure");
 let manifest;
 try{manifest=JSON.parse(bytes.toString("utf8"));}catch{stop("Invalid manifest JSON");}
 if(JSON.stringify(manifest)!==bytes.toString("utf8"))stop("Noncanonical manifest JSON");
 exact(manifest,["schema","issuedAt","expiresAt","source","proofs"],"operator manifest");
 if(manifest.schema!==ARTIFACT_MANIFEST_SCHEMA||!stamp(manifest.issuedAt)||!stamp(manifest.expiresAt))stop("Invalid operator manifest metadata");
 const start=Date.parse(manifest.issuedAt),end=Date.parse(manifest.expiresAt);
 if(start>nowMs+60000||end<nowMs||end<=start||end-start>86400000)
   stop("Expired, future or overlong operator manifest");
 exact(manifest.source,SOURCE,"operator source");
 if(!sourceOk(manifest.source))stop("Invalid operator source identity");
 if(!Array.isArray(manifest.proofs)||manifest.proofs.length<1||manifest.proofs.length>192)
   stop("Invalid operator proof inventory");
 const approved=new Map();
 for(const p of manifest.proofs){
  exact(p,PROOF,"operator proof");
  if(!HEX64.test(p.sha256)||typeof p.url!=="string"||p.url.length>600||
    !URL.test(p.url)||typeof p.kind!=="string"||p.kind.length>40||
    !stamp(p.measuredAt)||typeof p.conditions!=="string"||p.conditions.length<1||
    p.conditions.length>500||approved.has(p.sha256))stop("Invalid or repeated operator proof");
  approved.set(p.sha256,JSON.stringify(p));
 }
 // The manifest is signed, but its contents must not become mutable caller state.
 const approvedSource=JSON.stringify(manifest.source);
 return async (proof,payload) => {
  try {
   if(!payload?.source||JSON.stringify(payload.source)!==approvedSource||
      !proof||!HEX64.test(proof.sha256)||approved.get(proof.sha256)!==JSON.stringify(proof))return false;
   const dir=await open(root,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
   try {
    const d=await dir.stat();
    if(!d.isDirectory()||(d.mode&0o077)!==0||
      (typeof process.geteuid==="function"&&d.uid!==process.geteuid()))return false;
    const handle=await open(join(root,proof.sha256+".proof"),constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
    try {
     const st=await handle.stat();
     if(!st.isFile()||st.nlink!==1||st.size<1||st.size>1048576||(st.mode&0o077)!==0||
       (typeof process.geteuid==="function"&&st.uid!==process.geteuid()))return false;
     const buffer=Buffer.alloc(st.size+1);
     const {bytesRead}=await handle.read(buffer,0,buffer.length,0);
     return bytesRead===st.size&&
       createHash("sha256").update(buffer.subarray(0,bytesRead)).digest("hex")===proof.sha256;
    } finally {await handle.close();}
   } finally {await dir.close();}
  } catch {return false;} // The scorer refuses any uncertain/missing artifact.
 };
}
