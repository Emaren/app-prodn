#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 2) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(`bad argument ${key || ""}`);
    }
    out[key.slice(2)] = value;
  }
  return out;
}

const args = parseArgs(process.argv);
const url = String(args.url || "https://aoe2war.com/");
const samples = Math.max(1, Math.min(20, Number(args.samples || 8)));
const viewportName = String(args.viewport || "desktop");
const releaseSha = String(args["release-sha"] || "");
const buildVersion = String(args["build-version"] || "");
const outDir = path.resolve(String(args["out-dir"] || ""));
const chrome = String(
  args.chrome || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
);
const postLoadMs = Math.max(500, Number(args["post-load-ms"] || 2500));
const loadTimeoutMs = Math.max(5000, Number(args["load-timeout-ms"] || 20000));
const commandTimeoutMs = Math.max(5000, Number(args["command-timeout-ms"] || 15000));
const sampleAttempts = Math.max(1, Math.min(3, Number(args["sample-attempts"] || 2)));
if (!outDir) throw new Error("--out-dir is required");
await mkdir(outDir, { recursive: true });

const viewports = {
  desktop: { width: 1440, height: 900, mobile: false },
  phone: { width: 390, height: 844, mobile: true },
};
const viewport = viewports[viewportName];
if (!viewport) throw new Error("--viewport must be desktop or phone");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function percentile(values, q) {
  if (!values.length) return null;
  const rows = [...values].sort((a, b) => a - b);
  if (rows.length === 1) return rows[0];
  const pos = (rows.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return rows[lo];
  return rows[lo] + (rows[hi] - rows[lo]) * (pos - lo);
}

function summarize(values) {
  const rows = values.filter((v) => Number.isFinite(v));
  return {
    count: rows.length,
    p50: percentile(rows, 0.5),
    p75: percentile(rows, 0.75),
    p95: percentile(rows, 0.95),
    max: rows.length ? Math.max(...rows) : null,
  };
}

const INIT_SCRIPT = String.raw`(() => {
  const state = window.__AOE2WAR_COLD_DIAG__ = {
    lcp: [],
    longTasks: [],
    layoutShifts: [],
  };
  const elementLabel = (el) => {
    if (!el) return null;
    const tag = String(el.tagName || "").toLowerCase();
    const id = el.id ? "#" + el.id : "";
    const cls = Array.from(el.classList || []).slice(0, 4)
      .map((x) => "." + x).join("");
    return (tag + id + cls).slice(0, 240);
  };
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        state.lcp.push({
          startTime: e.startTime,
          renderTime: e.renderTime,
          loadTime: e.loadTime,
          size: e.size,
          id: e.id || "",
          url: e.url || "",
          element: elementLabel(e.element),
        });
      }
    }).observe({ type: "largest-contentful-paint", buffered: true });
  } catch {}
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        state.longTasks.push({
          startTime: e.startTime,
          duration: e.duration,
          name: e.name || "",
        });
      }
    }).observe({ type: "longtask", buffered: true });
  } catch {}
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (!e.hadRecentInput) {
          state.layoutShifts.push({ startTime: e.startTime, value: e.value });
        }
      }
    }).observe({ type: "layout-shift", buffered: true });
  } catch {}
})();`;

const SNAPSHOT_EXPR = String.raw`(() => {
  const nav = performance.getEntriesByType("navigation")[0];
  const paints = Object.fromEntries(
    performance.getEntriesByType("paint").map((e) => [e.name, e.startTime])
  );
  const ready = Object.values(window.__AOE2WAR_SPEED_READY__ || {})
    .filter((v) => Number.isFinite(v))
    .map((v) => v - performance.timeOrigin);
  const diag = window.__AOE2WAR_COLD_DIAG__ || {};
  const lcp = Array.isArray(diag.lcp) ? diag.lcp : [];
  const longTasks = Array.isArray(diag.longTasks) ? diag.longTasks : [];
  const shifts = Array.isArray(diag.layoutShifts) ? diag.layoutShifts : [];
  const resources = performance.getEntriesByType("resource")
    .map((e) => ({
      name: e.name,
      initiatorType: e.initiatorType,
      startTime: e.startTime,
      duration: e.duration,
      responseEnd: e.responseEnd,
      transferSize: e.transferSize,
      encodedBodySize: e.encodedBodySize,
      decodedBodySize: e.decodedBodySize,
      renderBlockingStatus: e.renderBlockingStatus || "",
    }))
    .sort((a, b) => b.duration - a.duration)
    .slice(0, 40);
  return {
    href: location.href,
    title: document.title,
    navigation: nav ? {
      startTime: nav.startTime,
      domainLookupStart: nav.domainLookupStart,
      domainLookupEnd: nav.domainLookupEnd,
      connectStart: nav.connectStart,
      secureConnectionStart: nav.secureConnectionStart,
      connectEnd: nav.connectEnd,
      requestStart: nav.requestStart,
      responseStart: nav.responseStart,
      responseEnd: nav.responseEnd,
      domInteractive: nav.domInteractive,
      domContentLoadedEventEnd: nav.domContentLoadedEventEnd,
      loadEventEnd: nav.loadEventEnd,
      transferSize: nav.transferSize,
      encodedBodySize: nav.encodedBodySize,
      decodedBodySize: nav.decodedBodySize,
      nextHopProtocol: nav.nextHopProtocol,
    } : null,
    paints,
    readyMs: ready.length ? Math.min(...ready) : null,
    lcpEntries: lcp,
    finalLcp: lcp.length ? lcp[lcp.length - 1] : null,
    longTasks,
    longTaskCount: longTasks.length,
    longTaskTotalMs: longTasks.reduce((sum, e) => sum + e.duration, 0),
    maxLongTaskMs: longTasks.length
      ? Math.max(...longTasks.map((e) => e.duration))
      : 0,
    cls: shifts.reduce((sum, e) => sum + e.value, 0),
    resources,
    resourceCount: performance.getEntriesByType("resource").length,
  };
})()`;

async function connectChrome(profileDir) {
  const chromeArgs = [
    "--headless=new",
    "--remote-debugging-port=0",
    `--user-data-dir=${profileDir}`,
    "--no-first-run",
    "--disable-default-apps",
    "--hide-scrollbars",
    "about:blank",
  ];
  const child = spawn(chrome, chromeArgs, { stdio: "ignore" });
  let port = null;
  for (let attempt = 0; attempt < 160; attempt += 1) {
    try {
      const active = await readFile(path.join(profileDir, "DevToolsActivePort"), "utf8");
      port = Number(active.split("\n")[0]);
      if (Number.isFinite(port) && port > 0) break;
    } catch {}
    await sleep(50);
  }
  if (!port) {
    child.kill("SIGTERM");
    throw new Error("Chrome DevTools port did not become available");
  }
  const tab = await fetch(
    `http://127.0.0.1:${port}/json/new?about:blank`,
    { method: "PUT" }
  ).then((r) => r.json());
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  let nextId = 0;
  const pending = new Map();
  const events = [];
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject, timer } = pending.get(message.id);
      pending.delete(message.id);
      clearTimeout(timer);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    } else {
      events.push(message);
    }
  };
  const command = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error("CDP command timed out after " + commandTimeoutMs + "ms: " + method));
      }, commandTimeoutMs);
      pending.set(id, { resolve, reject, timer });
      try {
        ws.send(JSON.stringify({ id, method, params }));
      } catch (error) {
        clearTimeout(timer);
        pending.delete(id);
        reject(error);
      }
    });

  return { child, ws, events, command };
}

