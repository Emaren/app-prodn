import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { getPrisma } from "@/lib/prisma";
import { sanitizeSpeedPath } from "@/lib/speed/routeSanitizer";
import { getSessionUid } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SAMPLE_ID_RE = /^[A-Za-z0-9_-]{8,100}$/;

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

function metric(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export async function POST(request: NextRequest) {
  const ingestKey = process.env.TRAFFIC_PERFORMANCE_INGEST_KEY?.trim();
  if (!ingestKey) {
    return NextResponse.json({ detail: "Speed report relay is not configured" }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ detail: "Invalid Speed report" }, { status: 400 });
  }

  const sampleId = cleanText(body.sample_id, 100);
  if (sampleId && !SAMPLE_ID_RE.test(sampleId)) {
    return NextResponse.json({ detail: "Invalid Speed sample reference" }, { status: 400 });
  }

  const recentRaw = Array.isArray(body.recent_sample_ids) ? body.recent_sample_ids : [];
  const recentSampleIds = recentRaw
    .map((value) => cleanText(value, 100))
    .filter((value) => SAMPLE_ID_RE.test(value))
    .slice(0, 20);

  const diagnostic =
    body.diagnostic_snapshot && typeof body.diagnostic_snapshot === "object"
      ? (body.diagnostic_snapshot as Record<string, unknown>)
      : {};

  const identity = await trustedIdentity(request);
  const route = sanitizeSpeedPath(cleanText(body.route, 1000));
  const slowestApiPathRaw = cleanText(diagnostic.slowest_api_path, 1000);
  const reportId = `SPR_${randomUUID().replace(/-/g, "")}`;

  const payload = {
    report_id: reportId,
    sample_id: sampleId,
    host: "aoe2war.com",
    route,
    build_version: process.env.NEXT_PUBLIC_AOE2WAR_BUILD_VERSION || "development",
    ...identity,
    recent_sample_ids: recentSampleIds,
    diagnostic_snapshot: {
      note: "User submitted Speed Report from the personal Speed Observatory.",
      route,
      ready_ms: metric(diagnostic.ready_ms),
      ttfb_ms: metric(diagnostic.ttfb_ms),
      lcp_ms: metric(diagnostic.lcp_ms),
      inp_ms: metric(diagnostic.inp_ms),
      cls: metric(diagnostic.cls),
      slowest_api_path: slowestApiPathRaw ? sanitizeSpeedPath(slowestApiPathRaw) : "",
      slowest_api_ms: metric(diagnostic.slowest_api_ms),
      top_resources: Array.isArray(diagnostic.top_resources) ? diagnostic.top_resources.slice(0, 10) : [],
      top_api_requests: Array.isArray(diagnostic.top_api_requests) ? diagnostic.top_api_requests.slice(0, 10) : [],
    },
  };

  try {
    const upstream = await fetch(`${performanceBaseUrl()}/api/internal/performance/report`, {
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
    console.error("Speed report relay failed:", error);
    return NextResponse.json({ detail: "Speed report service unavailable" }, { status: 502 });
  }
}
