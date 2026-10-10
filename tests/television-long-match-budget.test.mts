import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { estimateTelevisionRecordingBudget } from "../lib/televisionCapacityPlan.ts";

test("reviewed 1.6.4 Stable 720p default supports two hours without exhausting per-stream caps",()=>{
  const plan=estimateTelevisionRecordingBudget();
  assert.equal(plan.configured,true);
  assert.ok(plan.perStreamByteLimit>=2*1024**3);
  assert.ok(plan.perStreamChunkLimit>=12_000);
  const stable=plan.profiles.find(x=>x.key==="stable");
  assert.ok(stable);
  assert.equal(stable?.twoHourCandidate,true);
  assert.ok((stable?.estimatedMinutes??0)>=120);
});
test("two-hour video modes reveal the real byte-versus-chunk limiting factor",()=>{
  const x=estimateTelevisionRecordingBudget();
  const modes=Object.fromEntries(x.profiles.map(p=>[p.key,p]));
  // Under the 12,000-slice cap, low-bitrate modes can both hit 200 minutes.
  // A higher bitrate never improves the recording budget, but a tie is valid.
  assert.ok(modes.stable.estimatedMinutes>=modes.screen.estimatedMinutes);
  assert.ok(modes.screen.estimatedMinutes>=modes.sharp.estimatedMinutes);
  assert.ok(modes.sharp.estimatedBytesForTwoHours>modes.stable.estimatedBytesForTwoHours);
  assert.equal(modes.stable.limitingFactor,"chunks");
  assert.equal(modes.screen.limitingFactor,"chunks");
  assert.equal(modes.sharp.limitingFactor,"bytes");
});
test("custom small stream limits produce honest insufficient-duration warning",()=>{
  const x=estimateTelevisionRecordingBudget(128*1024*1024,2000);
  assert.ok(x.profiles.every(p=>!p.twoHourCandidate));
  assert.equal(x.profiles[0].limitingFactor,"bytes");
});
test("operator receives actual live caps and does not promise Windows capture certification",()=>{
  const route=readFileSync("app/api/admin/video-vault/route.ts","utf8");
  const ui=readFileSync("components/admin/VideoVaultDashboard.tsx","utf8");
  const store=readFileSync("lib/streamStorage.ts","utf8");
  assert.match(route,/estimateTelevisionRecordingBudget\(\)/);
  assert.match(ui,/Actual encoding, upload loss, and capture duration/);
  assert.match(ui,/installed Windows canary/);
  assert.match(store,/STREAM_MIN_FREE_BYTES/);
  assert.match(store,/getStreamVolumeHeadroom/);
  assert.doesNotMatch(route,/settleWolo|winnerProof.*update/);
});
