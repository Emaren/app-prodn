import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { projectTrophyChallengeAuthority } from "../lib/trophies/service.ts";

function trophy(overrides: Record<string, unknown> = {}) {
  return {
    trophyId: "usa_champion_belt",
    status: "held",
    currentHolderUserId: 10,
    currentHolderDisplayName: "Holder",
    currentHolderWoloAddress: "wolo1holder",
    guardianHolderUserId: null,
    guardianHolderDisplayName: null,
    guardianHolderWoloAddress: null,
    ...overrides,
  };
}

test("held title admits only the active holder as challenge custody", () => {
  const authority = projectTrophyChallengeAuthority(
    trophy({
      guardianHolderUserId: 99,
      guardianHolderDisplayName: "Inactive Guardian",
      guardianHolderWoloAddress: "wolo1guardian",
    }) as never
  );

  assert.equal(authority.challengeable, true);
  assert.equal(authority.status, "held");
  assert.equal(authority.currentHolderUserId, 10);
  assert.equal(authority.guardianHolderUserId, null);
});

test("vacant title may retain Guardian activation custody", () => {
  const authority = projectTrophyChallengeAuthority(
    trophy({
      status: "vacant",
      currentHolderUserId: null,
      currentHolderDisplayName: null,
      currentHolderWoloAddress: null,
      guardianHolderUserId: 20,
      guardianHolderDisplayName: "Commissioner Guardian",
      guardianHolderWoloAddress: "wolo1guardian",
    }) as never
  );

  assert.equal(authority.challengeable, true);
  assert.equal(authority.status, "vacant");
  assert.equal(authority.currentHolderUserId, null);
  assert.equal(authority.guardianHolderUserId, 20);
});

test("forced-season vacancy erases stale holder custody for challenge authority", () => {
  const authority = projectTrophyChallengeAuthority(
    trophy({
      trophyId: "world_champion",
      status: "held",
      currentHolderUserId: 77,
      currentHolderDisplayName: "Historical Holder",
      currentHolderWoloAddress: "wolo1old",
      guardianHolderUserId: 88,
      guardianHolderDisplayName: "Historical Guardian",
      guardianHolderWoloAddress: "wolo1guard",
    }) as never
  );

  assert.equal(authority.forcedVacant, true);
  assert.equal(authority.challengeable, true);
  assert.equal(authority.status, "vacant");
  assert.equal(authority.currentHolderUserId, null);
  assert.equal(authority.guardianHolderUserId, null);
});

test("paused retired and draft title states are not challengeable", () => {
  for (const status of ["paused", "retired", "draft"]) {
    const authority = projectTrophyChallengeAuthority(
      trophy({ status }) as never
    );
    assert.equal(authority.statusChallengeable, false, status);
    assert.equal(authority.challengeable, false, status);
  }
});

test("malformed challengeable custody fails closed", () => {
  const unlinkedHeld = projectTrophyChallengeAuthority(
    trophy({
      status: "held",
      currentHolderUserId: null,
      currentHolderDisplayName: "Display-only holder",
      currentHolderWoloAddress: null,
    }) as never
  );
  assert.equal(unlinkedHeld.statusChallengeable, true);
  assert.equal(unlinkedHeld.custodyConsistent, false);
  assert.equal(unlinkedHeld.challengeable, false);

  const impossibleVacant = projectTrophyChallengeAuthority(
    trophy({ status: "vacant", currentHolderUserId: 10 }) as never
  );
  assert.equal(impossibleVacant.custodyConsistent, false);
  assert.equal(impossibleVacant.challengeable, false);
});

test("public admin and settlement rails consume the same Trophy authority", () => {
  const route = readFileSync(
    new URL("../app/api/challenges/route.ts", import.meta.url),
    "utf8"
  );
  const actions = readFileSync(
    new URL("../lib/trophies/actions.ts", import.meta.url),
    "utf8"
  );
  const titleState = readFileSync(
    new URL("../lib/champions/titleState.ts", import.meta.url),
    "utf8"
  );

  assert.match(route, /projectTrophyChallengeAuthority\(targetTrophy\)/);
  assert.match(route, /lockTrophyMoneyState\(tx, title\.id\)/);
  assert.match(route, /projectTrophyChallengeAuthority\(liveTitle\)/);
  assert.match(route, /custody or status changed while the challenge was being created/);
  assert.match(actions, /projectTrophyChallengeAuthority\(currentTrophy\)/);
  assert.match(actions, /projectTrophyChallengeAuthority\(trophy\)/);
  assert.match(actions, /TERMINAL_TITLE_CHALLENGE_STATUSES/);
  assert.match(titleState, /: "coming_soon"/);
  assert.match(titleState, /publicStatus === "coming_soon"/);
});
