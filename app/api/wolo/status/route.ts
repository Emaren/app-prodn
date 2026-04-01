import { NextResponse } from "next/server";

import { fetchWoloStatusSnapshot } from "@/lib/woloRuntime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

export async function GET() {
  const snapshot = await fetchWoloStatusSnapshot();
  return NextResponse.json(snapshot, {
    headers: NO_STORE_HEADERS,
  });
}