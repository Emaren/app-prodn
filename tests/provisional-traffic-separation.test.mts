import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { normalizeProvisionalTraffic, loadProvisionalTraffic } from "../lib/provisionalTraffic.ts";

const today = "2026-11-03";
const good = () => ({
  ok: true,
  project_slug: "aoe2hdbets",
  kind: "provisional_observed_project_daily",
  last_certified_day: "2026-10-19",
  points: [
    { date: "2026-10-20", observed_qualifying_ips: 12, observed_get_events: 93,
      utc_day_complete: true, certified_human: false },
    { date: "2026-11-03", observed_qualifying_ips: 8, observed_get_events: 61,
      utc_day_complete: false, certified_human: false },
  ],
});

test("typed recent activity is provisional, independent and cannot backdate a certified day", () => {
  const actual = normalizeProvisionalTraffic(good(), today);
  assert.equal(actual.kind, "provisional_observed_project_daily");
  assert.equal(actual.lastCertifiedDay, "2026-10-19");
  assert.deepEqual(actual.points.map(x => x.date), ["2026-10-20", "2026-11-03"]);
  assert.equal(actual.points[1].utcDayComplete, false);
  assert.equal(actual.points[0].observedGetEvents, 93);
  assert.equal((actual.points[0] as unknown as Record<string, unknown>).confirmedHuman, undefined);
});

test("unknown authority, inflated counters, partial/complete mismatch fail closed", () => {
  const changes: Array<(p: ReturnType<typeof good>)=>void> = [
    p => { p.project_slug = "other"; },
    p => { p.ok = false; },
    p => { p.kind = "certified_human"; },
    p => { p.points[0].certified_human = true; },
    p => { p.points[0].date = "2026-10-19"; },
    p => { p.points[0].date = "2026-11-04"; },
    p => { p.points[0].observed_get_events = 1; },
    p => { p.points[0].observed_qualifying_ips = -2; },
    p => { p.points[0].utc_day_complete = false; },
    p => { p.points[1].utc_day_complete = true; },
    p => { p.points[1].date = "2026-10-20"; },
    p => { p.last_certified_day = "2026-11-03"; },
    p => { p.points = Array.from({length:46},()=>({...p.points[0],date:"2026-10-20"})); },
  ];
  for(const change of changes) {
    const candidate = good();change(candidate);
    assert.throws(()=>normalizeProvisionalTraffic(candidate,today));
  }
});

test("UTC rollover turns yesterday's incomplete day into a complete day", () => {
  assert.throws(() => normalizeProvisionalTraffic(good(), "2026-11-04"),
                /Provisional activity invariant failed/);
  const yesterdayCompleted = good();
  yesterdayCompleted.points[1].utc_day_complete = true;
  const afterRollover = normalizeProvisionalTraffic(yesterdayCompleted, "2026-11-04");
  assert.equal(afterRollover.points[1].utcDayComplete, true);
});

test("source fetch is exactly GET-only 3331 observational rail, requires same canonical cutoff", async () => {
  // Production uses the actual UTC clock; static Nov 3 mock data would
  // become invalid at midnight UTC and make the CI suite fail every day.
  const liveToday = new Date().toISOString().slice(0, 10);
  const dayBefore = (days: number) =>
    new Date(Date.parse(liveToday + "T00:00:00Z") - days * 86_400_000)
      .toISOString().slice(0, 10);
  const liveCertifiedCutoff = dayBefore(2);
  const liveFixture = {
    ...good(),
    last_certified_day: liveCertifiedCutoff,
    points: [
      { ...good().points[0], date: dayBefore(1), utc_day_complete: true },
      { ...good().points[1], date: liveToday, utc_day_complete: false },
    ],
  };
  const initial = globalThis.fetch;
  const env = process.env.TRAFFIC_API_BASE;
  const observed: Array<{url:string,options:RequestInit}> = [];
  try {
    process.env.TRAFFIC_API_BASE = "http://127.0.0.1:3331";
    globalThis.fetch = (async (url: URL | RequestInfo, options: RequestInit) => {
      observed.push({url:String(url),options});
      return {ok:true,json:async()=>liveFixture} as Response;
    }) as typeof fetch;
    const payload = await loadProvisionalTraffic(liveCertifiedCutoff);
    assert.equal(payload.points.length,2);
    assert.equal(observed[0].url,"http://127.0.0.1:3331/api/projects/aoe2hdbets/observed-daily-series");
    assert.equal(observed[0].options.cache,"no-store");
    assert.equal(observed[0].options.method,undefined);
    assert.equal(observed[0].options.headers,undefined);
    assert.equal(observed[0].options.body,undefined);
    await assert.rejects(()=>loadProvisionalTraffic("2026-10-18"),/cutoff mismatch/);
  } finally {
    globalThis.fetch=initial;
    if(env===undefined)delete process.env.TRAFFIC_API_BASE;
    else process.env.TRAFFIC_API_BASE=env;
  }
});

test("page renders certified chart separately before provisional rail", () => {
  const page=readFileSync("app/traffic/page.tsx","utf8");
  const component=readFileSync("components/traffic/ProvisionalActivity.tsx","utf8");
  assert.match(page,/loadPublicTraffic\(\)/);
  assert.match(page,/RecentObservedActivity lastPublishedDay=\{lastPublishedDay\}/);
  assert.ok(page.indexOf("<PremiumTimeSeriesChart") < page.indexOf("<RecentObservedActivity"));
  assert.match(component,/not people/i);
  assert.match(component,/not human-certified/i);
  assert.match(component,/Provisional · unverified/);
  assert.match(component,/observedQualifyingIps/);
  assert.doesNotMatch(component,/suspectedHuman|confirmedHuman|totalTraffic/);
});
