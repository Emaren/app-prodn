// app/api/game_stats/route.ts
export async function GET() {
  const upstream =
    process.env.AOE2_BACKEND_UPSTREAM ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    "http://127.0.0.1:3330";

  const base = upstream.replace(/\/$/, "");
  const res = await fetch(`${base}/api/game_stats`, { cache: "no-store" });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
