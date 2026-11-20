import {NextRequest,NextResponse} from "next/server";
import {requireAdmin} from "@/lib/adminSession";
import {teachingOwnerAccess} from "@/lib/storageHogTeachingLedger";
import {readExactItems} from "@/lib/storageExactItemSource";
import {appendArchiveChoice,readArchiveEvents} from "@/lib/storageArchivePreferenceLedger";
import {readIntelColdEvidence} from "@/lib/intelColdStorageEvidence";

export const dynamic="force-dynamic";
export const runtime="nodejs";
const HEADERS={"Cache-Control":"private, no-store, max-age=0","Vary":"Cookie"};
const reject=(status:number,detail:string)=>NextResponse.json({
  detail,authority:"NO_TRANSFER_NO_DELETE"},{status,headers:HEADERS});
async function enrolled(request:NextRequest){
  const session=await requireAdmin(request);
  if("error" in session)return {error:session.error};
  const owner=teachingOwnerAccess(session.user.uid);
  if(!owner.ownerBinding)return {error:reject(503,"ARCHIVE_OWNER_NOT_ENROLLED")};
  if(!owner.mayRecord)return {error:reject(403,"ARCHIVE_OWNER_REQUIRED")};
  return {owner};
}
async function intelAvailable(){
  if(process.env.AOE2WAR_INTEL_STATUS_CONTRACT_ADMITTED!=="WE4_SIGNED_V1")return false;
  try{
    const view=await readIntelColdEvidence();
    return view.source==="SIGNED_PRIVATE_RECEIPT"&&view.health==="ONLINE";
  }catch{return false;}
}
export async function GET(request:NextRequest){
  const access=await enrolled(request);
  if("error" in access)return access.error;
  try{
    const [source,events,intelOnline]=await Promise.all([
      readExactItems(),readArchiveEvents(),intelAvailable()]);
    return NextResponse.json({
      schema:"aoe2war.storage-archive-preferences.read.v1",
      source,events,ownerBinding:access.owner.ownerBinding,intelOnline,
      authority:"OWNER_PREFERENCE_ONLY_NO_TRANSFER_NO_DELETE",
      transferAuthorized:false,deleteAuthorized:false,
    },{headers:HEADERS});
  }catch{return reject(503,"ARCHIVE_SIGNED_SOURCE_OR_LEDGER_HOLD");}
}
export async function POST(request:NextRequest){
  const access=await enrolled(request);
  if("error" in access)return access.error;
  if(request.headers.get("origin")!==new URL(request.url).origin||
     request.headers.get("sec-fetch-site")==="cross-site")
    return reject(403,"ARCHIVE_ORIGIN_HOLD");
  if(!request.headers.get("content-type")?.startsWith("application/json"))
    return reject(415,"ARCHIVE_CONTENT_TYPE_HOLD");
  const len=Number(request.headers.get("content-length")??"0");
  if(!Number.isSafeInteger(len)||len<0||len>1024)
    return reject(413,"ARCHIVE_BODY_SIZE_HOLD");
  let req:Record<string,unknown>;
  try{
    const body=await request.text();
    if(Buffer.byteLength(body)>1024)return reject(413,"ARCHIVE_BODY_SIZE_HOLD");
    const o:unknown=JSON.parse(body);
    if(!o||typeof o!=="object"||Array.isArray(o))throw Error("BAD_JSON");
    req=o as Record<string,unknown>;
  }catch{return reject(400,"ARCHIVE_BAD_JSON");}
  if(typeof req.objectId!=="string"||!/^[a-f0-9]{64}$/.test(req.objectId)||
     typeof req.fingerprint!=="string"||!/^[a-f0-9]{64}$/.test(req.fingerprint)||
     typeof req.sourceDigest!=="string"||!/^[a-f0-9]{64}$/.test(req.sourceDigest)||
     typeof req.observedAt!=="string"||
     (req.choice!=="YES"&&req.choice!=="NO")||
     !(req.previousChoiceId===null||
       (typeof req.previousChoiceId==="string"&&/^[a-f0-9-]{36}$/.test(req.previousChoiceId))))
    return reject(400,"ARCHIVE_FIELDS_INVALID");
  try{
    const source=await readExactItems();
    if(source.source!=="SIGNED_PRIVATE_RECEIPT")
      return reject(409,"EXACT_OBJECT_SOURCE_NOT_ADMITTED");
    const item=source.items.find(x=>x.objectId===req.objectId);
    if(!item||item.fingerprint!==req.fingerprint||
       item.sourceDigest!==req.sourceDigest||item.observedAt!==req.observedAt)
      return reject(409,"ARCHIVE_OBJECT_IDENTITY_CHANGED");
    const event=await appendArchiveChoice({
      object:item,choice:req.choice,previousChoiceId:req.previousChoiceId as string|null,
      ownerBinding:access.owner.ownerBinding!,
    });
    const intelOnline=await intelAvailable();
    return NextResponse.json({
      schema:"aoe2war.storage-archive-preference.receipt.v1",
      event,status:event.choice==="NO"?"NOT_QUEUED":
        intelOnline?"PREFERENCE_RECORDED_TRANSFER_HELD":"QUEUED_OFFLINE",
      authority:"OWNER_PREFERENCE_ONLY_NO_TRANSFER_NO_DELETE",
      transferAuthorized:false,deleteAuthorized:false,
    },{status:201,headers:HEADERS});
  }catch(e){
    const reason=e instanceof Error?e.message:"ARCHIVE_HOLD";
    return reject(["ARCHIVE_STALE_CHOICE","ARCHIVE_DUPLICATE_CHOICE"].includes(reason)
      ?409:503,reason.startsWith("ARCHIVE_")?reason:"ARCHIVE_LEDGER_HOLD");
  }
}
