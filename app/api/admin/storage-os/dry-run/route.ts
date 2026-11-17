import {NextRequest,NextResponse} from "next/server";
import {requireAdmin} from "@/lib/adminSession";
import {readPrivateStorageVisual,INDIVIDUAL_TRANSPORT_ADOPTED} from "@/lib/storageVisualPrivate";
import {buildManifestDraft,StorageManifestHold} from "@/lib/storageExactDryRun";

export const dynamic="force-dynamic";
export const runtime="nodejs";
const HEADERS={"Cache-Control":"private, no-store, max-age=0","Vary":"Cookie"};
const hold=(status:number,reason:string)=>
  NextResponse.json({status:"HOLD",reason,authority:"NO_DELETE"}, {status,headers:HEADERS});

/** Strict non-destructive owner-only manifest preview. No host path access. */
export async function POST(request:NextRequest){
  const admin=await requireAdmin(request);
  if("error" in admin)return admin.error;
  const origin=request.headers.get("origin");
  if(!origin||origin!==new URL(request.url).origin||
     request.headers.get("sec-fetch-site")==="cross-site")
    return hold(403,"CROSS_ORIGIN_HOLD");
  if(!request.headers.get("content-type")?.startsWith("application/json"))
    return hold(415,"CONTENT_TYPE_HOLD");
  const declared=request.headers.get("content-length");
  if(declared!==null&&(!/^[0-9]+$/.test(declared)||Number(declared)>512))
    return hold(413,"MANIFEST_INPUT_TOO_LARGE");
  const reader=request.body?.getReader();
  if(!reader)return hold(400,"EMPTY_BODY");
  const chunks:Uint8Array[]=[];let count=0;
  for(;;){
    const {done,value}=await reader.read();if(done)break;
    count+=value.byteLength;
    if(count>512){await reader.cancel();return hold(413,"MANIFEST_INPUT_TOO_LARGE");}
    chunks.push(value);
  }
  const raw=Buffer.concat(chunks).toString("utf8");
  let input:unknown;
  try{input=JSON.parse(raw);}catch{return hold(400,"INVALID_JSON");}
  if(!input||typeof input!=="object"||Array.isArray(input))
    return hold(400,"INVALID_INPUT");
  const item=input as Record<string,unknown>;
  if(Object.keys(item).sort().join(",")!=="alias,observedAt,plane,sourceDigest"||
     typeof item.plane!=="string"||typeof item.alias!=="string"||
     typeof item.observedAt!=="string"||typeof item.sourceDigest!=="string")
    return hold(400,"INVALID_SOURCE_BOUND_REQUEST");
  try{
    const evidence=await readPrivateStorageVisual();
    const manifest=buildManifestDraft(evidence,{
      plane:item.plane as "mac"|"hel1-root"|"hel1-volume-105319120",
      alias:item.alias,observedAt:item.observedAt,sourceDigest:item.sourceDigest,
    },INDIVIDUAL_TRANSPORT_ADOPTED);
    return NextResponse.json(manifest,{status:200,headers:HEADERS});
  }catch(e){
    return hold(409,e instanceof StorageManifestHold?e.reason:"SIGNED_SOURCE_UNAVAILABLE");
  }
}
// No GET, DELETE, PUT, PATCH, command execution or filesystem mutation.
