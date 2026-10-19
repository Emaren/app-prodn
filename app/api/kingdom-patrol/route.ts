import { NextResponse } from "next/server";
import { kingdomPatrolCoverage } from "@/lib/kingdomPatrolCoverage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = kingdomPatrolCoverage();
  return NextResponse.json({
    ...snapshot,
    generatedAt: new Date().toISOString(),
    deployedBuild: process.env.NEXT_PUBLIC_AOE2WAR_BUILD_VERSION || null,
  }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
}
