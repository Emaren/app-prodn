import assert from "node:assert/strict";
import test from "node:test";

import {
  warGraphFossilizationInternals,
  warGraphFossilizationStage,
} from "../lib/wargraph/fossilizationContract.ts";

test("fossilization follows the constitutional dormant-night bands", () => {
  assert.deepEqual(
    [0, 1, 2, 3, 4, 5, 6, 7, 13, 14, 40].map(warGraphFossilizationStage),
    [0, 1, 2, 3, 4, 4, 4, 5, 5, 6, 6],
  );
});

test("WarGraph visit, Watcher proof, or battle participation awakens a node", () => {
  const opensAt = new Date("2026-08-24T23:00:00.000Z");
  const closesAt = new Date("2026-08-25T23:00:00.000Z");
  const active = new Date("2026-08-25T12:00:00.000Z");
  const blank = {
    lastParticipationAt: null,
    presence: { graphSeenAt: null, watcherSeenAt: null },
  };
  assert.equal(
    warGraphFossilizationInternals.participatedDuringWarGraphDay(
      blank,
      opensAt,
      closesAt,
    ),
    false,
  );
  for (const membership of [
    { ...blank, lastParticipationAt: active },
    { ...blank, presence: { graphSeenAt: active, watcherSeenAt: null } },
    { ...blank, presence: { graphSeenAt: null, watcherSeenAt: active } },
  ]) {
    assert.equal(
      warGraphFossilizationInternals.participatedDuringWarGraphDay(
        membership,
        opensAt,
        closesAt,
      ),
      true,
    );
  }
});

test("participation boundaries are half-open", () => {
  const opensAt = new Date("2026-08-24T23:00:00.000Z");
  const closesAt = new Date("2026-08-25T23:00:00.000Z");
  assert.equal(
    warGraphFossilizationInternals.participatedDuringWarGraphDay(
      {
        lastParticipationAt: closesAt,
        presence: { graphSeenAt: null, watcherSeenAt: null },
      },
      opensAt,
      closesAt,
    ),
    false,
  );
});
