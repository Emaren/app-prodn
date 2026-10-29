import { NextRequest,NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminSession";
import { loadWarriorHistory,parseCursor,parseWindow } from "@/lib/adminLivingKingdom/read";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const revalidate=0;
const HEADERS={"Cache-Control":"private, no-store, max-age=0","X-Content-Type-Options":"nosniff"};
export async function GET(request:NextRequest,context:{params:Promise<{uid:string}>}){
 try{
  const gate=await requireAdmin(request);
  if("error" in gate)return NextResponse.json({detail:"Admin authentication required"},{status:gate.error.status,headers:HEADERS});
  const {uid}=await context.params;
  if(!uid||uid.length>100||!/^[A-Za-z0-9_-]+$/.test(uid))
   return NextResponse.json({detail:"Invalid warrior"},{status:400,headers:HEADERS});
  const payload=await loadWarriorHistory(gate.prisma,{
   uid,days:parseWindow(request.nextUrl.searchParams.get("days")),
   cursor:parseCursor(request.nextUrl.searchParams.get("cursor"))
  });
  if(!payload)return NextResponse.json({detail:"Warrior not found"},{status:404,headers:HEADERS});
  return NextResponse.json(payload,{headers:HEADERS});
 }catch{
  return NextResponse.json({detail:"History unavailable"},{status:500,headers:HEADERS});
 }
}