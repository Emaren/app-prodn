import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mayPublishLeaderboardRefresh as allowed } from "../lib/leaderboardRefreshFence.ts";

test("late old server projection cannot overwrite newer accepted rankings", () => {
  assert.equal(allowed({ requestEpoch: 0, currentEpoch: 0, requestSequence: 2, acceptedSequence: 3 }), false);
  assert.equal(allowed({ requestEpoch: 0, currentEpoch: 0, requestSequence: 3, acceptedSequence: 2 }), true);
  assert.equal(allowed({ requestEpoch: 0, currentEpoch: 0, requestSequence: 2, acceptedSequence: null }), true);
});

test("explicit invalidation fences every in-flight older refresh", () => {
  assert.equal(allowed({ requestEpoch: 4, currentEpoch: 5, requestSequence: 99, acceptedSequence: null }), false);
  assert.equal(allowed({ requestEpoch: 5, currentEpoch: 5, requestSequence: 100, acceptedSequence: null }), true);
  assert.equal(allowed({ requestEpoch: 5, currentEpoch: 5, requestSequence: 101, acceptedSequence: 100 }), true);
  for(const serial of [NaN, 0, -1, Infinity, 1.5]){
    assert.equal(allowed({ requestEpoch: 5, currentEpoch: 5, requestSequence: serial, acceptedSequence: null }), false);
  }
});

test("the real server cache applies the fence before insertion, not after", () => {
  const source = readFileSync(new URL("../lib/lobbyLeaderboard.ts", import.meta.url), "utf8");
  assert.match(source, /const refreshEpoch = leaderboardGameCorpusEpoch/);
  assert.match(source, /const refreshSequence = \+\+leaderboardRefreshSequence/);
  assert.match(source, /if \(!mayPublishLeaderboardRefresh\(/);
  assert.match(source, /currentEpoch: leaderboardGameCorpusEpoch/);
  assert.match(source, /acceptedSequence: leaderboardCache\.get\(cacheKey\)\?\.refreshSequence/);
  assert.match(source, /refreshSequence,\s*value,/);
  assert.match(source, /leaderboardGameCorpusEpoch \+= 1/);
});
