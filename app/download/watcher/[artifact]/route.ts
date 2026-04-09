import { NextRequest, NextResponse } from "next/server";

import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";
import {
  readWatcherDownloadIpAddress,
  readWatcherDownloadReferer,
  readWatcherDownloadUserAgent,
} from "@/lib/watcherDownloads";
import { getWatcherDownloadArtifact, WATCHER_RELEASE } from "@/lib/watcherRelease";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function resolveViewerId(request: NextRequest) {
  const sessionUid = await getSessionUid(request);
  if (!sessionUid) {
    return null;
  }

  const prisma = getPrisma();
  const viewer = await prisma.user.findUnique({
    where: { uid: sessionUid },
    select: { id: true },
  });

  return viewer?.id ?? null;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ artifact: string }> }
) {
  const { artifact: artifactKey } = await context.params;
  const artifact = getWatcherDownloadArtifact(artifactKey);

  if (!artifact) {
    return NextResponse.json({ detail: "Watcher artifact not found." }, { status: 404 });
  }

  try {
    const prisma = getPrisma();
    const userId = await resolveViewerId(request);

    await prisma.watcherDownloadEvent.create({
      data: {
        userId,
        platform: artifact.platform,
        artifact: artifact.key,
        version: WATCHER_RELEASE.version,
        filename: artifact.filename,
        ipAddress: readWatcherDownloadIpAddress(request),
        userAgent: readWatcherDownloadUserAgent(request),
        referer: readWatcherDownloadReferer(request),
      },
    });
  } catch (error) {
    console.error(`Failed to record watcher download for ${artifact.key}:`, error);
  }

  return NextResponse.redirect(new URL(artifact.downloadPath, request.url), {
    status: 307,
  });
}
