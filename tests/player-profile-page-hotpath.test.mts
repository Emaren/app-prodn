import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const profile = readFileSync("lib/playerProfile.ts", "utf8");
const directoryPage = readFileSync("app/players/page.tsx", "utf8");

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
