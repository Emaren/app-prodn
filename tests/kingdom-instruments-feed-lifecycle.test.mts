import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  beginInstrumentReads,
  expirePendingInstrumentReads,
  hideInstrumentReads,
} from "../components/kingdom-instruments/instrumentFeedPolicy.ts";

const first = "/api/general-inspections";
const second = "/api/kingdom-index";
const unrelated = "/api/kingdom-intelligence";
const observed = (at = "2026-10-20T18:00:00.000Z") => ({
  state: "observed" as const,
  payload: { schema: 1, overallScore: 80 },
  fetchedAt: at,
});

test("every new instrument batch invalidates old observations before requesting", () => {
  const old = {
    [first]: observed(),
    [second]: observed(),
    [unrelated]: observed(),
  };
  const refreshed = beginInstrumentReads(old, [first, second]);

  assert.deepEqual(refreshed[first], { state: "loading", payload: null, fetchedAt: null });
  assert.deepEqual(refreshed[second], { state: "loading", payload: null, fetchedAt: null });
  assert.deepEqual(refreshed[unrelated], old[unrelated], "unrelated reader survives a different page kind");
  assert.deepEqual(old[first], observed(), "policy must not mutate the prior render snapshot");
});

test("hide clears all current page sources while preserving unrelated source state", () => {
  const current = {
    [first]: observed(),
    [second]: { state: "loading" as const, payload: null, fetchedAt: null },
    [unrelated]: observed(),
  };
  const hidden = hideInstrumentReads(current, [first, second]);
  assert.deepEqual(hidden[first], { state: "unavailable", payload: null, fetchedAt: null });
  assert.deepEqual(hidden[second], { state: "unavailable", payload: null, fetchedAt: null });
  assert.deepEqual(hidden[unrelated], current[unrelated]);
});

test("10-second timeout invalidates only unfinished readers, not partial successful evidence", () => {
  const currently = {
    [first]: observed("2026-10-20T18:01:00.000Z"),
    [second]: { state: "loading" as const, payload: null, fetchedAt: null },
    [unrelated]: observed(),
  };
  const expired = expirePendingInstrumentReads(currently, new Set([second]));

  assert.deepEqual(expired[first], currently[first], "completed reader must remain observed");
  assert.deepEqual(expired[second], { state: "unavailable", payload: null, fetchedAt: null });
  assert.deepEqual(expired[unrelated], currently[unrelated]);
});

test("late timeout on an already-completed URL cannot change observed state", () => {
  const completed = { [first]: observed() };
  assert.deepEqual(
    expirePendingInstrumentReads(completed, new Set([first])),
    completed,
  );
});

test("real shared instrument component fences network generations and visibility", () => {
  const source = readFileSync("components/kingdom-instruments/KingdomInstruments.tsx", "utf8");

  assert.match(source, /activeRead\.current=null;\s*previous\?\.abort\(\);/);
  assert.match(source, /setFeeds\(prev=>hideInstrumentReads\(prev,sources\[kind\]\)\)/);
  assert.match(source, /else if\(!wasVisible\.current\)/);
  assert.match(source, /setRefreshId\(value=>value\+1\)/);
  assert.match(source, /setFeeds\(prev=>beginInstrumentReads\(prev,urls\)\)/);
  assert.match(source, /activeRead\.current!==ctrl/);
  assert.match(source, /setFeeds\(prev=>expirePendingInstrumentReads\(prev,pending\)\)/);
  assert.match(source, /activeRead\.current===ctrl && !ctrl\.signal\.aborted/);
  assert.match(source, /ctrl\.abort\(\)/);
  assert.match(source, /},10000\)/);
  assert.match(source, /setRefreshId\(x=>x\+1\),90000\)/);
  assert.match(source, /credentials:"same-origin"/);
  assert.doesNotMatch(source, /method:"POST"|method:"DELETE"|wallet\.sign|settleWager/);
});
