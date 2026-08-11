import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));

function sourceFilesUnder(directory: string): string[] {
  const absoluteDirectory = join(repositoryRoot, directory);
  return readdirSync(absoluteDirectory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = join(absoluteDirectory, entry.name);
    const repositoryPath = relative(repositoryRoot, absolutePath);
    if (entry.isDirectory()) {
      return entry.name === "generated" ? [] : sourceFilesUnder(repositoryPath);
    }
    return /\.(?:ts|tsx)$/.test(entry.name) ? [repositoryPath] : [];
  });
}

const migratedTimestampSurfaces = [
  "app/bets/[marketId]/page.tsx",
  "app/matchups/[left]/[right]/page.tsx",
  "app/matchups/team/[left]/[right]/page.tsx",
  "app/game-stats/page.tsx",
  "app/game-stats/[id]/page.tsx",
  "components/game-stats/ConfirmedDesyncBanner.tsx",
  "components/game-stats/LiveReplayDetail.tsx",
  "components/game-stats/ReplayVerdictTrail.tsx",
  "components/lobby/LeaderboardPanel.tsx",
  "components/lobby/LobbyChat.tsx",
  "components/lobby/LobbyHero.tsx",
  "components/lobby/RecentMatchesPanel.tsx",
  "components/lobby/TournamentPanel.tsx",
  "components/lobby/WatchAndChatHero.tsx",
  "app/tournaments/[slug]/page.tsx",
  "app/staking/StakingActionTile.tsx",
  "app/staking/StakingActivityFeed.tsx",
  "app/staking/stakers/[slug]/StakerLedgerPanel.tsx",
  "app/admin/parser-lab/page.tsx",
  "app/admin/replay-review/page.tsx",
  "app/admin/market-integrity/page.tsx",
  "components/admin/ReplayOperationsCommandCenter.tsx",
  "app/requests/page.tsx",
  "components/zodiac/ZodiacTrainingPage.tsx",
  "app/champions/page.tsx",
  "app/champions/[...slug]/page.tsx",
  "components/lobby/WolomaniaPromoTile.tsx",
  "app/wolomania/WolomaniaPageClient.tsx",
  "components/live/LiveGamesBoard.tsx",
  "components/clans/ClanHallClient.tsx",
] as const;

test("migrated timestamp surfaces use the shared browser-local renderer", () => {
  for (const path of migratedTimestampSurfaces) {
    const contents = source(path);
    assert.match(contents, /TimeDisplayText/, `${path} must use TimeDisplayText`);
    assert.doesNotMatch(
      contents,
      /timeZone:\s*["']America\/Edmonton["']/,
      `${path} must not pin timestamp display to Edmonton`
    );
  }
});

test("bets, matchups, and replay detail no longer retain ambient server timestamp helpers", () => {
  for (const path of [
    "app/bets/[marketId]/page.tsx",
    "app/matchups/[left]/[right]/page.tsx",
    "app/matchups/team/[left]/[right]/page.tsx",
    "app/game-stats/[id]/page.tsx",
    "components/game-stats/ConfirmedDesyncBanner.tsx",
    "components/game-stats/LiveReplayDetail.tsx",
    "components/game-stats/ReplayVerdictTrail.tsx",
  ]) {
    const contents = source(path);
    assert.doesNotMatch(contents, /function format(?:Date|DateLong|DateTime|IncidentTime)\s*\(/);
  }
});

test("lobby day grouping receives the hydrated display timezone with UTC first-render fallback", () => {
  const home = source("app/HomePageClient.tsx");
  const utilities = source("components/lobby/utils.ts");

  assert.match(home, /appearanceLoaded[\s\S]*resolveTimeZone/);
  assert.match(home, /buildChatItems\(messages,\s*chatTimeZone\)/);
  assert.match(utilities, /buildChatItems\(messages: LobbyMessage\[\], timeZone = "UTC"\)/);
  assert.match(utilities, /formatToParts\(date\)/);
  assert.doesNotMatch(utilities, /America\/Edmonton/);
});

test("staking presentation renders raw occurrence instants while civil ledger-day headers stay UTC", () => {
  const activity = source("app/staking/StakingActivityFeed.tsx");
  const ledger = source("app/staking/stakers/[slug]/StakerLedgerPanel.tsx");
  const action = source("app/staking/StakingActionTile.tsx");

  assert.match(activity, /TimeDisplayText value=\{item\.occurredAt\}/);
  assert.match(activity, /useTimeDisplayFormatter/);
  assert.match(ledger, /TimeDisplayText value=\{row\.occurredAt\}/);
  assert.match(ledger, /formatLedgerDayLabel[\s\S]*timeZone: "UTC"/);
  assert.match(ledger, /row\.metaKind === "label"/);
  assert.match(ledger, /UTC staking day/);
  assert.match(action, /const occurredAt = new Date\(\)\.toISOString\(\)/);
  assert.match(action, /occurredAt,/);
});

test("fixed-zone timestamp formatting is prohibited outside intentional UTC civil grains", () => {
  const paths = [
    ...sourceFilesUnder("app"),
    ...sourceFilesUnder("components"),
    ...sourceFilesUnder("lib"),
  ];
  const fixedUtcPaths = new Set<string>();

  for (const path of paths) {
    const contents = source(path);
    assert.doesNotMatch(contents, /timeZone:\s*["']America\/Edmonton["']/);
    assert.doesNotMatch(contents, /\b\d{1,2}:\d{2}\s*(?:AM|PM)\s*UTC\b/i);
    if (/timeZone:\s*["']UTC["']/.test(contents)) {
      fixedUtcPaths.add(path);
    }
  }

  assert.deepEqual(
    [...fixedUtcPaths].sort(),
    [
      "app/staking/stakers/[slug]/StakerLedgerPanel.tsx",
      "components/observatory/PremiumTimeSeriesChart.tsx",
    ]
  );
});

test("fixed-zone APIs preserve raw ISO instants for browser-side rendering", () => {
  const stakingActivityApi = source("app/api/staking/activity/route.ts");
  const roadmap = source("lib/siteRoadmapContent.ts");

  assert.doesNotMatch(stakingActivityApi, /formatPublicBountyTime/);
  assert.match(stakingActivityApi, /timestampLabel:\s*occurredAt/);
  assert.match(roadmap, /new Date\(\)\.toISOString\(\)/);
});

test("signed-in accounts receive the browser-local default migration once per account", () => {
  const timeDisplay = source("lib/timeDisplay.ts");
  const appearance = source("components/lobby/LobbyAppearanceContext.tsx");

  assert.match(timeDisplay, /needsAccountTimeDisplayDefaultMigration/);
  assert.match(timeDisplay, /ACCOUNT_TIME_DISPLAY_DEFAULT_VERSION_KEY/);
  assert.match(appearance, /preference\.timeDisplayMode === "utc"/);
  assert.match(appearance, /markAccountTimeDisplayDefaultMigration/);
});
