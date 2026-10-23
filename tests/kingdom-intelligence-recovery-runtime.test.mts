import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

import {
  isOperatorPreviewOnlyPayload,
  isUsableLiveRecoveryPayload,
  LIVE_RECOVERY_POLL_INTERVAL_MS,
  LIVE_RECOVERY_REQUEST_TIMEOUT_MS,
  shouldPollLiveRecovery,
} from "../app/kingdom-intelligence/liveRecoveryPolicy.ts";

/**
 * Compile the REAL React hook rather than duplicating its algorithm.
 * The CommonJS runtime injects a tiny React stub because these tests exercise
 * subscribe/poll/visibility, not React's render lifecycle or actual network.
 * All I/O, clock and document state are deterministic. No production APIs run.
 */
function createRuntime(initialVisibility = "visible") {
  const raw = readFileSync("app/kingdom-intelligence/useLiveRecoveryProgress.ts", "utf8");
  const js = ts.transpileModule(
    raw + "\n;(globalThis as any).__recoveryTestBridge = { subscribe };",
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText;

  let clock = 0;
  // The server sends sampledAt; fake only the client acceptance clock.
  const observedAtMs = Date.parse("2026-10-20T18:05:00.000Z");
  let nextTimer = 0;
  const timers = new Map<number, { at: number; callback: () => void }>();
  const fetches: Array<{
    signal: AbortSignal;
    url: string;
    options: { cache: string; signal: AbortSignal };
    settle: (data: unknown, ok?: boolean) => void;
    fail: (reason?: Error) => void;
    invalidJson: () => void;
  }> = [];
  const listeners = new Map<string, Set<() => void>>();
  const document = {
    visibilityState: initialVisibility,
    addEventListener(name: string, fn: () => void) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name)!.add(fn);
    },
    removeEventListener(name: string, fn: () => void) {
      listeners.get(name)?.delete(fn);
    },
  };

  const sandbox: Record<string, unknown> = {
    exports: {},
    document,
    AbortController,
    setTimeout(fn: () => void, delay: number) {
      const id = ++nextTimer;
      timers.set(id, { at: clock + delay, callback: fn });
      return id;
    },
    clearTimeout(id: number) {
      timers.delete(id);
    },
    fetch(url: string, options: { cache: string; signal: AbortSignal }) {
      return new Promise((resolve, reject) => {
        fetches.push({
          url,
          options,
          signal: options.signal,
          settle(data, ok = true) {
            resolve({ ok, json: async () => data });
          },
          fail(error = new Error("unavailable")) {
            reject(error);
          },
          invalidJson() {
            resolve({ ok: true, json: async () => { throw new SyntaxError("invalid JSON"); } });
          },
        });
      });
    },
    require(name: string) {
      if (name === "react") return { useEffect() {}, useState(value: unknown) { return [value, () => {}]; } };
      if (name === "./liveRecoveryPolicy") {
        return {
          isOperatorPreviewOnlyPayload,
          isUsableLiveRecoveryPayload(value: unknown) {
            return isUsableLiveRecoveryPayload(value, observedAtMs + clock);
          },
          LIVE_RECOVERY_POLL_INTERVAL_MS,
          LIVE_RECOVERY_REQUEST_TIMEOUT_MS,
          shouldPollLiveRecovery,
        };
      }
      throw new Error("Unexpected module imported by Recovery hook: " + name);
    },
  };

  vm.runInNewContext(js, sandbox, { filename: "useLiveRecoveryProgress.ts" });
  const bridge = sandbox.__recoveryTestBridge as {
    subscribe: (listener: (value: unknown) => void) => () => void;
  };

  function visibility(state: string) {
    document.visibilityState = state;
    for (const listener of listeners.get("visibilitychange") || []) listener();
  }

  function advance(ms: number) {
    clock += ms;
    // Timers are ordered by deadline; a callback may register a later timer.
    while (true) {
      const due = [...timers].filter(([, timer]) => timer.at <= clock)
        .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!due) break;
      timers.delete(due[0]);
      due[1].callback();
    }
  }

  return { bridge, fetches, visibility, advance, listeners };
}

async function settleMicrotasks() {
  // Allow fetch, response.json(), and the finally scheduling microtasks to run.
  await new Promise<void>((resolve) => setImmediate(resolve));
}

const validProgress = (date = "2026-10-20T18:05:00.000Z") => ({
  available: true,
  sampledAt: date,
  observedBytes: 512,
  completedClasses: 1,
  totalClasses: 2,
  overallPercent: 50,
});

test("public operator-preview refusal terminates shared polling", async () => {
  const rt = createRuntime();
  const left: unknown[] = [];
  const right: unknown[] = [];
  const unLeft = rt.bridge.subscribe((x) => left.push(x));
  const unRight = rt.bridge.subscribe((x) => right.push(x));

  assert.equal(rt.fetches.length, 1, "two consumers share one GET");
  assert.equal(rt.fetches[0].url, "/api/kingdom-intelligence/live-recovery");
  assert.equal(rt.fetches[0].options.cache, "no-store");
  rt.fetches[0].settle({ available: false, reason: "operator_preview_only" });
  await settleMicrotasks();

  rt.advance(30_000);
  await settleMicrotasks();
  assert.equal(rt.fetches.length, 1, "denied public client stops polling");
  assert.equal(left.at(-1), null);
  assert.equal(right.at(-1), null);

  unLeft();
  unRight();
  assert.equal(rt.listeners.get("visibilitychange")?.size, 0);
});

