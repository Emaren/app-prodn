// app/api/game_stats/route.ts
import { type NextRequest } from "next/server";

import { getBackendUpstreamBase } from "@/lib/backendUpstream";
import {
  loadPublicBattleArchivePage,
  PUBLIC_BATTLE_ARCHIVE_PAGE_MAX,
} from "@/lib/publicBattleArchive";
import { cleanPublicGameRows } from "@/lib/publicReplayTruth";
import {
  hydrateEffectiveReplayResultAdjudications,
} from "@/lib/replayAdjudications";
import { getPrisma } from "@/lib/prisma";

function parsePositiveInt(value: string | null, fallback: number, max: number) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function parseOffset(value: string | null) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.min(parsed, 10_000_000);
}

export async function GET(request: NextRequest) {
  const base = getBackendUpstreamBase();
  const searchParams = request.nextUrl.searchParams;

  const limitRaw = searchParams.get("limit") || searchParams.get("take");
  const offsetRaw = searchParams.get("offset") || searchParams.get("skip");

  const archiveMode =
    searchParams.get(
      "archive"
    ) ===
    "1";

  const hasSlice =
    Boolean(
      limitRaw ||
      offsetRaw
    );

  const publicLimit =
    parsePositiveInt(
      limitRaw,
      12,
      archiveMode
        ? PUBLIC_BATTLE_ARCHIVE_PAGE_MAX
        : 500
    );

  const offset =
    parseOffset(
      offsetRaw
    );

  if (archiveMode) {
    const page = await loadPublicBattleArchivePage(getPrisma(), {
      offset,
      limit: publicLimit,
    });
    return Response.json({
      matches: page.rows,
      total: page.total,
      offset: page.offset,
      nextOffset: page.nextOffset,
    });
  }

  const upstreamLimit =
    hasSlice
      ? Math.min(
          5000,
          offset +
            publicLimit +
            12
        )
      : null;

  const upstreamUrl = new URL(`${base}/api/game_stats`);
  if (upstreamLimit !== null) {
    upstreamUrl.searchParams.set("limit", String(upstreamLimit));
  }

  const res = await fetch(upstreamUrl.toString(), { cache: "no-store" });
  const data = await res.json();

  const publicData = Array.isArray(data)
    ? cleanPublicGameRows(
        await hydrateEffectiveReplayResultAdjudications(
          getPrisma(),
          data
        ),
        {
          includeReview: true,
          includeLive: false,
        }
      )
    : data;

  if (
    Array.isArray(
      publicData
    ) &&
    hasSlice
  ) {
    return Response.json(
      publicData.slice(
        offset,
        offset +
          publicLimit
      ),
      {
        status:
          res.status,
      }
    );
  }

  return Response.json(
    publicData,
    {
      status:
        res.status,
    }
  );
}
