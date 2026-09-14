import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  beginReplayUploadMediaPressure,
  currentStreamMediaAdmission,
  evaluateStreamMediaAdmission,
  resetStreamMediaAdmissionForTests,
  STREAM_MEDIA_SHED_CODE,
} from "../lib/streamMediaAdmission.ts";

test("stream media admission stays open without Tier-0 pressure", () => {
  assert.deepEqual(
    evaluateStreamMediaAdmission({ activeReplayUploads: 0, operatorKillSwitch: false }),
    { allow: true, activeReplayUploads: 0, operatorKillSwitch: false },
  );
});

test("active replay upload sheds native video with a terminal bounded retry", () => {
  assert.deepEqual(
    evaluateStreamMediaAdmission({ activeReplayUploads: 2, operatorKillSwitch: false }),
    {
      allow: false,
      terminal: true,
      code: STREAM_MEDIA_SHED_CODE,
      reason: "replay_upload_priority",
      retryAfterSeconds: 15,
      activeReplayUploads: 2,
      operatorKillSwitch: false,
    },
  );
});

test("operator kill switch sheds media without impersonating replay pressure", () => {
  assert.deepEqual(
    evaluateStreamMediaAdmission({ activeReplayUploads: 0, operatorKillSwitch: true }),
    {
      allow: false,
      terminal: true,
      code: STREAM_MEDIA_SHED_CODE,
      reason: "operator_kill_switch",
      retryAfterSeconds: 60,
      activeReplayUploads: 0,
      operatorKillSwitch: true,
    },
  );
});

test("replay pressure lease is reference-counted and release is idempotent", () => {
  const previous = process.env.AOE2_STREAM_MEDIA_KILL_SWITCH;
  delete process.env.AOE2_STREAM_MEDIA_KILL_SWITCH;
  resetStreamMediaAdmissionForTests();
  const releaseA = beginReplayUploadMediaPressure();
  const releaseB = beginReplayUploadMediaPressure();
  assert.equal(currentStreamMediaAdmission().allow, false);
  assert.equal(currentStreamMediaAdmission().activeReplayUploads, 2);
  releaseA();
  releaseA();
  assert.equal(currentStreamMediaAdmission().activeReplayUploads, 1);
  releaseB();
  assert.equal(currentStreamMediaAdmission().allow, true);
  if (previous === undefined) delete process.env.AOE2_STREAM_MEDIA_KILL_SWITCH;
  else process.env.AOE2_STREAM_MEDIA_KILL_SWITCH = previous;
});

test("native chunk route sheds before body read and records server-owned telemetry", () => {
  const route = readFileSync(
    new URL("../app/api/streams/[streamId]/chunks/route.ts", import.meta.url),
    "utf8",
  );
  const admissionOffset = route.indexOf("currentStreamMediaAdmission()");
  const bodyOffset = route.indexOf("request.arrayBuffer()");
  assert.ok(admissionOffset >= 0 && admissionOffset < bodyOffset);
  assert.match(route, /stream\.sourceType === "watcher_native"/);
  assert.match(route, /eventType: "stream_media_shed"/);
  assert.match(route, /authority: "server_media_admission"/);
  assert.match(route, /code: admission\.code/);
  assert.match(route, /status: 409/);
  assert.match(route, /"Retry-After"/);
  assert.match(route, /status: "ended"/);
});

test("replay proxy owns the media-pressure lease only while upload is in flight", () => {
  const route = readFileSync(
    new URL("../app/api/replay/upload/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(route, /withReplayUploadMediaPressure\(\(\) =>/);
  assert.match(route, /fetch\(`\$\{base\}\/api\/replay\/upload`, init\)/);
});

test("server shed event is stored but cannot be forged through client-event ingress", () => {
  const telemetry = readFileSync(new URL("../lib/watcherTelemetry.ts", import.meta.url), "utf8");
  const ingress = readFileSync(new URL("../app/api/streams/client-event/route.ts", import.meta.url), "utf8");
  const funnel = readFileSync(new URL("../lib/watcherFunnel.ts", import.meta.url), "utf8");
  assert.match(telemetry, /"stream_media_shed"/);
  assert.doesNotMatch(ingress, /"stream_media_shed"/);
  assert.match(funnel, /"stream_media_shed"/);
});
