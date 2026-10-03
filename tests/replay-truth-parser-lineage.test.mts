import assert from "node:assert/strict";
import test from "node:test";

import { gameIdsWithExactParserArtifactAttempt } from "../lib/replayTruthParserLineage.ts";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);

test("exact parser attempts are inherited by every GameStats row bound to the same immutable replay SHA", () => {
  const ids = gameIdsWithExactParserArtifactAttempt(
    [
      { id: 10, replayHash: HASH_A },
      { id: 11, replayHash: HASH_A },
      { id: 12, replayHash: HASH_B },
      { id: 13, replayHash: HASH_C.toUpperCase() },
      { id: 14, replayHash: "not-a-sha" },
    ],
    [
      { inputHash: HASH_A },
      { inputHash: HASH_C },
      { inputHash: null },
      { inputHash: "invalid" },
    ],
  );

  assert.deepEqual([...ids].sort((a, b) => a - b), [10, 11, 13]);
  assert.equal(ids.has(12), false);
  assert.equal(ids.has(14), false);
});

test("an empty parser-attempt set leaves every valid replay eligible for a future parser attempt", () => {
  const ids = gameIdsWithExactParserArtifactAttempt(
    [
      { id: 20, replayHash: HASH_A },
      { id: 21, replayHash: HASH_B },
    ],
    [],
  );

  assert.deepEqual([...ids], []);
});
