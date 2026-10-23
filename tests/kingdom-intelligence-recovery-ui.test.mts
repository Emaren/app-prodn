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
    raw + "\n;(globalThis as any).__recoveryTestBridge = { subscribe, subscribeSignalState, getSignalState };",
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
    subscribeSignalState: (listener: () => void) => () => void;
    getSignalState: () => string;
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

test("terminal preview denial announces availability without extra GETs", async () => {
  const rt = createRuntime();
  const states: string[] = [rt.bridge.getSignalState()];
  const offState = rt.bridge.subscribeSignalState(() => states.push(rt.bridge.getSignalState()));
  const offLeft = rt.bridge.subscribe(() => {});
  const offRight = rt.bridge.subscribe(() => {});
  assert.equal(rt.fetches.length, 1, "both panels still share one request");
  rt.fetches[0].settle({ available: false, reason: "operator_preview_only" });
  await settleMicrotasks();
  assert.equal(rt.bridge.getSignalState(), "operator_preview_only");
  rt.advance(30_000);
  rt.visibility("hidden");
  rt.visibility("visible");
  assert.equal(rt.fetches.length, 1, "terminal preview cannot resume polling");
  assert.equal(rt.bridge.getSignalState(), "operator_preview_only");
  assert.deepEqual(states, ["awaiting_sample", "operator_preview_only"]);
  offLeft(); offRight(); offState();
});

test("stale, valid, hidden, and reactivated observations remain distinguishable", async () => {
  const rt = createRuntime();
  const states: string[] = [];
  const offState = rt.bridge.subscribeSignalState(() => states.push(rt.bridge.getSignalState()));
  const off = rt.bridge.subscribe(() => {});
  rt.fetches[0].settle(validProgress("2020-01-01T00:00:00.000Z"));
  await settleMicrotasks();
  assert.equal(rt.bridge.getSignalState(), "unavailable");
  rt.advance(5_000);
  rt.fetches[1].settle(validProgress("2026-10-20T18:05:05.000Z"));
  await settleMicrotasks();
  assert.equal(rt.bridge.getSignalState(), "live");
  rt.visibility("hidden");
  assert.equal(rt.bridge.getSignalState(), "paused");
  rt.visibility("visible");
  assert.equal(rt.bridge.getSignalState(), "awaiting_sample");
  assert.equal(rt.fetches.length, 3, "resume triggers one fresh request");
  rt.fetches[2].settle(validProgress("2026-10-20T18:05:05.000Z"));
  await settleMicrotasks();
  assert.equal(rt.bridge.getSignalState(), "live");
  assert.deepEqual(states, ["unavailable", "awaiting_sample", "live", "paused", "awaiting_sample", "live"]);
  off(); offState();
});
