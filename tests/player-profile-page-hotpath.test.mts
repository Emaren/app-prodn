import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const profile = readFileSync("lib/playerProfile.ts", "utf8");
const directoryPage = readFileSync("app/players/page.tsx", "utf8");
const academyPage = readFileSync("app/academy/page.tsx", "utf8");
const zodiacPage = readFileSync("app/zodiac/page.tsx", "utf8");

test("claimed exact-Steam profiles bypass the full public directory", () => {
  const start = profile.indexOf("export async function loadClaimedPlayerProfile(");
  const end = profile.indexOf("\nexport async function loadReplayPlayerProfile(", start);
  const loader = profile.slice(start, end);

  assert.match(loader, /const exactSteamPlayer\s*=\s*buildExactSteamClaimedPlayer\(user\)/);
  assert.match(
    loader,
    /const directoryEntry = exactSteamPlayer[\s\S]*?\? null[\s\S]*?: await resolveProfileDirectoryIdentity/,
  );
  assert.match(loader, /const currentPlayer\s*=\s*exactSteamPlayer \?\?/);
});

test("Academy and Zodiac use the lightweight claimed-player preview rail", () => {
  assert.match(
    profile,
    /export async function loadClaimedPlayerPreview\([\s\S]*?loadCandidateFinalGames\([\s\S]*?buildMatchFeed\(/,
  );
  assert.doesNotMatch(
    profile.slice(
      profile.indexOf("export async function loadClaimedPlayerPreview("),
      profile.indexOf("export async function loadClaimedPlayerProfile("),
    ),
    /loadWoloStats|loadWatcherStats|loadStreamStats|buildRivalSummaries|loadUserCommunitySummaries/,
  );
  assert.match(academyPage, /loadClaimedPlayerPreview\([\s\S]*?,\s*1\s*\)/);
  assert.doesNotMatch(academyPage, /loadClaimedPlayerProfile/);
  assert.match(zodiacPage, /loadClaimedPlayerPreview\([\s\S]*?,\s*6\s*\)/);
  assert.doesNotMatch(zodiacPage, /loadClaimedPlayerProfile/);
});

test("the player directory preserves its generation-before-corpus watermark", () => {
  assert.match(
    directoryPage,
    /const \[initialGeneration, presence\] = await Promise\.all\(\[[\s\S]*?loadPublicReplayGeneration\(prisma\)[\s\S]*?loadPublicPresenceSnapshot\(prisma\)[\s\S]*?const directory = await loadPublicPlayerDirectoryFresh\(prisma\)/,
  );
  assert.ok(
    directoryPage.indexOf("await loadPublicReplayGeneration(prisma)") <
      directoryPage.indexOf("loadPublicPlayerDirectoryFresh(prisma)"),
    "the replay generation watermark must be captured before the fresh corpus read starts",
  );
});
