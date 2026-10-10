import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminSession";
import { loadPublicPlayerDirectory } from "@/lib/publicPlayerDirectory";
import { loadCurrentWatcherAccountStates } from "@/lib/currentWatcherAccountState";
import { loadVerifiedWatcherSteamRatings } from "@/lib/verifiedWatcherSteamRatings";
import { buildZodiacRatingAudit } from "@/lib/zodiacRatingAudit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

/**
 * Administrator-only, bounded three-account reconciliation.
 * No game/result/rating database writes, no third-party lookup, no
 * undocumented Steam-ID/name folding, no settlement side effects.
 */
export async function GET(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("error" in gate) return gate.error;
  try {
    const [directory, receipts, signed] = await Promise.all([
      loadPublicPlayerDirectory(gate.prisma, null, {
        includePresence: false, includeCurrentWatcherState: true,
      }),
      loadCurrentWatcherAccountStates(gate.prisma),
      loadVerifiedWatcherSteamRatings(gate.prisma),
    ]);
    return NextResponse.json(buildZodiacRatingAudit(directory, receipts, signed), {
      headers: NO_STORE,
    });
  } catch (error) {
    console.error("[zodiac-rating-audit] read-only evidence load failed", {
      kind: error instanceof Error ? error.name : "unknown",
    });
    return NextResponse.json({
      detail: "The three-account rating audit could not be completed. No ratings or results were changed.",
    }, { status: 503, headers: NO_STORE });
  }
}
