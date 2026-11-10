import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {isDeniedPublicSiteThemeCampaign} from "../lib/siteThemeCampaignReadFence.ts";

const route=readFileSync("app/api/site-theme-campaign/route.ts","utf8");

const denied=(table: string, code="42501", prisma="P2010") => ({
  code:prisma,
  meta:{code,message:`permission denied for table ${table}`},
  message:`Raw query failed. Code: \`${code}\` permission denied for table ${table}`,
});

test("strict exact site_theme_campaign P2010/P2039 42501 only", () => {
  for (const orm of ["P2010","P2039"]) {
    assert.equal(isDeniedPublicSiteThemeCampaign(denied("site_theme_campaign","42501",orm)),true);
  }
});

test("wrong SQLSTATE or Prisma code never triggers optional fallback",()=>{
  assert.equal(isDeniedPublicSiteThemeCampaign(denied("site_theme_campaign","23505")),false);
  assert.equal(isDeniedPublicSiteThemeCampaign(denied("site_theme_campaign","42501","P2025")),false);
  assert.equal(isDeniedPublicSiteThemeCampaign(new Error("permission denied for table site_theme_campaign")),false);
});

test("financial, identity, and adjacent nonfinancial denials retain real errors",()=>{
  for(const table of ["users","bet_wagers","wolo_indexed_transfers","wolo_reserve_journal",
    "site_theme_campaign_events","scheduled_matches","replay_stat_projections"]) {
    assert.equal(isDeniedPublicSiteThemeCampaign(denied(table)),false,table);
  }
});

test("null/primitive/broken metadata do not masquerade as denied campaign",()=>{
  for(const value of [null,undefined,{},0,"42501",{code:"P2010",meta:{code:"42501"},message:"permission denied for site_theme_campaign"}]){
    assert.equal(isDeniedPublicSiteThemeCampaign(value),false);
  }
});

test("guest public endpoint distinguishes real unavailable from absent campaign",()=>{
  assert.match(route,/isDeniedPublicSiteThemeCampaign\(error\)/);
  assert.match(route,/status: "HOLD_SITE_THEME_CAMPAIGN_READ_UNAVAILABLE"/);
  assert.match(route,/campaignAvailability: "unavailable"/);
  assert.match(route,/\{ status: 503, headers: NO_STORE_HEADERS \}/);
  assert.match(route,/status: "HOLD_SITE_THEME_CAMPAIGN_BACKEND_FAILURE"/);
  assert.match(route,/\{ status: 500, headers: NO_STORE_HEADERS \}/);
  assert.doesNotMatch(route,/catch \(error\)[\s\S]*?\{ campaign: null, overrideThemeKey: null \}/);
});

test("route retains original auth read, no-store and no broader permissions",()=>{
  assert.match(route,/export async function GET\(request: NextRequest\)/);
  assert.match(route,/await getSessionUid\(request\)/);
  assert.match(route,/loadSiteThemeCampaignViewerState\(/);
  assert.match(route,/"Cache-Control": "no-store, max-age=0"/);
  assert.doesNotMatch(route,/\bGRANT\s+|\bREVOKE\s+|\bEXECUTE\s+.*funding/i);
});
