import {NextRequest,NextResponse} from "next/server";
import {getSessionUid} from "@/lib/session";
import {NONFINANCIAL_PRODUCTION_PROFILE} from "@/lib/productionAuth";
import {callSocialClanImageWriter,callSocialClanImageReader,signedSocialCookie,validateSocialWriteOrigin} from "@/lib/socialWriterClient";
import {readBoundedClanImage} from "@/lib/clanImageIngress";
import {readRestrictedClanImage} from "@/lib/restrictedClanImageStorage.mjs";
import {readRestrictedClanHall,CLAN_PRIVATE_HEADERS} from "@/lib/restrictedClanHall";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const json=(body:Record<string,unknown>,status:number)=>NextResponse.json(body,{status,headers:CLAN_PRIVATE_HEADERS});
const enabled=()=>process.env.AOE2WAR_RUNTIME_PROFILE===NONFINANCIAL_PRODUCTION_PROFILE&&Boolean(process.env.SOCIAL_CLAN_IMAGE_READ_ROOT)&&process.env.SOCIAL_CLAN_IMAGE_READ_ROOT!==process.env.SOCIAL_DIRECT_IMAGE_READ_ROOT;
const id=(x:unknown):x is number=>typeof x==="number"&&Number.isSafeInteger(x)&&x>0&&x<=2147483647;
export async function POST(request:NextRequest){
 if(!enabled())return json({detail:"Clan image posting unavailable"},503);
 if(!validateSocialWriteOrigin(request))return json({detail:"Same-origin required"},403);
 const actor=await getSessionUid(request),token=signedSocialCookie(request);
 if(!actor||!token)return json({detail:"Signed session required"},401);
 let input;try{input=await readBoundedClanImage(request);}catch{return json({detail:"Choose one PNG, JPEG or WebP (10 MB maximum), without caption"},400);}
 const r=await callSocialClanImageWriter(token,input);
 if(r.status!==201)return json(r.body,r.status);
 const mid=r.body.messageId,aid=r.body.attachmentId;
 if(id(mid)&&id(aid)&&typeof input.slug==="string"){
  try{const snapshot=await readRestrictedClanHall(token,actor,input.slug,null,mid);if(snapshot.messages.some(m=>m.id===mid&&m.attachments.some(t=>t.id===aid)))return NextResponse.json(snapshot,{status:201,headers:CLAN_PRIVATE_HEADERS});}catch{}
 }
 return json({persisted:true,messageId:mid,attachmentId:aid,detail:"Image saved. Check Hall history before retrying."},202);
}
export async function GET(request:NextRequest){
 if(!enabled())return json({detail:"Clan images unavailable"},503);
 const actor=await getSessionUid(request),token=signedSocialCookie(request);
 if(!actor||!token)return json({detail:"Signed session required"},401);
 const q=request.nextUrl.searchParams,slug=q.get("slug"),raw=q.get("attachmentId");
 if([...q.keys()].length!==2||q.getAll("slug").length!==1||q.getAll("attachmentId").length!==1||!slug||!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(slug)||!raw||!/^[1-9]\d{0,9}$/.test(raw)||!id(Number(raw)))return json({detail:"Invalid image request"},400);
 const r=await callSocialClanImageReader(token,{slug,attachmentId:Number(raw)});
 if(r.status!==200)return json({detail:r.status===404?"Image not found":"Image unavailable"},r.status);
 const {storageRef,mimeType,sizeBytes}=r.body;
 if(typeof storageRef!=="string"||typeof mimeType!=="string"||!id(sizeBytes))return json({detail:"Image unavailable"},503);
 const image=await readRestrictedClanImage(process.env.SOCIAL_CLAN_IMAGE_READ_ROOT,storageRef,mimeType,sizeBytes);
 if(!image)return json({detail:"Image not found"},404);
 return new NextResponse(new Uint8Array(image.buffer),{headers:{...CLAN_PRIVATE_HEADERS,"Content-Type":image.mimeType,"Content-Length":String(image.buffer.length),"Content-Security-Policy":"sandbox","Content-Disposition":"inline"}});
}
