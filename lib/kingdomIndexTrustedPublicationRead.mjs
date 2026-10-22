/**
 * Server-only, read-only publication ingress. All trust material and signed
 * operator artifacts are provisioned OUTSIDE source/Git/public assets.
 * No GET-time nonce consumption, network access, signer key or financial write.
 * Misconfiguration, uncertain build identity and stale evidence return null.
 */
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { open, readFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { createApprovedCriterionArtifactVerifier } from "./kingdomIndexCriterionArtifactVerifier.mjs";
import { verifyKingdomIndexPublication } from "./kingdomIndexTrustedPublication.mjs";

const HEX40=/^[a-f0-9]{40}$/, HEX64=/^[a-f0-9]{64}$/;
const digest=x=>createHash("sha256").update(x).digest("hex");
async function privateText(file,limit){
  if(!isAbsolute(file)||file.includes("\0"))throw Error("Private absolute file path required");
  const dir=await open(dirname(file),constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
  try{
    const stat=await dir.stat();
    if(!stat.isDirectory()||(stat.mode&0o077)!==0||
      (typeof process.geteuid==="function"&&stat.uid!==process.geteuid()))
      throw Error("Private directory authority invalid");
    const fh=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
    try{
      const s=await fh.stat();
      if(!s.isFile()||s.nlink!==1||s.size<2||s.size>limit||
        (s.mode&0o077)!==0||
        (typeof process.geteuid==="function"&&s.uid!==process.geteuid()))
        throw Error("Private file integrity invalid");
      const buffer=Buffer.alloc(s.size+1);
      const {bytesRead}=await fh.read(buffer,0,buffer.length,0);
      if(bytesRead!==s.size)throw Error("Private file changed during read");
      return buffer.subarray(0,bytesRead).toString("utf8");
    }finally{await fh.close();}
  }finally{await dir.close();}
}
function env(name){
  const value=process.env[name];
  if(!value)throw Error("Missing independently supplied "+name);
  return value;
}
function trustedKeys(){
  const input=JSON.parse(env("KINGDOM_INDEX_PUBLICATION_TRUST_KEYS_JSON"));
  if(!Array.isArray(input)||input.length!==2)throw Error("Exactly two enrolled certifier keys required");
  const keys=new Map();
  for(const item of input){
    if(!item||Object.keys(item).sort().join(",")!=="keyId,notAfter,notBefore,pem,role,route"||
      typeof item.keyId!=="string"||typeof item.pem!=="string"||
      !["release","reviewer"].includes(item.role)||
      item.route!=="/kingdom-index"||
      typeof item.notBefore!=="string"||typeof item.notAfter!=="string"||
      keys.has(item.keyId))
      throw Error("Invalid independent certifier enrollment");
    keys.set(item.keyId,{pem:item.pem,role:item.role,route:item.route,
      notBefore:item.notBefore,notAfter:item.notAfter});
  }
  return keys;
}
async function committedIngest(source,nonce,sha256){
  const root=env("KINGDOM_INDEX_PUBLICATION_NONCE_DIR");
  if(!isAbsolute(root)||!HEX40.test(source.gitSha)||!HEX64.test(sha256))return false;
  const identity=digest("aoe2war.kingdom-index.publication.nonce.v1\0"+
    source.gitSha+"\0"+source.buildId+"\0"+nonce);
  const row=JSON.parse(await privateText(join(root,identity+".json"),2048));
  return row?.schema===1&&row?.identitySha256===identity&&
    row?.payloadSha256===sha256&&row?.releaseApproved===true&&row?.reviewerApproved===true;
}
export async function loadCurrentKingdomIndexTrustedPublication({rubric,profile,nowMs=Date.now()}){
  try{
    const gitSha=env("KINGDOM_INDEX_DEPLOYED_GIT_SHA");
    const closureSha256=env("KINGDOM_INDEX_DEPLOYED_CLOSURE_SHA256");
    const assetsSha256=env("KINGDOM_INDEX_DEPLOYED_ASSETS_SHA256");
    const releaseSha256=env("KINGDOM_INDEX_DEPLOYED_RELEASE_SHA256");
    if(!HEX40.test(gitSha)||![closureSha256,assetsSha256,releaseSha256].every(x=>HEX64.test(x)))
      throw Error("Invalid externally controlled release metadata");
    // Bind the controller's declared build to the real emitted Next build file.
    const buildId=(await readFile(join(process.cwd(),".next","BUILD_ID"),"utf8")).trim();
    if(!buildId||buildId!==env("KINGDOM_INDEX_DEPLOYED_BUILD_ID"))
      throw Error("Emitted Next BUILD_ID does not match controller authority");
    const source={route:"/kingdom-index",template:"app/kingdom-index/page.tsx",
      gitSha,closureSha256,buildId,releaseSha256,assetsSha256};
    const envelope=JSON.parse(await privateText(env("KINGDOM_INDEX_PUBLICATION_PATH"),196608));
    const approved=JSON.parse(await privateText(env("KINGDOM_INDEX_OPERATOR_APPROVAL_PATH"),160000));
    const verifyArtifact=createApprovedCriterionArtifactVerifier({
      root:env("KINGDOM_INDEX_OPERATOR_ARTIFACT_ROOT"),
      operatorPublicKeyPem:env("KINGDOM_INDEX_OPERATOR_PUBLIC_KEY_PEM"),
      envelope:approved,nowMs,
    });
    return await verifyKingdomIndexPublication(envelope,{
      expected:source,trustedKeys:trustedKeys(),rubric,profile,nowMs,
      verifyArtifact,isCommitted:committedIngest,
    });
  }catch{
    // The public page MUST remain unmeasured when any authority is absent.
    return null;
  }
}
