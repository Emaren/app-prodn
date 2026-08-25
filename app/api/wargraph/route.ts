import { NextRequest, NextResponse } from "next/server";

import { getSessionUid } from "@/lib/session";
import { loadWarGraphPublicSnapshot } from "@/lib/wargraph/snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const uid = await getSessionUid(request);
  const snapshot = await loadWarGraphPublicSnapshot({ uid });
  const etag = `"wargraph-${snapshot.revision}"`;
  const headers = {
    "Cache-Control": "private, no-cache, max-age=0, must-revalidate",
    ETag: etag,
    Vary: "Cookie",
  };

  if (request.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers });
  }
  return NextResponse.json(snapshot, { status: 200, headers });
}
