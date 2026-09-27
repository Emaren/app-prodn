import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const shell = fs.readFileSync("app/AppShell.tsx", "utf8");
const olympia = fs.readFileSync("app/olympia/page.tsx", "utf8");
const chaosium = fs.readFileSync("lib/champions/chaosium.ts", "utf8");
const chaosiumPage = fs.readFileSync("app/chaosium/page.tsx", "utf8");
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
});

test("Chaosium reads holder-changing Trophy events and preserves an origin marker", () => {
  assert.match(chaosium, /HOLDER_ASSIGNED/);
  assert.match(chaosium, /HOLDER_REASSIGNED/);
  assert.match(chaosium, /CHALLENGE_SETTLED_HOLDER_CHANGED/);
  assert.match(chaosium, /Belt entered the Kingdom/);
  assert.match(chaosium, /trophy\.createdAt\.toISOString\(\)/);
  assert.match(chaosium, /skippedCurrentHolderEvent/);
  assert.match(chaosiumPage, /animate-ping/);
  assert.match(chaosiumPage, /Newest reign to origin/);
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
});
