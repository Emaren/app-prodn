import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { planLiveChunkAdvance } from "../lib/continuousVideoPlan.ts";

test("late viewers start from recent clusters, never the full recording", () => {
  const newest = 7_300;
  const availableMediaSeqs = Array.from({ length: 80 }, (_, i) => newest - 79 + i);
  assert.deepEqual(planLiveChunkAdvance({
    lastSeq: -1, newest, recommendedStartSeq: newest - 10,
    availableMediaSeqs, maxCatchup: 36,
  }), { kind: "append", from: newest - 9, through: newest });
});

test("steady viewer appends only new contiguous chunks", () => {
  assert.deepEqual(planLiveChunkAdvance({
    lastSeq: 42, newest: 45, recommendedStartSeq: 30,
    availableMediaSeqs: [39, 40, 41, 42, 43, 44, 45], maxCatchup: 36,
  }), { kind: "append", from: 43, through: 45 });
  assert.equal(planLiveChunkAdvance({
    lastSeq: 45, newest: 45, recommendedStartSeq: 40,
    availableMediaSeqs: [45], maxCatchup: 36,
  }).kind, "wait");
});

test("unbounded viewer lag triggers fallback rather than massive egress", () => {
  assert.deepEqual(planLiveChunkAdvance({
    lastSeq: 100, newest: 500, recommendedStartSeq: 490,
    availableMediaSeqs: [490, 491, 492, 493, 494, 495, 496, 497, 498, 499, 500],
    maxCatchup: 36,
  }), { kind: "fallback", reason: "too-many-chunks" });
});

test("missing middle and expired media are fail-closed, not timestamp-guessing", () => {
  assert.deepEqual(planLiveChunkAdvance({
    lastSeq: 10, newest: 14, recommendedStartSeq: null,
    availableMediaSeqs: [11, 13, 14], maxCatchup: 36,
  }), { kind: "fallback", reason: "gap" });
  assert.deepEqual(planLiveChunkAdvance({
    lastSeq: 10, newest: 14, recommendedStartSeq: null,
    availableMediaSeqs: [12, 13, 14], maxCatchup: 36,
  }), { kind: "fallback", reason: "behind-window" });
  assert.deepEqual(planLiveChunkAdvance({
    lastSeq: 10, newest: 14, recommendedStartSeq: null,
    availableMediaSeqs: [11, 12, 13], maxCatchup: 36,
  }), { kind: "wait", reason: "pending-chunk" });
});

test("MSE is bounded, decoder-first and reverts to existing rolling player", async () => {
  const component = await readFile(
    new URL("../components/streaming/ContinuousWebmPlayer.tsx", import.meta.url), "utf8",
  );
  const wrapper = await readFile(
    new URL("../components/streaming/LiveStreamFrame.tsx", import.meta.url), "utf8",
  );
  assert.match(component, /new MediaSource\(\)/);
  assert.match(component, /mediaSource\.addSourceBuffer\(mime\)/);
  assert.match(component, /await append\(init\)/);
  assert.match(component, /planLiveChunkAdvance/);
  assert.match(component, /MAX_CATCHUP_CHUNKS = 36/);
  assert.match(component, /KEEP_BEHIND_SECONDS = 45/);
  assert.match(component, /if \(networkFailures >= 3\) fail\(\)/);
  assert.match(component, /document\.visibilityState !== "visible"/);
  assert.match(component, /return await response\.arrayBuffer\(\)/);
  assert.doesNotMatch(component, /video\.load\(\);\s*lastSeq =/);
  assert.match(wrapper, /<ContinuousWebmPlayer stream=\{stream\} title=\{title\} onUnsupported=\{disableMse\}/);
  assert.match(wrapper, /<BrowserChunkPlayer stream=\{stream\} title=\{title\} compact=\{compact\}/);
});
