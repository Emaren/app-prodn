import type { LobbyThemeKey } from "@/components/lobby/lobbyPresentation";
import type { SiteThemeCampaignViewerState } from "@/lib/siteThemeCampaign";

export type SiteThemeCampaignAvailability = "loading" | "ready" | "unavailable";

/** Exact optional public-read denial, not an absent campaign. */
export class SiteThemeCampaignUnavailableError extends Error {
  readonly status = 503;

  constructor() {
    super("Site theme campaign data temporarily unavailable");
    this.name = "SiteThemeCampaignUnavailableError";
  }
}

export async function fetchSiteThemeCampaignState() {
  const response = await fetch("/api/site-theme-campaign", {
    cache: "no-store",
    credentials: "same-origin",
  });
  if (response.status === 503) {
    // Never parse or trust this denied public response as a campaign object.
    throw new SiteThemeCampaignUnavailableError();
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
