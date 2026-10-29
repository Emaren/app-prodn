import "server-only";
import {constants} from "node:fs";
import {open, lstat} from "node:fs/promises";
import path from "node:path";
import {authenticateStorageAtlas, type AtlasTrustPolicy, type SignedAtlasPublic}
 from "./aoe2StorageAtlasAuth";

/** Read-only Next server ingress. Reads exactly one bounded OPERATOR-INSTALLED
 * private file. No network, no shell, no file walks, no public write endpoint.
 * The pinned trust policy must arrive through private runtime deployment env.
 */
export async function readAuthenticatedStorageAtlas():Promise<SignedAtlasPublic|null>{
 const file=process.env.STORAGE_ATLAS_SIGNED_BUNDLE_FILE;
 const pins=process.env.STORAGE_ATLAS_COLLECTOR_TRUST_JSON;
 if(!file||!pins||!path.isAbsolute(file)||file.length>1024||pins.length>24_000)return null;
 let handle:Awaited<ReturnType<typeof open>>|undefined;
 try{
  // Reject symlinked ancestors as well as the final entry. Never permit an
  // attacker to swap a public writable parent for another trusted location.
  let part=path.dirname(file);
  while(part!==path.dirname(part)){
   const parent=await lstat(part);
   if(parent.isSymbolicLink()||!parent.isDirectory()||(parent.mode&0o002)!==0)return null;
   part=path.dirname(part);
  }
  handle=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW);
  const stat=await handle.stat();
  if(!stat.isFile()||stat.size<=0||stat.size>512*1024||stat.nlink!==1||
    (stat.mode&0o077)!==0)return null;
  if(typeof process.getuid==="function"&&stat.uid!==process.getuid())return null;
  const content=Buffer.alloc(stat.size);
  const {bytesRead}=await handle.read(content,0,content.length,0);
  if(bytesRead!==stat.size)return null;
  const input=JSON.parse(content.toString("utf8"));
  const config=JSON.parse(pins) as AtlasTrustPolicy;
  // Bad, stale, forged, partial or replayed input never promotes LIVE or GO.
  return authenticateStorageAtlas(input,config);
 }catch{return null}
 finally{await handle?.close().catch(()=>{});}
}
