import { NextRequest, NextResponse } from "next/server";

import { isLobbyThemeKey } from "@/components/lobby/lobbyPresentation";
import { requireAdmin } from "@/lib/adminSession";
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
    label?: string;
    themeKey?: string;
    appliesToThemeKey?: string;
    startsAt?: string;
    endsAt?: string;
  };

  const themeKey =
    typeof body.themeKey === "string" && isLobbyThemeKey(body.themeKey)
      ? body.themeKey
      : current.themeKey;
  const appliesToThemeKey =
    typeof body.appliesToThemeKey === "string" &&
    isLobbyThemeKey(body.appliesToThemeKey)
      ? body.appliesToThemeKey
      : current.appliesToThemeKey;
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
      appliesToThemeKey,
      startsAt,
      endsAt,
      updatedByUserId: gate.user.id,
    },
  });

  const state = await loadSiteThemeCampaignAdminState(gate.prisma);
  return NextResponse.json(state, { headers: NO_STORE_HEADERS });
}
