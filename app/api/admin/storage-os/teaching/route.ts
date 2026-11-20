import {NextRequest,NextResponse} from "next/server";
import {requireAdmin} from "@/lib/adminSession";
import {readPrivateStorageVisual} from "@/lib/storageVisualPrivate";
import {appendTeachingEvent,observedHogFingerprint,readTeachingEvents,teachingOwnerAccess} from "@/lib/storageHogTeachingLedger";
import {isTeachingLevel,isTeachingPlane,sourceMatchesRequest} from "@/lib/storageHogTeachingPolicy";
import {teachingSourceDeadline} from "@/lib/storageSignedFreshness";

export const dynamic="force-dynamic";
export const runtime="nodejs";
const HEADERS={"Cache-Control":"private, no-store, max-age=0","Vary":"Cookie"};
const rejection=(code:number,detail:string)=>
  NextResponse.json({detail,authority:"NO_DELETE"}, {status:code,headers:HEADERS});

/** Read the append-only owner training record, not the live filesystem. */
export async function GET(request:NextRequest){
  const admin=await requireAdmin(request);
  if("error" in admin)return admin.error;
  // A site administrator is not automatically the enrolled storage owner.
  // Apply exactly the same account fence to GET as POST *before* loading
  // historical owner decisions. No broad admin-read exception is installed.
  const owner=teachingOwnerAccess(admin.user.uid);
  if(!owner.ownerBinding)return rejection(503,"TEACHING_OWNER_NOT_ENROLLED");
  if(!owner.mayRecord)return rejection(403,"TEACHING_OWNER_REQUIRED");
  try{
    return NextResponse.json({
      schema:"aoe2war.storage-teaching-history.v1",
      events:await readTeachingEvents(),
      ...owner,
      authority:"OWNER_FEEDBACK_ONLY_NO_DELETE",
    },{headers:HEADERS});
  }catch{return rejection(503,"TEACHING_LEDGER_NOT_ENROLLED_OR_UNAVAILABLE");}
}

/** A category preference is NEVER a filename or a cleanup permit. */
export async function POST(request:NextRequest){
  const admin=await requireAdmin(request);
  if("error" in admin)return admin.error;
  const owner=teachingOwnerAccess(admin.user.uid);
  if(!owner.ownerBinding)return rejection(503,"TEACHING_OWNER_NOT_ENROLLED");
  if(!owner.mayRecord)return rejection(403,"TEACHING_OWNER_REQUIRED");
  const origin=request.headers.get("origin");
  if(!origin||origin!==new URL(request.url).origin||
     request.headers.get("sec-fetch-site")==="cross-site")
    return rejection(403,"TEACHING_CROSS_ORIGIN_HOLD");
  if(!request.headers.get("content-type")?.startsWith("application/json"))
    return rejection(415,"TEACHING_CONTENT_TYPE_HOLD");
  const len=Number(request.headers.get("content-length")??"0");
  if(!Number.isSafeInteger(len)||len<0||len>1600)
    return rejection(413,"TEACHING_BODY_BOUND_HOLD");
  let obj:Record<string,unknown>;
  try{
    const bytes:Uint8Array[]=[];let size=0;
    const reader=request.body?.getReader();
    if(!reader)return rejection(400,"TEACHING_EMPTY_REQUEST");
    for(;;){
      const {done,value}=await reader.read();if(done)break;
      size+=value.byteLength;
      if(size>1600){await reader.cancel();return rejection(413,"TEACHING_BODY_BOUND_HOLD");}
      bytes.push(value);
    }
    const value:unknown=JSON.parse(Buffer.concat(bytes).toString("utf8"));
    if(!value||typeof value!=="object"||Array.isArray(value))throw Error("INVALID");
    obj=value as Record<string,unknown>;
  }catch{return rejection(400,"TEACHING_BAD_JSON");}
  if(!isTeachingPlane(obj.plane)||!isTeachingLevel(obj.level)||
     typeof obj.category!=="string"||!/^[A-Z][A-Z0-9_-]{2,47}$/.test(obj.category)||
     typeof obj.observedAt!=="string"||typeof obj.grossBytes!=="number"||
     typeof obj.sourceFloor!=="number"||typeof obj.overlaps!=="boolean"||
     !(obj.previousId===null||(typeof obj.previousId==="string"&&/^[a-f0-9-]{36}$/.test(obj.previousId)))||
     typeof obj.note!=="string"||obj.note.length>160||
     (obj.level===2&&!obj.note.trim())||
     (obj.level===5&&obj.confirmPermanent!==true))
    return rejection(400,"TEACHING_FIELDS_OR_CONFIRMATION_HOLD");
  try{
    const visual=await readPrivateStorageVisual();
    if(visual.source!=="SIGNED_PRIVATE_RECEIPT")
      return rejection(409,"SIGNED_HOG_FEED_UNAVAILABLE");
    const plane=visual.planes.find(p=>p.id===obj.plane);
    if(!plane||plane.status!=="RECEIPT"||plane.observedAt!==obj.observedAt)
      return rejection(409,"TEACHING_SOURCE_STALE");
    if(teachingSourceDeadline(plane.observedAt,obj.level)===null)
      return rejection(409,"TEACHING_SOURCE_EXPIRED");
    const hog=plane.hogs.find(h=>h.key===obj.category);
    if(!hog||!sourceMatchesRequest({
      key:hog.key,grossBytes:hog.grossBytes,level:hog.level,overlaps:hog.overlaps,
    },{key:obj.category,grossBytes:obj.grossBytes,sourceFloor:obj.sourceFloor,overlaps:obj.overlaps}))
      return rejection(409,"TEACHING_SOURCE_FINGERPRINT_CHANGED");
    const sourceFingerprint=observedHogFingerprint({
      plane:plane.id,at:plane.observedAt,key:hog.key,
      bytes:hog.grossBytes,level:hog.level,overlaps:hog.overlaps,
    });
    const event=await appendTeachingEvent({
      ownerBinding:owner.ownerBinding,
      plane:plane.id,category:hog.key,sourceObservedAt:plane.observedAt,
      sourceFingerprint,grossBytes:hog.grossBytes,sourceFloor:hog.level,
      overlaps:hog.overlaps,requestedLevel:obj.level,
      previousId:obj.previousId as string|null,
      note:obj.note.trim(),
    });
    return NextResponse.json({
      schema:"aoe2war.storage-teaching-receipt.v1",
      event,authority:"OWNER_FEEDBACK_ONLY_NO_DELETE",deleteExecuted:false,
    },{status:201,headers:HEADERS});
  }catch(e){
    const reason=e instanceof Error?e.message:"HOLD";
    return rejection(reason==="TEACHING_STALE_EXPECTATION"?409:503,
      reason.startsWith("TEACHING_")?reason:"TEACHING_LEDGER_UNAVAILABLE");
  }
}
