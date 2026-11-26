// Exact single-member image ingress. No caption, remote URL, audience or actor fields.
const MAX=10_000_000, CAP=MAX+65_536;
const TYPES=new Set(["image/png","image/jpeg","image/webp"]);
export async function readBoundedClanImage(request:Request):Promise<Record<string,unknown>>{
 const ct=request.headers.get("content-type")??"",length=request.headers.get("content-length");
 if(!/^multipart\/form-data\s*;/i.test(ct)||ct.length>256||!request.body||(length!==null&&(!/^\d+$/.test(length)||Number(length)>CAP)))throw Error("INVALID_CLAN_MULTIPART");
 const reader=request.body.getReader(),chunks:Uint8Array[]=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>CAP){void reader.cancel().catch(()=>{});throw Error("CLAN_IMAGE_TOO_LARGE");}chunks.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 const form=await new Response(bytes,{headers:{"content-type":ct}}).formData();
 const allowed=["slug","requestKey","attachment"];
 if([...form.keys()].length!==3||allowed.some(k=>form.getAll(k).length!==1)||[...form.keys()].some(k=>!allowed.includes(k)))throw Error("INVALID_CLAN_FIELDS");
 const slug=form.get("slug"),key=form.get("requestKey"),file=form.get("attachment");
 if(typeof slug!=="string"||!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(slug)||typeof key!=="string"||!/^[0-9a-f]{32}$/.test(key)||!(file instanceof File)||file.size<1||file.size>MAX||!TYPES.has(file.type)||file.name.length<1||file.name.length>160||/[\u0000-\u001f\u007f/\\]/.test(file.name))throw Error("INVALID_CLAN_FIELDS");
 return {slug,requestKey:key,name:file.name,mimeType:file.type,imageBase64:Buffer.from(await file.arrayBuffer()).toString("base64")};
}
