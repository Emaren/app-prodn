import {NextResponse} from "next/server";
import {readKingdomIndexLiveCandidate} from "@/lib/kingdomIndexLiveFeed.mjs";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const revalidate=0;
export async function GET(){
 const report=await readKingdomIndexLiveCandidate();
 return NextResponse.json(report,{headers:{
  "Cache-Control":"private, no-store, max-age=0",
  "X-Content-Type-Options":"nosniff"
 }});
}