test("hidden/resumed Recovery tab aborts old request and fences late completion", async () => {
  const rt = createRuntime("hidden");
  const observed: unknown[] = [];
  const unsubscribe = rt.bridge.subscribe((x) => observed.push(x));

  assert.equal(rt.fetches.length, 0, "hidden subscriber has no network activity");
  rt.visibility("visible");
  assert.equal(rt.fetches.length, 1);

  rt.visibility("hidden");
  assert.equal(rt.fetches[0].signal.aborted, true);
  rt.advance(60_000);
  assert.equal(rt.fetches.length, 1, "hidden tab cannot schedule more GETs");

  rt.visibility("visible");
  assert.equal(rt.fetches.length, 2, "resume must request fresh data immediately");

  const fresh = validProgress("2026-10-20T18:06:00.000Z");
  rt.fetches[1].settle(fresh);
  await settleMicrotasks();
  assert.equal((observed.at(-1) as { sampledAt?: string })?.sampledAt, fresh.sampledAt);

  rt.fetches[0].settle(validProgress("2026-10-20T18:05:59.000Z"));
  await settleMicrotasks();
  assert.equal((observed.at(-1) as { sampledAt?: string })?.sampledAt, fresh.sampledAt,
    "the cancelled previous generation cannot overwrite resumed evidence");

  unsubscribe();
  assert.equal(rt.listeners.get("visibilitychange")?.size, 0);
});

test("stale or impossible successful responses clear live override without stopping polling", async () => {
  const rt = createRuntime();
  const seen: unknown[] = [];
  const stop = rt.bridge.subscribe((value) => seen.push(value));
  rt.fetches[0].settle(validProgress());
  await settleMicrotasks();
  assert.equal((seen.at(-1) as { available?: boolean })?.available, true);

  rt.advance(5_000);
  rt.fetches[1].settle(validProgress("2020-01-01T00:00:00.000Z"));
  await settleMicrotasks();
  assert.equal(seen.at(-1), null, "stale sample cannot remain a live override");

  rt.advance(5_000);
  rt.fetches[2].settle({ ...validProgress(), completedClasses: 5, totalClasses: 2 });
  await settleMicrotasks();
  assert.equal(seen.at(-1), null, "impossible class totals fail closed");
  rt.advance(5_000);
  rt.fetches[3].settle(validProgress());
  await settleMicrotasks();
  assert.equal((seen.at(-1) as { available?: boolean })?.available, true,
    "future valid Recovery samples still work");
  stop();
});

test("HTTP denial, malformed JSON and transport errors fail closed but recover", async () => {
  const rt = createRuntime();
  const observed: unknown[] = [];
  const unsubscribe = rt.bridge.subscribe((value) => observed.push(value));
  rt.fetches[0].settle(validProgress());
  await settleMicrotasks();
  assert.equal((observed.at(-1) as { available?: boolean })?.available, true);

  rt.advance(5_000);
  rt.fetches[1].settle({ error: "unavailable" }, false);
  await settleMicrotasks();
  assert.equal(observed.at(-1), null, "HTTP failures clear the live override");

  rt.advance(5_000);
  rt.fetches[2].invalidJson();
  await settleMicrotasks();
  assert.equal(observed.at(-1), null, "invalid JSON fails closed");

  rt.advance(5_000);
  rt.fetches[3].fail(new Error("network disconnected"));
  await settleMicrotasks();
  assert.equal(observed.at(-1), null, "network failures fail closed");

  rt.advance(5_000);
  rt.fetches[4].settle(validProgress("2026-10-20T18:05:20.000Z"));
  await settleMicrotasks();
  assert.equal((observed.at(-1) as { available?: boolean })?.available, true);
  unsubscribe();
});

test("4s deadline aborts Recovery GET; failed response clears previous live override", async () => {
  const rt = createRuntime();
  const observed: unknown[] = [];
  const unsubscribe = rt.bridge.subscribe((x) => observed.push(x));

  const fresh = validProgress();
  rt.fetches[0].settle(fresh);
  await settleMicrotasks();
  assert.equal((observed.at(-1) as { available?: boolean })?.available, true);

  rt.advance(5_000);
  assert.equal(rt.fetches.length, 2);
  rt.advance(4_000);
  assert.equal(rt.fetches[1].signal.aborted, true, "4s deadline reached");

  // Some test transports ignore cancellation. The resolution must still fail
  // without allowing a malformed response to become live data.
  rt.fetches[1].fail();
  await settleMicrotasks();
  assert.equal(observed.at(-1), null);
  unsubscribe();
});
