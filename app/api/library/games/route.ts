import { NextRequest, NextResponse } from "next/server";

import { getPrisma } from "@/lib/prisma";
import { libraryDisplayName, libraryMapName, libraryPlayerNames } from "@/lib/libraryLedger";
import {
  loadLibraryHistoricalSnapshot,
  selectLibraryHistoryPage,
} from "@/lib/libraryHistoricalIndex";
import {
  LIBRARY_ORIGIN_FILTERS,
  type LibraryOriginFilter,
} from "@/lib/libraryHistoricalProvenance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const PAGE_SIZE = 48;

function positiveId(input: string | null): number | null {
  if (!input || !/^[1-9][0-9]{0,12}$/.test(input)) return null;
  const value = Number(input);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

/** The Library indexes all durable final replay receipts, never only the
 * last 48 unfiltered rows. Source filters therefore reach historical records
 * even when dozens of new Watcher games push them off the recent page.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const after = positiveId(params.get("after"));
  const before = positiveId(params.get("before"));
  const rawFilter = params.get("origin") ?? "all";
  if ((params.has("after") && !after) ||
      (params.has("before") && !before) ||
      (after !== null && before !== null) ||
      !LIBRARY_ORIGIN_FILTERS.includes(rawFilter as LibraryOriginFilter)) {
    return NextResponse.json(
      { ok: false, detail: "Invalid Library filter or cursor." },
      { status: 400 },
    );
  }
  const filter = rawFilter as LibraryOriginFilter;

  try {
    const prisma = getPrisma();
    const history = await loadLibraryHistoricalSnapshot(prisma);
    const page = selectLibraryHistoryPage(history, {
      filter,
      before,
      after,
      limit: PAGE_SIZE,
    });
    const raw = page.rows.length
      ? await prisma.gameStats.findMany({
          where: { id: { in: page.rows.map(row => row.id) }, is_final: true },
          select: {
            id: true,
            createdAt: true,
            parse_reason: true,
            map: true,
            players: true,
            game_type: true,
            user: {
              select: {
                uid: true,
                inGameName: true,
                steamPersonaName: true,
              },
            },
          },
        })
      : [];
    const byId = new Map(raw.map(row => [row.id, row]));

    const items = page.rows.flatMap(entry => {
      const row = byId.get(entry.id);
      if (!row) return [];
      return [{
        id: row.id,
        ordinal: entry.ordinal,
        occurredAt: row.createdAt.toISOString(),
        uploader: libraryDisplayName(row.user),
        kind: entry.source.kind,
        evidence: entry.source.evidence,
        mapName: libraryMapName(row.map),
        players: libraryPlayerNames(row.players),
        gameType: row.game_type?.trim().slice(0, 40) || null,
        unknownOutcome: entry.unknownOutcome,
        stage: entry.checkpoint ? "checkpoint" :
          entry.unknownOutcome ? "review" : "recorded",
      }];
    });

    return NextResponse.json(
      {
        ok: true,
        generatedAt: new Date().toISOString(),
        total: history.total,
        last24h: history.last24h,
        filterTotal: page.filterTotal,
        origin: filter,
        items,
        nextBefore: page.nextBefore,
        latestId: page.latestId,
        hasMore: page.hasMore,
        mode: after !== null ? "newer" : before !== null ? "older" : "latest",
      },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  } catch (error) {
    console.error("Library historical ledger query failed:", error);
    return NextResponse.json(
      { ok: false, detail: "Library history temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
