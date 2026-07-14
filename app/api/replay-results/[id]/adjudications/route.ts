import { NextRequest, NextResponse } from "next/server";

import { getPrisma } from "@/lib/prisma";
import {
  loadReplayResultReviewState,
  ReplayResultReviewError,
  submitReplayResultAdjudication,
  type ReplayResultAdjudicationInput,
} from "@/lib/replayResultAdjudications";
import { getSessionUid } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function noStoreJson(body: unknown, init?: { status?: number }) {
  return NextResponse.json(body, {
    ...init,
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}

async function readGameStatsId(context: RouteContext) {
  const { id } = await context.params;
  const gameStatsId = Number(id);
  return Number.isSafeInteger(gameStatsId) && gameStatsId > 0 ? gameStatsId : null;
}

function errorResponse(error: unknown) {
  if (error instanceof ReplayResultReviewError) {
    return noStoreJson(
      { detail: error.message, code: error.code },
      { status: error.status }
    );
  }
  console.error("Replay result adjudication request failed:", error);
  return noStoreJson(
    { detail: "Replay result review is temporarily unavailable.", code: "review_unavailable" },
    { status: 500 }
  );
}

async function requireSession(request: NextRequest) {
  const viewerUid = await getSessionUid(request);
  if (!viewerUid) {
    return {
      error: noStoreJson(
        { detail: "Sign in before reviewing replay results.", code: "session_required" },
        { status: 401 }
      ),
    };
  }
  return { viewerUid };
}

export async function GET(request: NextRequest, context: RouteContext) {
  const session = await requireSession(request);
  if ("error" in session) return session.error;
  const gameStatsId = await readGameStatsId(context);
  if (gameStatsId === null) {
    return noStoreJson(
      { detail: "Invalid replay game id.", code: "invalid_game_id" },
      { status: 400 }
    );
  }

  try {
    const state = await loadReplayResultReviewState(
      getPrisma(),
      session.viewerUid,
      gameStatsId
    );
    return noStoreJson(state);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const session = await requireSession(request);
  if ("error" in session) return session.error;
  const gameStatsId = await readGameStatsId(context);
  if (gameStatsId === null) {
    return noStoreJson(
      { detail: "Invalid replay game id.", code: "invalid_game_id" },
      { status: 400 }
    );
  }

  let payload: ReplayResultAdjudicationInput;
  try {
    const raw = (await request.json()) as unknown;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return noStoreJson(
        { detail: "A JSON verdict is required.", code: "invalid_body" },
        { status: 400 }
      );
    }
    payload = raw as ReplayResultAdjudicationInput;
  } catch {
    return noStoreJson(
      { detail: "A valid JSON verdict is required.", code: "invalid_json" },
      { status: 400 }
    );
  }

  try {
    const result = await submitReplayResultAdjudication({
      prisma: getPrisma(),
      viewerUid: session.viewerUid,
      gameStatsId,
      payload,
    });
    return noStoreJson(result, { status: result.created ? 201 : 200 });
  } catch (error) {
    return errorResponse(error);
  }
}
