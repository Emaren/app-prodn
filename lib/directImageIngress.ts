// Bounded browser multipart admission; the restricted writer re-verifies all fields and bytes.
import { MAX_DIRECT_IMAGE_BYTES } from "@/lib/contactInboxConfig";

const MULTIPART_CAP=MAX_DIRECT_IMAGE_BYTES+65_536;
const TYPES=new Set(["image/png","image/jpeg","image/webp"]);
export async function readBoundedDirectImage(request: Request): Promise<Record<string,unknown>> {
  const contentType=request.headers.get("content-type")||"";
  if (!/^multipart\/form-data\s*;/i.test(contentType) || contentType.length>256 || !request.body)
    throw new Error("INVALID_IMAGE_MULTIPART");
  const length=request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length)>MULTIPART_CAP)) throw new Error("IMAGE_TOO_LARGE");
  const reader=request.body.getReader();
  const chunks:Uint8Array[]=[]; let size=0;
  try {
    for (;;) {
      const {done,value}=await reader.read(); if(done) break;
      size+=value.byteLength;
      if(size>MULTIPART_CAP) { void reader.cancel().catch(()=>{}); throw new Error("IMAGE_TOO_LARGE"); }
      chunks.push(value);
    }
  } finally {reader.releaseLock();}
  const bytes=new Uint8Array(size); let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  const form=await new Response(bytes,{headers:{"content-type":contentType}}).formData();
  const allowed=new Set(["body","targetUid","replyToMessageId","attachment","requestKey"]);
  for(const key of form.keys()) if(!allowed.has(key)||form.getAll(key).length!==1) throw new Error("INVALID_IMAGE_FIELDS");
  const file=form.get("attachment"), body=form.get("body"), target=form.get("targetUid"), reply=form.get("replyToMessageId"), key=form.get("requestKey");
  if(!(file instanceof File)||file.size<1||file.size>MAX_DIRECT_IMAGE_BYTES||!TYPES.has(file.type)||
      typeof body!=="string"||body.length>1000||typeof key!=="string"||!/^[0-9a-f]{32}$/.test(key)||
      (target!==null&&(typeof target!=="string"||!/^[a-zA-Z0-9_.:-]{1,100}$/.test(target)))||
      (reply!==null&&(typeof reply!=="string"||!/^[1-9]\d{0,9}$/.test(reply)||Number(reply)>2147483647))||
      file.name.length>160||/[\u0000-\u001f\u007f/\\]/.test(file.name))
    throw new Error("INVALID_IMAGE_FIELDS");
  return {targetUid:target,body,replyToMessageId:reply===null?null:Number(reply),requestKey:key,
    name:file.name,mimeType:file.type,imageBase64:Buffer.from(await file.arrayBuffer()).toString("base64")};
}
