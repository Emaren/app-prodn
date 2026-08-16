import { NextResponse } from "next/server";

import { queueBetMarketEnsure } from "@/lib/betMarketEnsureQueue";
import { loadLiveGamesSnapshot } from "@/lib/liveGames";
import { getPrisma } from "@/lib/prisma";
import { buildPreviewDataUrl } from "@/lib/previewDataSource";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type HeaderSummary = {
  liveCount: number;
  openRequestCount: number;
  workshopLive: boolean;
  updatedAt: string;
};

const CACHE_TTL_MS = 5_000;
let cachedSummary: { expiresAt: number; value: HeaderSummary } | null = null;
let refreshPromise: Promise<HeaderSummary> | null = null;

async function loadHeaderSummary(): Promise<HeaderSummary> {
  const now = Date.now();
  if (cachedSummary && cachedSummary.expiresAt > now) {
    return cachedSummary.value;
  }
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const prisma = getPrisma();

    // Preserve the live-board reconciliation wake-up previously provided by
    // the header's /api/live-games summary request.
    queueBetMarketEnsure(prisma, 0);

    const [liveResult, requestsResult, workshopStatusResult, workshopStreamResult] =
      await Promise.allSettled([
        loadLiveGamesSnapshot(prisma),
        prisma.communityRequest.count({ where: { status: "open" } }),
        prisma.workshopStatus.findUnique({
          where: { id: 1 },
          select: { isLive: true },
        }),
        prisma.workshopStream.findFirst({
          where: { status: "live", isPublic: true },
          select: { id: true },
        }),
      ]);

    const failedLoads = [
      ["live games", liveResult],
      ["requests", requestsResult],
      ["workshop status", workshopStatusResult],
      ["workshop stream", workshopStreamResult],
    ] as const;
    for (const [label, result] of failedLoads) {
      if (result.status === "rejected") {
        console.warn(`Header summary ${label} unavailable:`, result.reason);
      }
    }

    const liveSnapshot =
      liveResult.status === "fulfilled" ? liveResult.value : null;
    const openRequestCount =
      requestsResult.status === "fulfilled" ? requestsResult.value : 0;
    const workshopStatus =
      workshopStatusResult.status === "fulfilled"
        ? workshopStatusResult.value
        : null;
    const liveWorkshopStream =
      workshopStreamResult.status === "fulfilled"
        ? workshopStreamResult.value
        : null;

    const value: HeaderSummary = {
      liveCount: liveSnapshot?.liveCount ?? 0,
      openRequestCount,
      workshopLive:
        workshopStatus?.isLive === true || Boolean(liveWorkshopStream),
      updatedAt: new Date().toISOString(),
    };
    cachedSummary = { expiresAt: Date.now() + CACHE_TTL_MS, value };
    return value;
  })().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

export async function GET() {
  try {
    const previewUrl =
      buildPreviewDataUrl(
        "/api/header-summary",
      );

    if (previewUrl) {
      const response =
        await fetch(
          previewUrl,
          {
            cache: "no-store",
            headers: {
              Accept:
                "application/json",
              "Cache-Control":
                "no-cache",
            },
          },
        );

      const body =
        await response.text();

      return new NextResponse(
        body,
        {
          status:
            response.status,
          headers: {
            "Content-Type":
              response.headers.get(
                "content-type",
              ) ??
              "application/json; charset=utf-8",
            "Cache-Control":
              "no-store",
            "X-AoE2WAR-Preview-Data":
              "production-read-through",
          },
        },
      );
    }

    return NextResponse.json(await loadHeaderSummary(), {
      headers: {
        "Cache-Control": "public, max-age=5, stale-while-revalidate=20",
      },
    });
  } catch (error) {
    console.error("Failed to load header summary:", error);
    return NextResponse.json(
      { detail: "Header summary unavailable." },
      { status: 500 }
    );
  }
}
