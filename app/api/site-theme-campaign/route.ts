import { NextRequest, NextResponse } from "next/server";

import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";
import { loadSiteThemeCampaignViewerState } from "@/lib/siteThemeCampaign";

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
    console.error("Failed to load site theme campaign:", error);
    return NextResponse.json(
      { campaign: null, overrideThemeKey: null },
      { headers: NO_STORE_HEADERS },
    );
  }
}
