import {NextResponse} from "next/server";
import {loadKingdomBetters} from "@/lib/kingdomBetters";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET() {
  try{
    return NextResponse.json(await loadKingdomBetters(),{headers:{"Cache-Control":"public, s-maxage=20, stale-while-revalidate=20"}});
  }catch(error){
    console.warn("Kingdom Betters public projection unavailable",error);
    return NextResponse.json({detail:"Betting roster temporarily unavailable."},{status:503,headers:{"Cache-Control":"no-store"}});
  }
}
