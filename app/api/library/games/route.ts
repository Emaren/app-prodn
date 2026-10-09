import { NextRequest, NextResponse } from "next/server";

import { getPrisma } from "@/lib/prisma";
import {
  libraryDisplayName,
  libraryMapName,
  libraryOrigin,
  libraryPendingReason,
  libraryPlayerNames,
  libraryRecord,
} from "@/lib/libraryLedger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const PAGE_SIZE = 48;
const ZIP_LOOKUP_AFTER_MS = 6 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function positiveId(input: string | null): number | null {
  if (!input || !/^[1-9]\d{0,12}$/.test(input)) return null;
  const value = Number(input);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

/**
 * An entry is one durable final GameStats row, not one telemetry ping,
 * upload attempt, unique match, or settlement-ready result. The primary-key
 * cursor makes older pages stable under live insertions and avoids offset
 * rescans. The live 'after' lane reads ascending so bursts cannot skip gaps.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const after = positiveId(params.get("after"));
  const before = positiveId(params.get("before"));
  if ((params.has("after") && !after) ||
      (params.has("before") && !before) ||
      (after !== null && before !== null)) {
    return NextResponse.json(
      { ok: false, detail: "Invalid intake cursor." },
      { status: 400 },
    );
  }

  try {
    const prisma = getPrisma();
    const direction = after !== null ? "asc" : "desc";
    const where = {
      is_final: true,
      ...(after !== null ? { id: { gt: after } } :
        before !== null ? { id: { lt: before } } : {}),
    };

    const [candidateRows, total, last24h] = await Promise.all([
      prisma.gameStats.findMany({
        where,
        orderBy: { id: direction },
        take: PAGE_SIZE + 1,
        select: {
          id: true,
          createdAt: true,
          parse_source: true,
          parse_reason: true,
          original_filename: true,
          replay_file: true,
          map: true,
          key_events: true,
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
      }),
      prisma.gameStats.count({ where: { is_final: true } }),
      prisma.gameStats.count({
        where: {
          is_final: true,
          createdAt: { gte: new Date(Date.now() - DAY_MS) },
        },
      }),
    ]);

    const hasMore = candidateRows.length > PAGE_SIZE;
    const chosen = candidateRows.slice(0, PAGE_SIZE);
    const rows = direction === "asc" ? chosen.reverse() : chosen;
    const createdTimes = rows.map((row) => row.createdAt.getTime());
    const minTime = createdTimes.length ? Math.min(...createdTimes) : 0;
    const maxTime = createdTimes.length ? Math.max(...createdTimes) : 0;

    // A ZIP can be declared as such only when its durable package receipt
    // contains this exact game ID. Legacy filename-only receipts are ambiguous
    // and intentionally never used to infer ZIP provenance.
    const packageEvents = rows.length
      ? await prisma.userActivityEvent.findMany({
          where: {
            type: "replay_upload",
            createdAt: {
              gte: new Date(minTime - 60_000),
              lte: new Date(maxTime + ZIP_LOOKUP_AFTER_MS),
            },
            metadata: { path: ["packageUpload"], equals: true },
          },
          orderBy: { createdAt: "desc" },
          take: 250,
          select: { metadata: true, user: { select: { uid: true } } },
        })
      : [];
    const zipByGameId = new Map<number, string>();
    for (const event of packageEvents) {
      const meta = libraryRecord(event.metadata);
      const ids = Array.isArray(meta.gameIds) ? meta.gameIds : [];
      for (const id of ids) {
        if (typeof id === "number" && Number.isSafeInteger(id) && id > 0 && event.user) {
          zipByGameId.set(id, event.user.uid);
        }
      }
    }

    const items = rows.map((row) => {
      const uploaderUid = row.user?.uid ?? null;
      const zipMatched = uploaderUid !== null &&
        zipByGameId.get(row.id) === uploaderUid;
      const filename = (row.original_filename ?? row.replay_file).toLowerCase();
      const isCheckpoint = filename.endsWith(".aoe2mpgame");
      const players = libraryPlayerNames(row.players);
      const pending = libraryPendingReason(row.parse_reason);

      return {
        id: row.id,
        occurredAt: row.createdAt.toISOString(),
        uploader: libraryDisplayName(row.user),
        kind: libraryOrigin(row.parse_source, row.key_events, zipMatched),
        // Classification happens against persisted key_events, not filenames.
        mapName: libraryMapName(row.map),
        players,
        gameType: row.game_type?.trim().slice(0, 40) || null,
        stage: isCheckpoint ? "checkpoint" :
          pending || players.length === 0 ? "review" : "recorded",
      };
    });

    return NextResponse.json(
      {
        ok: true,
        generatedAt: new Date().toISOString(),
        total,
        last24h,
        items,
        nextBefore: rows.length ? Math.min(...rows.map((row) => row.id)) : null,
        latestId: rows.length ? Math.max(...rows.map((row) => row.id)) : null,
        hasMore,
        mode: after !== null ? "newer" : before !== null ? "older" : "latest",
      },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  } catch (error) {
    console.error("Library ledger query failed:", error);
    return NextResponse.json(
      { ok: false, detail: "Live Library temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
