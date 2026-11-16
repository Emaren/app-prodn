import { NextRequest, NextResponse } from "next/server";

import { isLobbyThemeKey } from "@/components/lobby/lobbyPresentation";
import { requireAdmin } from "@/lib/adminSession";
import { NOVEMBER_2026_CAMPAIGN, isApprovedNovemberCampaignTransition } from "@/lib/novemberThemeCampaign";
import {
  loadSiteThemeCampaignAdminState,
  SITE_THEME_CAMPAIGN_SLOT,
} from "@/lib/siteThemeCampaign";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

function parseDate(value: unknown, fallback: Date) {
  if (typeof value !== "string" || !value.trim()) return fallback;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : fallback;
}

export async function GET(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("error" in gate) return gate.error;

  const state = await loadSiteThemeCampaignAdminState(gate.prisma);
  return NextResponse.json(state, { headers: NO_STORE_HEADERS });
}

export async function POST(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("error" in gate) return gate.error;

  const current = await gate.prisma.siteThemeCampaign.findUnique({
    where: { slot: SITE_THEME_CAMPAIGN_SLOT },
  });
  if (!current) {
    return NextResponse.json(
      { detail: "Site theme campaign is not configured." },
      { status: 409, headers: NO_STORE_HEADERS },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    enabled?: boolean;
    campaignKey?: string;
    label?: string;
    themeKey?: string;
    startsAt?: string;
    endsAt?: string;
  };

  const isCampaignSwitch = body.campaignKey !== undefined;
  if (
    isCampaignSwitch &&
    !isApprovedNovemberCampaignTransition(current.campaignKey, body.campaignKey)
  ) {
    return NextResponse.json(
      { detail: "Unsupported campaign transition." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  // A new month's campaign must use its own key: October opt-outs are not
  // silently inherited. The reviewed activation has a fixed start/end/theme.
  const November = NOVEMBER_2026_CAMPAIGN;
  if (isCampaignSwitch) {
    await gate.prisma.siteThemeCampaign.update({
      where: { slot: SITE_THEME_CAMPAIGN_SLOT },
      data: {
        campaignKey: November.campaignKey,
        label: November.label,
        themeKey: November.themeKey,
        enabled: November.enabled,
        startsAt: new Date(November.startsAt),
        endsAt: new Date(November.endsAt),
        updatedByUserId: gate.user.id,
      },
    });
    const state = await loadSiteThemeCampaignAdminState(gate.prisma);
    return NextResponse.json(state, { headers: NO_STORE_HEADERS });
  }

  const themeKey =
    typeof body.themeKey === "string" && isLobbyThemeKey(body.themeKey)
      ? body.themeKey
      : current.themeKey;
  const startsAt = parseDate(body.startsAt, current.startsAt);
  const endsAt = parseDate(body.endsAt, current.endsAt);

  if (startsAt.getTime() >= endsAt.getTime()) {
    return NextResponse.json(
      { detail: "Theme campaign start must be before its end." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const label =
    typeof body.label === "string" && body.label.trim()
      ? body.label.trim().slice(0, 120)
      : current.label;

  await gate.prisma.siteThemeCampaign.update({
    where: { slot: SITE_THEME_CAMPAIGN_SLOT },
    data: {
      enabled:
        typeof body.enabled === "boolean" ? body.enabled : current.enabled,
      label,
      themeKey,
      startsAt,
      endsAt,
      updatedByUserId: gate.user.id,
    },
  });

  const state = await loadSiteThemeCampaignAdminState(gate.prisma);
  return NextResponse.json(state, { headers: NO_STORE_HEADERS });
}
