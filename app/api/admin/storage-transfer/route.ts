import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminSession";
import { readAoe2OsStorageEvidence } from "@/lib/aoe2Os";
import { readAuthenticatedStorageAtlas } from "@/lib/aoe2StorageAtlasServer";
import { projectPrivateStorage } from "@/lib/storageCommandCenterProjection";
import { readPrivateStorageVisual } from "@/lib/storageVisualPrivate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };

/**
 * Phase-1 visual read model. Reads only the existing operator evidence stores.
 * It deliberately returns NO transfer state until an independently reviewed
 * sender + Intel receiver cryptographic receipt feed has been installed.
 *
 * No shell, SSH, directory traversal, SQLite connection, network transfer,
 * discovery scan, mutation or deletion may be initiated by this route.
 */
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if ("error" in admin) return admin.error;
  try {
    const [estate, atlas, visual] = await Promise.all([
      readAoe2OsStorageEvidence(),
      readAuthenticatedStorageAtlas(),
      readPrivateStorageVisual(),
    ]);
    const observedAt = new Date();
    const storage = projectPrivateStorage(estate, atlas, observedAt, visual);
    return NextResponse.json({
      schema: "aoe2war.storage-transfer.control-room.v1",
      polledAt: observedAt.toISOString(),
      storage,
      transferReceipt: null, // Uninstalled transfer publisher: UNKNOWN, never fabricated.
    }, {headers: NO_STORE});
  } catch {
    return NextResponse.json({
      detail: "Authenticated storage receipt store unavailable",
    }, {status: 503, headers: NO_STORE});
  }
}
