import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const observatory = fs.readFileSync("components/speed/SpeedObservatory.tsx", "utf8");
const e2 = fs.readFileSync("components/speed/SpeedObservatoryE2.tsx", "utf8");
const e2Css = fs.readFileSync("components/speed/SpeedObservatoryE2.module.css", "utf8");
const snapshot = fs.readFileSync("lib/speed/observatorySnapshot.ts", "utf8");

test("Speed provenance is E1/E2 with E2 as the one-time rollout default", () => {
  assert.match(observatory, /type SpeedViewVersion = "e1" \| "e2"/);
  assert.match(observatory, /aoe2hdbets:speed:view-version:v1/);
  assert.match(observatory, /aoe2hdbets:speed:view-version-rollout/);
  assert.match(observatory, /e2-default-v1/);
  assert.match(observatory, /useState<SpeedViewVersion>\("e2"\)/);
  assert.match(observatory, /rollout !== SPEED_VIEW_ROLLOUT_VERSION/);
  assert.match(observatory, /setViewVersion\(saved === "e1" \? "e1" : "e2"\)/);
});

test("E1 preserves the original full-width Extreme observatory", () => {
  assert.match(observatory, /viewVersion === "e1"/);
  assert.match(observatory, /<ExtremeView \{\.\.\.shared\} chart=\{chart\} \/>/);
  assert.match(observatory, /data-speed-view="extreme"/);
  assert.match(observatory, /Session performance field/);
  assert.match(observatory, /Flight recorder/);
});

test("E2 is a real telemetry dashboard rather than explanatory SaaS copy", () => {
  assert.match(e2, /data-speed-view="e2"/);
  assert.match(e2, /SPEED OBSERVATORY/);
  assert.match(e2, /Edge Velocity \/ Before → After/);
  assert.match(e2, /Route Cohorts/);
  assert.match(e2, /Cache Integrity/);
  assert.match(e2, /Latency Ladder/);
  assert.match(e2, /Warm TTFB Spectrum/);
  assert.match(e2, /Hot Route Stack/);
  assert.match(e2, /Fastest Edge Hits/);
  assert.match(e2, /Browser Signal Field/);
  assert.match(e2, /Flight Recorder/);
  assert.match(e2Css, /speed-scan/);
  assert.match(e2Css, /linear-gradient/);
});

test("Speed bottom rail exposes E1 origin and E2 Observatory default", () => {
  assert.match(observatory, /LAYOUT \/ PROVENANCE/);
  assert.match(observatory, /"E1", "ORIGIN"/);
  assert.match(observatory, /"E2", "OBSERVATORY · DEFAULT"/);
  assert.match(observatory, /RESET E2/);
  assert.match(observatory, /data-speed-view-rail/);
});

test("E2 telemetry snapshot is explicitly release-bound and leak-free", () => {
  assert.match(snapshot, /audited: 78/);
  assert.match(snapshot, /edgeCached: 27/);
  assert.match(snapshot, /dynamic: 51/);
  assert.match(snapshot, /hitRoutes: 27/);
  assert.match(snapshot, /eligibleRoutes: 27/);
  assert.match(snapshot, /cookieLeaks: 0/);
  assert.match(snapshot, /rscLeaks: 0/);
  assert.match(snapshot, /speedup: 4\.9/);
  assert.match(snapshot, /releaseSha: "b257449a40fd/);
  assert.doesNotMatch(snapshot, /API_TOKEN|PASSWORD|SECRET|\/etc\/aoe2hdbets/);
});
