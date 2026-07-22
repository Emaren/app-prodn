import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  getPrisma,
} from "@/lib/prisma";

import {
  getReplayScreenshotEvidenceFile,
  ReplayScreenshotEvidenceError,
} from "@/lib/replayScreenshotEvidence";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

type RouteContext = {
  params:
    Promise<{
      id: string;
      artifactId: string;
    }>;
};

export async function GET(
  _request:
    NextRequest,
  context:
    RouteContext
) {
  const {
    id,
    artifactId,
  } =
    await context.params;

  const gameStatsId =
    Number(id);

  const evidenceArtifactId =
    Number(
      artifactId
    );

  if (
    !Number.isSafeInteger(
      gameStatsId
    ) ||
    gameStatsId <= 0 ||
    !Number.isSafeInteger(
      evidenceArtifactId
    ) ||
    evidenceArtifactId <= 0
  ) {
    return NextResponse.json(
      {
        detail:
          "Invalid evidence reference.",
      },
      {
        status:
          400,
      }
    );
  }

  try {
    const file =
      await getReplayScreenshotEvidenceFile(
        getPrisma(),
        gameStatsId,
        evidenceArtifactId
      );

    return new NextResponse(
      new Uint8Array(
        file.bytes
      ),
      {
        status:
          200,

        headers: {
          "Content-Type":
            file.mediaType,

          "Cache-Control":
            "public, max-age=300",

          "X-Content-Type-Options":
            "nosniff",
        },
      }
    );
  } catch (
    error
  ) {
    const status =
      error instanceof
      ReplayScreenshotEvidenceError
        ? error.status
        : 500;

    return NextResponse.json(
      {
        detail:
          error instanceof
            Error
            ? error.message
            : "Evidence unavailable.",
      },
      {
        status,
      }
    );
  }
}
