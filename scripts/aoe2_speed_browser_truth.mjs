#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 2) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key?.startsWith("--") || value === undefined) throw new Error(`bad argument ${key || ""}`);
    out[key.slice(2)] = value;
  }
  return out;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");
const args = parseArgs(process.argv);
const baseUrl = String(args["base-url"] || "https://aoe2war.com").replace(/\/$/, "");
const routesPath = path.resolve(String(args["routes-json"] || ""));
const outDir = path.resolve(String(args["out-dir"] || ""));
const releaseSha = String(args["release-sha"] || "");
const buildVersion = String(args["build-version"] || "");
const chrome = String(args.chrome || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
const postLoadMs = Number(args["post-load-ms"] || 1200);
const loadTimeoutMs = Number(args["load-timeout-ms"] || 15000);
if (!routesPath || !outDir || !releaseSha || !buildVersion) {
  throw new Error("routes, output, release SHA and build version are required");
}
const routes = JSON.parse(await readFile(routesPath, "utf8"));
if (!Array.isArray(routes) || routes.length === 0) throw new Error("route cohort is empty");
await mkdir(path.join(outDir, "screenshots"), { recursive: true });

const profileDir = await mkdtemp(path.join(os.tmpdir(), "aoe2war-browser-truth-"));
const chromeArgs = [
  "--headless=new",
  "--remote-debugging-port=0",
  `--user-data-dir=${profileDir}`,
  "--no-first-run",
  "--disable-default-apps",
  "--hide-scrollbars",
];
if (/^https:\/\/(?:localhost|127\.0\.0\.1)(?::|\/|$)/i.test(baseUrl)) {
  chromeArgs.push("--ignore-certificate-errors");
}
chromeArgs.push("about:blank");
const child = spawn(chrome, chromeArgs, { stdio: "ignore" });

let port = null;
for (let attempt = 0; attempt < 120; attempt += 1) {
  try {
    const active = await readFile(path.join(profileDir, "DevToolsActivePort"), "utf8");
    port = Number(active.split("\n")[0]);
    if (Number.isFinite(port) && port > 0) break;
  } catch {}
  await sleep(50);
}
if (!port) throw new Error("Chrome DevTools port did not become available");
const tab = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" }).then((r) => r.json());
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
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message || JSON.stringify(message.error)));
    else resolve(message.result);
  } else {
    events.push(message);
  }
};
function command(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
await command("Page.enable");
await command("Runtime.enable");
await command("Log.enable");
await command("Network.enable");
const viewports = [
  { name: "desktop", width: 1440, height: 900, mobile: false },
  { name: "phone", width: 390, height: 844, mobile: true },
];

function takeEventsSince(startIndex) {
  return events.slice(startIndex);
}

async function waitForLoad(startIndex, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (events.slice(startIndex).some((row) => row.method === "Page.loadEventFired")) return true;
    await sleep(50);
  }
  return false;
}

async function evaluateValue(expression) {
  const result = await command("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Runtime.evaluate failed");
  return result.result?.value;
}

