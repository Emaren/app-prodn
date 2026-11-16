import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminSession";
import { isNonfinancialPublicReadProfile } from "@/lib/nonfinancialPublicReadProfile";
import { loadAdminNonfinancialDirectory } from "@/lib/adminNonfinancialDirectory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Cookie",
} as const;

export async function GET(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("error" in gate) return gate.error;

  // Read only the existing R25 nonfinancial user-profile view.
  // This GET cannot trigger trophies, bet-intent refresh or settlement work.
  if (!isNonfinancialPublicReadProfile()) {
    return NextResponse.json(
      { status: "HOLD_NONFINANCIAL_PRODUCTION_READER_REQUIRED" },
      { status: 503, headers: PRIVATE_HEADERS },
    );
  }

  try {
    const result = await loadAdminNonfinancialDirectory(gate.prisma);
    return NextResponse.json(result, { headers: PRIVATE_HEADERS });
  } catch (error) {
    console.error("Admin nonfinancial directory read failed:", error);
    return NextResponse.json(
      { status: "HOLD_ADMIN_DIRECTORY_READER_UNAVAILABLE" },
      { status: 503, headers: PRIVATE_HEADERS },
    );
  }
}
