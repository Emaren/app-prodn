import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  BRAIN_ENDPOINT_COUNT, BRAIN_REFRESH_INTERVAL_MS, BRAIN_REFRESH_TIMEOUT_MS,
  BRAIN_SIGNAL_MAX_AGE_MS, BRAIN_SIGNAL_FUTURE_SKEW_MS,
  classifyBrainSignal, createBrainRefreshCoordinator, isBrainSignalDisplayable, brainSettledResult, brainSourceTimeLabel, nextBrainSignalExpiryDelay,
  unavailableBrainSignal,
} from "../app/kingdom-brain/brainSignalPolicy.ts";

const time = Date.parse("2026-10-22T17:45:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();
const index = (t = time) => ({ schema: 1, source: "review-baseline", generatedAt: iso(t), pages: [], certified: 0 });
const agents = (t = time) => ({
  schema: 1, observedAt: iso(t), releaseSha: "a".repeat(12), agents: [],
  sources: { intelligence: true, inspections: true, intelligenceStale: false, releaseAlignment: "aligned" },
});
const patrol = (t = time) => ({
  schema: 1, policyVersion: "2026-10-19-v1", generatedAt: iso(t),
  registered: 1, assigned: 1, agentsRunning: null,
  entries: [{ href: "/kingdom-brain", status: "POLICY_ONLY" }],
});
const census = (t = time) => ({
  schema: 1, status: "verified", source: "deployed-next-app-paths-manifest",
  capturedAt: iso(t), buildVersion: "build-1",
  counts: { totalPages: 144, apiHandlers: 273 },
});
const get = (source: "index" | "agents" | "patrol" | "census", value: unknown, at = time) => classifyBrainSignal(source, value, at);

test("HTTP-200 envelope is not proof of observation freshness or source authority", () => {
  for (const [source, value] of [
    ["index", index(time - BRAIN_SIGNAL_MAX_AGE_MS - 1)],
    ["agents", agents(time - BRAIN_SIGNAL_MAX_AGE_MS - 1)],
    ["patrol", patrol(time - BRAIN_SIGNAL_MAX_AGE_MS - 1)],
    ["census", census(time - BRAIN_SIGNAL_MAX_AGE_MS - 1)],
  ] as const) {
    const decision = get(source, value);
    assert.equal(decision.state, "stale", source);
    assert.equal(isBrainSignalDisplayable(decision, time), false);
  }
  assert.equal(get("index", index()).state, "observed");
  assert.equal(get("census", census()).state, "observed");
  assert.equal(get("patrol", patrol()).state, "policy-only");
});

test("future/malformed/missing timestamps and impossible calendar dates fail closed", () => {
  for (const source of ["index", "agents", "patrol", "census"] as const) {
    const sample = { index, agents, patrol, census }[source];
    const tooFuture = get(source, sample(time + BRAIN_SIGNAL_FUTURE_SKEW_MS + 1));
    assert.equal(tooFuture.state, "unverified", source);
    assert.equal(tooFuture.reason, "source-future");
    const key = { index: "generatedAt", agents: "observedAt", patrol: "generatedAt", census: "capturedAt" }[source];
    for (const invalid of [undefined, "tomorrow", "2026-02-30T12:00:00.000Z", "2026-10-22", 1234]) {
      assert.equal(get(source, { ...sample(), [key]: invalid }).state, "unverified", source);
    }
    assert.equal(get(source, { ...sample(), [key]: undefined }).reason, "timestamp-unknown");
  }
});

test("underlying stale/misaligned Agents cannot become healthy via fresh observedAt", () => {
  const stale = get("agents", { ...agents(), sources: { ...agents().sources, intelligenceStale: true } });
  assert.equal(stale.state, "stale");
  for (const changes of [
    { sources: { ...agents().sources, releaseAlignment: "mismatch" } },
    { sources: { ...agents().sources, inspections: false } },
    { sources: { ...agents().sources, intelligence: false } },
    { releaseSha: null },
    { sources: null },
  ]) {
    assert.equal(get("agents", { ...agents(), ...changes }).state, "unverified");
  }
});

test("declared patrol policy cannot be confused with active processes", () => {
  assert.equal(get("patrol", patrol()).state, "policy-only");
  for (const changes of [
    { agentsRunning: 8 },
    { entries: [{ status: "RUNNING" }] },
    { policyVersion: null },
    { registered: 2 },
    { assigned: 2 },
  ]) assert.equal(get("patrol", { ...patrol(), ...changes }).state, "unverified");
});

test("manifest counts require verified provenance and build identity", () => {
  for (const changes of [
    { status: "unavailable" }, { buildVersion: null }, { source: "legacy-file" },
    { counts: { totalPages: -1, apiHandlers: 273 } },
    { counts: null },
  ]) assert.equal(get("census", { ...census(), ...changes }).state, "unverified");
});

test("received evidence expires without inventing a new network observation", () => {
  const decision = get("index", index());
  assert.equal(isBrainSignalDisplayable(decision, time + BRAIN_SIGNAL_MAX_AGE_MS), true);
  assert.equal(isBrainSignalDisplayable(decision, time + BRAIN_SIGNAL_MAX_AGE_MS + 1), false);
  assert.equal(isBrainSignalDisplayable(unavailableBrainSignal(), time), false);
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test("reverse completion order: older generation cannot replace newer evidence", async () => {
  const pending = [deferred<string>(), deferred<string>()];
  const aborts: boolean[] = [];
  const outputs: string[] = [];
  const busy: boolean[] = [];
  const coordinator = createBrainRefreshCoordinator({
    load: signal => { aborts.push(false); signal.addEventListener("abort", () => { aborts[aborts.length - 1] = true; }); return pending[aborts.length - 1].promise; },
    publish: value => outputs.push(value), setBusy: value => busy.push(value),
  });
  const first = coordinator.refresh();
  const second = coordinator.refresh();
  assert.equal(aborts[0], true);
  pending[1].resolve("second-current"); await second;
  pending[0].resolve("first-stale"); await first;
  assert.deepEqual(outputs, ["second-current"]);
  assert.equal(busy.at(-1), false);
  coordinator.dispose();
});

test("rapid refresh, explicit cancel, rejected request, and dispose are bounded", async () => {
  const pending = Array.from({ length: 12 }, () => deferred<number>());
  const signals: AbortSignal[] = [];
  const results: number[] = [];
  const busy: boolean[] = [];
  let errors = 0;
  const coordinator = createBrainRefreshCoordinator({
    load: signal => { signals.push(signal); return pending[signals.length - 1].promise; },
    publish: result => results.push(result),
    setBusy: result => busy.push(result),
    failed: () => { errors++; },
  });
  const tasks = Array.from({ length: 8 }, () => coordinator.refresh());
  for (let i = 0; i < 7; i++) assert.equal(signals[i].aborted, true);
  pending[7].reject(Error("temporary unavailable")); await tasks[7];
  for (let i = 0; i < 7; i++) pending[i].resolve(i);
  await Promise.all(tasks.slice(0, 7));
  assert.deepEqual(results, []); assert.equal(errors, 1);
  const inFlight = coordinator.refresh();
  coordinator.cancel();
  assert.equal(signals[8].aborted, true);
  pending[8].resolve(8); await inFlight;
  assert.deepEqual(results, []);
  const beforeDispose = coordinator.refresh();
  coordinator.dispose();
  assert.equal(signals[9].aborted, true);
  pending[9].resolve(9); await beforeDispose;
  await coordinator.refresh();
  assert.deepEqual(results, []);
  assert.equal(signals.length, 10);
  assert.equal(busy.at(-1), true, "unmount does not set React state");
});

test("partial-success independent sources and request budget remain in page-client contract", () => {
  const code = readFileSync(new URL("../app/kingdom-brain/KingdomBrainClient.tsx", import.meta.url), "utf8");
  assert.equal(BRAIN_ENDPOINT_COUNT, 4);
  assert.equal(BRAIN_REFRESH_INTERVAL_MS, 120_000);
  assert.equal(BRAIN_REFRESH_TIMEOUT_MS, 12_000);
  assert.match(code, /Promise\.allSettled/);
  assert.match(code, /brainSettledResult\("index", a/);
  assert.match(code, /brainSettledResult\("agents", b/);
  assert.match(code, /brainSettledResult\("patrol", c/);
  assert.match(code, /brainSettledResult\("census", d/);
  assert.match(code, /coordinator\.dispose\(\)/);
  assert.match(code, /visibilitychange/);
  assert.doesNotMatch(code, /state:\s*"current"/i);
  assert.doesNotMatch(code, /method:\s*["'](?:POST|PUT|PATCH|DELETE)/);
});

test("four concurrent endpoints preserve partial success and independent unavailability", async () => {
  const arrivals = await Promise.allSettled([
    Promise.resolve(index()), Promise.reject(Error("Agents 503")),
    Promise.resolve(patrol()), Promise.resolve(census(time - BRAIN_SIGNAL_MAX_AGE_MS - 1)),
  ]);
  const decisions = [
    brainSettledResult("index", arrivals[0], time),
    brainSettledResult("agents", arrivals[1], time),
    brainSettledResult("patrol", arrivals[2], time),
    brainSettledResult("census", arrivals[3], time),
  ];
  assert.deepEqual(decisions.map(item => item.state), ["observed", "unavailable", "policy-only", "stale"]);
  assert.equal(decisions[0].data?.source, "review-baseline");
  assert.equal(decisions[1].data, null);
  assert.equal(isBrainSignalDisplayable(decisions[2], time), true);
  assert.equal(isBrainSignalDisplayable(decisions[3], time), false);
});

test("mobile source timestamp keeps UTC age visible and full ISO readable to assistive tech", () => {
  assert.equal(brainSourceTimeLabel("2026-10-22T19:17:04.689Z"), "10-22 19:17Z");
  assert.equal(brainSourceTimeLabel(null), "NO SOURCE TIME");
  const client = readFileSync(new URL("../app/kingdom-brain/KingdomBrainClient.tsx", import.meta.url), "utf8");
  assert.match(client, /aria-label=\{signal\.sourceAt \? "Source observation at "/);
  assert.match(client, /brainSourceTimeLabel\(signal\.sourceAt\)/);
  assert.match(client, /aria-live="polite"/);
});

test("source expires at its actual deadline, not next 120-second HTTP refresh", () => {
  const observed = get("index", index());
  assert.equal(nextBrainSignalExpiryDelay([observed], time, time), BRAIN_SIGNAL_MAX_AGE_MS + 1);
  assert.equal(nextBrainSignalExpiryDelay([observed], time, time + BRAIN_SIGNAL_MAX_AGE_MS - 8), 9);
  assert.equal(nextBrainSignalExpiryDelay([observed], time, time + BRAIN_SIGNAL_MAX_AGE_MS + 80), 0);
  const expiredClock = time + BRAIN_SIGNAL_MAX_AGE_MS + 1;
  assert.equal(isBrainSignalDisplayable(observed, expiredClock), false);
  assert.equal(nextBrainSignalExpiryDelay([observed], expiredClock, expiredClock), null);
});

test("independent source expiry uses earliest deadline, without more requests", () => {
  const first = get("index", index(time - 30_000));
  const second = get("patrol", patrol(time - 10_000));
  const unavailable = unavailableBrainSignal();
  assert.equal(nextBrainSignalExpiryDelay([second, first, unavailable], time, time), BRAIN_SIGNAL_MAX_AGE_MS - 30_000 + 1);
  const firstExpiry = time + BRAIN_SIGNAL_MAX_AGE_MS - 30_000 + 1;
  assert.equal(nextBrainSignalExpiryDelay([second, first, unavailable], firstExpiry, firstExpiry), 20_000);
  assert.equal(nextBrainSignalExpiryDelay([unavailable], time, time), null);
  assert.equal(nextBrainSignalExpiryDelay([second], Number.NaN, time), null);
  const client = readFileSync(new URL("../app/kingdom-brain/KingdomBrainClient.tsx", import.meta.url), "utf8");
  assert.match(client, /nextBrainSignalExpiryDelay\(signals, clockMs, Date\.now\(\)\)/);
  assert.match(client, /window\.clearTimeout\(timer\)/);
  assert.equal((client.match(/window\.setInterval\(/g) ?? []).length, 1);
  assert.equal(BRAIN_REFRESH_INTERVAL_MS, 120_000);
  assert.equal(BRAIN_ENDPOINT_COUNT, 4);
});


test("versioned real Next runner compiles and refuses non-source-bound execution", () => {
  const filename = new URL("./kingdom-brain-next-app-acceptance.py", import.meta.url);
  const runner = readFileSync(filename, "utf8");
  for (const required of [
    "rev-parse", "BUILD_ID", "--hostname", "127.0.0.1",
    "playwright.async_api", "python", "sourceSha", "productionAttested",
    "REAL_NEXT_CONTROLLED_API_FIXTURE", "REAL_NEXT_APPLICATION",
    "page.clock.run_for(5000)", "getComputedStyle",
  ]) assert.ok(runner.includes(required), "Runner missing boundary " + required);
  assert.ok(runner.includes("git(\\"status\\",\\"--porcelain\\",\\"--untracked-files=no\\")"));
  assert.ok(runner.includes("tests/kingdom-brain-next-app-acceptance.py") === false,
    "Runner must not depend on its own repository path");
  const compiled = spawnSync("python3", ["-m", "py_compile", filename.pathname], {
    encoding: "utf8", timeout: 10_000,
  });
  assert.equal(compiled.status, 0, compiled.stderr || compiled.error?.message);
});
