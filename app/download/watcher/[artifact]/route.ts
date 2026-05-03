import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

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

function resolveDownloadFilePath(downloadPath: string) {
  if (!downloadPath.startsWith("/downloads/")) {
    throw new Error(`Unsafe watcher download path: ${downloadPath}`);
  }

  const relativeFile = decodeURIComponent(downloadPath.replace(/^\/downloads\//, ""));
  return path.join(process.cwd(), "public", "downloads", relativeFile);
}

function buildAttachmentHeaders(filename: string, size: number) {
  const safeName = filename.replace(/["\\]/g, "_");
  const encodedName = encodeURIComponent(filename);

  return {
    "Content-Type": "application/octet-stream",
    "Content-Length": String(size),
    "Content-Disposition": `attachment; filename="${safeName}"; filename*=UTF-8''${encodedName}`,
    "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
  };
}

async function recordWatcherDownload(request: NextRequest, artifact: NonNullable<ReturnType<typeof getWatcherDownloadArtifact>>) {
  if (shouldSkipWatcherDownloadLogging(request)) {
    return;
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

  const filePath = resolveDownloadFilePath(artifact.downloadPath);
  const fileStat = await stat(filePath);

  await recordWatcherDownload(request, artifact);

  const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream<Uint8Array>;

  return new NextResponse(stream, {
    status: 200,
    headers: buildAttachmentHeaders(artifact.filename, fileStat.size),
  });
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

  const filePath = resolveDownloadFilePath(artifact.downloadPath);
  const fileStat = await stat(filePath);

  return new NextResponse(null, {
    status: 200,
    headers: buildAttachmentHeaders(artifact.filename, fileStat.size),
  });
}
