import { NextResponse } from "next/server";
import { buildKingdomAgentsPublicSnapshot } from "@/lib/kingdomAgentsPublic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store, max-age=0, must-revalidate" };

export async function GET() {
  try {
    const snapshot = await buildKingdomAgentsPublicSnapshot();
    return NextResponse.json(snapshot, { headers });
  } catch {
    return NextResponse.json(
      {
        schema: 1,
        observedAt: new Date().toISOString(),
        releaseSha: null,
        sources: { intelligence: false, intelligenceStale: true, inspections: false, releaseAlignment: "unknown" },
        readinessScore: null,
        doctorScore: null,
        directive: null,
        agents: [],
        activity: [],
      },
      { status: 503, headers },
    );
  }
}
