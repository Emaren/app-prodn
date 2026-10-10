import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  videoCapacityForecast,TV_PLANNING_BITRATE_BITS_PER_SECOND,
} from "../lib/televisionCapacityForecast.ts";

const GiB=1024*1024*1024;
test("512MiB default stream cap does not silently claim to support two hours",()=>{
  const r=videoCapacityForecast({
    perStreamLimitBytes:512*1024*1024,
    writableVolumeBytes:80*GiB,
  });
  assert.equal(r.cameras,2);
  assert.equal(r.minutes,120);
  assert.equal(r.enoughPerStream,false);
  assert.equal(r.readyToPlan,false);
  assert.ok(r.maxPerCameraMinutes>35&&r.maxPerCameraMinutes<60);
  assert.ok(r.estimatedPerCameraBytes>GiB);
});
test("2GiB camera cap and good mounted volume passes estimate but never certifies playback",()=>{
  const r=videoCapacityForecast({
    perStreamLimitBytes:2*GiB,writableVolumeBytes:50*GiB,
  });
  assert.equal(r.readyToPlan,true);
  assert.equal(r.enoughPerStream,true);
  assert.equal(r.enoughVolume,true);
  assert.match(r.warning,/performance is still unverified/);
  assert.equal(r.planningBitrateMbps,1.4);
});
test("unverified or limited disk headroom always blocks capacity readiness",()=>{
  const a=videoCapacityForecast({perStreamLimitBytes:2*GiB,writableVolumeBytes:null});
  assert.equal(a.volumeKnown,false);
  assert.equal(a.readyToPlan,false);
  const b=videoCapacityForecast({perStreamLimitBytes:2*GiB,writableVolumeBytes:GiB});
  assert.equal(b.enoughVolume,false);
  assert.equal(b.readyToPlan,false);
});
test("16-camera and extreme input projections remain finite and bounded",()=>{
  const r=videoCapacityForecast({
    perStreamLimitBytes:2*GiB,writableVolumeBytes:100*GiB,cameraCount:999,targetMinutes:9999,
  });
  assert.equal(r.cameras,16);
  assert.equal(r.minutes,240);
  assert.ok(Number.isSafeInteger(r.estimatedTotalBytes));
  assert.equal(TV_PLANNING_BITRATE_BITS_PER_SECOND,1_400_000);
});
test("operator preflight is read-only and never changes video stream limits",()=>{
  const src=readFileSync("lib/televisionCapacityForecast.ts","utf8");
  const ui=readFileSync("components/admin/VideoVaultDashboard.tsx","utf8");
  assert.match(ui,/videoCapacityForecast/);
  assert.match(ui,/Actual game capture/);
  assert.match(ui,/Verify the mounted media volume/);
  assert.doesNotMatch(src,/updateMany|\$executeRaw|removeStreamChunks|process.env\.[A-Z]+\s*=/);
});
