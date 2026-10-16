import { NextResponse } from "next/server";
import { buildAoe2warOsPublicSnapshot } from "@/lib/aoe2warOsPublic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const snapshot = await buildAoe2warOsPublicSnapshot();
    return NextResponse.json(snapshot, {
      headers: { "Cache-Control": "no-store, max-age=0, must-revalidate" },
    });
  } catch {
    return NextResponse.json(
      { schema: 1, observedAt: new Date().toISOString(), state: "unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store, max-age=0, must-revalidate" } },
    );
  }
}
