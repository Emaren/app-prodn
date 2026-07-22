import { NextRequest, NextResponse } from "next/server";

import { queueBetMarketEnsure } from "@/lib/betMarketEnsureQueue";
import { getPrisma } from "@/lib/prisma";
import { loadPublicLiveGamesSnapshot } from "@/lib/liveGamesPublicSnapshot";


function liveSessionTimeMs(session: Record<string, unknown>) {
  for (const key of ["completedAt", "playedOn", "updatedAt", "createdAt"]) {
    const value = session[key];
    if (typeof value === "string" && value.trim()) {
      const ms = new Date(value).getTime();
      if (Number.isFinite(ms)) return ms;
    }
  }
  return 0;
}

function isSameUtcDay(ms: number, anchor: Date) {
  if (!Number.isFinite(ms) || ms <= 0) return false;
  const date = new Date(ms);
  return (
    date.getUTCFullYear() === anchor.getUTCFullYear() &&
    date.getUTCMonth() === anchor.getUTCMonth() &&
    date.getUTCDate() === anchor.getUTCDate()
  );
}

function liveProofCounts(snapshot: Record<string, unknown>) {
  const today = new Date();
  const completed = Array.isArray(snapshot.recentlyCompletedSessions)
    ? snapshot.recentlyCompletedSessions
    : [];

  let resolvedToday = 0;
  let reviewToday = 0;

  for (const item of completed) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const session = item as Record<string, unknown>;
    if (!isSameUtcDay(liveSessionTimeMs(session), today)) continue;

    const unresolved = session.unresolvedResult;
    const needsReview =
      Boolean(unresolved && typeof unresolved === "object" && (unresolved as { reviewNeeded?: unknown }).reviewNeeded);
    const winner = typeof session.winner === "string" && session.winner.trim();

    if (needsReview) reviewToday += 1;
    else if (winner) resolvedToday += 1;
  }

  return {
    resolvedToday,
    reviewToday,
    resolvedGamesToday: resolvedToday,
    needsReviewToday: reviewToday,
    uniqueReplaysToday: resolvedToday + reviewToday,
  };
}

function withLiveProofCounts<T extends Record<string, unknown>>(snapshot: T) {
  return {
    ...snapshot,
    ...liveProofCounts(snapshot),
  };
}


export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const prisma = getPrisma();

    // The live board polls continuously. Wake the existing
    // throttled reconciler so an eligible replay proposition
    // becomes a market without requiring a separate /bets visit.
    queueBetMarketEnsure(prisma, 0);

    const publicSnapshot =
      await loadPublicLiveGamesSnapshot(prisma);
    const snapshot = withLiveProofCounts(publicSnapshot as Record<string, unknown>);
    const headers = {
      "Cache-Control": "no-store, max-age=0",
    };

    if (request.nextUrl.searchParams.get("summary") === "1") {
      return NextResponse.json({
        liveCount: snapshot.liveCount,
        readyCount: snapshot.readyCount,
        updatedAt: snapshot.updatedAt,
        resolvedToday: snapshot.resolvedToday,
        reviewToday: snapshot.reviewToday,
        resolvedGamesToday: snapshot.resolvedGamesToday,
        needsReviewToday: snapshot.needsReviewToday,
        uniqueReplaysToday: snapshot.uniqueReplaysToday,
      }, { headers });
    }

    return NextResponse.json(snapshot, { headers });
  } catch (error) {
    console.error("Failed to load live games:", error);
    return NextResponse.json({ detail: "Live games unavailable." }, { status: 500 });
  }
}
