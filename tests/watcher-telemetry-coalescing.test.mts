import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createWatcherTelemetryCoalescer,
} from "../lib/watcherTelemetryCoalescer.ts";

const identity = {
  resolved: true,
  userId: 42,
  userUid: "u_watcher_test",
};

function ignored(replayFile = "live.aoe2record") {
  return {
    eventType: "replay_detected_ignored",
    watcherId: "watcher-one",
    replayFile,
    metadata: { reason: "monitoring" },
  };
}

test("stores one monitoring-ignore summary per replay every thirty seconds", () => {
  let now = 1_000;
  const coalescer = createWatcherTelemetryCoalescer({
    now: () => now,
    windowMs: 30_000,
  });

  const first = coalescer.admit(ignored(), identity);
  assert.equal(first.accepted, true);
  assert.deepEqual(first.event.metadata, {
    reason: "monitoring",
    serverCoalescedCount: 1,
    serverCoalescedWindowMs: 30_000,
  });

  coalescer.recordWriteSuccess(first);
  now += 100;
  assert.equal(coalescer.admit(ignored(), identity).accepted, false);
  now += 100;
  assert.equal(coalescer.admit(ignored(), identity).accepted, false);

  now = 31_000;
  const summary = coalescer.admit(ignored(), identity);
  assert.equal(summary.accepted, true);
  assert.equal(
    (summary.event.metadata as Record<string, unknown>).serverCoalescedCount,
    3,
  );
});

test("never suppresses meaningful watcher transitions", () => {
  const coalescer = createWatcherTelemetryCoalescer();

  for (const eventType of [
    "replay_detected",
    "upload_succeeded",
    "parse_succeeded",
    "result_ready",
    "final_candidate_accepted",
    "final_settle_observation_complete",
    "final_result_review_observation_complete",
  ]) {
    const event = {
      ...ignored(),
      eventType,
    };
    assert.equal(coalescer.admit(event, identity).accepted, true);
    assert.equal(coalescer.admit(event, identity).accepted, true);
  }

  const importing = {
    ...ignored(),
    metadata: { reason: "importing" },
  };
  assert.equal(coalescer.admit(importing, identity).accepted, true);
  assert.equal(coalescer.admit(importing, identity).accepted, true);
});

test("separates users and replays and resets after monitor stop", () => {
  const coalescer = createWatcherTelemetryCoalescer();
  const first = ignored();

  const admission = coalescer.admit(first, identity);
  assert.equal(admission.accepted, true);
  coalescer.recordWriteSuccess(admission);
  assert.equal(coalescer.admit(first, identity).accepted, false);
  assert.equal(
    coalescer.admit(first, { ...identity, userId: 43 }).accepted,
    true,
  );
  assert.equal(coalescer.admit(ignored("other.aoe2record"), identity).accepted, true);

  assert.equal(
    coalescer.admit(
      {
        eventType: "monitor_stop",
        watcherId: first.watcherId,
        replayFile: first.replayFile,
      },
      identity,
    ).accepted,
    true,
  );
  assert.equal(coalescer.admit(first, identity).accepted, true);
});

test("bounds key memory and keeps failed writes inside the admission window", () => {
  let now = 1_000;
  const coalescer = createWatcherTelemetryCoalescer({
    maxKeys: 2,
    now: () => now,
  });

  const failed = coalescer.admit(ignored("failed.aoe2record"), identity);
  assert.equal(failed.accepted, true);
  coalescer.recordWriteFailure(failed);
  const second = coalescer.admit(ignored("failed.aoe2record"), identity);
  assert.equal(second.accepted,true,
    "a failed write must not authorize a suppression receipt");
  coalescer.recordWriteFailure(second);

  now += 30_000;
  const retrySummary = coalescer.admit(
    ignored("failed.aoe2record"),
    identity,
  );
  assert.equal(retrySummary.accepted, true);
  assert.equal(
    (retrySummary.event.metadata as Record<string, unknown>)
      .serverCoalescedCount,
    4,
  );

  now += 1;
  coalescer.admit(ignored("second.aoe2record"), identity);
  now += 1;
  coalescer.admit(ignored("third.aoe2record"), identity);
  assert.equal(coalescer.size(), 2);
});

