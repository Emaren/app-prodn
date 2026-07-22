import { NextRequest, NextResponse } from "next/server";

import { getPrisma } from "@/lib/prisma";
import { ChallengeDesyncError } from "@/lib/desyncChallenge";
import { applyReplayDesyncIncidentProtocol } from "@/lib/desyncChallengeProtocol";
import {
  loadReplayDesyncIncidentProvenance,
  ReplayDesyncIncidentError,
  submitReplayDesyncIncident,
  type ReplayDesyncIncidentInput,
} from "@/lib/replayDesyncIncidents";
import { getSessionUid } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function noStoreJson(body: unknown, init?: { status?: number }) {
  return NextResponse.json(body, {
    ...init,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

async function readGameStatsId(context: RouteContext) {
  const { id } = await context.params;
  const gameStatsId = Number(id);
  return Number.isSafeInteger(gameStatsId) && gameStatsId > 0 ? gameStatsId : null;
}

function errorResponse(error: unknown) {
  if (error instanceof ChallengeDesyncError) {
    return noStoreJson(
      { detail: error.message, code: error.code },
      { status: error.status }
    );
  }
  if (error instanceof ReplayDesyncIncidentError) {
    return noStoreJson(
      { detail: error.message, code: error.code },
      { status: error.status }
    );
  }

  console.error("Replay desync incident request failed:", error);
  return noStoreJson(
    {
      detail: "Replay desync provenance is temporarily unavailable.",
      code: "desync_review_unavailable",
    },
    { status: 500 }
  );
}

/* Public provenance read. Mutation authority remains admin-only. */
export async function GET(_request: NextRequest, context: RouteContext) {
  const gameStatsId = await readGameStatsId(context);
  if (gameStatsId === null) {
    return noStoreJson(
      { detail: "Invalid replay game id.", code: "invalid_game_id" },
      { status: 400 }
    );
  }

  const prisma = getPrisma();
  try {
    const game = await prisma.gameStats.findUnique({
      where: { id: gameStatsId },
      select: { id: true },
    });
    if (!game) {
      return noStoreJson(
        { detail: "Replay game not found.", code: "game_not_found" },
        { status: 404 }
      );
    }
    return noStoreJson(
      await loadReplayDesyncIncidentProvenance(prisma, gameStatsId)
    );
  } catch (error) {
    return errorResponse(error);
  }
}

/*
 * Admin-only append. The incident is immutable truth; after it lands, a
 * retryable projection pauses or restores linked Challenge protocol state.
 * Commissioner rematch/refund decisions belong to the Challenge admin route.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const viewerUid = await getSessionUid(request);
  if (!viewerUid) {
    return noStoreJson(
      { detail: "Admin authentication required.", code: "session_required" },
      { status: 401 }
    );
  }

  const gameStatsId = await readGameStatsId(context);
  if (gameStatsId === null) {
    return noStoreJson(
      { detail: "Invalid replay game id.", code: "invalid_game_id" },
      { status: 400 }
    );
  }

  let payload: ReplayDesyncIncidentInput;
  try {
    const raw: unknown = await request.json();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return noStoreJson(
        { detail: "A JSON desync decision is required.", code: "invalid_body" },
        { status: 400 }
      );
    }
    payload = raw as ReplayDesyncIncidentInput;
    const requestedDisposition =
      typeof payload.settlementDisposition === "string"
        ? payload.settlementDisposition.trim().toLowerCase()
        : "";
    if (
      requestedDisposition === "rematch" ||
      requestedDisposition === "void_refund"
    ) {
      return noStoreJson(
        {
          detail:
            "Choose Rematch or Void & Refund from the linked Challenge room after the desync confirmation is recorded.",
          code: "desync_disposition_requires_challenge_action",
        },
        { status: 409 }
      );
    }
  } catch {
    return noStoreJson(
      { detail: "A valid JSON desync decision is required.", code: "invalid_json" },
      { status: 400 }
    );
  }

  try {
    const prisma = getPrisma();
    const result = await submitReplayDesyncIncident({
      prisma,
      viewerUid,
      gameStatsId,
      payload,
    });
    const protocol = await applyReplayDesyncIncidentProtocol(
      prisma,
      result.incident
    );
    return noStoreJson(
      { ...result, challengeProtocol: protocol },
      { status: result.created ? 201 : 200 }
    );
  } catch (error) {
    return errorResponse(error);
  }
}
