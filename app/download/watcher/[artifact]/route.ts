import { NextRequest, NextResponse } from "next/server";

import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";
import {
  readWatcherDownloadIpAddress,
  readWatcherDownloadReferer,
  readWatcherDownloadUserAgent,
  shouldSkipWatcherDownloadLogging,
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

function buildDownloadRedirectResponse(downloadPath: string) {
  const response = new NextResponse(null, { status: 307 });
  response.headers.set("Location", downloadPath);
  response.headers.set("Cache-Control", "no-store, no-cache, max-age=0, must-revalidate");
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return response;
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

  if (!shouldSkipWatcherDownloadLogging(request)) {
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
  }

  return buildDownloadRedirectResponse(artifact.downloadPath);
}

export async function HEAD(
  _request: NextRequest,
  context: { params: Promise<{ artifact: string }> }
) {
  const { artifact: artifactKey } = await context.params;
  const artifact = getWatcherDownloadArtifact(artifactKey);

  if (!artifact) {
    return new NextResponse(null, { status: 404 });
  }

  return buildDownloadRedirectResponse(artifact.downloadPath);
}