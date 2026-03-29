import { NextRequest, NextResponse } from "next/server";
import { getBackendUpstreamBase } from "@/lib/backendUpstream";
import { getSessionUid } from "@/lib/session";
import { getPrisma } from "@/lib/prisma";
import { reconcileTournamentMatchProofs } from "@/lib/tournamentProofReconciler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readHeader(request: NextRequest, name: string) {
  const value = request.headers.get(name);
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function POST(request: NextRequest) {
  const watcherApiKey = readHeader(request, "x-api-key");
  const watcherUid = readHeader(request, "x-user-uid");
  const isWatcherProxyUpload = Boolean(watcherApiKey && watcherUid);

  const sessionUid = isWatcherProxyUpload ? null : await getSessionUid(request);
  const uid = watcherUid || sessionUid;

  if (!uid) {
    return NextResponse.json({ detail: "Sign in with Steam before uploading replays." }, { status: 401 });
  }

  const prisma = getPrisma();
  let playerName: string | null = readHeader(request, "x-player-name");
  let user:
    | {
        uid: string;
        inGameName: string | null;
      }
    | null = null;

  if (!isWatcherProxyUpload) {
    user = await prisma.user.findUnique({
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
    playerName = user?.inGameName || null;
  }

  const base = getBackendUpstreamBase();
  const contentType = request.headers.get("content-type");

  const headers = new Headers();
  if (contentType) headers.set("content-type", contentType);
  headers.set("x-user-uid", uid);
  if (playerName) {
    headers.set("x-player-name", playerName);
  }
  if (isWatcherProxyUpload && watcherApiKey) {
    headers.set("x-api-key", watcherApiKey);
    for (const headerName of ["x-parse-iteration", "x-is-final", "x-parse-source", "x-parse-reason"]) {
      const value = readHeader(request, headerName);
      if (value) {
        headers.set(headerName, value);
      }
    }
  } else if (process.env.INTERNAL_API_KEY) {
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
  if (upstreamResponse.ok) {
    try {
      await reconcileTournamentMatchProofs(prisma, { force: true });
    } catch (error) {
      console.warn("Replay upload succeeded but tournament proof reconciliation failed:", error);
    }
  }
  return new NextResponse(upstreamResponse.body, {
    status: upstreamResponse.status,
    headers: {
      "content-type": upstreamResponse.headers.get("content-type") || "application/json",
    },
  });
}
