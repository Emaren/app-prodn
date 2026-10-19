import { NextResponse } from "next/server";
import { readKingdomBuildRouteCensus } from "@/lib/kingdomBuildRouteCensus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const data = await readKingdomBuildRouteCensus();
  return NextResponse.json(data, {
    status: data.status === "verified" ? 200 : 503,
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}
