import type {
  PrismaClient,
} from "@/lib/generated/prisma";
import {
  RADIO_WOLO_LISTENER_ACTIVE_WINDOW_MS,
  radioWoloListenerIsEffectivelyOn,
  radioWoloRaterKey,
} from "@/lib/radioWoloFeedbackPolicy";

export type AdminRadioWoloAnalytics = {
  generatedAt: string;
  summary: {
    totalListeners: number;
    onCount: number;
    offCount: number;
    signedInCount: number;
    anonymousCount: number;
    totalRatings: number;
  };
  listeners: Array<{
    listenerId: string;
    identityKind:
      | "user"
      | "anonymous";
    userUid:
      | string
      | null;
    displayName: string;
    status:
      | "on"
      | "off";
    storedListening:
      boolean;
    lastEvent: string;
    lastSeenAt: string;
    startedListeningAt:
      | string
      | null;
    stoppedListeningAt:
      | string
      | null;
    currentTrack:
      | string
      | null;
    currentRating:
      | number
      | null;
  }>;
  tracks: Array<{
    assetId: number;
    title: string;
    ratingCount: number;
    averageRating:
      | number
      | null;
    lastRatedAt:
      | string
      | null;
    distribution: number[];
  }>;
};

export function emptyAdminRadioWoloAnalytics(
  now = new Date(),
): AdminRadioWoloAnalytics {
  return {
    generatedAt:
      now.toISOString(),
    summary: {
      totalListeners: 0,
      onCount: 0,
      offCount: 0,
      signedInCount: 0,
      anonymousCount: 0,
      totalRatings: 0,
    },
    listeners: [],
    tracks: [],
  };
}

function displayNameFor(
  row: {
    listenerId: string;
    user: {
      uid: string;
      inGameName:
        | string
        | null;
      steamPersonaName:
        | string
        | null;
    } | null;
  },
) {
  if (row.user) {
    return (
      row.user.inGameName ||
      row.user.steamPersonaName ||
      row.user.uid
    );
  }

  return `Anonymous · ${row.listenerId.slice(
    0,
    8,
  )}`;
}

