import {NextRequest,NextResponse} from "next/server";
import type {ClanHallSnapshot,ClanDirectoryEntry} from "@/lib/clans";
import {buildClanFallbackSnapshot} from "@/lib/clans";
import {NONFINANCIAL_PRODUCTION_PROFILE} from "@/lib/productionAuth";
import {callSocialClanReader,signedSocialCookie} from "@/lib/socialWriterClient";
import {mapClanHall} from "@/lib/socialClanReaderCore.mjs";
export const CLAN_PRIVATE_HEADERS={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};
export class ClanReadError extends Error{
 readonly status:number;
 constructor(status:number){super("CLAN_HALL_UNAVAILABLE");this.status=status;}
}
export function lockedClanSnapshot(clan:ClanDirectoryEntry,actor:string|null,notice:string):ClanHallSnapshot{
 const base=buildClanFallbackSnapshot(clan,actor);
 return {...base,viewer:{...base.viewer,isMember:false,canManage:false},allowedAudiences:[],messages:[],roster:[],access:{canReadChat:false,canPost:false,hallScribeRepliesAvailable:false,restrictedMemberHall:true,restrictedImageAvailable:false,notice}};
}
export async function readRestrictedClanHall(token:string|null|undefined,actor:string|null,slug:string,before:number|null=null,focus:number|null=null):Promise<ClanHallSnapshot>{
 if(process.env.AOE2WAR_RUNTIME_PROFILE!==NONFINANCIAL_PRODUCTION_PROFILE)throw new ClanReadError(503);
 if(!token||!actor)throw new ClanReadError(401);
 if(!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(slug))throw new ClanReadError(400);
 const r=await callSocialClanReader(token,{slug,before,focus});
 if(r.status!==200)throw new ClanReadError([400,401,404].includes(r.status)?r.status:503);
 return mapClanHall(r.body,{actor,slug,before,focus});
}
export async function restrictedClanResponse(request:NextRequest,actor:string|null,pathSlug?:string){
 try{
  const q=request.nextUrl.searchParams;
  if([...q.keys()].some(k=>!(pathSlug===undefined?["slug","beforeMessageId","focusMessageId"]:["beforeMessageId","focusMessageId"]).includes(k)||q.getAll(k).length!==1))throw new ClanReadError(400);
  const slug=pathSlug??q.get("slug")??"";
  const cursor=(k:string)=>{const v=q.get(k);if(v===null)return null;if(!/^[1-9]\d{0,9}$/.test(v)||Number(v)>2147483647)throw new ClanReadError(400);return Number(v);};
  const before=cursor("beforeMessageId"),focus=cursor("focusMessageId");
  if(before!==null&&focus!==null)throw new ClanReadError(400);
  const snapshot=await readRestrictedClanHall(signedSocialCookie(request),actor,slug,before,focus);
  return NextResponse.json(snapshot,{headers:CLAN_PRIVATE_HEADERS});
 }catch(e){const status=e instanceof ClanReadError?e.status:503;return NextResponse.json({detail:status===401?"Sign in to access Clan Hall":status===404?"Active clan membership required":"Clan Hall unavailable"},{status,headers:CLAN_PRIVATE_HEADERS});}
}
