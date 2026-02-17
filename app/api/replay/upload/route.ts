import { NextRequest, NextResponse } from "next/server";
import { getSessionUid } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const uid = await getSessionUid(request);
  if (!uid) {
    return NextResponse.json({ detail: "Missing session identity" }, { status: 401 });
  }

  const upstream =
    process.env.AOE2_BACKEND_UPSTREAM ||
    process.env.BACKEND_API ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    "http://127.0.0.1:3330";
  const base = (upstream === "." ? "http://127.0.0.1:3330" : upstream).replace(/\/$/, "");
  const contentType = request.headers.get("content-type");

  const headers = new Headers();
  if (contentType) headers.set("content-type", contentType);
  headers.set("x-user-uid", uid);

  const init: RequestInit & { duplex?: "half" } = {
    method: "POST",
    headers,
    body: request.body,
    duplex: "half",
    cache: "no-store",
  };

  const upstreamResponse = await fetch(`${base}/api/replay/upload`, init);
  return new NextResponse(upstreamResponse.body, {
    status: upstreamResponse.status,
    headers: {
      "content-type": upstreamResponse.headers.get("content-type") || "application/json",
    },
  });
}
