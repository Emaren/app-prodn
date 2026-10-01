import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  resolveEffectiveSiteThemeKey,
  siteThemeCampaignAppliesToPathname,
  siteThemeCampaignIsActive,
  type SiteThemeCampaignControl,
} from "../lib/siteThemeCampaign.ts";

const activeCampaign: SiteThemeCampaignControl = {
  campaignKey: "october-black-2026",
  label: "October Blackout 2026",
  enabled: true,
  themeKey: "black",
  appliesToThemeKey: "midnight",
  startsAt: "2026-10-01T06:00:00.000Z",
  endsAt: "2026-11-01T06:00:00.000Z",
  active: true,
  excludedPaths: ["/academy", "/statistics", "/traffic", "/speed"],
};

test("October campaign temporarily defaults every normal site theme to black", () => {
  for (const preferredThemeKey of [
    "midnight",
    "crimson",
    "sepia",
    "grey",
  ] as const) {
    assert.equal(
      resolveEffectiveSiteThemeKey({
        preferredThemeKey,
        campaign: activeCampaign,
        pathname: "/profile",
      }),
      "black",
    );
  }
});

test("explicit campaign override wins without changing the campaign default", () => {
  assert.equal(
    resolveEffectiveSiteThemeKey({
      preferredThemeKey: "midnight",
      overrideThemeKey: "midnight",
      campaign: activeCampaign,
      pathname: "/profile",
    }),
    "midnight",
  );
  assert.equal(
    resolveEffectiveSiteThemeKey({
      preferredThemeKey: "sepia",
      overrideThemeKey: "crimson",
      campaign: activeCampaign,
      pathname: "/bets",
    }),
    "crimson",
  );
});

test("self-themed page families are never campaign-skinned", () => {
  for (const pathname of [
    "/academy",
    "/academy/build-orders",
    "/statistics",
    "/statistics/detail",
    "/traffic",
    "/traffic/humans",
    "/speed",
    "/speed/edge",
  ]) {
    assert.equal(siteThemeCampaignAppliesToPathname(pathname), false);
    assert.equal(
      resolveEffectiveSiteThemeKey({
        preferredThemeKey: "midnight",
        campaign: activeCampaign,
        pathname,
      }),
      "midnight",
    );
  }

  assert.equal(siteThemeCampaignAppliesToPathname("/kingdom"), true);
  assert.equal(siteThemeCampaignAppliesToPathname("/profile"), true);
});

test("campaign window remains bounded to October", () => {
  const row = {
    enabled: true,
    startsAt: new Date("2026-10-01T06:00:00.000Z"),
    endsAt: new Date("2026-11-01T06:00:00.000Z"),
  };
  assert.equal(
    siteThemeCampaignIsActive(row, new Date("2026-10-01T06:00:00.000Z")),
    true,
  );
  assert.equal(
    siteThemeCampaignIsActive(row, new Date("2026-10-31T23:59:59.000Z")),
    true,
  );
  assert.equal(
    siteThemeCampaignIsActive(row, new Date("2026-11-01T06:00:00.000Z")),
    false,
  );
  assert.equal(
    siteThemeCampaignIsActive(
      { ...row, enabled: false },
      new Date("2026-10-15T12:00:00.000Z"),
    ),
    false,
  );
});

test("client persists the underlying preference instead of the temporary black campaign theme", () => {
  const source = readFileSync(
    new URL(
      "../components/lobby/LobbyAppearanceContext.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(
    source,
    /writeStoredLobbyTheme\(preferredThemeKey\)/,
  );
  assert.match(
    source,
    /themeKey:\s*preferredThemeKey/,
  );
  assert.match(
    source,
    /resolveEffectiveSiteThemeKey\(/,
  );
  assert.match(
    source,
    /saveThemeCampaignOverride\(/,
  );
});

test("migration seeds the October switch on and keeps overrides separate", () => {
  const migration = readFileSync(
    new URL(
      "../prisma/migrations/20261001153000_october_site_theme_campaign/migration.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(migration, /'october-black-2026'/);
  assert.match(migration, /TIMESTAMP '2026-10-01 06:00:00'/);
  assert.match(migration, /TIMESTAMP '2026-11-01 06:00:00'/);
  assert.match(migration, /CREATE TABLE "user_theme_campaign_overrides"/);
  assert.match(migration, /true,\s*'black'/);
});
