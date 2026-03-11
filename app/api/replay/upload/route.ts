import { NextRequest, NextResponse } from "next/server";
import { getBackendUpstreamBase } from "@/lib/backendUpstream";
import { getSessionUid } from "@/lib/session";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const uid = await getSessionUid(request);
  if (!uid) {
    return NextResponse.json({ detail: "Sign in with Steam before uploading replays." }, { status: 401 });
  }

  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: { uid },
    select: {
      uid: true,
      inGameName: true,
    },
  });
  if (!user) {
    await prisma.user.create({
      data: {
        uid,
        isAdmin: false,
      },
    });
  }

  const base = getBackendUpstreamBase();
  const contentType = request.headers.get("content-type");

  const headers = new Headers();
  if (contentType) headers.set("content-type", contentType);
  headers.set("x-user-uid", uid);
  const playerName = user?.inGameName;
  if (playerName) {
    headers.set("x-player-name", playerName);
  }
  if (process.env.INTERNAL_API_KEY) {
    headers.set("x-api-key", process.env.INTERNAL_API_KEY);
  }

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
