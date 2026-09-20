import type {
  PrismaClient,
} from "@/lib/generated/prisma";
import {
  radioWoloListenerIsEffectivelyOn,
  radioWoloRaterKey,
} from "@/lib/radioWoloFeedbackPolicy";
import {
  radioWoloOperatorUids,
} from "@/lib/radioWoloOperatorPolicy";

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
    trafficVisitorId:
      | string
      | null;
    visitCount: number;
    returnCount: number;
    activeOnSite: boolean;
    currentPage:
      | string
      | null;
    hasInteracted: boolean;
    everSoundOn: boolean;
    hasRated: boolean;
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

type TrafficAudienceRow = {
  traffic_visitor_id: string;
  visit_count: number;
  return_count: number;
  last_seen_at: string;
  active_now: boolean;
  current_path: string;
  known_visitor_label: string;
  known_visitor_kind: string;
  authenticated_uid: string;
  exclude_from_human_analytics: boolean;
};

async function loadTrafficAudience() {
  const key =
    process.env
      .TRAFFIC_IDENTITY_INGEST_KEY
      ?.trim();

  if (!key) {
    return [] as TrafficAudienceRow[];
  }

  let endpoint =
    "http://127.0.0.1:3345/api/internal/browser-visitor-audience";

  const configured =
    process.env
      .TRAFFIC_IDENTITY_INGEST_URL
      ?.trim();

  if (configured) {
    try {
      const parsed =
        new URL(
          configured,
        );

      parsed.pathname =
        "/api/internal/browser-visitor-audience";
      parsed.search = "";
      parsed.hash = "";
      endpoint =
        parsed.toString();
    } catch {
      // The local Traffic authority remains the safe fallback.
    }
  }

  try {
    const response =
      await fetch(
        endpoint,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
            "X-Identity-Key":
              key,
          },
          body:
            JSON.stringify(
              {
                project_slug:
                  "aoe2hdbets",
                since_hours: 24,
                limit: 160,
                exclude_authenticated_uids:
                  [
                    ...radioWoloOperatorUids(),
                  ],
              },
            ),
          cache: "no-store",
          signal:
            AbortSignal.timeout(
              3_000,
            ),
        },
      );

    if (!response.ok) {
      return [];
    }

    const payload =
      (await response.json()) as {
        visitors?: unknown;
      };

    if (
      !Array.isArray(
        payload.visitors,
      )
    ) {
      return [];
    }

    const operators =
      radioWoloOperatorUids();

    return (
      payload.visitors as
        TrafficAudienceRow[]
    ).filter(
      (row) =>
        Boolean(
          row &&
            typeof row
              .traffic_visitor_id ===
              "string" &&
            row
              .traffic_visitor_id &&
            !row
              .exclude_from_human_analytics &&
            !(
              row
                .authenticated_uid &&
              operators.has(
                row
                  .authenticated_uid,
              )
            ),
        ),
    );
  } catch {
    return [];
  }
}

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
  const [
    states,
    totalRatings,
    trackGroups,
    distributionRows,
    trafficAudience,
  ] =
    await Promise.all([
      prisma.radioListenerState.findMany(
        {
          where: {
            OR: [
              {
                trafficVisitorId: {
                  not: null,
                },
              },
              {
                startedListeningAt: {
                  not: null,
                },
              },
              {
                interactedAt: {
                  not: null,
                },
              },
              {
                lastEvent: "rate",
              },
            ],
          },
          orderBy: [
            {
              lastSeenAt:
                "desc",
            },
            {
              id: "desc",
            },
          ],
          take: 200,
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
            trafficVisitorId:
              true,
            interactedAt:
              true,
            lastInteraction:
              true,
            soundEverOnAt:
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

      loadTrafficAudience(),
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

  const listenerIds =
    states.map(
      (row) =>
        row.listenerId,
    );

  const [
    ratings,
    assets,
    ratedListeners,
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

      listenerIds.length
        ? prisma.radioTrackRating.findMany(
            {
              where: {
                listenerId: {
                  in: listenerIds,
                },
              },
              distinct: [
                "listenerId",
              ],
              select: {
                listenerId:
                  true,
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

  const ratedListenerIds =
    new Set(
      ratedListeners.map(
        (row) =>
          row.listenerId,
      ),
    );

  type StateRow =
    (typeof states)[number];

  const stateSignals = (
    row: StateRow,
  ) => {
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

    const hasRated =
      ratedListenerIds.has(
        row.listenerId,
      );

    return {
      status:
        (
          radioWoloListenerIsEffectivelyOn(
            row,
            now,
          )
            ? "on"
            : "off"
        ) as
          | "on"
          | "off",
      currentRating,
      hasRated,
      hasInteracted:
        Boolean(
          row.interactedAt ||
            row.soundEverOnAt ||
            hasRated,
        ),
      everSoundOn:
        Boolean(
          row.soundEverOnAt ||
            row.startedListeningAt,
        ),
    };
  };

  const stateByTrafficVisitor =
    new Map(
      states
        .filter(
          (
            row,
          ): row is StateRow & {
            trafficVisitorId:
              string;
          } =>
            Boolean(
              row.trafficVisitorId,
            ),
        )
        .map(
          (row) => [
            row.trafficVisitorId,
            row,
          ] as const,
        ),
    );

  const joinedStateIds =
    new Set<string>();

  const trafficListeners:
    AdminRadioWoloAnalytics["listeners"] =
    trafficAudience.map(
      (traffic) => {
        const state =
          stateByTrafficVisitor.get(
            traffic
              .traffic_visitor_id,
          ) ??
          null;

        if (state) {
          joinedStateIds.add(
            state.listenerId,
          );
        }

        const signals =
          state
            ? stateSignals(
                state,
              )
            : {
                status:
                  "off" as const,
                currentRating:
                  null,
                hasRated:
                  false,
                hasInteracted:
                  false,
                everSoundOn:
                  false,
              };

        const trafficSeen =
          new Date(
            traffic.last_seen_at,
          );
        const stateSeen =
          state?.lastSeenAt ??
          null;

        const lastSeenAt =
          stateSeen &&
          (
            !Number.isFinite(
              trafficSeen.getTime(),
            ) ||
            stateSeen >
              trafficSeen
          )
            ? stateSeen.toISOString()
            : traffic.last_seen_at;

        const resolvedUid =
          state?.user?.uid ||
          traffic
            .authenticated_uid ||
          null;

        const displayName =
          state
            ? displayNameFor(
                state,
              )
            : (
                traffic
                  .known_visitor_label ||
                `Anonymous · ${traffic.traffic_visitor_id.slice(-8)}`
              );

        return {
          listenerId:
            state?.listenerId ??
            `traffic:${traffic.traffic_visitor_id}`,
          identityKind:
            resolvedUid
              ? (
                  "user" as const
                )
              : (
                  "anonymous" as const
                ),
          userUid:
            resolvedUid,
          displayName,
          status:
            signals.status,
          storedListening:
            state?.listening ??
            false,
          lastEvent:
            state?.lastEvent ??
            "off",
          lastSeenAt,
          startedListeningAt:
            state?.startedListeningAt?.toISOString() ??
            null,
          stoppedListeningAt:
            state?.stoppedListeningAt?.toISOString() ??
            null,
          currentTrack:
            state?.currentAsset
              ?.title ??
            null,
          currentRating:
            signals.currentRating,
          trafficVisitorId:
            traffic
              .traffic_visitor_id,
          visitCount:
            Math.max(
              1,
              traffic
                .visit_count,
            ),
          returnCount:
            Math.max(
              0,
              traffic
                .return_count,
            ),
          activeOnSite:
            traffic.active_now,
          currentPage:
            traffic
              .current_path ||
            null,
          hasInteracted:
            signals
              .hasInteracted,
          everSoundOn:
            signals
              .everSoundOn,
          hasRated:
            signals.hasRated,
        };
      },
    );

  const legacyRadioListeners:
    AdminRadioWoloAnalytics["listeners"] =
    states
      .filter(
        (row) =>
          !joinedStateIds.has(
            row.listenerId,
          ),
      )
      .map(
        (row) => {
          const signals =
            stateSignals(
              row,
            );

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
            status:
              signals.status,
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
            currentRating:
              signals
                .currentRating,
            trafficVisitorId:
              row.trafficVisitorId,
            visitCount: 1,
            returnCount: 0,
            activeOnSite:
              false,
            currentPage:
              null,
            hasInteracted:
              signals
                .hasInteracted,
            everSoundOn:
              signals
                .everSoundOn,
            hasRated:
              signals.hasRated,
          };
        },
      );

  const listeners =
    [
      ...trafficListeners,
      ...legacyRadioListeners,
    ]
      .sort(
        (left, right) =>
          Date.parse(
            right.lastSeenAt,
          ) -
          Date.parse(
            left.lastSeenAt,
          ),
      )
      .slice(
        0,
        120,
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

  const totalListeners =
    listeners.length;

  const onCount =
    listeners.filter(
      (row) =>
        row.status === "on",
    ).length;

  const signedInCount =
    listeners.filter(
      (row) =>
        row.identityKind ===
        "user",
    ).length;

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
