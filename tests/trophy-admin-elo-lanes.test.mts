import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const command = readFileSync(
  new URL("../components/admin/trophies/TrophyCommandCenter.tsx", import.meta.url),
  "utf8",
);
const actions = readFileSync(
  new URL("../lib/trophies/actions.ts", import.meta.url),
  "utf8",
);

test("Trophy Command creates lane-specific RM and DM ELO definitions", () => {
  assert.match(
    command,
    /const \[eloLane, setEloLane\] = useState<"rm" \| "dm">\("rm"\)/,
  );
  assert.match(command, /ELO lane/);
  assert.match(command, /RM · Random Map/);
  assert.match(command, /DM · Death Match/);
  assert.match(command, /\$\{eloLane\.toUpperCase\(\)\} ELO/);
});

test("out-of-band holder assignment remains an explicit commissioner override", () => {
  assert.match(command, /Record an explicit eligibility override/);
  assert.match(command, /eligibilityOverride: override/);
});


test("server canonicalizes ELO creation by lane and division and rejects semantic duplicates", () => {
  assert.match(actions, /eloTrophyIdentity/);
  assert.match(actions, /eloIdentity\?\.canonicalId \?\? requestedTrophyKey/);
  assert.match(actions, /existingEloTrophies/);
  assert.match(actions, /identity\?\.canonicalId === eloIdentity\.canonicalId/);
});
