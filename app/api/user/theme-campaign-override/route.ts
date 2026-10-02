import { NextRequest, NextResponse } from "next/server";

import { isLobbyThemeKey } from "@/components/lobby/lobbyPresentation";
import { getPrisma } from "@/lib/prisma";
import {
  loadSiteThemeCampaign,
  saveSiteThemeCampaignOverride,
} from "@/lib/siteThemeCampaign";
import { getSessionUid } from "@/lib/session";
import { recordUserActivity } from "@/lib/userExperience";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

export async function POST(request: NextRequest) {
  const sessionUid = await getSessionUid(request);
  if (!sessionUid) {
    return NextResponse.json(
      { detail: "No active session" },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    campaignKey?: string;
    themeKey?: string;
  };
  const campaignKey = String(body.campaignKey || "").trim();
  const themeKey = String(body.themeKey || "").trim();

  if (!campaignKey || !isLobbyThemeKey(themeKey)) {
    return NextResponse.json(
      { detail: "Campaign key and valid theme are required." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: { uid: sessionUid },
    select: { id: true },
  });
  if (!user) {
    return NextResponse.json(
      { detail: "User not found" },
      { status: 404, headers: NO_STORE_HEADERS },
    );
  }

  const campaign = await loadSiteThemeCampaign(prisma);
  if (!campaign || !campaign.active || campaign.campaignKey !== campaignKey) {
    return NextResponse.json(
      { detail: "Theme campaign is not active." },
      { status: 409, headers: NO_STORE_HEADERS },
    );
  }

  const saved = await saveSiteThemeCampaignOverride(prisma, {
    userId: user.id,
    campaignKey,
    themeKey,
  });

  await recordUserActivity(prisma, {
    userId: user.id,
    type: "theme_campaign_override",
    path: request.nextUrl.pathname,
    label: `${campaignKey}/${themeKey}`,
    metadata: {
      campaignKey,
      themeKey,
      campaignThemeKey: campaign.themeKey,
    },
    dedupeWithinSeconds: 30,
  });

  return NextResponse.json(
    {
      campaignKey,
      themeKey: saved.themeKey,
      updatedAt: saved.updatedAt.toISOString(),
    },
    { headers: NO_STORE_HEADERS },
  );
}
