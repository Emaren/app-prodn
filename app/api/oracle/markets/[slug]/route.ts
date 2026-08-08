import { NextRequest, NextResponse } from "next/server";

import { loadOracleSnapshot } from "@/lib/oracle";
import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const normalizedSlug = decodeURIComponent(slug).trim().toLowerCase();
    const uid = await getSessionUid(request);
    const snapshot = await loadOracleSnapshot(getPrisma(), uid);
    const market = snapshot.markets.find((entry) => entry.slug === normalizedSlug);
    if (!market) {
      return NextResponse.json({ detail: "Oracle market not found." }, { status: 404 });
    }
    return NextResponse.json(
      {
        generatedAt: snapshot.generatedAt,
        stage: snapshot.stage,
        viewer: snapshot.viewer,
        markBalance: snapshot.markBalance,
        pulse: snapshot.pulse,
        market,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("Failed to load Oracle market:", error);
    return NextResponse.json(
      { detail: "The Oracle market could not be read." },
      { status: 500 },
    );
  }
}