async function waitForLoad(events, startIndex) {
  const deadline = Date.now() + loadTimeoutMs;
  while (Date.now() < deadline) {
    if (events.slice(startIndex).some((e) => e.method === "Page.loadEventFired")) {
      return true;
    }
    await sleep(50);
  }
  return false;
}

async function evaluateValue(command, expression) {
  const result = await command("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || "Runtime.evaluate failed");
  }
  return result.result?.value;
}

async function runOne(index) {
  const profileDir = await mkdtemp(path.join(os.tmpdir(), "aoe2war-cold-lcp-"));
  let session = null;
  try {
    session = await connectChrome(profileDir);
    const { command, events } = session;
    await command("Page.enable");
    await command("Runtime.enable");
    await command("Network.enable");
    await command("Network.setExtraHTTPHeaders", {
      headers: {
        "X-AoE2WAR-Synthetic": "speedos-cold-lcp",
      },
    });
    await command("Network.setCacheDisabled", { cacheDisabled: true });
    await command("Emulation.setDeviceMetricsOverride", {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      mobile: viewport.mobile,
    });
    await command("Page.addScriptToEvaluateOnNewDocument", {
      source: INIT_SCRIPT,
    });

    const startIndex = events.length;
    const wallStart = Date.now();
    await command("Page.navigate", { url });
    const loaded = await waitForLoad(events, startIndex);
    await sleep(postLoadMs);
    const metrics = await evaluateValue(command, SNAPSHOT_EXPR);
    const routeEvents = events.slice(startIndex);
    const documentResponse = routeEvents
      .filter((e) => e.method === "Network.responseReceived" && e.params?.type === "Document")
      .map((e) => e.params?.response)
      .find((r) => String(r?.url || "").startsWith(url));
    const failed = routeEvents
      .filter((e) => e.method === "Network.loadingFailed")
      .map((e) => ({
        error: e.params?.errorText || "",
        canceled: Boolean(e.params?.canceled),
      }));
    return {
      sample: index,
      viewport: viewportName,
      loaded,
      elapsedMs: Date.now() - wallStart,
      documentStatus: Number(documentResponse?.status || 0) || null,
      documentProtocol: documentResponse?.protocol || null,
      documentRemoteIp: documentResponse?.remoteIPAddress || null,
      documentFromDiskCache: Boolean(documentResponse?.fromDiskCache),
      documentFromServiceWorker: Boolean(documentResponse?.fromServiceWorker),
      documentTiming: documentResponse?.timing || null,
      metrics,
      failedResources: failed.slice(0, 20),
    };
  } finally {
    try { session?.ws.close(); } catch {}
    const child = session?.child;
    if (child && child.exitCode === null && child.signalCode === null) {
      const exited = new Promise((resolve) => child.once("exit", resolve));
      try { child.kill("SIGTERM"); } catch {}
      await Promise.race([exited, sleep(1500)]);
      if (child.exitCode === null && child.signalCode === null) {
        try { child.kill("SIGKILL"); } catch {}
        await Promise.race([
          new Promise((resolve) => child.once("exit", resolve)),
          sleep(500),
        ]);
      }
    }
    await rm(profileDir, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    });
  }
}

