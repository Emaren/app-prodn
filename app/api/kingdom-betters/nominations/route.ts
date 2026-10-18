import {NextRequest,NextResponse} from "next/server";
import {getSessionUid} from "@/lib/session";
import {getPrisma} from "@/lib/prisma";
import {isInternalSystemUid} from "@/lib/internalSystemAccounts";
export const runtime="nodejs";export const dynamic="force-dynamic";
const NO_STORE={"Cache-Control":"private, no-store"};
function error(detail:string,status:number){return NextResponse.json({detail},{status,headers:NO_STORE});}
export async function POST(request:NextRequest){
  const origin=request.headers.get("origin");
  if(!origin || !origin.startsWith(request.nextUrl.origin+"/") && origin!==request.nextUrl.origin)return error("Invalid request origin.",403);
  const uid=await getSessionUid(request);
  if(!uid)return error("Sign in to propose a matchup.",401);
  const db=getPrisma();
  const viewer=await db.user.findUnique({where:{uid},select:{id:true,uid:true}});
  if(!viewer || isInternalSystemUid(viewer.uid))return error("Human account required.",403);
  const body=(await request.json().catch(()=>null)) as {
    left?:unknown;right?:unknown;trophyId?:unknown;requestId?:unknown;note?:unknown;
  }|null;
  const left=body?.left,right=body?.right;
  const validSide=(x:unknown):x is string[]=>Array.isArray(x)&&x.length>=1&&x.length<=4&&x.every(v=>typeof v==="string"&&v.length>0&&v.length<=100);
  if(!validSide(left)||!validSide(right)||left.length+right.length>8)return error("Choose 1–4 warriors on each side, up to eight total.",400);
  const all=[...left,...right];
  if(new Set(all).size!==all.length)return error("A warrior can only appear once per matchup.",400);
  const trophyId=body?.trophyId;
  if(trophyId!==null && trophyId!==undefined && (typeof trophyId!=="string"||trophyId.length>100))return error("Invalid belt selection.",400);
  const requestId=body?.requestId;
  if(typeof requestId!=="string"||!/^[a-z0-9-]{16,75}$/i.test(requestId))return error("Invalid request identity.",400);
  const note=typeof body?.note==="string"?body.note.trim().slice(0,250):"";
  try {
    const [participants,trophy]=await Promise.all([
      db.user.findMany({where:{uid:{in:all}},select:{uid:true,inGameName:true,steamPersonaName:true}}),
      typeof trophyId==="string"?db.trophy.findUnique({where:{trophyId},select:{trophyId:true,displayName:true}}):Promise.resolve(null),
    ]);
    if(participants.length!==all.length||participants.some(x=>isInternalSystemUid(x.uid)))return error("All selected combatants must be registered human players.",400);
    if(typeof trophyId==="string"&&!trophy)return error("The selected belt is unavailable.",400);
    const named=new Map(participants.map(p=>[p.uid,p.inGameName||p.steamPersonaName||"Warrior"]));
    const now=new Date(),today=new Date(now.getTime()-86_400_000);
    const result=await db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(79711, ${viewer.id})`;
      const recent=await tx.userActivityEvent.findMany({where:{userId:viewer.id,type:"kingdom_match_nomination",createdAt:{gte:today}},take:20,orderBy:{createdAt:"desc"},select:{id:true,metadata:true}});
      const duplicate=recent.find(x=>x.metadata && typeof x.metadata==="object"&&!Array.isArray(x.metadata)&&"requestId" in x.metadata && x.metadata.requestId===requestId);
      if(duplicate)return {id:duplicate.id,duplicate:true};
      if(recent.length>=3)throw new Error("LIMIT_REACHED");
      const row=await tx.userActivityEvent.create({data:{userId:viewer.id,type:"kingdom_match_nomination",path:"/kingdom-betters",label:"Spectator challenge",metadata:{
        requestId,left,right,trophyId:typeof trophyId==="string"?trophyId:null,note,
        leftNames:left.map(k=>named.get(k)??"Warrior"),rightNames:right.map(k=>named.get(k)??"Warrior"),
        status:"pending_commissioner_review",source:"kingdom-betters-v1",woloAuthority:false
      }},select:{id:true}});
      return {id:row.id,duplicate:false};
    });
    return NextResponse.json({ok:true,...result,status:"pending_commissioner_review"}, {status:201,headers:NO_STORE});
  }catch(cause){
    if(cause instanceof Error&&cause.message==="LIMIT_REACHED")return error("Three proposals per 24 hours. Try again later.",429);
    console.warn("Match nomination failed",cause);
    return error("Unable to record matchup request.",503);
  }
}
