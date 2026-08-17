import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const routerSource = readFileSync(
  "lib/kingdomKnowledgeRouter.ts",
  "utf8",
);

function targetedPairSource() {
  const start = routerSource.indexOf(
    "async function loadTargetedPairArchive(",
  );
  const end = routerSource.indexOf(
    "\nasync function loadRivalries",
    start,
  );

  assert.notEqual(
    start,
    -1,
    "targeted pair archive function must exist",
  );
  assert.notEqual(
    end,
    -1,
    "targeted pair archive function must have a stable boundary",
  );

  return routerSource.slice(start, end);
}

test("targeted pair archives resolve canonical player identity before reading matches", () => {
  const source = targetedPairSource();

  assert.match(
    source,
    /resolveTargetedPairArchiveProfileIdentity\([\s\S]*?queryPlayer/,
  );
  assert.match(
    source,
    /loadTargetedPairProfileMatchPage\([\s\S]*?profileIdentity/,
  );
});

test("shadow mode cannot bypass canonical pair identity with a raw replay-name endpoint", () => {
  const source = targetedPairSource();

  assert.doesNotMatch(
    source,
    /const page = isShadowMode\(\)/,
  );
  assert.doesNotMatch(
    source,
    /player-profile\/matches\?kind=replay&name=.*queryPlayer/,
  );
});

test("environment branching lives inside the canonical profile loader only", () => {
  const helperStart = routerSource.indexOf(
    "async function loadTargetedPairProfileMatchPage(",
  );
  const pairStart = routerSource.indexOf(
    "async function loadTargetedPairArchive(",
  );

  assert.notEqual(helperStart, -1);
  assert.notEqual(pairStart, -1);

  const helper = routerSource.slice(
    helperStart,
    pairStart,
  );

  assert.match(
    helper,
    /if \(isShadowMode\(\)\)/,
  );
  assert.match(
    helper,
    /pairArchivePublicMatchPath\(/,
  );
  assert.match(
    helper,
    /loadPlayerProfileMatchPage\(/,
  );
});
