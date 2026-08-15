import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
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

test("Basic and Advanced preserve the classic composition", () => {
  const page = source(
    "components/leaderboard/ModernLeaderboardPage.tsx",
  );

  assert.equal(
    (page.match(/<LeaderboardWatcherCard compact \/>/g) ?? []).length,
    2,
  );

  assert.equal(
    (page.match(/<LeaderboardScopeToggle/g) ?? []).length,
    1,
  );

  assert.doesNotMatch(
    page,
    /isBasic \? "rounded-none"/,
  );
});

test("Extreme remains a distinct presentation branch", () => {
  const page = source(
    "components/leaderboard/ModernLeaderboardPage.tsx",
  );

  assert.match(
    page,
    /const isExtreme\s*=\s*viewMode === "extreme"/,
  );

  assert.equal(
    (page.match(/<LeaderboardWatcherCard \/>/g) ?? []).length,
    1,
  );
});

test("Extreme is the leaderboard default", () => {
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

test("product contract freezes B and A and reserves E for Living Leaderboard", () => {
  const contract = source(
    "docs/LEADERBOARD_VIEW_MODES.md",
  );

  assert.match(
    contract,
    /Basic and Advanced are preserved reference surfaces/,
  );

  assert.match(
    contract,
    /Extreme exclusively owns future Living Leaderboard/,
  );

  assert.match(
    contract,
    /deep warrior intelligence must not inflate the base-board payload/,
  );
});
