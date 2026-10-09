import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { loadLibraryHistoricalSnapshot } from "@/lib/libraryHistoricalIndex";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Public uploader history, scoped to named claimed site accounts. This is
 * GameStats.userUid ownership, not a roster participation tally. Nobody's
 * results, Wolo custody, replay content or identity claims are modified.
 */
export async function GET() {
  try {
    const snapshot = await loadLibraryHistoricalSnapshot(getPrisma());
    return NextResponse.json({
      ok: true,
      generatedAt: snapshot.generatedAt,
      totalFinalRecords: snapshot.total,
      last24h: snapshot.last24h,
      totals: snapshot.totalByOrigin,
      players: snapshot.profiles,
      definition: {
        owner: "Authenticated uploader GameStats.user_uid; not game participant",
        unknown: "Non-checkpoint final record with no trusted, statistics-eligible result in the current public replay truth resolver",
        historicalZip: "Older ZIP receipt correlations are marked inferred; ambiguous matches remain manual",
        record: "One durable final replay record; not necessarily one unique public battle",
      },
    }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (error) {
    console.error("Library uploader census unavailable:", error);
    return NextResponse.json(
      { ok: false, detail: "Uploader census temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
