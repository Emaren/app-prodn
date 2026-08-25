import { NextRequest, NextResponse } from "next/server";

import { getSessionUid } from "@/lib/session";
import {
  markWarGraphReady,
  openWarGraphAdvance,
  takeWarGraphFight,
  WarGraphCommandError,
} from "@/lib/wargraph/commands";
import {
  consumeWarGraphMutationRateLimit,
  isWarGraphSameOrigin,
  readWarGraphJsonBody,
  requireMatchingWarGraphIdempotencyKey,
  warGraphClientAddress,
} from "@/lib/wargraph/requestSecurity";
import { loadWarGraphPublicSnapshot } from "@/lib/wargraph/snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function errorResponse(
  status: number,
  code: string,
  message: string,
  extraHeaders?: HeadersInit,
) {
  return NextResponse.json(
    { ok: false, code, message },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        ...extraHeaders,
      },
    },
  );
}

export async function POST(request: NextRequest) {
  if (!isWarGraphSameOrigin(request)) {
    return errorResponse(403, "SAME_ORIGIN_REQUIRED", "Request origin is not trusted.");
  }
  const uid = await getSessionUid(request);
  if (!uid) {
    return errorResponse(401, "SIGN_IN_REQUIRED", "Sign in with Steam to command the WarGraph.");
  }
  const rateLimit = consumeWarGraphMutationRateLimit({
    uid,
    ip: warGraphClientAddress(request),
  });
  if (!rateLimit.allowed) {
    return errorResponse(
      429,
      "RATE_LIMITED",
      "Too many WarGraph commands. Try again shortly.",
      { "Retry-After": String(Math.max(1, Math.ceil(rateLimit.retryAfterMs / 1_000))) },
    );
  }

  const parsed = await readWarGraphJsonBody(request, 1_024);
  if (!parsed.ok) {
    return errorResponse(parsed.status, "INVALID_BODY", parsed.error);
  }
  const body = object(parsed.value);
  if (!body) {
    return errorResponse(400, "INVALID_BODY", "A JSON object is required.");
  }
  const action = body.action;
  const allowedKeys = new Set(
    action === "advance"
      ? ["action", "idempotencyKey"]
      : action === "take_fight"
        ? ["action", "advanceId", "idempotencyKey"]
        : action === "ready"
          ? ["action", "engagementId", "idempotencyKey"]
          : [],
  );
  if (
    allowedKeys.size === 0 ||
    Object.keys(body).some((key) => !allowedKeys.has(key))
  ) {
    return errorResponse(400, "INVALID_ACTION", "The WarGraph action contract is invalid.");
  }
  const idempotency = requireMatchingWarGraphIdempotencyKey(
    request,
    body.idempotencyKey,
  );
  if (!idempotency.ok) {
    return errorResponse(idempotency.status, idempotency.code, idempotency.error);
  }

  try {
    let result;
    if (action === "advance") {
      result = await openWarGraphAdvance({ uid, idempotencyKey: idempotency.key });
    } else if (action === "take_fight") {
      if (typeof body.advanceId !== "string" || !UUID.test(body.advanceId)) {
        return errorResponse(400, "INVALID_ADVANCE_ID", "A valid advance ID is required.");
      }
      result = await takeWarGraphFight({
        uid,
        idempotencyKey: idempotency.key,
        advanceId: body.advanceId,
      });
    } else {
      if (typeof body.engagementId !== "string" || !UUID.test(body.engagementId)) {
        return errorResponse(400, "INVALID_ENGAGEMENT_ID", "A valid engagement ID is required.");
      }
      result = await markWarGraphReady({
        uid,
        idempotencyKey: idempotency.key,
        engagementId: body.engagementId,
      });
    }

    const snapshot = await loadWarGraphPublicSnapshot({ uid });
    return NextResponse.json(
      { ok: true, changed: result.changed, message: result.message, snapshot },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof WarGraphCommandError) {
      return errorResponse(error.status, error.code, error.message);
    }
    const code =
      error && typeof error === "object" && "code" in error
        ? String(error.code)
        : "";
    if (code === "P2002" || code === "P2034") {
      return errorResponse(
        409,
        "COMMAND_RACE_LOST",
        "Another warrior changed this contract first. The board has been refreshed.",
      );
    }
    console.error("WarGraph command guarded", {
      code: error instanceof Error ? error.message : "UNKNOWN",
    });
    return errorResponse(
      503,
      "WARGRAPH_COMMAND_UNAVAILABLE",
      "The board could not prove that move safely. No competitive mutation was accepted.",
    );
  }
}
