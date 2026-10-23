import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { toWatcherEventArray } from "../lib/watcherTelemetryBatch.ts";

const heartbeat = { event_type:"heartbeat", metadata:{source:"watcher"} };
const uploaded = { event_type:"upload_succeeded", replay_hash:"a".repeat(64) };

test("unchanged single-event envelope and supported batch shape",()=>{
  assert.deepEqual(toWatcherEventArray(heartbeat),[heartbeat]);
  assert.deepEqual(toWatcherEventArray({events:[heartbeat,uploaded]}),[heartbeat,uploaded]);
  assert.deepEqual(toWatcherEventArray({events:[]}),[]);
  assert.deepEqual(toWatcherEventArray(null),[]);
});

test("invalid batch entries never get silently filtered into a successful partial ACK",()=>{
  for(const bad of [null, false, 42, "oops", [], [heartbeat]]) {
    assert.throws(()=>toWatcherEventArray({events:[heartbeat,bad]}),/Invalid watcher batch entry/);
    assert.throws(()=>toWatcherEventArray({events:[bad,heartbeat]}),/Invalid watcher batch entry/);
  }
});

test("no non-object or top-level array masquerades as a valid watcher event",()=>{
  for(const value of [null, false, "string", 123, [], [heartbeat]]) {
    assert.deepEqual(toWatcherEventArray(value),[]);
  }
});

test("server retains 25-event cap and rejects malformed batches before storage",()=>{
  const route=readFileSync(new URL("../app/api/watcher/events/route.ts",import.meta.url),"utf8");
  assert.match(route,/toWatcherEventArray\(payload\)/);
  assert.match(route,/MAX_BATCH_EVENTS = 25/);
  assert.match(route,/Invalid watcher batch entry/);
  assert.match(route,/status: 400/);
});
