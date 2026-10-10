import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { estimateTelevisionRecordingBudget } from "../lib/televisionCapacityPlan.ts";
import { streamCapacityAdmission, MAX_STREAM_BYTES, MAX_STREAM_CHUNKS, STREAM_MIN_FREE_BYTES } from "../lib/streamStorage.ts";

test("every 1.6.4 video mode has estimated two-hour admission capacity, with storage reserve intact", () => {
  const plan = estimateTelevisionRecordingBudget();
  assert.ok(MAX_STREAM_BYTES >= 3 * 1024 ** 3);
  assert.ok(MAX_STREAM_CHUNKS >= 7200);
  assert.deepEqual(plan.profiles.map(p => p.key), ["stable", "screen", "sharp"]);
  for (const mode of plan.profiles) {
    assert.equal(mode.twoHourCandidate, true, mode.key + " should fit a two-hour estimate");
    assert.ok(mode.estimatedBytesForTwoHours <= MAX_STREAM_BYTES, mode.key);
    assert.ok(mode.estimatedMinutes >= 120, mode.key);
  }
  assert.ok(STREAM_MIN_FREE_BYTES >= 1024 ** 3);
  assert.equal(streamCapacityAdmission(STREAM_MIN_FREE_BYTES, 1).allowed, false);
  assert.equal(estimateTelevisionRecordingBudget(512 * 1024 ** 2, 4000).profiles.at(-1)?.twoHourCandidate, false);
});

test("physical media limit is bounded, not a blanket VPS disk expansion", () => {
  const storage = readFileSync("lib/streamStorage.ts", "utf8");
  assert.match(storage, /3 \* 1024 \* 1024 \* 1024/);
  assert.match(storage, /4 \* 1024 \* 1024 \* 1024/);
  assert.match(storage, /await getStreamVolumeHeadroom\(\)/);
  assert.match(storage, /streamCapacityAdmission\(freeBytes, data.byteLength\)/);
  assert.match(storage, /STREAM_STORAGE_ROOT/);
});

test("database failures never announce an empty live feed list", () => {
  const api = readFileSync("app/api/watch-streams/route.ts", "utf8");
  assert.match(api, /if \(retainedRows === null\)/);
  assert.match(api, /if \(streams === null\)/);
  assert.match(api, /status: 503/);
  assert.match(api, /no-store/);
});

test("live TV polls only after Play, preserves cameras and aborts stale-session requests", () => {
  const tv = readFileSync("components/television/TelevisionWoloExperience.tsx", "utf8");
  assert.match(tv, /if \(!playingKey \|\| playingKey !== selectedKey\) return/);
  assert.match(tv, /document.hidden \|\| inFlight/);
  assert.match(tv, /new AbortController\(\)/);
  assert.match(tv, /abort.abort\(\)/);
  assert.match(tv, /lastDirectoryCheck/);
  assert.match(tv, /async function checkFeedsNow\(\)/);
  assert.match(tv, /onClick=\{\(\) => void checkFeedsNow\(\)\}/);
  assert.match(tv, /Video diagnostics/);
  assert.match(tv, /public/i);
  assert.match(tv, /Video stays asleep until you press play/);
  assert.match(tv, /mergeTelevisionStreamEvidence/);
  assert.match(tv, /assignTelevisionCameras/);
});
