import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  normalizePublicProvisionalActivity,
  loadPublicProvisionalActivity,
} from "../lib/publicObservedTraffic.ts";

const today = "2026-11-04";
const row = (date:string, ips:number, gets:number, complete=true) => ({
  date,
  observed_qualifying_ips: ips,
  observed_get_events: gets,
  updated_at: date + "T23:59:00Z",
  utc_day_complete: complete,
  certified_human: false,
});
const valid = () => ({
  ok:true,
  project_slug:"aoe2hdbets",
  kind:"provisional_observed_project_daily",
  generated_at:"2026-11-04T05:45:32Z",
  last_certified_day:"2026-10-19",
  points:[
    row("2026-11-02",3003,23445),
    row("2026-11-03",2640,20864),
    {...row("2026-11-04",586,2879,false),updated_at:"2026-11-04T05:38:26Z"},
  ],
});

test("accepts only separate real observed day values, never certified-human",() => {
  const normalized=normalizePublicProvisionalActivity(valid(),today);
  assert.equal(normalized.lastCertifiedDay,"2026-10-19");
  assert.equal(normalized.kind,"provisional_observed_project_daily");
  assert.deepEqual(normalized.points.map(x => [x.date,x.observedQualifyingIps,
    x.observedGetEvents,x.utcDayComplete,x.certifiedHuman]),[
      ["2026-11-02",3003,23445,true,false],
      ["2026-11-03",2640,20864,true,false],
      ["2026-11-04",586,2879,false,false],
    ]);
  assert.equal("totalTraffic" in normalized.points[0],false);
  assert.equal("confirmedHuman" in normalized.points[0],false);
});

test("rejects invalid project identity or claim that observations are certified",() => {
  for(const mutation of [
    (x:ReturnType<typeof valid>) => {x.kind="certified_public_audience";},
    (x:ReturnType<typeof valid>) => {x.project_slug="other";},
    (x:ReturnType<typeof valid>) => {x.points[0].certified_human=true;},
    (x:ReturnType<typeof valid>) => {x.points[1].date="2026-10-19";},
    (x:ReturnType<typeof valid>) => {x.points[1].date="2026-11-05";},
    (x:ReturnType<typeof valid>) => {x.points[1].date="2026-11-02";},
    (x:ReturnType<typeof valid>) => {x.last_certified_day="2026-11-04";},
  ]){
    const data=valid();mutation(data);
    assert.throws(()=>normalizePublicProvisionalActivity(data,today));
  }
});

test("rejects partial/certified boundary and fake counts instead of inventing zero",() => {
  for(const mutation of [
    (x:ReturnType<typeof valid>) => {x.points[2].utc_day_complete=true;},
    (x:ReturnType<typeof valid>) => {x.points[1].utc_day_complete=false;},
    (x:ReturnType<typeof valid>) => {x.points[0].observed_qualifying_ips=-1;},
    (x:ReturnType<typeof valid>) => {x.points[0].observed_qualifying_ips=23446;},
    (x:ReturnType<typeof valid>) => {x.points[0].observed_get_events=0.5;},
    (x:ReturnType<typeof valid>) => {x.points[0].updated_at="2026-11-01T12:00:00Z";},
    (x:ReturnType<typeof valid>) => {x.generated_at="not-a-timestamp";},
  ]){
    const data=valid();mutation(data);
    assert.throws(()=>normalizePublicProvisionalActivity(data,today));
  }
});

test("rejects maliciously oversized or unordered timeseries",()=>{
  const data=valid();data.points=Array.from({length:46},(_,i)=>row("2026-11-02",i,i));
  assert.throws(()=>normalizePublicProvisionalActivity(data,today));
  assert.throws(()=>normalizePublicProvisionalActivity(null,today));
});

test("read-only fetch preserves HTTP failures; no observed fake zero",async()=>{
  const previous=globalThis.fetch;
  try{
    let url="";
    globalThis.fetch=async(request:RequestInfo|URL,options?:RequestInit)=>{
      url=String(request);
      assert.equal(options?.cache,"no-store");
      assert.ok(options?.signal);
      return new Response(JSON.stringify(valid()),{status:200});
    };
    const result=await loadPublicProvisionalActivity("2026-11-04");
    assert.ok(url.endsWith("/api/projects/aoe2hdbets/observed-daily-series"));
    assert.equal(result.points.length,3);
    globalThis.fetch=async()=>new Response("unavailable",{status:503});
    await assert.rejects(loadPublicProvisionalActivity("2026-11-04"),/503/);
  }finally{globalThis.fetch=previous;}
});

test("server-side Traffic UI keeps the original certified chart and excludes observational substitute",()=>{
  const page=readFileSync(new URL("../app/traffic/page.tsx",import.meta.url),"utf8");
  const component=readFileSync(new URL("../components/traffic/ProvisionalDailyTraffic.tsx",import.meta.url),"utf8");
  assert.match(page,/loadPublicTraffic/);
  assert.match(page,/ObservedTrafficSensors/);
  assert.doesNotMatch(page,/ObservedDailyTraffic|RecentObservedActivity/);
  assert.match(page,/Canonical Traffic series/);
  assert.equal((page.match(/<PremiumTimeSeriesChart/g)||[]).length,1);
  assert.match(page,/lastPublishedDay=\{lastPublishedDay\}/);
  assert.match(component,/OBSERVED \/ UNVERIFIED — DAILY PROJECT ACTIVITY/);
  assert.match(component,/not people,/);
  assert.match(component,/not sessions/);
  assert.match(component,/data.lastCertifiedDay === lastPublishedDay/);
  assert.doesNotMatch(component,/totalTraffic:|confirmedHuman:/);
});