export async function loadAdminRadioWoloAnalytics(
  prisma: PrismaClient,
  now = new Date(),
): Promise<AdminRadioWoloAnalytics> {
  const cutoff =
    new Date(
      now.getTime() -
        RADIO_WOLO_LISTENER_ACTIVE_WINDOW_MS,
    );

  const [
    states,
    totalListeners,
    onCount,
    signedInCount,
    totalRatings,
    trackGroups,
    distributionRows,
  ] =
    await Promise.all([
      prisma.radioListenerState.findMany(
        {
          orderBy: [
            {
              lastSeenAt:
                "desc",
            },
            {
              id: "desc",
            },
          ],
          take: 80,
          select: {
            listenerId:
              true,
            userId: true,
            listening:
              true,
            lastEvent:
              true,
            lastSeenAt:
              true,
            startedListeningAt:
              true,
            stoppedListeningAt:
              true,
            currentAssetId:
              true,
            currentAsset: {
              select: {
                title: true,
              },
            },
            user: {
              select: {
                uid: true,
                inGameName:
                  true,
                steamPersonaName:
                  true,
              },
            },
          },
        },
      ),

      prisma.radioListenerState.count(),

      prisma.radioListenerState.count(
        {
          where: {
            listening:
              true,
            lastSeenAt: {
              gte: cutoff,
            },
          },
        },
      ),

      prisma.radioListenerState.count(
        {
          where: {
            userId: {
              not: null,
            },
          },
        },
      ),

      prisma.radioTrackRating.count(),

      prisma.radioTrackRating.groupBy(
        {
          by: [
            "assetId",
          ],
          _count: {
            _all: true,
          },
          _avg: {
            rating: true,
          },
          _max: {
            updatedAt:
              true,
          },
        },
      ),

      prisma.radioTrackRating.groupBy(
        {
          by: [
            "assetId",
            "rating",
          ],
          _count: {
            _all: true,
          },
        },
      ),
    ]);

  const assetIds =
    Array.from(
      new Set(
        [
          ...states
            .map(
              (row) =>
                row.currentAssetId,
            )
            .filter(
              (
                value,
              ): value is number =>
                typeof value ===
                "number",
            ),

          ...trackGroups.map(
            (row) =>
              row.assetId,
          ),
        ],
      ),
    );

  const [
    ratings,
    assets,
  ] =
    await Promise.all([
      assetIds.length
        ? prisma.radioTrackRating.findMany(
            {
              where: {
                assetId: {
                  in: assetIds,
                },
              },
              select: {
                assetId:
                  true,
                raterKey:
                  true,
                rating:
                  true,
              },
            },
          )
        : Promise.resolve(
            [],
          ),

      assetIds.length
        ? prisma.radioAsset.findMany(
            {
              where: {
                id: {
                  in: assetIds,
                },
              },
              select: {
                id: true,
                title: true,
              },
            },
          )
        : Promise.resolve(
            [],
          ),
    ]);

  const ratingByIdentity =
    new Map(
      ratings.map(
        (row) => [
          `${row.assetId}:${row.raterKey}`,
          row.rating,
        ] as const,
      ),
    );

  const titleByAssetId =
    new Map(
      assets.map(
        (asset) => [
          asset.id,
          asset.title,
        ] as const,
      ),
    );

  const distributionByAssetId =
    new Map<
      number,
      number[]
    >();

  for (
    const row of
      distributionRows
  ) {
    const distribution =
      distributionByAssetId.get(
        row.assetId,
      ) ??
      Array.from(
        {
          length: 10,
        },
        () => 0,
      );

    distribution[
      row.rating - 1
    ] =
      row._count._all;

    distributionByAssetId.set(
      row.assetId,
      distribution,
    );
  }

  const listeners =
    states.map(
      (row) => {
        const status: "on" | "off" =
          radioWoloListenerIsEffectivelyOn(
            row,
            now,
          )
            ? "on"
            : "off";

        const raterKey =
          radioWoloRaterKey(
            row.userId,
            row.listenerId,
          );

        const currentRating =
          row.currentAssetId
            ? ratingByIdentity.get(
                `${row.currentAssetId}:${raterKey}`,
              ) ??
              null
            : null;

        return {
          listenerId:
            row.listenerId,
          identityKind:
            row.user
              ? (
                  "user" as const
                )
              : (
                  "anonymous" as const
                ),
          userUid:
            row.user?.uid ??
            null,
          displayName:
            displayNameFor(
              row,
            ),
          status,
          storedListening:
            row.listening,
          lastEvent:
            row.lastEvent,
          lastSeenAt:
            row.lastSeenAt.toISOString(),
          startedListeningAt:
            row.startedListeningAt?.toISOString() ??
            null,
          stoppedListeningAt:
            row.stoppedListeningAt?.toISOString() ??
            null,
          currentTrack:
            row.currentAsset
              ?.title ??
            null,
          currentRating,
        };
      },
    );

  const tracks =
    [...trackGroups]
      .sort(
        (
          left,
          right,
        ) =>
          (
            right._max
              .updatedAt
              ?.getTime() ??
            0
          ) -
          (
            left._max
              .updatedAt
              ?.getTime() ??
            0
          ),
      )
      .slice(0, 24)
      .map(
        (row) => ({
          assetId:
            row.assetId,
          title:
            titleByAssetId.get(
              row.assetId,
            ) ??
            `Radio asset #${row.assetId}`,
          ratingCount:
            row._count._all,
          averageRating:
            typeof row._avg
              .rating ===
              "number"
              ? Math.round(
                  row._avg
                    .rating *
                    100,
                ) /
                100
              : null,
          lastRatedAt:
            row._max.updatedAt?.toISOString() ??
            null,
          distribution:
            distributionByAssetId.get(
              row.assetId,
            ) ??
            Array.from(
              {
                length: 10,
              },
              () => 0,
            ),
        }),
      );

  return {
    generatedAt:
      now.toISOString(),
    summary: {
      totalListeners,
      onCount,
      offCount:
        Math.max(
          0,
          totalListeners -
            onCount,
        ),
      signedInCount,
      anonymousCount:
        Math.max(
          0,
          totalListeners -
            signedInCount,
        ),
      totalRatings,
    },
    listeners,
    tracks,
  };
}