const rows = [];
for (let i = 1; i <= samples; i += 1) {
  let row = null;
  let lastError = null;
  for (let attempt = 1; attempt <= sampleAttempts; attempt += 1) {
    try {
      row = await runOne(i);
      row.harnessAttempt = attempt;
      break;
    } catch (error) {
      lastError = error;
      process.stderr.write(
        "sample " + i + "/" + samples + " attempt " + attempt + "/" + sampleAttempts +
        " failed: " + (error?.message || error) + "\n"
      );
    }
  }
  if (!row) throw lastError || new Error("sample " + i + "/" + samples + " failed");
  rows.push(row);
  const lcp = row.metrics?.finalLcp?.startTime;
  const ready = row.metrics?.readyMs;
  const load = row.metrics?.navigation?.loadEventEnd;
  process.stderr.write(
    "sample " + i + "/" + samples + " attempt=" + row.harnessAttempt +
    " ready=" + (ready?.toFixed?.(1) ?? "-") + "ms " +
    "lcp=" + (lcp?.toFixed?.(1) ?? "-") + "ms load=" +
    (load?.toFixed?.(1) ?? "-") + "ms\n"
  );
}

const lcpValues = rows.map((r) => r.metrics?.finalLcp?.startTime);
const readyValues = rows.map((r) => r.metrics?.readyMs);
const loadValues = rows.map((r) => r.metrics?.navigation?.loadEventEnd);
const dclValues = rows.map((r) => r.metrics?.navigation?.domContentLoadedEventEnd);
const ttfbValues = rows.map((r) => r.metrics?.navigation?.responseStart);
const targetCounts = {};
for (const row of rows) {
  const lcp = row.metrics?.finalLcp;
  const key = lcp?.url || lcp?.element || "missing";
  targetCounts[key] = (targetCounts[key] || 0) + 1;
}

const receipt = {
  schema: 1,
  kind: "aoe2war-cold-process-lcp",
  generatedAt: new Date().toISOString(),
  releaseSha,
  buildVersion,
  url,
  viewport: viewportName,
  samples,
  postLoadMs,
  loadTimeoutMs,
  commandTimeoutMs,
  sampleAttempts,
  retriedSamples: rows.filter((row) => row.harnessAttempt > 1).map((row) => row.sample),
  productionMutated: false,
  databaseMutated: false,
  woloMutated: false,
  summary: {
    readyMs: summarize(readyValues),
    lcpMs: summarize(lcpValues),
    loadMs: summarize(loadValues),
    dclMs: summarize(dclValues),
    documentTtfbMs: summarize(ttfbValues),
    lcpTargets: Object.entries(targetCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([target, count]) => ({ target, count })),
    maxLongTaskMs: summarize(rows.map((r) => r.metrics?.maxLongTaskMs)),
    longTaskTotalMs: summarize(rows.map((r) => r.metrics?.longTaskTotalMs)),
  },
  rows,
};

const receiptPath = path.join(outDir, "receipt.json");
await writeFile(receiptPath, JSON.stringify(receipt, null, 2) + "\n");
console.log(JSON.stringify({ receipt: receiptPath, summary: receipt.summary }, null, 2));
