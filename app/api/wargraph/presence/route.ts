import { NextRequest, NextResponse } from "next/server";

import { getSessionUid } from "@/lib/session";
import {
  recordWarGraphPresence,
  validateVisibleWarGraphAdvanceIds,
  validateWarGraphFocusId,
  WARGRAPH_SPECTATOR_COOKIE,
} from "@/lib/wargraph/presence";
import {
  consumeWarGraphPresenceRateLimit,
  isWarGraphSameOrigin,
  readWarGraphJsonBody,
  warGraphClientAddress,
} from "@/lib/wargraph/requestSecurity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function failure(status: number, code: string, message: string) {
  return NextResponse.json(
    { ok: false, code, message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: NextRequest) {
  if (!isWarGraphSameOrigin(request)) {
    return failure(403, "SAME_ORIGIN_REQUIRED", "Request origin is not trusted.");
  }
  const uid = await getSessionUid(request);
  const limit = consumeWarGraphPresenceRateLimit({
    uid,
    ip: warGraphClientAddress(request),
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, code: "RATE_LIMITED", message: "Presence is updating too quickly." },
      {
        status: 429,
        headers: {
          "Cache-Control": "no-store",
          "Retry-After": String(Math.max(1, Math.ceil(limit.retryAfterMs / 1_000))),
        },
      },
    );
  }
  const parsed = await readWarGraphJsonBody(request, 2_048);
  if (!parsed.ok) return failure(parsed.status, "INVALID_BODY", parsed.error);
  const body = object(parsed.value);
  if (
    !body ||
    body.intent !== "heartbeat" ||
    body.page !== "wargraph" ||
    Object.keys(body).some(
      (key) =>
        !["intent", "page", "visibleAdvanceIds", "focusEngagementId"].includes(key),
    )
  ) {
    return failure(400, "INVALID_PRESENCE_CONTRACT", "Presence contract is invalid.");
  }
  const visibleAdvanceIds = validateVisibleWarGraphAdvanceIds(
    body.visibleAdvanceIds ?? [],
  );
  const focusEngagementId = validateWarGraphFocusId(body.focusEngagementId);
  if (visibleAdvanceIds === null || focusEngagementId === false) {
    return failure(400, "INVALID_PRESENCE_EVIDENCE", "Visible challenge evidence is invalid.");
  }

  try {
    const result = await recordWarGraphPresence({
      uid,
      sessionToken: request.cookies.get(WARGRAPH_SPECTATOR_COOKIE)?.value ?? null,
      clientAddress: warGraphClientAddress(request),
      userAgent: request.headers.get("user-agent"),
      visibleAdvanceIds,
      focusEngagementId,
    });
    const response = NextResponse.json(
      {
        ok: true,
        spectatorCount: result.spectatorCount,
        projectionVersion: result.projectionVersion,
        acknowledgedAdvanceIds: result.acknowledgedAdvanceIds,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
    if (result.sessionCreated) {
      response.cookies.set({
        name: WARGRAPH_SPECTATOR_COOKIE,
        value: result.sessionToken,
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/api/wargraph",
        maxAge: 60 * 60 * 24 * 30,
      });
    }
    return response;
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String(error.code)
        : "";
    if (code === "P2002" || code === "P2034") {
      return failure(
        409,
        "PRESENCE_RACE",
        "The board changed while presence was confirmed. Retry on the next heartbeat.",
      );
    }
    console.error("WarGraph presence guarded", {
      code: error instanceof Error ? error.message : "UNKNOWN",
    });
    return failure(
      503,
      "PRESENCE_UNAVAILABLE",
      "Presence could not be recorded safely. Competitive state was not changed.",
    );
  }
}