test("watcher ingress reports exact stored and suppressed counts", () => {
  const source = readFileSync(
    new URL("../app/api/watcher/events/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /touchLastUsedAt:\s*false/);
  assert.match(source, /await touchWatcherTelemetryIdentity/);
  assert.match(source, /watcherTelemetryCoalescer\.admit/);
  assert.match(source, /watcherTelemetryCoalescer\.recordWriteFailure/);
  assert.match(source, /Promise\.allSettled/);
  assert.match(source, /stored:\s*storedEvents\.length/);
  assert.match(source, /suppressed,/);
  assert.match(source, /failed,/);
});

test("failed same-ID coalesced event may retry inside the existing window",()=>{
  let now = 1000;
  const coalescer = createWatcherTelemetryCoalescer({now:()=>now,windowMs:30_000});
  const payload = {...ignored("retry.aoe2record"), metadata:{
    reason:"monitoring",telemetryEventId:"telemetry_0123456789abcdef0123456789abcdef"
  }};
  const first=coalescer.admit(payload,identity);
  assert.equal(first.accepted,true);
  coalescer.recordWriteFailure(first);
  const different=coalescer.admit({...payload,metadata:{...payload.metadata,telemetryEventId:
    "telemetry_ffffffffffffffffffffffffffffffff"}},identity);
  assert.equal(different.accepted,true,"unsettled prior write must not coalesce other IDs");
  coalescer.recordWriteSuccess(different);
  const retry=coalescer.admit(payload,identity);
  assert.equal(retry.accepted,true,"exact durable retry must reach DB, not be suppressed");
  assert.ok(Number((retry.event.metadata as Record<string,unknown>).serverCoalescedCount)>=2);
  coalescer.recordWriteSuccess(retry);
  assert.equal(coalescer.admit(payload,identity).accepted,false,"successful retry closes window again");
  coalescer.recordWriteFailure(retry);
  now+=1;
  assert.equal(coalescer.admit(payload,identity).accepted,false,
    "stale failure after confirmed success cannot roll back durable receipt");
  assert.equal(coalescer.size(),1);
});

test("failed single-event writes return retryable HTTP status without changing batch compatibility",()=>{
  const source=readFileSync(new URL("../app/api/watcher/events/route.ts",import.meta.url),"utf8");
  assert.match(source,/ok: failed === 0/);
  assert.match(source,/status: failed > 0 && events\.length === 1 \? 503 : 200/);
  assert.match(source,/watcherTelemetryCoalescer\.recordWriteFailure/);
});

test("same-ID overlapping monitoring writes never return a premature coalesced ACK",()=>{
  const coalescer=createWatcherTelemetryCoalescer({now:()=>1000,windowMs:30_000});
  const event={...ignored("overlapping.aoe2record"),metadata:{
    reason:"monitoring",telemetryEventId:"telemetry_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  }};
  const first=coalescer.admit(event,identity);
  const overlapping=coalescer.admit(event,identity);
  assert.equal(first.accepted,true);
  assert.equal(overlapping.accepted,true,"uncommitted exact ID must reach DB rather than a 200 coalescer suppression");
  assert.notEqual(first.generation,overlapping.generation);
  const different={...event,metadata:{...event.metadata,
    telemetryEventId:"telemetry_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}};
  const separate=coalescer.admit(different,identity);
  assert.equal(separate.accepted,true,
    "an unrelated event cannot be acknowledged before any DB write completes");
  // The first completion is stale after a newer admission; it cannot
  // override the latest generation's write status.
  coalescer.recordWriteFailure(first);
  coalescer.recordWriteFailure(overlapping);
  coalescer.recordWriteFailure(separate);
  const retry=coalescer.admit(event,identity);
  assert.equal(retry.accepted,true,"exact durable retry must still be admitted after both fail");
  coalescer.recordWriteSuccess(retry);
  assert.equal(coalescer.admit(event,identity).accepted,false,
    "only a confirmed stored or duplicate outcome closes the retry window");
});

test("a committed overlapping event clears only its generation's in-flight receipt",()=>{
  const coalescer=createWatcherTelemetryCoalescer({now:()=>1000});
  const event={...ignored("race.aoe2record"),metadata:{
    reason:"monitoring",telemetryEventId:"telemetry_cccccccccccccccccccccccccccccccc"
  }};
  const first=coalescer.admit(event,identity);
  const second=coalescer.admit(event,identity);
  coalescer.recordWriteSuccess(first);
  assert.equal(coalescer.admit(event,identity).accepted,true,
    "first completion cannot falsely close a newer concurrent admission");
  const third=coalescer.admit(event,identity);
  coalescer.recordWriteSuccess(third);
  coalescer.recordWriteSuccess(second);
  assert.equal(coalescer.admit(event,identity).accepted,false);
  assert.equal(second.accepted,true);
});

test("concurrent different IDs require their own DB outcome; failed IDs survive another success",()=>{
 const c=createWatcherTelemetryCoalescer({now:()=>1000});
 const a={...ignored("pg-race.aoe2record"),metadata:{
  reason:"monitoring",telemetryEventId:"telemetry_"+"a".repeat(32)}};
 const b={...a,metadata:{...a.metadata,telemetryEventId:"telemetry_"+"b".repeat(32)}};
 const first=c.admit(a,identity);
 const second=c.admit(b,identity);
 assert.equal(first.accepted,true);
 assert.equal(second.accepted,true,"no premature HTTP 200 suppression");
 c.recordWriteFailure(first);
 c.recordWriteSuccess(second);
 const retry=c.admit(a,identity);
 assert.equal(retry.accepted,true,"first failed event ID must remain retryable");
 c.recordWriteSuccess(retry);
 assert.equal(c.admit(a,identity).accepted,false,"confirmed DB writes permit coalescing again");
});

test("all failed pending requests reopen admission; normal coalescing resumes after stored outcome",()=>{
 const c=createWatcherTelemetryCoalescer({now:()=>1000});
 const first=c.admit(ignored("all-failed.aoe2record"),identity);
 const second=c.admit(ignored("all-failed.aoe2record"),identity);
 assert.equal(second.accepted,true);
 c.recordWriteFailure(first);
 c.recordWriteFailure(second);
 const third=c.admit(ignored("all-failed.aoe2record"),identity);
 assert.equal(third.accepted,true,"no completed write means no successful suppression");
 c.recordWriteSuccess(third);
 assert.equal(c.admit(ignored("all-failed.aoe2record"),identity).accepted,false);
});

test("constructor-supplied maxKeys cannot expand the coalescer indefinitely",()=>{
 const c=createWatcherTelemetryCoalescer({maxKeys:Number.MAX_SAFE_INTEGER});
 for(let i=0;i<4200;i++) c.admit(ignored("key-"+i+".aoe2record"),identity);
 assert.equal(c.size(),4096);
});
