// app/api/game_stats/route.ts
import { getBackendUpstreamBase } from "@/lib/backendUpstream";
export async function GET() {
  const base = getBackendUpstreamBase();
  const res = await fetch(`${base}/api/game_stats`, { cache: "no-store" });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
