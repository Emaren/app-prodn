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

  assert.equal(coalescer.admit(first, identity).accepted, true);
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
  assert.equal(
    coalescer.admit(ignored("failed.aoe2record"), identity).accepted,
    false,
  );

  now += 30_000;
  const retrySummary = coalescer.admit(
    ignored("failed.aoe2record"),
    identity,
  );
  assert.equal(retrySummary.accepted, true);
  assert.equal(
    (retrySummary.event.metadata as Record<string, unknown>)
      .serverCoalescedCount,
    3,
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
  assert.equal(coalescer.admit({...payload,metadata:{...payload.metadata,telemetryEventId:
    "telemetry_ffffffffffffffffffffffffffffffff"}},identity).accepted,false);
  const retry=coalescer.admit(payload,identity);
  assert.equal(retry.accepted,true,"exact durable retry must reach DB, not be suppressed");
  assert.equal((retry.event.metadata as Record<string,unknown>).serverCoalescedCount,2);
  coalescer.recordWriteSuccess(retry);
  assert.equal(coalescer.admit(payload,identity).accepted,false,"successful retry closes window again");
  coalescer.recordWriteFailure(retry);
  now+=1;
  assert.equal(coalescer.admit(payload,identity).accepted,true,"repeat failures remain retryable");
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
  assert.equal(coalescer.admit(different,identity).accepted,false,
    "unrelated monitoring event stays coalesced during overlap");
  // The first completion is stale after a newer admission; it cannot
  // override the latest generation's write status.
  coalescer.recordWriteFailure(first);
  coalescer.recordWriteFailure(overlapping);
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
  assert.equal(coalescer.admit(event,identity).accepted,false);
  assert.equal(second.accepted,true);
});
