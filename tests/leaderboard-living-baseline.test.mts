import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function source(path: string) {
  return readFileSync(
    join(root, path),
    "utf8",
  );
}

test("public leaderboard no longer exposes Basic census UI", () => {
  const page = source(
    "components/leaderboard/ModernLeaderboardPage.tsx",
  );

  for (const forbidden of [
    "IdentityMetric",
    "IdentityCensus",
    "identityCensus",
    "24hr Rank Pulse",
    "Make the ladder move.",
    "Replay-backed Steam IDs",
  ]) {
    assert.equal(
      page.includes(forbidden),
      false,
      `stale public Basic UI/plumbing survived: ${forbidden}`,
    );
  }
});

test("Basic and Advanced share the frozen classic presentation", () => {
  const page = source(
    "components/leaderboard/ModernLeaderboardPage.tsx",
  );

  assert.equal(
    (
      page.match(
        /<LeaderboardWatcherCard compact \/>/g,
      ) ?? []
    ).length,
    1,
  );

  assert.equal(
    (
      page.match(
        /<ModernLeaderboardTable/g,
      ) ?? []
    ).length,
    1,
  );

  assert.match(
    page,
    /data-classic-leaderboard-table/,
  );

  assert.doesNotMatch(
    page,
    /const isAdvanced/,
  );
});

test("Basic has breathing room while Advanced stays at 90rem", () => {
  const css = source(
    "app/globals.css",
  );

  assert.match(
    css,
    /data-leaderboard-view="basic"[\s\S]*76rem/,
  );

  assert.match(
    css,
    /\[data-classic-leaderboard-table\][\s\S]*padding-right:\s*1\.75rem/,
  );

  assert.match(
    css,
    /data-leaderboard-view="advanced"[\s\S]*90rem/,
  );
});

test("Extreme owns a dedicated Living Leaderboard tree", () => {
  const page = source(
    "components/leaderboard/ModernLeaderboardPage.tsx",
  );

  const living = source(
    "components/leaderboard/LivingLeaderboard.tsx",
  );

  const table = source(
    "components/leaderboard/LivingLeaderboardTable.tsx",
  );

  const preferenceHook = source(
    "components/leaderboard/useLivingLeaderboardPreferences.ts",
  );

  assert.match(
    page,
    /if \(isExtreme\) \{[\s\S]*<LivingLeaderboard/,
  );

  assert.match(
    living,
    /<LivingLeaderboardTable/,
  );

  assert.match(
    living,
    /<LeaderboardWatcherCard \/>/,
  );

  assert.match(
    living,
    /bookmarkedPlayerKeys/,
  );

  assert.match(
    preferenceHook,
    /aoe2war:living-leaderboard:preferences:v2/,
  );

  assert.match(
    preferenceHook,
    /\/api\/user\/leaderboard-preferences/,
  );

  assert.match(
    living,
    /rank_change_24h/,
  );

  assert.match(
    living,
    /pulseActive/,
  );

  assert.match(
    table,
    /WarriorExpansion/,
  );

  assert.match(
    table,
    /rankDelta24hState/,
  );
});

test("Living presentation does not add network work to the base board", () => {
  const living = source(
    "components/leaderboard/LivingLeaderboard.tsx",
  );

  const table = source(
    "components/leaderboard/LivingLeaderboardTable.tsx",
  );

  assert.doesNotMatch(
    living,
    /\bfetch\s*\(/,
  );

  assert.doesNotMatch(
    table,
    /\bfetch\s*\(/,
  );

  assert.doesNotMatch(
    living,
    /\/api\//,
  );

  assert.doesNotMatch(
    table,
    /\/api\//,
  );
});

test("Extreme remains the leaderboard default", () => {
  const preferences = source(
    "lib/tileViewPreferences.ts",
  );

  assert.match(
    preferences,
    /leaderboard:\s*"extreme"/,
  );

  assert.doesNotMatch(
    preferences,
    /leaderboard:\s*"advanced"/,
  );
});

test("product contract freezes Classic and assigns Living interaction to E", () => {
  const contract = source(
    "docs/LEADERBOARD_VIEW_MODES.md",
  );

  assert.match(
    contract,
    /Basic and Advanced are preserved reference surfaces/,
  );

  assert.match(
    contract,
    /Extreme exclusively owns Living Leaderboard/,
  );

  assert.match(
    contract,
    /no additional base-board network request/,
  );

  assert.match(
    contract,
    /deep warrior intelligence must not inflate the base-board payload/,
  );
});
