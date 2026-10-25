import { NextRequest,NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminSession";
import { loadObservatory,parseWindow,parseCursor,parseSearch } from "@/lib/adminLivingKingdom/read";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const revalidate=0;
const HEADERS={"Cache-Control":"private, no-store, max-age=0","X-Content-Type-Options":"nosniff"};
export async function GET(request:NextRequest){
 try{
  const gate=await requireAdmin(request);
  if("error" in gate)return NextResponse.json({detail:"Admin authentication required"},{status:gate.error.status,headers:HEADERS});
  const q=request.nextUrl.searchParams;
  const payload=await loadObservatory(gate.prisma,{
   days:parseWindow(q.get("days")),cursor:parseCursor(q.get("cursor")),search:parseSearch(q.get("q"))
  });
  return NextResponse.json(payload,{headers:HEADERS});
 }catch{
  return NextResponse.json({detail:"Observatory unavailable"},{status:500,headers:HEADERS});
 }
}