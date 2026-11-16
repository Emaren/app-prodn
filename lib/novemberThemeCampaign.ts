// October and November share the singleton scheduler, but NOT a campaign key.
// Distinct keys protect users' October color opt-outs from leaking into November.
export const NOVEMBER_2026_CAMPAIGN = {
  campaignKey: "november-crimson-2026",
  label: "November Ember Reign 2026",
  themeKey: "crimson",
  startsAt: "2026-11-01T06:00:00.000Z",
  endsAt: "2026-12-01T07:00:00.000Z",
  enabled: true,
} as const;

export function isApprovedNovemberCampaignTransition(
  currentKey: string,
  requestedKey: unknown,
): boolean {
  return requestedKey === NOVEMBER_2026_CAMPAIGN.campaignKey &&
    (currentKey === "october-black-2026" ||
      currentKey === NOVEMBER_2026_CAMPAIGN.campaignKey);
}