function safeSlug(route) {
  if (route === "/") return "home";
  return route.replace(/^\//, "").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 120) || "route";
}
const METRICS_EXPRESSION = String.raw`(() => {
  const nav = performance.getEntriesByType("navigation")[0];
  const ready = window.__AOE2WAR_SPEED_READY__ || {};
  const de = document.documentElement;
  const body = document.body;
  const width = window.innerWidth;
  const offenders = [];
  for (const el of document.querySelectorAll("body *")) {
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    if (r.right > width + 2 || r.left < -2) {
      const tag = el.tagName.toLowerCase();
      const label = el.id ? tag + "#" + el.id :
        tag + Array.from(el.classList).slice(0, 3).map((x) => "." + x).join("");
      offenders.push({ label, left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) });
      if (offenders.length >= 12) break;
    }
  }
  const scrollWidth = Math.max(de.scrollWidth, body?.scrollWidth || 0);
  const readyValues = Object.values(ready).filter((value) => Number.isFinite(value));
  return {
    url: location.href,
    title: document.title,
    ready,
    readyObserved: readyValues.length > 0,
    readyAfterNavigationMs: readyValues.length ? Math.min(...readyValues) - performance.timeOrigin : null,
    innerWidth: width,
    innerHeight: window.innerHeight,
    scrollWidth,
    overflowX: scrollWidth > width + 2,
    overflowOffenders: offenders,
    domContentLoadedMs: nav?.domContentLoadedEventEnd ?? null,
    loadMs: nav?.loadEventEnd ?? null,
    transferSize: nav?.transferSize ?? null,
    encodedBodySize: nav?.encodedBodySize ?? null,
    decodedBodySize: nav?.decodedBodySize ?? null,
    bodyTextLength: (body?.innerText || "").trim().length,
  };
})()`;
const rows = [];
try {
  for (const viewport of viewports) {
    await command("Emulation.setDeviceMetricsOverride", {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      mobile: viewport.mobile,
    });
    for (const spec of routes) {
      await command("Network.clearBrowserCookies");
      await command("Network.clearBrowserCache");
      const startIndex = events.length;
      const startedAt = Date.now();
      const route = String(spec.route);
      const url = `${baseUrl}${route}`;
      await command("Page.navigate", { url });
      const loaded = await waitForLoad(startIndex, loadTimeoutMs);
      await sleep(postLoadMs);
      if (spec.expect_ready) {
        const deadline = Date.now() + 4000;
        while (Date.now() < deadline) {
          const ready = await evaluateValue("Object.keys(window.__AOE2WAR_SPEED_READY__ || {}).length > 0");
          if (ready) break;
          await sleep(100);
        }
      }
      const metrics = await evaluateValue(METRICS_EXPRESSION);
      const routeEvents = takeEventsSince(startIndex);
      const documentResponse = routeEvents
        .filter((event) => event.method === "Network.responseReceived" && event.params?.type === "Document")
        .map((event) => event.params.response)
        .find((response) => String(response?.url || "").startsWith(url));
      const exceptions = routeEvents
        .filter((event) => event.method === "Runtime.exceptionThrown")
        .map((event) => {
          const details = event.params?.exceptionDetails || {};
          const exception = details.exception || {};
          const frames = details.stackTrace?.callFrames || [];
          return {
            text: String(details.text || "Uncaught exception"),
            description: String(exception.description || exception.value || ""),
            url: String(details.url || ""),
            line: Number(details.lineNumber ?? -1),
            column: Number(details.columnNumber ?? -1),
            stack: frames.slice(0, 8).map((frame) =>
              `${frame.functionName || "<anonymous>"} @ ${frame.url || ""}:${Number(frame.lineNumber ?? -1) + 1}:${Number(frame.columnNumber ?? -1) + 1}`
            ),
          };
        });
      const consoleErrors = routeEvents
        .filter((event) => event.method === "Runtime.consoleAPICalled" && event.params?.type === "error")
        .map((event) => (event.params?.args || []).map((arg) => arg.value ?? arg.description ?? "").join(" ").slice(0, 500));
      const failedResources = routeEvents
        .filter((event) => event.method === "Network.loadingFailed")
        .map((event) => ({ error: event.params?.errorText || "", canceled: Boolean(event.params?.canceled) }));
      const screenshot = await command("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
      const screenshotBuffer = Buffer.from(screenshot.data, "base64");
      const screenshotName = `${safeSlug(route)}--${viewport.name}.png`;
      const screenshotPath = path.join(outDir, "screenshots", screenshotName);
      await writeFile(screenshotPath, screenshotBuffer);
      const status = Number(documentResponse?.status || 0);
      const failures = [];
      if (!loaded) failures.push("load_event_timeout");
      if (status < 200 || status >= 400) failures.push(`document_status_${status || "missing"}`);
      if (metrics?.overflowX) failures.push("horizontal_overflow");
      if ((metrics?.bodyTextLength || 0) < 20) failures.push("empty_or_near_empty_body");
      if (spec.expect_ready && !metrics?.readyObserved) failures.push("expected_ready_missing");
      if (exceptions.length) failures.push("runtime_exception");
      if (consoleErrors.length) failures.push("console_error");
      rows.push({
        route,
        viewport: viewport.name,
        width: viewport.width,
        height: viewport.height,
        expect_ready: Boolean(spec.expect_ready),
        loaded,
        elapsed_ms: Date.now() - startedAt,
        document_status: status || null,
        metrics,
        runtime_exceptions: exceptions,
        console_errors: consoleErrors,
        failed_resource_count: failedResources.length,
        failed_resources: failedResources.slice(0, 10),
        screenshot: `screenshots/${screenshotName}`,
        screenshot_bytes: screenshotBuffer.length,
        screenshot_sha256: sha256(screenshotBuffer),
        failures,
        pass: failures.length === 0,
      });
      process.stderr.write(`${viewport.name} ${route} ${failures.length ? "FAIL " + failures.join(",") : "PASS"}\n`);
    }
  }
} finally {
  try { ws.close(); } catch {}
  child.kill("SIGTERM");
  await sleep(100);
  await rm(profileDir, { recursive: true, force: true });
}
const failing = rows.filter((row) => !row.pass);
const readyExpected = rows.filter((row) => row.expect_ready);
const readyObserved = readyExpected.filter((row) => row.metrics?.readyObserved);
const receipt = {
  schema: 1,
  kind: "aoe2war-browser-truth",
  generated_at: new Date().toISOString(),
  base_url: baseUrl,
  release_sha: releaseSha,
  build_version: buildVersion,
  route_count: routes.length,
  observation_count: rows.length,
  viewports,
  summary: {
    pass: failing.length === 0,
    passed: rows.length - failing.length,
    failed: failing.length,
    overflow_failures: rows.filter((row) => row.failures.includes("horizontal_overflow")).length,
    runtime_error_failures: rows.filter((row) => row.failures.includes("runtime_exception") || row.failures.includes("console_error")).length,
    ready_expected: readyExpected.length,
    ready_observed: readyObserved.length,
  },
  production_mutated: false,
  database_mutated: false,
  wolo_mutated: false,
  rows,
};
await writeFile(path.join(outDir, "receipt.json"), JSON.stringify(receipt, null, 2) + "\n");
console.log(JSON.stringify(receipt));
process.exitCode = failing.length ? 2 : 0;
