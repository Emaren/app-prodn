import "server-only";
import {constants} from "node:fs";
import {open,lstat} from "node:fs/promises";
import path from "node:path";
import {sentinelPublicProjection,type SentinelPublicProjection} from "./aoe2StorageSentinelEvents";
/** Bounded nonweb read of operator-published summary. NOT an evidence signer. */
export async function readStorageSentinelSummary():Promise<SentinelPublicProjection|null>{
 const file=process.env.STORAGE_SENTINEL_PRIVATE_PROJECTION_FILE;
 if(!file||!path.isAbsolute(file)||file.length>1024||file.includes("/public/")||
    file.includes("/.next/")||file.includes("/uploads/"))return null;
 let handle:Awaited<ReturnType<typeof open>>|undefined;
 try{
  let ancestor=path.dirname(file);
  while(ancestor!==path.dirname(ancestor)){
   const stat=await lstat(ancestor);
   if(!stat.isDirectory()||stat.isSymbolicLink()||(stat.mode&0o022)!==0)return null;
   ancestor=path.dirname(ancestor);
  }
  handle=await open(file,constants.O_NOFOLLOW|constants.O_RDONLY);
  const stat=await handle.stat();
  if(!stat.isFile()||stat.nlink!==1||stat.size<1||stat.size>32768||
     (stat.mode&0o077)!==0||
     (typeof process.getuid==="function"&&stat.uid!==process.getuid()))return null;
  const bytes=Buffer.alloc(stat.size);
  const {bytesRead}=await handle.read(bytes,0,bytes.length,0);
  if(bytesRead!==stat.size)return null;
  const summary=sentinelPublicProjection(JSON.parse(bytes.toString("utf8")));
  return summary;
 }catch{return null}
 finally{await handle?.close().catch(()=>{});}
}
