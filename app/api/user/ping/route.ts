import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { resolveRequestUid } from "@/lib/requestIdentity";

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
    | "disabled"
    | "missing_ids"
    | "rejected"
    | "failed";
  http_status?: number;
  session_event_count?: number;
};

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
  const prisma = getPrisma();
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const uid = await resolveRequestUid(request, body);

  if (!uid) {
    return NextResponse.json({ detail: "Missing session identity" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { uid } });
  if (!user) {
    return NextResponse.json({ detail: "User not found" }, { status: 404 });
  }

  await prisma.user.update({
    where: { uid },
    data: { lastSeen: new Date() },
  });

  // Await the internal bridge, bounded by its own short timeout.
  // This makes authenticated presence deterministic and diagnosable.
  const trafficIdentity =
    await reportAuthenticatedPresence(
      request,
      body,
      user,
    );

  return NextResponse.json({
    status: "ok",
    traffic_identity:
      trafficIdentity,
  });
}
