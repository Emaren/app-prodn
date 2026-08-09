import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  selectReplayParserRecoveryBatch,
  selectRecurrentReplayRecoveryBatch,
  type ReplayRecoveryGapCandidate,
} from "../lib/replayRecoveryBatch.ts";

const recoveryRouteSource = readFileSync(
  new URL("../app/api/admin/replay-auto-recovery/route.ts", import.meta.url),
  "utf8"
);

function identityGap(id: number): ReplayRecoveryGapCandidate {
  return {
    id,
    missingIdentityProjection: true,
    missingAcceptedResult: true,
    staleIdentityResultProjection: false,
  };
}

function resultGap(id: number): ReplayRecoveryGapCandidate {
  return {
    id,
    missingIdentityProjection: false,
    missingAcceptedResult: true,
    staleIdentityResultProjection: false,
  };
}

function staleProjection(id: number): ReplayRecoveryGapCandidate {
  return {
    id,
    missingIdentityProjection: false,
    missingAcceptedResult: false,
    staleIdentityResultProjection: true,
  };
}

test("permanently skipped identity gaps cannot starve older identity rows", () => {
  const candidates = Array.from({ length: 20 }, (_entry, index) =>
    identityGap(index + 1)
  );
  const seen = new Set<number>();

  for (let minuteBucket = 0; minuteBucket < 20; minuteBucket += 1) {
    const selected = selectRecurrentReplayRecoveryBatch({
      candidates,
      batchSize: 4,
      targetGameStatsId: null,
      minuteBucket,
    });
    assert.equal(selected.length, 4);
    selected.forEach((candidate) => seen.add(candidate.id));
  }

  assert.deepEqual(
    [...seen].sort((left, right) => left - right),
    candidates.map((candidate) => candidate.id)
  );
});

test("a permanently failing newest parser candidate cannot starve older rows", () => {
  const candidates = Array.from(
    { length: 160 },
    (_entry, index) => ({ id: index + 1 })
  );
  const seen = new Set<number>();

  for (let minuteBucket = 0; minuteBucket < 160; minuteBucket += 1) {
    const selected = selectReplayParserRecoveryBatch({
      candidates,
      batchSize: 1,
      targetGameStatsId: null,
      minuteBucket,
    });
    assert.equal(selected.length, 1);
    selected.forEach((candidate) => seen.add(candidate.id));
  }

  assert.equal(seen.size, candidates.length);
  assert.ok(seen.has(101));
  assert.ok(seen.has(160));

  const queryStart = recoveryRouteSource.indexOf(
    "const candidates"
  );
  const queryEnd = recoveryRouteSource.indexOf(
    "const eligible",
    queryStart
  );
  assert.ok(queryStart >= 0 && queryEnd > queryStart);
  const parserQuery = recoveryRouteSource.slice(queryStart, queryEnd);
  assert.doesNotMatch(parserQuery, /LIMIT\s+100/);
  assert.match(
    recoveryRouteSource,
    /selectReplayParserRecoveryBatch/
  );
  assert.match(
    recoveryRouteSource,
    /candidateRotation:\s*true/
  );
});

test("recurrent recovery traverses candidates beyond the former 100-row horizon", () => {
  const candidates = Array.from({ length: 160 }, (_entry, index) =>
    identityGap(index + 1)
  );
  const seen = new Set<number>();

  for (let minuteBucket = 0; minuteBucket < 20; minuteBucket += 1) {
    selectRecurrentReplayRecoveryBatch({
      candidates,
      batchSize: 8,
      targetGameStatsId: null,
      minuteBucket,
    }).forEach((candidate) => seen.add(candidate.id));
  }

  assert.equal(seen.size, candidates.length);
  assert.ok(seen.has(101));
  assert.ok(seen.has(160));

  const queryStart = recoveryRouteSource.indexOf(
    "const reconciliationCandidates"
  );
  const queryEnd = recoveryRouteSource.indexOf(
    "const reconciliationEligible",
    queryStart
  );
  assert.ok(queryStart >= 0 && queryEnd > queryStart);
  assert.doesNotMatch(
    recoveryRouteSource.slice(queryStart, queryEnd),
    /LIMIT\s+100/
  );
  assert.match(
    recoveryRouteSource,
    /candidateHorizon:\s*"complete_configured_lookback"/
  );
});

test("mixed batches prioritize identity while both lanes make progress", () => {
  const identities = Array.from({ length: 24 }, (_entry, index) =>
    identityGap(index + 1)
  );
  const results = Array.from({ length: 12 }, (_entry, index) =>
    resultGap(index + 101)
  );
  const seenIdentities = new Set<number>();
  const seenResults = new Set<number>();

  for (let minuteBucket = 0; minuteBucket < 24; minuteBucket += 1) {
    const selected = selectRecurrentReplayRecoveryBatch({
      candidates: [...identities, ...results],
      batchSize: 8,
      targetGameStatsId: null,
      minuteBucket,
    });
    const identityCount = selected.filter(
      (candidate) => candidate.missingIdentityProjection
    ).length;
    const resultCount = selected.length - identityCount;

    assert.equal(selected.length, 8);
    assert.equal(identityCount, 6);
    assert.equal(resultCount, 2);
    selected.forEach((candidate) => {
      if (candidate.missingIdentityProjection) {
        seenIdentities.add(candidate.id);
      } else {
        seenResults.add(candidate.id);
      }
    });
  }

  assert.equal(seenIdentities.size, identities.length);
  assert.equal(seenResults.size, results.length);
});

test("one-slot 3:1 scheduling rotates within both lanes", () => {
  const identities = Array.from({ length: 8 }, (_entry, index) =>
    identityGap(index + 1)
  );
  const results = Array.from({ length: 4 }, (_entry, index) =>
    resultGap(index + 101)
  );
  const seenIdentities = new Set<number>();
  const seenResults = new Set<number>();

  for (let minuteBucket = 0; minuteBucket < 32; minuteBucket += 1) {
    const [selected] = selectRecurrentReplayRecoveryBatch({
      candidates: [...identities, ...results],
      batchSize: 1,
      targetGameStatsId: null,
      minuteBucket,
    });
    assert.ok(selected);
    if (selected.missingIdentityProjection) {
      seenIdentities.add(selected.id);
    } else {
      seenResults.add(selected.id);
    }
  }

  assert.equal(seenIdentities.size, identities.length);
  assert.equal(seenResults.size, results.length);
});

test("a stale unresolved projection stays in the identity-priority lane", () => {
  const selected = selectRecurrentReplayRecoveryBatch({
    candidates: [resultGap(1), staleProjection(2)],
    batchSize: 1,
    targetGameStatsId: null,
    minuteBucket: 0,
  });

  assert.deepEqual(selected.map((candidate) => candidate.id), [2]);
});

test("an exact target bypasses rotation and quota allocation", () => {
  const candidates = [identityGap(1), resultGap(2), identityGap(3)];

  assert.deepEqual(
    selectRecurrentReplayRecoveryBatch({
      candidates,
      batchSize: 1,
      targetGameStatsId: 3,
      minuteBucket: 999,
    }).map((candidate) => candidate.id),
    [3]
  );
});
