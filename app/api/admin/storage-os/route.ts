import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminSession";
import { readAoe2OsStorageEvidence } from "@/lib/aoe2Os";
import { readAuthenticatedStorageAtlas } from "@/lib/aoe2StorageAtlasServer";
import { projectPrivateStorage } from "@/lib/storageCommandCenterProjection";
import { readPrivateStorageVisual } from "@/lib/storageVisualPrivate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };

/** Read already-published, bounded operator evidence. No shell, mount or scan. */
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if ("error" in admin) return admin.error;
  try {
    const [dashboard, signed, visual] = await Promise.all([
      readAoe2OsStorageEvidence(),
      readAuthenticatedStorageAtlas(),
      readPrivateStorageVisual(),
    ]);
    return NextResponse.json(projectPrivateStorage(dashboard, signed, new Date(), visual), {
      headers: NO_STORE,
    });
  } catch {
    // Fail closed: never substitute a canned/stale capacity figure.
    return NextResponse.json(
      { detail: "Storage OS evidence store unavailable; all gauges unknown." },
      { status: 503, headers: NO_STORE },
    );
  }
}
