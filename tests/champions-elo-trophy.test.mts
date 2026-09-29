import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalEloTrophyId,
  eloTrophyIdentity,
  replayEloLane,
} from "../lib/champions/eloTrophy.ts";

test("RM and DM ELO custody ids are independent", () => {
  assert.equal(canonicalEloTrophyId("rm", "veteran"), "elo-veteran");
  assert.equal(canonicalEloTrophyId("dm", "veteran"), "dm-veteran");
  assert.equal(canonicalEloTrophyId("rm", "legend"), "elo-legend");
  assert.equal(canonicalEloTrophyId("dm", "legend"), "dm-legend");
});

test("legacy generic ELO trophies remain RM by band while explicit DM ids stay DM", () => {
  assert.deepEqual(
    eloTrophyIdentity({
      trophyId: "veteran",
      displayName: "Veteran",
      tier: "ELO",
      eloBandMin: 1500,
      eloBandMax: 1799,
    }),
    {
      lane: "rm",
      division: "veteran",
      canonicalId: "elo-veteran",
    },
  );

  assert.deepEqual(
    eloTrophyIdentity({
      trophyId: "dm-legend",
      displayName: "DM Legend",
      tier: "ELO",
      eloBandMin: 2100,
      eloBandMax: null,
    }),
    {
      lane: "dm",
      division: "legend",
      canonicalId: "dm-legend",
    },
  );
});

test("verified replay game type resolves the title lane without guessing", () => {
  assert.equal(replayEloLane("Random Map"), "rm");
  assert.equal(replayEloLane("RM"), "rm");
  assert.equal(replayEloLane("Death Match"), "dm");
  assert.equal(replayEloLane("Deathmatch"), "dm");
  assert.equal(replayEloLane("Empire Wars"), null);
  assert.equal(replayEloLane(null), null);
});
