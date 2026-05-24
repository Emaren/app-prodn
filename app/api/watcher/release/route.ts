import { NextResponse } from "next/server";

import { WATCHER_DOWNLOAD_ARTIFACTS, WATCHER_RELEASE } from "@/lib/watcherRelease";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      version: WATCHER_RELEASE.version,
      label: WATCHER_RELEASE.label,
      releasedOn: WATCHER_RELEASE.releasedOn,
      signingStatus: WATCHER_RELEASE.signingStatus,
      releaseUrl: "/download",
      artifacts: WATCHER_DOWNLOAD_ARTIFACTS.map((artifact) => ({
        key: artifact.key,
        platform: artifact.platform,
        title: artifact.title,
        filename: artifact.filename,
        downloadPath: artifact.downloadPath,
        trackedHref: artifact.trackedHref,
        primary: artifact.primary,
      })),
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    }
  );
}
