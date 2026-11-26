import { constants } from "node:fs";
import { lstat, realpath, open } from "node:fs/promises";
import path from "node:path";
const REF=/^file:v1:(clan-[a-f0-9]{32}\.(png|jpg|webp))$/;
const MIME={png:"image/png",jpg:"image/jpeg",webp:"image/webp"};
export function isRestrictedClanImageReference(ref) {
  return typeof ref==="string" && REF.test(ref);
}
export async function readRestrictedClanImage(root,ref,mime,sizeBytes) {
  const match=typeof ref==="string"&&REF.exec(ref);
  if(!match||MIME[match[2]]!==mime||typeof root!=="string"||!path.isAbsolute(root)||path.resolve(root)!==root) return null;
  let fd;
  try{
    const stat=await lstat(root);
    if(!stat.isDirectory()||stat.isSymbolicLink()||await realpath(root)!==root||(stat.mode&0o777)!==0o750) return null;
    fd=await open(path.join(root,match[1]),constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
    const f=await fd.stat();
    if(!f.isFile()||f.nlink!==1||f.uid!==stat.uid||f.gid!==stat.gid||(f.mode&0o777)!==0o640||
       f.size<1||f.size>10_000_000||f.size!==sizeBytes) return null;
    const buffer=Buffer.alloc(f.size);
    let position=0;
    while(position<buffer.length){
      const {bytesRead}=await fd.read(buffer,position,buffer.length-position,position);
      if(!bytesRead)return null;
      position+=bytesRead;
    }
    const after=await fd.stat();
    if(after.size!==f.size||after.mtimeMs!==f.mtimeMs||after.ctimeMs!==f.ctimeMs)return null;
    return {buffer,mimeType:mime};
  }catch{return null;}finally{if(fd)await fd.close().catch(()=>{});}
}
