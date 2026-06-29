// app/api/game_stats/route.ts
import { type NextRequest } from "next/server";

import { getBackendUpstreamBase } from "@/lib/backendUpstream";

function parsePositiveInt(value: string | null, fallback: number, max: number) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function parseOffset(value: string | null) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

export async function GET(request: NextRequest) {
  const base = getBackendUpstreamBase();
  const res = await fetch(`${base}/api/game_stats`, { cache: "no-store" });
  const data = await res.json();

  const searchParams = request.nextUrl.searchParams;
  const limitRaw = searchParams.get("limit") || searchParams.get("take");
  const offsetRaw = searchParams.get("offset") || searchParams.get("skip");

  if (Array.isArray(data) && (limitRaw || offsetRaw)) {
    const limit = parsePositiveInt(limitRaw, 12, 60);
    const offset = parseOffset(offsetRaw);
    return Response.json(data.slice(offset, offset + limit), { status: res.status });
  }

  return Response.json(data, { status: res.status });
}
