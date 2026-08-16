import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  loadLobbyLeaderboard,
} from "@/lib/lobbyLeaderboard";
import {
  normalizeLeaderboardLane,
} from "@/lib/leaderboardLane";
import {
  normalizeLeaderboardScope,
} from "@/lib/leaderboardScope";
import {
  getPrisma,
} from "@/lib/prisma";
import {
  buildPreviewDataUrl,
  getPreviewIdentity,
} from "@/lib/previewDataSource";
import {
  getSessionUid,
} from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
) {
  try {
    const previewIdentity =
      getPreviewIdentity();

    if (previewIdentity) {
      const lane =
        normalizeLeaderboardLane(
          request.nextUrl.searchParams.get(
            "lane",
          ),
        );

      const scope =
        normalizeLeaderboardScope(
          request.nextUrl.searchParams.get(
            "scope",
          ),
        );

      const previewUrl =
        buildPreviewDataUrl(
          "/api/lobby/leaderboard",
          new URLSearchParams({
            lane,
            scope,
            q: previewIdentity.name,
            offset: "0",
            limit: "64",
          }),
        );

      if (!previewUrl) {
        throw new Error(
          "Preview leaderboard source unavailable",
        );
      }

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

      if (!response.ok) {
        throw new Error(
          `Preview locate returned ${response.status}`,
        );
      }

      const payload =
        (await response.json()) as {
          entries?: Array<{
            key: string;
            rank: number;
            currentName: string;
          }>;
          trackedPlayers?: number;
        };

      const targetName =
        previewIdentity.name
          .trim()
          .toLowerCase();

      const entry =
        (payload.entries ?? [])
          .find(
            (candidate) =>
              candidate.currentName
                .trim()
                .toLowerCase() ===
              targetName,
          );

      return NextResponse.json(
        entry
          ? {
              found: true,
              lane,
              scope,
              key: entry.key,
              rank: entry.rank,
              name:
                entry.currentName,
              trackedPlayers:
                payload.trackedPlayers ??
                0,
              preview: true,
            }
          : {
              found: false,
              lane,
              scope,
              key: null,
              rank: null,
              name: null,
              preview: true,
            },
      );
    }

    const sessionUid =
      await getSessionUid(
        request,
      );

    if (!sessionUid) {
      return NextResponse.json(
        {
          detail:
            "No active session",
        },
        {
          status: 401,
        },
      );
    }

    const prisma =
      getPrisma();

    const user =
      await prisma.user.findUnique({
        where: {
          uid: sessionUid,
        },
        select: {
          uid: true,
          steamId: true,
          inGameName: true,
          steamPersonaName: true,
        },
      });

    if (!user) {
      return NextResponse.json(
        {
          detail:
            "User not found",
        },
        {
          status: 404,
        },
      );
    }

    const lane =
      normalizeLeaderboardLane(
        request.nextUrl.searchParams.get(
          "lane",
        ),
      );

    const scope =
      normalizeLeaderboardScope(
        request.nextUrl.searchParams.get(
          "scope",
        ),
      );

    const searchTerms =
      Array.from(
        new Set(
          [
            user.inGameName,
            user.steamPersonaName,
          ]
            .map(
              (value) =>
                value?.trim() ??
                "",
            )
            .filter(Boolean),
        ),
      );

    for (const query of searchTerms) {
      const leaderboard =
        await loadLobbyLeaderboard(
          prisma,
          {
            lane,
            scope,
            query,
            offset: 0,
            limit: 64,
            includePendingClaimed:
              false,
            includeFeaturedClaimed:
              false,
          },
        );

      const entry =
        leaderboard.entries.find(
          (candidate) =>
            candidate.uid ===
              user.uid ||
            Boolean(
              user.steamId &&
                candidate.steamId ===
                  user.steamId,
            ),
        );

      if (entry) {
        return NextResponse.json({
          found: true,
          lane,
          scope,
          key: entry.key,
          rank: entry.rank,
          name:
            entry.currentName,
          trackedPlayers:
            leaderboard.trackedPlayers,
        });
      }
    }

    return NextResponse.json({
      found: false,
      lane,
      scope,
      key: null,
      rank: null,
      name: null,
    });
  } catch (error) {
    console.error(
      "Failed to locate signed-in leaderboard warrior:",
      error,
    );

    return NextResponse.json(
      {
        detail:
          "Warrior location unavailable",
      },
      {
        status: 500,
      },
    );
  }
}
