import assert from "node:assert/strict";
import test from "node:test";

import {
  videoCapacityPlan,
  videoStorageObservation,
  inspectVideoCapacity,
} from "../scripts/television_video_preflight.mjs";

test("default Television V3 modes fit 2 hours only as a model", () => {
  const plan = videoCapacityPlan({});
  assert.equal(plan.maxChunks, 12_000);
  assert.equal(plan.maxBytes, 3 * 1024 ** 3);
  assert.equal(plan.reserveBytes, 6 * 1024 ** 3);
  assert.equal(plan.modes.length, 3);
  assert.ok(plan.modes.every((mode) => mode.fitsOwnCaps));
  assert.equal(plan.modes.find((mode) => mode.mode === "Sharp")?.projectedChunks, 7_201);
});

test("old production-equivalent ceilings fail long-game projection", () => {
  const plan = videoCapacityPlan({
    AOE2_STREAM_MAX_CHUNKS: "4000",
    AOE2_STREAM_MAX_BYTES: String(512 * 1024 * 1024),
  });
  assert.ok(plan.modes.every((mode) => !mode.fitsOwnCaps));
});

test("invalid env overrides cannot inflate or disable the safe config", () => {
  const plan = videoCapacityPlan({
    AOE2_STREAM_MAX_CHUNKS: "100000000",
    AOE2_STREAM_MAX_BYTES: "-1",
    AOE2_STREAM_MIN_FREE_BYTES: "0",
  });
  assert.equal(plan.maxChunks, 12_000);
  assert.equal(plan.maxBytes, 3 * 1024 ** 3);
  assert.equal(plan.reserveBytes, 6 * 1024 ** 3);
});

test("missing storage declaration cannot become a false green", async () => {
  const location = await videoStorageObservation({});
  assert.equal(location.state, "unknown");
  assert.equal(location.reason, "video_storage_not_configured");
  const result = await inspectVideoCapacity({});
  assert.equal(result.overall, "unknown");
  assert.equal(result.fieldProof, "not_measured");
  assert.equal(result.schema, "aoe2war-television-video-preflight/v1");
});

test("missing mount remains blocked; preflight does not create directories", async () => {
  const env = { AOE2_VIDEO_CAPTURE_DIR: "/definitely-nonexistent-aoe2war-preflight-test" };
  const result = await inspectVideoCapacity(env);
  assert.equal(result.overall, "blocked");
  assert.equal(result.storage.state, "blocked");
  assert.equal(result.checks.find((x) => x.id === "video_volume_mount")?.state, "blocked");
});
