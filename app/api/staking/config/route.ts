import { NextResponse } from "next/server";

import { getWoloStakingRuntime } from "@/lib/woloStakingRuntime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getWoloStakingRuntime());
}
