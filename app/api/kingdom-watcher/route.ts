import { NextResponse } from "next/server";
import { loadKingdomWatcherPublic } from "@/lib/kingdomWatcherPublic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = await loadKingdomWatcherPublic();
  return NextResponse.json(snapshot, {
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
