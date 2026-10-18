import {NextRequest,NextResponse} from "next/server";
import {requireAdmin} from "@/lib/adminSession";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(request:NextRequest) {
 const gate=await requireAdmin(request);
 if("error" in gate)return gate.error;
 const rows=await gate.prisma.userActivityEvent.findMany({where:{type:"kingdom_match_nomination"},orderBy:{createdAt:"desc"},take:80,
 select:{id:true,createdAt:true,metadata:true,user:{select:{uid:true,inGameName:true,steamPersonaName:true}}}});
 return NextResponse.json({rows:rows.map(r=>({...r,createdAt:r.createdAt.toISOString(),
  proposer:r.user.inGameName||r.user.steamPersonaName||"Warrior",user:undefined}))},
  {headers:{"Cache-Control":"private, no-store"}});
}
