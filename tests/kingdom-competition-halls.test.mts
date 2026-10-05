import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const shell = fs.readFileSync("app/AppShell.tsx", "utf8");
const olympia = fs.readFileSync("app/olympia/page.tsx", "utf8");
const chaosium = fs.readFileSync("lib/champions/chaosium.ts", "utf8");
const chaosiumPage = fs.readFileSync("app/chaosium/page.tsx", "utf8");
const chaosiumDisplayRail = fs.readFileSync("components/chaosium/ChaosiumDisplayRail.tsx", "utf8");
const chaosiumBeltRail = fs.readFileSync("components/chaosium/ChaosiumBeltRail.tsx", "utf8");
const nationalBeltCatalog = fs.readFileSync("lib/champions/nationalBeltCatalog.ts", "utf8");
const leagues = fs.readFileSync("lib/leagues.ts", "utf8");
const leagueApi = fs.readFileSync("app/api/leagues/route.ts", "utf8");
const leagueQuote = fs.readFileSync("app/api/leagues/quote/route.ts", "utf8");
const leagueUi = fs.readFileSync("components/leagues/LeaguesPageClient.tsx", "utf8");
const schema = fs.readFileSync("prisma/schema.prisma", "utf8");

test("Kingdom dropdown exposes Chaosium, Olympia, and Leagues", () => {
  for (const href of ["/chaosium", "/olympia", "/leagues"]) {
    assert.match(shell, new RegExp(`href: "${href}"`));
  }
});

test("Olympia is deliberately the three-nation opening delegation", () => {
  assert.match(olympia, /national-canada/);
  assert.match(olympia, /national-usa/);
  assert.match(olympia, /national-mexico/);
  assert.doesNotMatch(olympia, /national-uk/);
  assert.doesNotMatch(olympia, /id: "chaos"/);
  assert.match(olympia, /Claim your nation&apos;s vacant belt/);
  assert.match(olympia, /Commissioner/);
  assert.match(olympia, /\/challenge\?/);
  assert.match(olympia, /kind: "national"/);
});

test("Chaosium reads canonical Trophy lineage and the complete Champions belt catalog", () => {
  assert.match(chaosium, /HOLDER_ASSIGNED/);
  assert.match(chaosium, /HOLDER_REASSIGNED/);
  assert.match(chaosium, /CHALLENGE_SETTLED_HOLDER_CHANGED/);
  assert.match(chaosium, /Belt entered the Kingdom/);
  assert.match(chaosium, /trophy\.createdAt\.toISOString\(\)/);
  assert.match(chaosium, /previousIdentity === toIdentity/);
  assert.match(chaosium, /CHAMPIONS_NATIONAL_BELT_CATALOG/);
  assert.match(chaosium, /title\.type !== "designation"/);
  assert.match(chaosium, /title\.id !== "tag-team"/);
  assert.match(chaosium, /return belts\.sort/);
  assert.match(chaosium, /if \(leftHeld !== rightHeld\) return leftHeld \? -1 : 1/);
  assert.match(nationalBeltCatalog, /export const CHAMPIONS_NATIONAL_BELT_CATALOG/);
  assert.equal((nationalBeltCatalog.match(/flag: "/g) ?? []).length, 42);
});

test("Chaosium E2 is the frontier default while B1 A1 and E1 stay directly recoverable", () => {
  assert.match(chaosiumPage, /return "e2";/);
  assert.match(chaosiumPage, /CorrectedMetrics/);
  assert.match(chaosiumPage, /PreservedE1Metrics/);
  assert.match(chaosiumPage, /ChaosiumBeltRail/);
  assert.match(chaosiumPage, /ROAD_VIEWPORT_HEIGHT = 560/);
  assert.match(chaosiumPage, /Math\.pow\(ageRatio, 0\.82\)/);
  assert.match(chaosiumPage, /data-chaosium-belt-road/);
  assert.match(chaosiumPage, /h-\[35rem\] overflow-y-auto/);
  assert.match(chaosiumPage, /Open championship/);
  assert.match(chaosiumPage, /ChaosiumDisplayRail active=\{view\}/);

  for (const version of ["b1", "a1", "e1", "e2"]) {
    assert.match(chaosiumDisplayRail, new RegExp(`key: "${version}"`));
  }
  assert.match(chaosiumDisplayRail, /key: "e2"[\s\S]*href: "\/chaosium"/);
  assert.match(chaosiumDisplayRail, /href="\/chaosium\?view=b1"/);
  assert.match(chaosiumDisplayRail, /href="\/chaosium\?view=a1"/);
  assert.match(chaosiumDisplayRail, /href: "\/chaosium\?view=e1"/);
  assert.match(chaosiumDisplayRail, /data-chaosium-version=\{active\}/);
});

test("Chaosium museum rail supports native swipe, drag, keyboard, click, and quiet edge-hover glide", () => {
  assert.match(chaosiumBeltRail, /overflow-x-auto/);
  assert.match(chaosiumBeltRail, /scrollBy\(\{ left: direction \* distance, behavior: "smooth" \}\)/);
  assert.match(chaosiumBeltRail, /onPointerDown=\{handlePointerDown\}/);
  assert.match(chaosiumBeltRail, /event\.key === "ArrowLeft"/);
  assert.match(chaosiumBeltRail, /event\.key === "ArrowRight"/);
  assert.match(chaosiumBeltRail, /EDGE_SPEED_PX_PER_SECOND/);
  assert.match(chaosiumBeltRail, /onMouseEnter=\{\(\) => startEdgeGlide\(-1\)\}/);
  assert.match(chaosiumBeltRail, /onMouseEnter=\{\(\) => startEdgeGlide\(1\)\}/);
  assert.match(chaosiumBeltRail, /opacity-0/);
});
test("league charter is a verified 100 WOLO signed creation rail", () => {
  assert.match(leagues, /LEAGUE_CREATION_PRICE_WOLO = 100/);
  assert.match(leagues, /verifyWoloTransfer\(/);
  assert.match(leagues, /buildLeagueCreationMemo/);
  assert.match(leagues, /resolvePrimaryAdminContact/);
  assert.match(leagueQuote, /recipientAddress: commissioner\.walletAddress/);
  assert.match(leagueApi, /verifyLeagueCreationPayment\(/);
  assert.match(leagueApi, /tx\.league\.create/);
  assert.match(leagueApi, /existingLeague/);
  assert.match(leagueApi, /recovered: true/);
  assert.match(schema, /model League/);
  assert.match(schema, /creationTxHash\s+String\s+@unique/);
});

test("Leagues exposes every team size with independent RM and DM controls", () => {
  for (const label of ["1v1", "2v2", "3v3", "4v4"]) {
    assert.match(leagueUi, new RegExp(`label: "${label}"`));
  }
  assert.match(leagueUi, /\["rm", "dm"\]/);
  assert.match(leagueUi, /setLaneModes/);
  assert.match(leagueUi, /Found league · 100 WOLO/);
  assert.match(leagueUi, /pendingPayment/);
  assert.match(leagueUi, /Retry charter · already paid/);
  assert.match(leagueUi, /PENDING_LEAGUE_PAYMENT_STORAGE_PREFIX/);
  assert.match(leagueUi, /localStorage\.setItem/);
  assert.match(leagueUi, /localStorage\.removeItem/);
});
