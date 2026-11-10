import { NextRequest, NextResponse } from "next/server";

import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";
import { loadSiteThemeCampaignViewerState } from "@/lib/siteThemeCampaign";
import { isDeniedPublicSiteThemeCampaign } from "@/lib/siteThemeCampaignReadFence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

export async function GET(request: NextRequest) {
  try {
    const prisma = getPrisma();
    const sessionUid = await getSessionUid(request);
    const user = sessionUid
      ? await prisma.user.findUnique({
          where: { uid: sessionUid },
          select: { id: true },
        })
      : null;

    const state = await loadSiteThemeCampaignViewerState(
      prisma,
      user?.id ?? null,
    );

    return NextResponse.json(state, { headers: NO_STORE_HEADERS });
  } catch (error) {
    // An unreadable campaign is NOT an absent/inactive campaign. Keep exact
    // optional-read 42501 distinct from a genuine empty findUnique result.
    if (isDeniedPublicSiteThemeCampaign(error)) {
      return NextResponse.json(
        {
          status: "HOLD_SITE_THEME_CAMPAIGN_READ_UNAVAILABLE",
          campaignAvailability: "unavailable",
        },
        { status: 503, headers: NO_STORE_HEADERS },
      );
    }
    console.error("Failed to load site theme campaign:", error);
    // Unrelated identity or database failures stay failures, never silent
    // campaign:none success. In particular no finance table permission bypass.
    return NextResponse.json(
      { status: "HOLD_SITE_THEME_CAMPAIGN_BACKEND_FAILURE" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
