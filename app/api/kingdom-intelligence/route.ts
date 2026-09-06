import { NextResponse } from "next/server";

import { loadPublicKingdomIntelligence } from "@/lib/kingdomIntelligencePublic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = {
  "Cache-Control": "no-store, max-age=0",
};

export async function GET() {
  try {
    const intelligence = await loadPublicKingdomIntelligence();
    return NextResponse.json(intelligence, { headers: NO_STORE });
  } catch {
    return NextResponse.json(
      {
        available: false,
        generatedAt: null,
        receivedAt: null,
        warDate: null,
        stale: true,
        ageSeconds: null,
        operatingState: "UNKNOWN",
        source: null,
        health: null,
        storage: null,
        storageCampaign: null,
        replayTruth: null,
        performance: null,
        workspace: null,
        activity24h: null,
        invariants: [],
        directive: null,
      },
      { status: 503, headers: NO_STORE }
    );
  }
}
