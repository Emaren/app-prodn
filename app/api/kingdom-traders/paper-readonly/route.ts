import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminSession";
import { readKt84ProductionProjection } from "@/lib/kt84ReadonlyProjection";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "Vary": "Cookie",
  "X-Content-Type-Options": "nosniff",
};

/** Owner-authenticated GET of a separately signed, sanitized WE3 record only.
 * No website wallet signer, original SQLite datasource, bot control or POST. */
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if ("error" in admin) {
    const denied = admin.error;
    denied.headers.set("Cache-Control", HEADERS["Cache-Control"]);
    denied.headers.set("Vary", HEADERS["Vary"]);
    return denied;
  }
  try {
    const projection = await readKt84ProductionProjection();
    return NextResponse.json(projection, { status: 200, headers: HEADERS });
  } catch {
    // Do not leak private directory paths, key-enrollment or parse failures.
    return NextResponse.json({
      schema: "aoe2war.kt84.readonly-hold.v1",
      status: "HOLD_WE3_SIGNED_PROJECTION_NOT_ADMITTED",
      financed: false,
      tradingAuthorized: false,
      operatorAuthorized: false,
    }, { status: 503, headers: HEADERS });
  }
}
