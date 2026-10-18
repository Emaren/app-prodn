import { NextResponse } from "next/server";
import { loadKingdomIndex } from "@/lib/kingdomIndex";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET() {
  const data=await loadKingdomIndex();
  return NextResponse.json(data,{headers:{"Cache-Control":"private, no-store, max-age=0"}});
}
