import { NextResponse } from "next/server";

import { projectHdReplayEngine } from "@/lib/hdReplayEngine";
import { loadPublicParserObservatory } from "@/lib/parserObservatory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snapshot = projectHdReplayEngine(await loadPublicParserObservatory());
    return NextResponse.json(snapshot, {
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    // Do not fabricate success or export internal DB errors to public clients.
    return NextResponse.json(
      { error: "Replay telemetry temporarily unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
