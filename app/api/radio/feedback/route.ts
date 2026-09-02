import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  getPrisma,
} from "@/lib/prisma";
import {
  isLiveProductionReadOnlyPreview,
} from "@/lib/previewDataSource";
import {
  resolveCurrentRadioAsset,
} from "@/lib/radioWoloFeedback";
import {
  radioWoloListenerIdIsValid,
  radioWoloRaterKey,
  radioWoloRatingIsValid,
} from "@/lib/radioWoloFeedbackPolicy";
import {
  getSessionUid,
} from "@/lib/session";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control":
    "private, no-store, max-age=0",
  Vary:
    "Cookie",
};

type FeedbackEvent =
  | "on"
  | "off"
  | "heartbeat"
  | "rate";

function isFeedbackEvent(
  value: unknown,
): value is FeedbackEvent {
  return (
    value === "on" ||
    value === "off" ||
    value === "heartbeat" ||
    value === "rate"
  );
}

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

  return getPrisma().user.findUnique({
    where: {
      uid,
    },
    select: {
      id: true,
    },
  });
}

export async function GET(
  request: NextRequest,
) {
  const listenerId =
    request.nextUrl.searchParams.get(
      "listenerId",
    );

  if (
    !radioWoloListenerIdIsValid(
      listenerId,
    )
  ) {
    return NextResponse.json(
      {
        detail:
          "Valid listenerId is required.",
      },
      {
        status: 400,
        headers:
          NO_STORE_HEADERS,
      },
    );
  }

  if (
    isLiveProductionReadOnlyPreview()
  ) {
    return NextResponse.json(
      {
        feedback: {
          rating: null,
          previewReadOnly:
            true,
        },
      },
      {
        headers:
          NO_STORE_HEADERS,
      },
    );
  }

  const prisma =
    getPrisma();

  const [
    user,
    asset,
  ] =
    await Promise.all([
      resolveUser(
        request,
      ),
      resolveCurrentRadioAsset(
        prisma,
      ),
    ]);

  if (!asset) {
    return NextResponse.json(
      {
        feedback: {
          rating: null,
        },
      },
      {
        headers:
          NO_STORE_HEADERS,
      },
    );
  }

  const raterKey =
    radioWoloRaterKey(
      user?.id ?? null,
      listenerId,
    );

  const rating =
    await prisma.radioTrackRating.findFirst(
      {
        where: {
          assetId:
            asset.id,
          raterKey,
        },
        select: {
          rating: true,
        },
      },
    );

  return NextResponse.json(
    {
      feedback: {
        rating:
          rating?.rating ??
          null,
      },
    },
    {
      headers:
        NO_STORE_HEADERS,
    },
  );
}

export async function POST(
  request: NextRequest,
) {
  const payload =
    (await request.json().catch(
      () => ({}),
    )) as {
      listenerId?: unknown;
      event?: unknown;
      rating?: unknown;
    };

  if (
    !radioWoloListenerIdIsValid(
      payload.listenerId,
    )
  ) {
    return NextResponse.json(
      {
        detail:
          "Valid listenerId is required.",
      },
      {
        status: 400,
        headers:
          NO_STORE_HEADERS,
      },
    );
  }

  if (
    !isFeedbackEvent(
      payload.event,
    )
  ) {
    return NextResponse.json(
      {
        detail:
          "Valid Radio WOLO feedback event is required.",
      },
      {
        status: 400,
        headers:
          NO_STORE_HEADERS,
      },
    );
  }

  if (
    payload.event === "rate" &&
    !radioWoloRatingIsValid(
      payload.rating,
    )
  ) {
    return NextResponse.json(
      {
        detail:
          "Rating must be an integer from 1 through 10.",
      },
      {
        status: 400,
        headers:
          NO_STORE_HEADERS,
      },
    );
  }

  if (
    isLiveProductionReadOnlyPreview()
  ) {
    return NextResponse.json(
      {
        ok: true,
        rating:
          payload.event ===
            "rate"
            ? payload.rating
            : null,
        previewReadOnly:
          true,
      },
      {
        headers:
          NO_STORE_HEADERS,
      },
    );
  }

  const prisma =
    getPrisma();

  const now =
    new Date();

  const [
    user,
    asset,
  ] =
    await Promise.all([
      resolveUser(
        request,
      ),
      resolveCurrentRadioAsset(
        prisma,
        now,
      ),
    ]);

  const listenerId =
    payload.listenerId;

  if (
    payload.event === "rate"
  ) {
    if (!asset) {
      return NextResponse.json(
        {
          detail:
            "Radio WOLO is not currently airing a rateable track.",
        },
        {
          status: 409,
          headers:
            NO_STORE_HEADERS,
        },
      );
    }

    const rating =
      payload.rating as number;

    const raterKey =
      radioWoloRaterKey(
        user?.id ?? null,
        listenerId,
      );

    await prisma.$transaction([
      prisma.radioTrackRating.upsert(
        {
          where: {
            assetId_raterKey: {
              assetId:
                asset.id,
              raterKey,
            },
          },
          create: {
            assetId:
              asset.id,
            raterKey,
            userId:
              user?.id ??
              null,
            listenerId,
            rating,
          },
          update: {
            userId:
              user?.id ??
              null,
            listenerId,
            rating,
          },
        },
      ),

      prisma.radioListenerState.upsert(
        {
          where: {
            listenerId,
          },
          create: {
            listenerId,
            userId:
              user?.id ??
              null,
            listening:
              false,
            currentAssetId:
              asset.id,
            lastEvent:
              "rate",
            startedListeningAt:
              null,
            stoppedListeningAt:
              now,
            lastSeenAt:
              now,
          },
          update: {
            userId:
              user?.id ??
              null,
            currentAssetId:
              asset.id,
            lastEvent:
              "rate",
            lastSeenAt:
              now,
          },
        },
      ),
    ]);

    return NextResponse.json(
      {
        ok: true,
        rating,
      },
      {
        headers:
          NO_STORE_HEADERS,
      },
    );
  }

  const listening =
    payload.event !== "off";

  await prisma.radioListenerState.upsert(
    {
      where: {
        listenerId,
      },
      create: {
        listenerId,
        userId:
          user?.id ??
          null,
        listening,
        currentAssetId:
          asset?.id ??
          null,
        lastEvent:
          payload.event,
        startedListeningAt:
          listening
            ? now
            : null,
        stoppedListeningAt:
          listening
            ? null
            : now,
        lastSeenAt:
          now,
      },
      update: {
        userId:
          user?.id ??
          null,
        listening,
        currentAssetId:
          asset?.id ??
          null,
        lastEvent:
          payload.event,
        lastSeenAt:
          now,
        ...(
          payload.event ===
            "on"
            ? {
                startedListeningAt:
                  now,
                stoppedListeningAt:
                  null,
              }
            : payload.event ===
                "off"
              ? {
                  stoppedListeningAt:
                    now,
                }
              : {}
        ),
      },
    },
  );

  return NextResponse.json(
    {
      ok: true,
      listening,
    },
    {
      headers:
        NO_STORE_HEADERS,
    },
  );
}
