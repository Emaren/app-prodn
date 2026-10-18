import { NextResponse } from "next/server";
import { loadKingdomIndex } from "@/lib/kingdomIndex";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET() {
  const data=await loadKingdomIndex();
  return NextResponse.json(data,{headers:{"Cache-Control":"public, max-age=0, s-maxage=30, stale-while-revalidate=30"}});
}
