import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("public Traffic chart remains unmodified and new work mounts BELOW it", () => {
  const page = read("app/traffic/page.tsx");
  const chart = page.match(/<PremiumTimeSeriesChart[\s\S]*?\/>/)?.[0];
  assert.equal(chart, [
    '<PremiumTimeSeriesChart',
    '            title="Traffic"',
    '            points={points}',
    '            series={SERIES}',
    '            variant="traffic"',
    '            speedReadyRoute="/traffic"',
    '          />',
  ].join("\n"));
  assert.ok(page.indexOf("<TrafficSensors") > page.indexOf(chart!));
  assert.match(page, /const lastPublishedDay = points\.at\(-1\)\?\.date/);
  assert.match(page, /color: "#f5c65b"/);
  assert.match(page, /color: "#5aa9ff"/);
  assert.match(page, /color: "#42f1b5"/);
  assert.doesNotMatch(page, /"use client"/);
});

test("Traffic Sensors are a subsystem, not a replacement for independent Kingdom Sensors", () => {
  const page = read("app/kingdom-sensors/page.tsx");
  const trafficPage = read("app/traffic/page.tsx");
  const component = read("components/traffic/TrafficSensors.tsx");
  assert.match(page, /KingdomInstruments kind="sensors"/);
  assert.match(trafficPage, /TrafficSensors points=\{points\}/);
  assert.match(component, /Traffic Sensors/);
  assert.match(component, /KINGDOM SENSORS \/ TRAFFIC SUBSYSTEM/);
  assert.match(component, /href="\/kingdom-sensors"/);
  assert.doesNotMatch(component, /\/api\/admin\/|\.env|127\.0\.0\.1/);
});

test("missing public country, path and dwell aggregates remain unavailable rather than fabricated", () => {
  const component = read("components/traffic/TrafficSensors.tsx");
  assert.match(component, /TOP FIVE COUNTRIES/);
  assert.match(component, /TOP FIVE PAGES/);
  assert.match(component, /OBSERVED TIME ON SITE/);
  assert.match(component, /NOT CERTIFIED/);
  assert.match(component, /Not yet verified/);
  assert.match(component, /21_618_093/);
  assert.match(component, /request rows, not visitors/);
  assert.match(component, /const available = points\.length > 0/);
  assert.match(component, /HISTORICAL ARCHIVE \/ READ ONLY/);
  assert.doesNotMatch(component, /fetch\(|setInterval|traffic_browser_events/);
});

test("Traffic instrumentation defaults open and uses only the canonical server-loaded points", () => {
  const component = read("components/traffic/TrafficSensors.tsx");
  const page = read("app/traffic/page.tsx");
  assert.match(component, /<details open/);
  assert.match(component, /points\.reduce/);
  assert.match(component, /points\.slice\(-30\)/);
  assert.match(component, /lastPublishedDay/);
  assert.match(component, /lagDays/);
  assert.match(page, /await loadPublicTraffic\(\)/);
});
