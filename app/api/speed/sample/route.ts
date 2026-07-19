import { NextRequest, NextResponse } from "next/server";

import { getPrisma } from "@/lib/prisma";
import { sanitizeSpeedPath } from "@/lib/speed/routeSanitizer";
import { getSessionUid } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SAMPLE_ID_RE = /^[A-Za-z0-9_-]{8,100}$/;
const MAX_ID_LENGTH = 120;

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, maxLength) : "";
}

function performanceBaseUrl() {
  return (process.env.TRAFFIC_PERFORMANCE_API_BASE_URL || "http://127.0.0.1:3345").replace(/\/$/, "");
}

async function trustedIdentity(request: NextRequest) {
  const uid = await getSessionUid(request);
  if (!uid) return { user_uid: "", user_display_name: "" };

  try {
    const user = await getPrisma().user.findUnique({
      where: { uid },
      select: { uid: true, inGameName: true, steamPersonaName: true },
    });
    return {
      user_uid: uid,
      user_display_name: user?.inGameName || user?.steamPersonaName || uid,
    };
  } catch {
    return { user_uid: uid, user_display_name: uid };
  }
}

export async function POST(request: NextRequest) {
  const ingestKey = process.env.TRAFFIC_PERFORMANCE_INGEST_KEY?.trim();
  if (!ingestKey) {
    return NextResponse.json({ detail: "Speed telemetry relay is not configured" }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const sampleId = cleanText(body?.sample_id, MAX_ID_LENGTH);
  if (!body || !SAMPLE_ID_RE.test(sampleId)) {
    return NextResponse.json({ detail: "Invalid Speed sample" }, { status: 400 });
  }

  const identity = await trustedIdentity(request);
  const payload = {
    sample_id: sampleId,
    occurred_at: body.occurred_at,
    host: "aoe2war.com",
    route: sanitizeSpeedPath(cleanText(body.route, 1000)),
    build_version: process.env.NEXT_PUBLIC_AOE2WAR_BUILD_VERSION || "development",
    traffic_visitor_id: cleanText(body.traffic_visitor_id, MAX_ID_LENGTH),
    traffic_session_id: cleanText(body.traffic_session_id, MAX_ID_LENGTH),
    journey_session_id: cleanText(body.journey_session_id, MAX_ID_LENGTH),
    ...identity,
    navigation_kind: body.navigation_kind,
    navigation_start_source: body.navigation_start_source,
    ready_source: body.ready_source,
    ready_ms: body.ready_ms,
    ttfb_ms: body.ttfb_ms,
    fcp_ms: body.fcp_ms,
    lcp_ms: body.lcp_ms,
    inp_ms: body.inp_ms,
    cls: body.cls,
    dom_content_loaded_ms: body.dom_content_loaded_ms,
    load_event_ms: body.load_event_ms,
    resource_count: body.resource_count,
    transfer_bytes: body.transfer_bytes,
    api_request_count: body.api_request_count,
    slowest_api_path: body.slowest_api_path,
    slowest_api_ms: body.slowest_api_ms,
    long_task_count: body.long_task_count,
    long_task_max_ms: body.long_task_max_ms,
    long_task_total_ms: body.long_task_total_ms,
    viewport_width: body.viewport_width,
    viewport_height: body.viewport_height,
    effective_connection_type: body.effective_connection_type,
    connection_rtt_ms: body.connection_rtt_ms,
    downlink_mbps: body.downlink_mbps,
    save_data: body.save_data,
    valid_for_aggregation: body.valid_for_aggregation,
    invalid_reason: body.invalid_reason,
    visibility_tainted: body.visibility_tainted,
    user_agent: cleanText(request.headers.get("user-agent"), 500),
    details: body.details,
  };

  try {
    const upstream = await fetch(`${performanceBaseUrl()}/api/internal/performance/sample`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Performance-Key": ingestKey,
      },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });

    const responseText = await upstream.text();
    return new NextResponse(responseText, {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") || "application/json",
        "Cache-Control": "no-store, max-age=0, must-revalidate",
      },
    });
  } catch (error) {
    console.error("Speed telemetry relay failed:", error);
    return NextResponse.json({ detail: "Speed telemetry unavailable" }, { status: 502 });
  }
}
