import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminSession";
import { readPrivateCentralCommand } from "@/lib/centralCommandPrivate";
export const dynamic="force-dynamic";
export const runtime="nodejs";
const CACHE="private, no-store, max-age=0";
export async function GET(request:NextRequest){
 const admin=await requireAdmin(request);
 if("error" in admin){
  admin.error.headers.set("Cache-Control",CACHE);
  return admin.error;
 }
 try{
  const data=await readPrivateCentralCommand();
  return NextResponse.json(data,{headers:{"Cache-Control":CACHE,"X-Content-Type-Options":"nosniff"}});
 }catch{
  return NextResponse.json({detail:"CENTRAL_COMMAND_SOURCE_HOLD",status:"UNKNOWN"},
   {status:503,headers:{"Cache-Control":CACHE,"X-Content-Type-Options":"nosniff"}});
 }
}
// No POST, no controller, no watcher, no session dispatch, no financial writer.
