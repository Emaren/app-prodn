import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  fetchSiteThemeCampaignState,
  SiteThemeCampaignUnavailableError,
} from "../lib/siteThemeCampaignClient.ts";

const provider = readFileSync(
  new URL("../components/lobby/LobbyAppearanceContext.tsx", import.meta.url),
  "utf8",
);

test("actual browser fetch handles 503 as typed unavailable, never empty campaign", async () => {
  const originalFetch = globalThis.fetch;
  let captured: RequestInit | undefined;
  globalThis.fetch = async (_url, init) => {
    captured = init;
    return new Response(
      JSON.stringify({
        status: "HOLD_SITE_THEME_CAMPAIGN_READ_UNAVAILABLE",
        campaignAvailability: "unavailable",
      }),
      { status: 503, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  };
  try {
    await assert.rejects(
      fetchSiteThemeCampaignState(),
      (error: unknown) =>
        error instanceof SiteThemeCampaignUnavailableError && error.status === 503,
    );
    assert.equal(captured?.credentials, "same-origin");
    assert.equal(captured?.cache, "no-store");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("successful genuine campaign absence is still a 200 response with null", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ campaign: null, overrideThemeKey: null }), {
      status: 200,
    });
  try {
    assert.deepEqual(await fetchSiteThemeCampaignState(), {
      campaign: null,
      overrideThemeKey: null,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("500 identity/backend failure is not misclassified as optional read 503", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response("backend failure", { status: 500 });
  try {
    await assert.rejects(fetchSiteThemeCampaignState(), (error: unknown) => {
      assert.equal(error instanceof SiteThemeCampaignUnavailableError, false);
      return error instanceof Error && error.message.includes("500");
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("provider retains previously verified public campaign when 503 occurs", () => {
  assert.match(provider, /setSiteThemeCampaignAvailability\("unavailable"\)/);
  assert.match(provider, /error instanceof SiteThemeCampaignUnavailableError/);
  assert.match(provider, /setSiteThemeCampaignAvailability\("ready"\)/);
  assert.match(provider, /siteThemeCampaignAvailability,\s*themeKey,/);
  assert.doesNotMatch(
    provider,
    /catch \(error\) \{[^}]*setSiteThemeCampaign\(null\)/,
  );
});

test("Steam identity switches clear previous private campaign overrides", () => {
  assert.match(provider, /setCampaignOverrideThemeKey\(null\);/);
  assert.match(provider, /let cancelled = false;[\s\S]*?window\.setInterval/);
  assert.match(provider, /\.then\(\(state\) => \{\s*if \(cancelled\) return;/);
});
