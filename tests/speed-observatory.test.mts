import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const page = fs.readFileSync("app/speed/page.tsx", "utf8");
const observatory = fs.readFileSync("components/speed/SpeedObservatory.tsx", "utf8");
const checkRoute = fs.readFileSync("app/api/speed/check/route.ts", "utf8");
const reportRoute = fs.readFileSync("app/api/speed/report/route.ts", "utf8");
const proof = fs.readFileSync("components/speed/SpeedProof.tsx", "utf8");

test("personal Speed Observatory reads only this browser tab's recent Speed samples", () => {
  assert.match(page, /SpeedObservatory/);
  assert.match(observatory, /getRecentSpeedSamples/);
  assert.match(observatory, /SPEED_SAMPLE_UPDATED_EVENT/);
  assert.match(observatory, /Up to 20 sanitized route samples/);
});

test("live check is uncached and measures a same-origin round trip", () => {
  assert.match(observatory, /\/api\/speed\/check/);
  assert.match(checkRoute, /Cache-Control/);
  assert.match(checkRoute, /no-store/);
  assert.match(checkRoute, /NEXT_PUBLIC_AOE2WAR_BUILD_VERSION/);
});

test("one-click Speed Report uses trusted server identity and private Traffic relay", () => {
  assert.match(observatory, /Send Speed Report/);
  assert.match(reportRoute, /getSessionUid/);
  assert.match(reportRoute, /TRAFFIC_PERFORMANCE_INGEST_KEY/);
  assert.match(reportRoute, /\/api\/internal\/performance\/report/);
  assert.match(reportRoute, /User submitted Speed Report/);
});

test("Speed Proof exposes the observatory without widening public proof eligibility", () => {
  assert.match(proof, /Open my Speed Observatory/);
  assert.match(proof, /ready_source === "explicit"/);
  assert.match(proof, /valid_for_aggregation/);
});
