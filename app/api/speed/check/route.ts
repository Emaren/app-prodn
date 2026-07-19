import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = performance.now();
  const response = NextResponse.json({
    ok: true,
    generated_at: new Date().toISOString(),
    build_version: process.env.NEXT_PUBLIC_AOE2WAR_BUILD_VERSION || "development",
    server_elapsed_ms: Math.round((performance.now() - startedAt) * 1000) / 1000,
  });
  response.headers.set("Cache-Control", "no-store, max-age=0, must-revalidate");
  return response;
}
