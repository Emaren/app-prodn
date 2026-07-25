// app/api/game_stats/route.ts
import { type NextRequest } from "next/server";

import { getBackendUpstreamBase } from "@/lib/backendUpstream";
import { cleanPublicGameRows } from "@/lib/publicReplayTruth";
import {
  isPublicBattleArchiveRow,
} from "@/lib/publicBattleArchiveEligibility";
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
  return Math.min(parsed, 5000);
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
        ? 5000
        : 500
    );

  const offset =
    parseOffset(
      offsetRaw
    );

  /*
   * Archive offsets refer to visible public battles, not raw upstream
   * rows. Pull the bounded archive corpus before filtering and slicing.
   */
  const upstreamLimit =
    archiveMode
      ? 5000
      : hasSlice
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

  const visiblePublicData =
    Array.isArray(
      publicData
    ) &&
    archiveMode
      ? publicData.filter(
          isPublicBattleArchiveRow
        )
      : publicData;

  if (
    Array.isArray(
      visiblePublicData
    ) &&
    hasSlice
  ) {
    return Response.json(
      visiblePublicData.slice(
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
    visiblePublicData,
    {
      status:
        res.status,
    }
  );
}
