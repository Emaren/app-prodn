import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  DEFAULT_LIVING_LEADERBOARD_PREFERENCES,
  normalizeLivingLeaderboardPreferences,
} from "@/lib/livingLeaderboardPreferences";
import { getPrisma } from "@/lib/prisma";
import {
  getPreviewIdentity,
} from "@/lib/previewDataSource";
import { getSessionUid } from "@/lib/session";
import {
  recordUserActivity,
} from "@/lib/userExperience";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EVENT_TYPE =
  "leaderboard_view_preference";

async function resolveUser(
  request: NextRequest,
) {
  const uid =
    await getSessionUid(
      request,
    );

  if (!uid) {
    return null;
  }

  const prisma = getPrisma();

  const user =
    await prisma.user.findUnique({
      where: { uid },
      select: {
        id: true,
        uid: true,
      },
    });

  return user
    ? {
        prisma,
        user,
      }
    : null;
}

function readEventPreferences(
  metadata: unknown,
) {
  if (
    !metadata ||
    typeof metadata !== "object" ||
    Array.isArray(metadata)
  ) {
    return DEFAULT_LIVING_LEADERBOARD_PREFERENCES;
  }

  const record =
    metadata as Record<
      string,
      unknown
    >;

  return normalizeLivingLeaderboardPreferences(
    record.preferences,
  );
}

export async function GET(
  request: NextRequest,
) {
  try {
    if (getPreviewIdentity()) {
      return NextResponse.json({
        preferences:
          DEFAULT_LIVING_LEADERBOARD_PREFERENCES,
        stored: false,
        updatedAt: null,
        preview: true,
      });
    }

    const resolved =
      await resolveUser(request);

    if (!resolved) {
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

    const latest =
      await resolved.prisma
        .userActivityEvent
        .findFirst({
          where: {
            userId:
              resolved.user.id,
            type: EVENT_TYPE,
          },
          orderBy: [
            {
              createdAt:
                "desc",
            },
            {
              id: "desc",
            },
          ],
          select: {
            metadata: true,
            createdAt: true,
          },
        });

    return NextResponse.json({
      preferences:
        latest
          ? readEventPreferences(
              latest.metadata,
            )
          : DEFAULT_LIVING_LEADERBOARD_PREFERENCES,
      stored:
        Boolean(latest),
      updatedAt:
        latest?.createdAt.toISOString() ??
        null,
    });
  } catch (error) {
    console.error(
      "Failed to load Living Leaderboard preferences:",
      error,
    );

    return NextResponse.json(
      {
        detail:
          "Leaderboard preferences unavailable",
      },
      {
        status: 500,
      },
    );
  }
}

export async function POST(
  request: NextRequest,
) {
  try {
    if (getPreviewIdentity()) {
      const body =
        await request
          .json()
          .catch(() => ({}));

      const preferences =
        normalizeLivingLeaderboardPreferences(
          body,
        );

      return NextResponse.json({
        ok: true,
        preferences,
        updatedAt: null,
        preview: true,
      });
    }

    const resolved =
      await resolveUser(request);

    if (!resolved) {
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

    const body =
      await request
        .json()
        .catch(
          () => ({}),
        );

    const preferences =
      normalizeLivingLeaderboardPreferences(
        body,
      );

    const event =
      await recordUserActivity(
        resolved.prisma,
        {
          userId:
            resolved.user.id,
          type: EVENT_TYPE,
          path: "/leaderboard",
          label:
            "living_board",
          metadata: {
            preferences,
          },
        },
      );

    return NextResponse.json({
      ok: true,
      preferences,
      updatedAt:
        event?.createdAt.toISOString() ??
        null,
    });
  } catch (error) {
    console.error(
      "Failed to save Living Leaderboard preferences:",
      error,
    );

    return NextResponse.json(
      {
        detail:
          "Leaderboard preference update failed",
      },
      {
        status: 500,
      },
    );
  }
}
