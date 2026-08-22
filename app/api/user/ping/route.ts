import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";
import {
  clearUserOnlineLeases,
  countUserOnlineLeases,
  normalizeUserOnlineClientId,
  normalizeUserOnlineSequence,
  releaseUserOnlineLease,
  touchUserOnlineLease,
  userOnlineLeaseState,
  USER_ONLINE_LEAVE_GRACE_MS,
} from "@/lib/userOnlinePresence";
import {
  isUserOnlineSameOrigin,
  readUserOnlineJsonBody,
  userOnlineHeartbeatLimiter,
  userOnlineLastSeenPersister,
} from "@/lib/userOnlinePresenceGuards";
import { invalidatePublicPlayerDirectoryCache } from "@/lib/publicPlayerDirectory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requestClientIp(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "";
  return request.headers.get("x-real-ip")?.trim() || "";
}

type TrafficIdentityBridgeResult = {
  status:
    | "stored"
    | "deferred"
    | "disabled"
    | "missing_ids"
    | "rejected"
    | "failed";
  http_status?: number;
  session_event_count?: number;
};

function resolvePresenceClientId(body: Record<string, unknown>) {
  return (
    normalizeUserOnlineClientId(body.presence_client_id) ??
    normalizeUserOnlineClientId(body.traffic_session_id)
  );
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function reportAuthenticatedPresence(
  request: NextRequest,
  body: Record<string, unknown>,
  user: {
    uid: string;
    inGameName?: string | null;
    steamPersonaName?: string | null;
  },
): Promise<TrafficIdentityBridgeResult> {
  const key =
    process.env.TRAFFIC_IDENTITY_INGEST_KEY?.trim();

  if (!key) {
    console.warn(
      "Traffic authenticated-presence bridge disabled: missing TRAFFIC_IDENTITY_INGEST_KEY",
    );

    return {
      status: "disabled",
    };
  }

  const visitorId = String(
    body.traffic_visitor_id ?? "",
  )
    .trim()
    .slice(0, 100);

  const sessionId = String(
    body.traffic_session_id ?? "",
  )
    .trim()
    .slice(0, 100);

  if (!visitorId || !sessionId) {
    console.warn(
      "Traffic authenticated-presence bridge missing browser IDs:",
      {
        uid: user.uid,
        hasVisitorId: Boolean(visitorId),
        hasSessionId: Boolean(sessionId),
      },
    );

    return {
      status: "missing_ids",
    };
  }

  const label = (
    user.inGameName ||
    user.steamPersonaName ||
    "Authenticated player"
  ).trim();

  const trafficPath = String(
    body.traffic_path ?? "/",
  )
    .trim()
    .slice(0, 500) || "/";

  try {
    const response = await fetch(
      process.env.TRAFFIC_IDENTITY_INGEST_URL?.trim() ||
        "http://127.0.0.1:3345/api/internal/auth-presence",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Identity-Key": key,
        },
        body: JSON.stringify({
          host: "aoe2war.com",
          path: trafficPath,
          occurred_at:
            new Date().toISOString(),
          visitor_id: visitorId,
          session_id: sessionId,
          authenticated_uid: user.uid,
          authenticated_label: label,
          client_ip:
            requestClientIp(request),
          client_user_agent:
            request.headers.get(
              "user-agent",
            ) || "",
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(
          5_000,
        ),
      },
    );

    const responseText =
      await response.text();

    let responsePayload:
      | {
          session_event_count?: unknown;
        }
      | null = null;

    try {
      responsePayload =
        JSON.parse(
          responseText,
        ) as {
          session_event_count?: unknown;
        };
    } catch {
      responsePayload = null;
    }

    if (!response.ok) {
      console.warn(
        "Traffic authenticated-presence bridge rejected:",
        response.status,
        responseText.slice(
          0,
          300,
        ),
      );

      return {
        status: "rejected",
        http_status:
          response.status,
      };
    }

    const rawCount = Number(
      responsePayload?.session_event_count,
    );

    return {
      status: "stored",
      http_status:
        response.status,
      session_event_count:
        Number.isFinite(rawCount)
          ? rawCount
          : undefined,
    };
  } catch (error) {
    console.warn(
      "Traffic authenticated-presence bridge failed:",
      error,
    );

    return {
      status: "failed",
    };
  }
}

export async function GET() {
  return NextResponse.json({ status: "ok" });
}

export async function POST(request: NextRequest) {
  if (!isUserOnlineSameOrigin(request)) {
    return NextResponse.json(
      { detail: "Same-origin request required" },
      { status: 403 },
    );
  }

  const uid = await getSessionUid(request);
  if (!uid) {
    return NextResponse.json({ detail: "Missing session identity" }, { status: 401 });
  }

  const parsedBody = await readUserOnlineJsonBody(request);
  if (!parsedBody.ok) {
    return NextResponse.json(
      { detail: parsedBody.error },
      { status: parsedBody.status },
    );
  }

  const prisma = getPrisma();
  const body = parsedBody.value;

  const presenceClientId = resolvePresenceClientId(body);
  const presenceSequence = normalizeUserOnlineSequence(body.presence_sequence);
  const action = body.action === "leave" ? "leave" : "heartbeat";

  if (action === "leave") {
    if (!presenceClientId) {
      return NextResponse.json(
        { detail: "Missing presence client identity" },
        { status: 400 },
      );
    }

    const leaveStartedAt = Date.now();
    const release = releaseUserOnlineLease(
      uid,
      presenceClientId,
      leaveStartedAt,
      presenceSequence,
    );

    if (release.accepted && release.activeClients === 0) {
      // A same-site navigation can unload one document immediately before its
      // replacement registers. The short grace avoids a false offline flash,
      // while explicit logout still clears presence without waiting.
      await wait(USER_ONLINE_LEAVE_GRACE_MS);

      if (userOnlineLeaseState(uid) === "offline") {
        // Live departure truth is process-local and immediate. Keep the
        // durable timestamp intact for "last seen" history and audit views.
        invalidatePublicPlayerDirectoryCache();
      }
    }

    return NextResponse.json({
      status: "left",
      active_clients: countUserOnlineLeases(uid),
    });
  }

  const rateLimit = userOnlineHeartbeatLimiter.consume(uid);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        detail: "Presence heartbeat rate exceeded",
        retry_after_ms: rateLimit.retryAfterMs,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(
            Math.max(1, Math.ceil(rateLimit.retryAfterMs / 1_000)),
          ),
        },
      },
    );
  }

  const heartbeatAt = new Date();
  const previousLeaseState = userOnlineLeaseState(
    uid,
    heartbeatAt.getTime(),
  );
  const lease = presenceClientId
    ? touchUserOnlineLease(
        uid,
        presenceClientId,
        heartbeatAt.getTime(),
        presenceSequence,
      )
    : { accepted: true, activeClients: 0 };

  if (!lease.accepted) {
    return NextResponse.json({
      status: "stale",
      active_clients: lease.activeClients,
    });
  }

  if (
    presenceClientId &&
    previousLeaseState !== "online"
  ) {
    invalidatePublicPlayerDirectoryCache();
  }

  const heartbeatUpdate = await userOnlineLastSeenPersister.persist(
    uid,
    heartbeatAt.getTime(),
    async () => {
      const result = await prisma.user.updateMany({
        where: { uid },
        data: { lastSeen: heartbeatAt },
      });
      return result.count;
    },
  );

  if (heartbeatUpdate.count === 0) {
    clearUserOnlineLeases(uid);
    return NextResponse.json({ detail: "User not found" }, { status: 404 });
  }

  // Online freshness is intentionally faster than Traffic identity sampling.
  // New clients request the bridge once per minute; legacy clients retain the
  // previous every-ping behavior because an omitted flag defaults to true.
  let trafficIdentity: TrafficIdentityBridgeResult = {
    status: "deferred",
  };

  if (body.report_traffic_identity !== false) {
    const trafficUser = await prisma.user.findUnique({
      where: { uid },
      select: {
        uid: true,
        inGameName: true,
        steamPersonaName: true,
      },
    });

    trafficIdentity = trafficUser
      ? await reportAuthenticatedPresence(
          request,
          body,
          trafficUser,
        )
      : { status: "failed" };
  }

  return NextResponse.json({
    status: "ok",
    active_clients: lease.activeClients,
    last_seen_at: heartbeatAt.toISOString(),
    traffic_identity:
      trafficIdentity,
  });
}
