import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  trafficUtcDay,
  trafficCalendarWindow,
  trafficCalendarFraction,
  trafficNearestCalendarIndex,
  trafficCertifiedRuns,
  trafficMissingCalendarDays,
} from "../lib/trafficChartCalendar.ts";

const item = (date: string, totalTraffic: number | null = 10) => ({
  date,
  values: { totalTraffic },
});

test("strict UTC calendar parser refuses normalized invalid dates and aliases", () => {
  assert.equal(trafficUtcDay("2026-02-29"), null);
  assert.equal(trafficUtcDay("2026-11-10T00:00:00Z"), null);
  assert.equal(trafficUtcDay("2026-11-10"), trafficUtcDay("2026-11-09")! + 1);
  assert.equal(trafficUtcDay("not-a-day"), null);
});

test("7D and 30D cut by calendar span, not seven or thirty sparse rows", () => {
  const sparse = [
    item("2026-10-01"), item("2026-10-03"),
    item("2026-10-10"), item("2026-10-11"), item("2026-10-30"),
  ];
  assert.deepEqual(trafficCalendarWindow(sparse, "7D").map(p => p.date), ["2026-10-30"]);
  assert.deepEqual(trafficCalendarWindow(sparse, "30D").map(p => p.date),
    ["2026-10-01","2026-10-03","2026-10-10","2026-10-11","2026-10-30"]);
  assert.deepEqual(trafficCalendarWindow(sparse, "ALL"), sparse);
});

test("the original chart allocates physical X space for missing UTC days", () => {
  const sparse = [item("2026-10-18"),item("2026-10-19"),item("2026-10-23")];
  assert.equal(trafficCalendarFraction(sparse,0),0);
  assert.equal(trafficCalendarFraction(sparse,1),0.2);
  assert.equal(trafficCalendarFraction(sparse,2),1);
  assert.equal(trafficNearestCalendarIndex(sparse,0.65),2);
  assert.equal(trafficNearestCalendarIndex(sparse,0.15),1);
  assert.equal(trafficCalendarFraction([item("2026-10-18")],0),0.5);
  assert.equal(trafficCalendarFraction(sparse,3),null);
});

test("missing certified days break every series, never connect or synthesize zero", () => {
  const sparse = [item("2026-10-18",5),item("2026-10-19",7),item("2026-10-23",13)];
  assert.deepEqual(trafficCertifiedRuns(sparse,"totalTraffic"),[[0,1],[2]]);
  assert.equal(trafficMissingCalendarDays(sparse),3);
  assert.equal(sparse.length,3);
});

test("true certified zero remains real; null and nonfinite break curves", () => {
  const points = [item("2026-10-18",0),item("2026-10-19",null),
    item("2026-10-20",3),item("2026-10-21",Number.NaN),
    item("2026-10-22",4)];
  assert.deepEqual(trafficCertifiedRuns(points,"totalTraffic"),[[0],[2],[4]]);
});

test("duplicate, descending and invalid dates cannot be smoothly joined", () => {
  assert.deepEqual(
    trafficCertifiedRuns([item("2026-10-18"),item("2026-10-18"),item("2026-10-17")],"totalTraffic"),
    [[0],[1],[2]],
  );
  assert.deepEqual(
    trafficCertifiedRuns([item("2026-10-18"),item("bad"),item("2026-10-19")],"totalTraffic"),
    [[0],[2]],
  );
  assert.equal(trafficMissingCalendarDays([item("2026-10-18"),item("2026-10-18")]),0);
});

test("statistics chart is untouched; canonical traffic source binds UTC geometry", () => {
  const src = readFileSync(new URL("../components/observatory/PremiumTimeSeriesChart.tsx",import.meta.url),"utf8");
  const traffic = readFileSync(new URL("../app/traffic/page.tsx",import.meta.url),"utf8");
  assert.match(src,/variant === "traffic"[\s\S]*trafficCalendarWindow/);
  assert.match(src,/trafficCertifiedRuns\(displayedPoints, item.key\)/);
  assert.match(src,/trafficNearestCalendarIndex\(displayedPoints, plotRelative\)/);
  assert.match(src,/trafficMissingCalendarDays\(displayedPoints\)/);
  assert.match(traffic,/<PremiumTimeSeriesChart[\s\S]*variant="traffic"/);
  assert.doesNotMatch(traffic,/ProvisionalDailyTraffic/);
});
