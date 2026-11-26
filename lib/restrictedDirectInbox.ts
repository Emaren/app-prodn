import type {NextRequest} from "next/server";
import {NextResponse} from "next/server";
import {callSocialDirectReader,signedSocialCookie} from "@/lib/socialWriterClient";
import {mapRestrictedInbox,selectRestrictedTarget,restrictedSyncMarker} from "@/lib/restrictedDirectInboxDto.mjs";
import {NONFINANCIAL_PRODUCTION_PROFILE} from "@/lib/productionAuth";
export const DIRECT_PRIVATE_HEADERS={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};
export class RestrictedDirectReadError extends Error {
 readonly status:number;
 constructor(status:number){super("DIRECT_READ_UNAVAILABLE");this.status=status;}
}
export function privateDirectError(error:unknown){
 const status=error instanceof RestrictedDirectReadError?error.status:503;
 return NextResponse.json({detail:status===401?"No active session":status===404?"Conversation or attachment not found":status===400?"Invalid inbox request":"Inbox unavailable"},{status,headers:DIRECT_PRIVATE_HEADERS});
}
export async function restrictedDirectRead(request:NextRequest,input:Record<string,unknown>){
 if(process.env.AOE2WAR_RUNTIME_PROFILE!==NONFINANCIAL_PRODUCTION_PROFILE)throw new RestrictedDirectReadError(503);
 const token=signedSocialCookie(request);
 if(!token)throw new RestrictedDirectReadError(401);
 const response=await callSocialDirectReader(token,input);
 if(response.status!==200)throw new RestrictedDirectReadError([400,401,404].includes(response.status)?response.status:503);
 return response.body;
}
export async function readRestrictedInbox(request:NextRequest,actor:string,options:{summaryOnly:boolean;targetUid:string|null;before:number|null}){
 const summary=await restrictedDirectRead(request,{op:"summary"});
 const viewer=summary.viewer as {uid?:unknown}|undefined;
 if(viewer?.uid!==actor)throw new RestrictedDirectReadError(401);
 let targetUid:string|null;
 try{targetUid=selectRestrictedTarget(summary,options.targetUid);}catch{throw new RestrictedDirectReadError(400);}
 const history=options.summaryOnly||!targetUid?null:await restrictedDirectRead(request,{op:"history",targetUid,before:options.before});
 return mapRestrictedInbox(summary,history,{actor,targetUid,summaryOnly:options.summaryOnly,before:options.before});
}
export async function readRestrictedInboxGet(request:NextRequest,actor:string){
 try{
  const q=request.nextUrl.searchParams;
  const allowed=["summary","user","before","sync","challenge"];
  if([...q.keys()].some(k=>!allowed.includes(k)||q.getAll(k).length!==1))throw new RestrictedDirectReadError(400);
  const targetUid=q.get("user");
  if(targetUid!==null&&(!/^[A-Za-z0-9_.:-]{1,100}$/.test(targetUid)||targetUid===actor))throw new RestrictedDirectReadError(400);
  if(q.has("sync")){
   if(q.get("sync")!=="1"||!targetUid||[...q.keys()].some(k=>k!=="sync"&&k!=="user"))throw new RestrictedDirectReadError(400);
   const d=await restrictedDirectRead(request,{op:"sync",targetUid});
   return NextResponse.json({syncMarker:restrictedSyncMarker(d.conversationId,d.rows)},{headers:DIRECT_PRIVATE_HEADERS});
  }
  const summaryOnly=q.get("summary")==="1";
  if(q.has("summary")&&!summaryOnly)throw new RestrictedDirectReadError(400);
  const raw=q.get("before");
  const before=raw===null?null:Number(raw);
  if(raw!==null&&(!/^[1-9]\d{0,9}$/.test(raw)||!Number.isSafeInteger(before)||Number(before)>2147483647||summaryOnly||!targetUid))throw new RestrictedDirectReadError(400);
  // Challenge projection is not admitted in this profile; ignore only a well-formed UI selection.
  const challenge=q.get("challenge");
  if(challenge!==null&&!/^[1-9]\d{0,9}$/.test(challenge))throw new RestrictedDirectReadError(400);
  const body=await readRestrictedInbox(request,actor,{summaryOnly,targetUid,before});
  return NextResponse.json(body,{headers:DIRECT_PRIVATE_HEADERS});
 }catch(error){return privateDirectError(error);}
}
