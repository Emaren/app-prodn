/**
 * Chronicle Press Pack: ZIP STORE stream (original image bytes, never transformed).
 * Paths are resolved by the separate admin-only route. No external fetching,
 * generic filesystem access, archive extraction, database write or shell process.
 */
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { open, realpath, stat } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";

export type PressFile = {
  sourceUrl: string;
  diskPath: string;
  archiveName: string;
  size: number;
};
export type PressImageRecord = {
  sourceUrl: string;
  archiveName: string;
  size: number;
  sha256: string;
};
export type PressPackSeed = {
  schema: "aoe2war.chronicle.press-pack.v1";
  exportedAt: string;
  selectedSurface: "hero-studio-publication" | "hero-stage-takeover";
  publishedVersion: number | null;
  publishedAt: string | null;
  carousel: unknown;
  placements: unknown[];
  sourceWarnings: string[];
};
export const PRESS_MAX_FILES = 160;
export const PRESS_MAX_BYTES = 512 * 1024 * 1024;
export const PRESS_MAX_IMAGE_BYTES = 16 * 1024 * 1024;
const HEAD = "https://aoe2war.com";
const FILE_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,180}$/;
const KIND = /^[a-zA-Z0-9_-]{1,32}$/;
const EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
const CRC_TABLE = Uint32Array.from({length:256},(_,n)=>{
  let c=n;
  for(let j=0;j<8;j++) c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);
  return c>>>0;
});

export function normalizedImageLocation(raw: string):
  { root: string; segments: string[]; sourceUrl: string } {
  if(typeof raw!=="string" || !raw || /[\\\u0000-\u001f]/.test(raw))
    throw new Error("UNSUPPORTED_CHRONICLE_IMAGE_URL");
  const url=new URL(raw,HEAD);
  if(url.origin!==HEAD || url.username || url.password || url.hash)
    throw new Error("CHRONICLE_EXTERNAL_OR_CREDENTIALLED_IMAGE");
  // Query parameters are presentation transforms; export always uses original image.
  let segments: string[];
  try{ segments=url.pathname.split("/").filter(Boolean).map(decodeURIComponent); }
  catch{ throw new Error("CHRONICLE_INVALID_ENCODING"); }
  if(!segments.every(v=>v!=="." && v!==".." && !v.includes("/") && !v.includes("\\")))
    throw new Error("CHRONICLE_IMAGE_PATH_TRAVERSAL");
  let base:string; let names:string[];
  if(segments[0]==="uploads" && segments[1]==="managed-assets"
     && segments.length===4 && KIND.test(segments[2])){
    base=process.env.MANAGED_MEDIA_UPLOAD_DIR?.trim()
      || path.join(process.cwd(),"public","uploads","managed-assets");
    names=segments.slice(2);
  } else if(segments[0]==="api" && segments[1]==="hero-stage-takeover"
     && segments[2]==="image" && segments.length===4) {
    base=path.join(process.cwd(),"storage","hero-stage","uploads");
    names=segments.slice(3);
  } else if(segments[0]==="images" && segments.length===2){
    base=path.join(process.cwd(),"public","images");
    names=segments.slice(1);
  } else if(segments.length===2 && segments[0]==="uploads"){
    base=path.join(process.cwd(),"public","uploads");
    names=segments.slice(1);
  } else {
    throw new Error("CHRONICLE_IMAGE_SOURCE_NOT_LOCAL_ALLOWLISTED");
  }
  if(!names.length || !names.every(v=>FILE_NAME.test(v)) ||
     !EXTS.has(path.extname(names.at(-1)!).toLowerCase()))
    throw new Error("CHRONICLE_IMAGE_EXTENSION_OR_BASENAME");
  return {root:base,segments:names,sourceUrl:url.pathname};
}

