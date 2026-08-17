import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  "lib/kingdomKnowledgeRouter.ts",
  "utf8",
);

function targetedIdentityResolver() {
  const start = source.indexOf(
    "async function resolveTargetedPairArchiveProfileIdentity(",
  );
  const end = source.indexOf(
    "\nasync function loadTargetedPairProfileMatchPage(",
    start,
  );

  assert.notEqual(start, -1);
  assert.notEqual(end, -1);

  return source.slice(start, end);
}

test("production targeted pair identity resolves unique current claimed names before the full directory", () => {
  const resolver = targetedIdentityResolver();

  const claimedLookup = resolver.indexOf(
    "findUniqueClaimedUserForReplayName(",
  );
  const directoryFallback = resolver.indexOf(
    "loadPublicPlayerDirectory(",
  );

  assert.notEqual(claimedLookup, -1);
  assert.notEqual(directoryFallback, -1);
  assert.ok(claimedLookup < directoryFallback);

  assert.match(
    resolver,
    /if \(claimedUser\) \{[\s\S]*?kind:\s*"claimed"[\s\S]*?uid:\s*claimedUser\.uid/,
  );
});

test("historical and replay aliases retain the accepted public-directory fallback", () => {
  const resolver = targetedIdentityResolver();

  assert.match(
    resolver,
    /loadPublicPlayerDirectory\([\s\S]*?resolveExactPairArchiveIdentityFromEntries\([\s\S]*?directory\.allEntries/,
  );
});

test("shadow targeted pair identity keeps the canonical public leaderboard resolver", () => {
  const resolver = targetedIdentityResolver();

  assert.match(
    resolver,
    /if \(isShadowMode\(\)\)[\s\S]*?\/api\/lobby\/leaderboard\?limit=40&q=\$\{encodeURIComponent\(queryPlayer\)\}[\s\S]*?resolveExactPairArchiveIdentityFromEntries/,
  );
});
