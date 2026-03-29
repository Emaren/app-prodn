import { NextRequest, NextResponse } from "next/server";

import { loadLiveReplayDetailSnapshot } from "@/lib/liveReplayDetail";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const sessionKey = request.nextUrl.searchParams.get("session")?.trim();
    if (!sessionKey) {
      return NextResponse.json({ detail: "session is required." }, { status: 400 });
    }

    const snapshot = await loadLiveReplayDetailSnapshot(getPrisma(), sessionKey);
    if (!snapshot) {
      return NextResponse.json({ detail: "Live replay session not found." }, { status: 404 });
    }

    return NextResponse.json(snapshot);
  } catch (error) {
    console.error("Failed to load live replay detail:", error);
    return NextResponse.json({ detail: "Live replay detail unavailable." }, { status: 500 });
  }
}
