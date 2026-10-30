import {NextRequest,NextResponse} from "next/server";
import {requireAdmin} from "@/lib/adminSession";
import {readWorkLedger} from "@/lib/centralWorkLedger";
export const dynamic="force-dynamic";
export const runtime="nodejs";
const headers={"Cache-Control":"private, no-store, max-age=0","X-Content-Type-Options":"nosniff"};
export async function GET(request:NextRequest){
 const auth=await requireAdmin(request);
 if("error" in auth){auth.error.headers.set("Cache-Control",headers["Cache-Control"]);return auth.error;}
 try{return NextResponse.json(await readWorkLedger(),{headers});}
 catch{return NextResponse.json({schema:"aoe2war.central-work-ledger.v1",status:"UNKNOWN",detail:"SOURCE_LEDGER_UNAVAILABLE"},{status:503,headers});}
}
