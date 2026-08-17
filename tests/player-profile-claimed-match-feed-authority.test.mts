import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  "lib/playerProfile.ts",
  "utf8",
);

function resolverSource() {
  const start = source.indexOf(
    "async function resolveMatchFeedIdentity(",
  );
  const end = source.indexOf(
    "\nexport async function loadPlayerProfileMatchPage(",
    start,
  );

  assert.notEqual(start, -1);
  assert.notEqual(end, -1);

  return source.slice(start, end);
}

test("claimed exact-Steam match feeds bypass full public directory resolution", () => {
  const resolver = resolverSource();

  assert.match(
    source,
    /function buildExactSteamClaimedMatchFeedPlayer\([\s\S]*?!currentPlayer\.steamId[\s\S]*?return withProfileAliases/,
  );

  assert.match(
    resolver,
    /loadClaimedProfileUser\([\s\S]*?buildExactSteamClaimedMatchFeedPlayer\([\s\S]*?if \(exactSteamPlayer\) \{[\s\S]*?return exactSteamPlayer;[\s\S]*?resolveProfileDirectoryIdentity/,
  );
});

test("uniquely claimed replay-name match feeds use the same exact-Steam fast path", () => {
  const resolver = resolverSource();

  assert.match(
    resolver,
    /if \(claimedUser\) \{[\s\S]*?buildExactSteamClaimedMatchFeedPlayer\([\s\S]*?return exactSteamPlayer;[\s\S]*?resolveProfileDirectoryIdentity/,
  );
});

test("directory fallback remains for claimed identities without exact Steam", () => {
  const resolver = resolverSource();

  assert.match(
    resolver,
    /resolveProfileDirectoryIdentity\(/,
  );
});
