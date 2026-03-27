import { NextResponse } from "next/server";

import { fetchWoloStatusSnapshot } from "@/lib/woloRuntime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = await fetchWoloStatusSnapshot();
  return NextResponse.json(snapshot);
}
