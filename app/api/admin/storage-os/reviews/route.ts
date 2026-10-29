import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminSession";
import { INDIVIDUAL_TRANSPORT_ADOPTED, readPrivateStorageVisual, type PlaneId } from "@/lib/storageVisualPrivate";
import { appendOwnerReview, readOwnerReviews } from "@/lib/storageOwnerReviews";

export const dynamic="force-dynamic";
export const runtime="nodejs";
const HEADERS={"Cache-Control":"private, no-store, max-age=0"};
function reject(status:number,detail:string){return NextResponse.json({detail},{status,headers:HEADERS});}
export async function GET(request:NextRequest){
  const admin=await requireAdmin(request);
  if("error" in admin){admin.error.headers.set("Cache-Control",HEADERS["Cache-Control"]);return admin.error;}
  try{
    const events=await readOwnerReviews();
    return NextResponse.json({schema:"aoe2war.storage-owner-reviews.v1",events}, {headers:HEADERS});
  }catch{return reject(503,"REVIEW_LEDGER_UNAVAILABLE");}
}
/** Owner intent only. Never invokes a delete, migration, scanner or release controller. */
export async function POST(request:NextRequest){
  const admin=await requireAdmin(request);
  if("error" in admin){admin.error.headers.set("Cache-Control",HEADERS["Cache-Control"]);return admin.error;}
  const origin=request.headers.get("origin");
  if(!origin||origin!==new URL(request.url).origin||request.headers.get("sec-fetch-site")==="cross-site")
    return reject(403,"REVIEW_CROSS_ORIGIN_HOLD");
  // C v1's exact source HMAC permits hogs only; no per-item review alias nor
  // source-owned capacity_sample is authenticated over the existing bridge.
  // Reject even correctly shaped, manually signed legacy items. No approval
  // can be minted until separate C/G versioned source contract is accepted.
  if(!INDIVIDUAL_TRANSPORT_ADOPTED)return reject(409,"REVIEW_SOURCE_TRANSPORT_UNAVAILABLE");
  if(!request.headers.get("content-type")?.startsWith("application/json"))return reject(415,"REVIEW_CONTENT_TYPE_HOLD");
  const suppliedLength=Number(request.headers.get("content-length")??"0");
  if(!Number.isFinite(suppliedLength)||suppliedLength>2048)return reject(413,"REVIEW_BODY_BOUNDS_HOLD");
  let body:Record<string,unknown>;
  try{
    const reader=request.body?.getReader();
    if(!reader)return reject(400,"REVIEW_BODY_EMPTY");
    const chunks:Uint8Array[]=[];let length=0;
    while(true){const {done,value}=await reader.read();if(done)break;
      length+=value.byteLength;if(length>2048){await reader.cancel();return reject(413,"REVIEW_BODY_BOUNDS_HOLD");}
      chunks.push(value);
    }
    const raw=Buffer.concat(chunks).toString("utf8");
    const decoded:unknown=JSON.parse(raw);
    if(!decoded||typeof decoded!=="object"||Array.isArray(decoded))throw Error("BODY");
    body=decoded as Record<string,unknown>;
  }catch{return reject(400,"REVIEW_BODY_INVALID");}
  const choice=body.decision;
  const choices=["PROTECT","REVIEW_LATER","SINGLE_CANDIDATE_APPROVAL","MIGRATION_REVIEW","REVOKE"] as const;
  if(typeof body.alias!=="string"||typeof body.fingerprint!=="string"||
    typeof body.sourceDigest!=="string"||typeof body.sourceRevision!=="string"||
    typeof body.plane!=="string"||!choices.some(x=>x===choice)||
    !(body.previousId===null||(typeof body.previousId==="string"&&/^[a-f0-9-]{36}$/.test(body.previousId))))
    return reject(400,"REVIEW_FIELDS_INVALID");
  try{
    const visual=await readPrivateStorageVisual();
    if(visual.source!=="SIGNED_PRIVATE_RECEIPT")return reject(409,"REVIEW_SIGNED_SOURCE_MISSING");
    const plane=visual.planes.find(p=>p.id===body.plane);
    if(!plane||plane.status!=="RECEIPT")return reject(409,"REVIEW_SOURCE_STALE");
    const item=plane.reviewItems?.find(i=>i.alias===body.alias);
    if(!item||item.fingerprint!==body.fingerprint||item.sourceDigest!==body.sourceDigest||
      item.sourceRevision!==body.sourceRevision)return reject(409,"REVIEW_FINGERPRINT_DRIFT");
    // L5 is owner-express immutable NEVER DELETE, including migrated legacy L4
    // PROTECTED. Generic review/REVOKE cannot withdraw permanent protection.
    if(item.level===5)return reject(409,"REVIEW_L5_OWNER_IMMUTABLE");
    // L4 is human-only; no automated delete operation exists in this API.
    // Migration design intent belongs to item-specific L3 alone.
    if(choice==="MIGRATION_REVIEW"&&item.level!==3)return reject(409,"REVIEW_MIGRATION_LEVEL_HOLD");
    const approval=choice==="SINGLE_CANDIDATE_APPROVAL";
    if(approval&&(item.level!==1||item.sourceStatus!=="GUARDED"||item.proofState!=="COMPLETE"||
      item.overlaps||Date.now()-Date.parse(plane.observedAt)>60*60_000))
      return reject(409,"REVIEW_SINGLE_APPROVAL_NOT_QUALIFIED");
    const event=await appendOwnerReview({plane:plane.id as PlaneId,item,
      decision:choice as (typeof choices)[number],previousId:body.previousId as string|null});
    return NextResponse.json({schema:"aoe2war.storage-owner-review-accepted.v1",
      event,authority:"INTENT_ONLY_NO_DELETE"}, {status:201,headers:HEADERS});
  }catch(e){
    const msg=e instanceof Error?e.message:"UNKNOWN";
    return reject(msg==="REVIEW_STALE_EXPECTATION"?409:503,"REVIEW_LEDGER_HOLD");
  }
}