export async function localPressFile(raw:string, archiveName:string):Promise<PressFile> {
  if(!/^images\/[0-9]{3}-[a-z0-9._-]{1,190}$/.test(archiveName))
    throw new Error("CHRONICLE_ARCHIVE_NAME");
  const parts=normalizedImageLocation(raw);
  const root=await realpath(parts.root);
  const proposed=path.join(root,...parts.segments);
  const diskPath=await realpath(proposed);
  const relative=path.relative(root,diskPath);
  if(relative.startsWith("..") || path.isAbsolute(relative) || relative==="")
    throw new Error("CHRONICLE_FILE_ESCAPED_UPLOAD_ROOT");
  const info=await stat(diskPath);
  if(!info.isFile() || info.size<1 || info.size>PRESS_MAX_IMAGE_BYTES)
    throw new Error("CHRONICLE_IMAGE_MISSING_OR_OVERSIZE");
  return {sourceUrl:parts.sourceUrl,diskPath,archiveName,size:info.size};
}
export function safePressBasename(url:string) {
  const parsed=normalizedImageLocation(url);
  const base=parsed.segments.at(-1)!.toLowerCase().replace(/[^a-z0-9._-]+/g,"-");
  return base.slice(0,180) || "image.png";
}
export function validatePackEntries(files:PressFile[]) {
  if(files.length<1 || files.length>PRESS_MAX_FILES)
    throw new Error("CHRONICLE_IMAGE_COUNT_BOUNDS");
  const unique=new Set(files.map(v=>v.archiveName));
  if(unique.size!==files.length) throw new Error("CHRONICLE_DUPLICATE_ARCHIVE_FILENAME");
  const bytes=files.reduce((sum,v)=>sum+v.size,0);
  if(!Number.isSafeInteger(bytes) || bytes>PRESS_MAX_BYTES)
    throw new Error("CHRONICLE_TOTAL_BYTES_BOUNDS");
  return bytes;
}
function crc32(state:number,bytes:Uint8Array) {
  let crc=state;
  for(const byte of bytes)crc=CRC_TABLE[(crc^byte)&255]^(crc>>>8);
  return crc>>>0;
}
function dosTime(date:Date) {
  const y=Math.max(1980,Math.min(2107,date.getUTCFullYear()));
  return {
    date:((y-1980)<<9)|((date.getUTCMonth()+1)<<5)|date.getUTCDate(),
    time:(date.getUTCHours()<<11)|(date.getUTCMinutes()<<5)|(date.getUTCSeconds()>>1),
  };
}
function localHeader(name:Buffer,date:Date) {
  const r=Buffer.alloc(30+name.length);const t=dosTime(date);
  r.writeUInt32LE(0x04034b50,0);r.writeUInt16LE(20,4);
  r.writeUInt16LE(0x0808,6);r.writeUInt16LE(0,8);
  r.writeUInt16LE(t.time,10);r.writeUInt16LE(t.date,12);
  r.writeUInt16LE(name.length,26);name.copy(r,30);return r;
}
function descriptor(crc:number,size:number) {
  const r=Buffer.alloc(16);r.writeUInt32LE(0x08074b50,0);
  r.writeUInt32LE(crc,4);r.writeUInt32LE(size,8);r.writeUInt32LE(size,12);return r;
}
function centralRecord(name:Buffer,crc:number,size:number,offset:number,date:Date) {
  const r=Buffer.alloc(46+name.length);const t=dosTime(date);
  r.writeUInt32LE(0x02014b50,0);r.writeUInt16LE(20,4);r.writeUInt16LE(20,6);
  r.writeUInt16LE(0x0808,8);r.writeUInt16LE(0,10);
  r.writeUInt16LE(t.time,12);r.writeUInt16LE(t.date,14);
  r.writeUInt32LE(crc,16);r.writeUInt32LE(size,20);r.writeUInt32LE(size,24);
  r.writeUInt16LE(name.length,28);r.writeUInt32LE(offset,42);
  name.copy(r,46);return r;
}
function endRecord(n:number,size:number,offset:number) {
  const r=Buffer.alloc(22);r.writeUInt32LE(0x06054b50,0);
  r.writeUInt16LE(n,8);r.writeUInt16LE(n,10);
  r.writeUInt32LE(size,12);r.writeUInt32LE(offset,16);return r;
}
export async function* pressPackChunks(files:PressFile[],seed:PressPackSeed):
  AsyncGenerator<Uint8Array> {
  validatePackEntries(files);
  const date=new Date(seed.exportedAt);
  if(!Number.isFinite(date.getTime())) throw new Error("CHRONICLE_INVALID_TIME");
  const directory:Buffer[]=[];const details:PressImageRecord[]=[];
  let offset=0;
  for(const file of files){
    const name=Buffer.from(file.archiveName,"utf8");
    const header=localHeader(name,date),start=offset;
    yield header;offset+=header.length;
    let crc=0xffffffff,size=0;
    const sha=createHash("sha256");
    const handle=await open(file.diskPath,constants.O_RDONLY|constants.O_NOFOLLOW);
    try {
      const info=await handle.stat();
      if(!info.isFile() || info.size!==file.size)
        throw new Error("CHRONICLE_SOURCE_CHANGED_DURING_EXPORT");
      const stream=createReadStream(file.diskPath,{fd:handle.fd,autoClose:false,highWaterMark:256*1024});
      for await(const chunk of stream){
        const bytes=chunk as Buffer;
        size+=bytes.length;
        if(size>file.size) throw new Error("CHRONICLE_SOURCE_GROWN_DURING_EXPORT");
        crc=crc32(crc,bytes);sha.update(bytes);
        yield bytes;offset+=bytes.length;
      }
    } finally {await handle.close();}
    if(size!==file.size)throw new Error("CHRONICLE_SOURCE_SHRANK_DURING_EXPORT");
    const finalCrc=(crc^0xffffffff)>>>0;
    const tail=descriptor(finalCrc,size);yield tail;offset+=tail.length;
    directory.push(centralRecord(name,finalCrc,size,start,date));
    details.push({sourceUrl:file.sourceUrl,archiveName:file.archiveName,
      size,sha256:sha.digest("hex")});
  }
  const manifest={
    ...seed,images:details,
    counts:{placements:seed.placements.length,uniqueImages:details.length,
      totalImageBytes:details.reduce((n,x)=>n+x.size,0)},
    safety:{originalBytes:true,noExternalFetch:true,adminOnly:true,
      noDatabaseMutation:true,sourceOfTruth:"current published Hero playlist"},
  };
  const bytes=Buffer.from(JSON.stringify(manifest,null,2)+"\n","utf8");
  const name=Buffer.from("chronicle-manifest.json","utf8"),start=offset;
  const header=localHeader(name,date);yield header;offset+=header.length;
  yield bytes;offset+=bytes.length;
  const crc=(crc32(0xffffffff,bytes)^0xffffffff)>>>0;
  const tail=descriptor(crc,bytes.length);yield tail;offset+=tail.length;
  directory.push(centralRecord(name,crc,bytes.length,start,date));
  const center=Buffer.concat(directory),centerStart=offset;
  yield center;offset+=center.length;
  yield endRecord(directory.length,center.length,centerStart);
}
export function pressPackStream(files:PressFile[],seed:PressPackSeed):
  ReadableStream<Uint8Array> {
  const iterator=pressPackChunks(files,seed)[Symbol.asyncIterator]();
  return new ReadableStream<Uint8Array>({
    async pull(controller){
      try{
        const next=await iterator.next();
        if(next.done)controller.close();else controller.enqueue(next.value);
      }catch(error){controller.error(error);}
    },
    async cancel(){await iterator.return?.(undefined);}
  });
}
