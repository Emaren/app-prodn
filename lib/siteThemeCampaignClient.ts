import type { LobbyThemeKey } from "@/components/lobby/lobbyPresentation";
import type { SiteThemeCampaignViewerState } from "@/lib/siteThemeCampaign";

export class SiteThemeCampaignReadUnavailable extends Error {
  readonly status = 503;
  readonly code = "HOLD_SITE_THEME_CAMPAIGN_READ_UNAVAILABLE";
  constructor() {
    super("Site theme campaign read is unavailable; absence is unproven");
    this.name = "SiteThemeCampaignReadUnavailable";
  }
}

export async function fetchSiteThemeCampaignState() {
  const response = await fetch("/api/site-theme-campaign", {
    cache: "no-store",
    credentials: "same-origin",
  });
  if (response.status === 503) {
    // Only the exact restricted optional-read response has this semantic.
    // A generic 503 cannot be silently translated into campaign absence.
    const payload: unknown = await response.json().catch(() => null);
    if (
      payload &&
      typeof payload === "object" &&
      (payload as { status?: unknown }).status ===
        "HOLD_SITE_THEME_CAMPAIGN_READ_UNAVAILABLE" &&
      (payload as { campaignAvailability?: unknown }).campaignAvailability === "unavailable"
    ) {
      throw new SiteThemeCampaignReadUnavailable();
    }
  }
  if (!response.ok) {
    throw new Error(`Theme campaign request failed: ${response.status}`);
  }
  return (await response.json()) as SiteThemeCampaignViewerState;
}

export async function saveThemeCampaignOverride(input: {
  campaignKey: string;
  themeKey: LobbyThemeKey;
}) {
  const response = await fetch("/api/user/theme-campaign-override", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(`Theme campaign override failed: ${response.status}`);
  }
  return (await response.json()) as {
    campaignKey: string;
    themeKey: LobbyThemeKey;
    updatedAt: string;
  };
}
