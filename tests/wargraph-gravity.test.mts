import assert from "node:assert/strict";
import test from "node:test";

import {
  rankWarGraphGravityCandidates,
  type WarGraphGravityCandidate,
} from "../lib/wargraph/gravityContract.ts";

function candidate(
  membershipId: number,
  overrides: Partial<WarGraphGravityCandidate> = {},
): WarGraphGravityCandidate {
  return {
    membershipId,
    membershipPublicId: `00000000-0000-4000-8000-${String(membershipId).padStart(12, "0")}`,
    lastParticipationAt: null,
    verifiedGamesPlayed: 0,
    occupiedAt: new Date("2026-08-01T00:00:00.000Z"),
    lastGravityAt: null,
    ...overrides,
  };
}

const target = {
  nightId: 42,
  targetNodePublicId: "00000000-0000-4000-8000-000000000099",
};

test("Gravity prefers the most recent WarGraph participant", () => {
  const ranked = rankWarGraphGravityCandidates(
    [
      candidate(1, {
        lastParticipationAt: new Date("2026-08-22T02:00:00.000Z"),
      }),
      candidate(2, {
        lastParticipationAt: new Date("2026-08-23T02:00:00.000Z"),
      }),
    ],
    target,
  );
  assert.equal(ranked[0]?.membershipId, 2);
});

test("Gravity then prefers actual verified live games", () => {
  const ranked = rankWarGraphGravityCandidates(
    [candidate(1, { verifiedGamesPlayed: 2 }), candidate(2, { verifiedGamesPlayed: 5 })],
    target,
  );
  assert.equal(ranked[0]?.membershipId, 2);
});

test("Gravity rewards time stranded before repeat promotion", () => {
  const ranked = rankWarGraphGravityCandidates(
    [
      candidate(1, {
        occupiedAt: new Date("2026-08-10T00:00:00.000Z"),
        lastGravityAt: new Date("2026-08-20T00:00:00.000Z"),
      }),
      candidate(2, {
        occupiedAt: new Date("2026-08-01T00:00:00.000Z"),
        lastGravityAt: new Date("2026-08-22T00:00:00.000Z"),
      }),
    ],
    target,
  );
  assert.equal(ranked[0]?.membershipId, 2);

  const equalStranding = rankWarGraphGravityCandidates(
    [
      candidate(1, { lastGravityAt: new Date("2026-08-20T00:00:00.000Z") }),
      candidate(2, { lastGravityAt: null }),
    ],
    target,
  );
  assert.equal(equalStranding[0]?.membershipId, 2);
});

test("Gravity's final tie is deterministic and does not mutate input", () => {
  const input = [candidate(1), candidate(2), candidate(3)];
  const first = rankWarGraphGravityCandidates(input, target).map(
    (item) => item.membershipId,
  );
  const second = rankWarGraphGravityCandidates(input, target).map(
    (item) => item.membershipId,
  );
  assert.deepEqual(first, second);
  assert.deepEqual(input.map((item) => item.membershipId), [1, 2, 3]);
});
