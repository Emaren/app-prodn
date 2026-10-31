import {NextRequest,NextResponse} from "next/server";
import {requireAdmin} from "@/lib/adminSession";
import {readCentralEvents} from "@/lib/centralEvents";
export const dynamic="force-dynamic";
export const runtime="nodejs";
const headers={"Cache-Control":"private, no-store, max-age=0","X-Content-Type-Options":"nosniff"};
export async function GET(req:NextRequest){
 const admin=await requireAdmin(req);
 if("error" in admin){admin.error.headers.set("Cache-Control",headers["Cache-Control"]);return admin.error;}
 try{return NextResponse.json(await readCentralEvents(),{headers});}
 catch{return NextResponse.json({detail:"SOURCE_EVENTS_UNKNOWN",status:"UNKNOWN"},{status:503,headers});}
}
// No mutations, unauthenticated read, webhook or GitHub token in client.
