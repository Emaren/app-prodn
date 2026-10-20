#!/usr/bin/env node
"use strict";

/**
 * Real Chromium, disposable Next.js server, six public instrument routes.
 * Intercepts only GET readers with explicit fixtures. No network egress,
 * production credentials, wallet signing, Wolo mutations, or operator actions.
 * DOM visibility tests are SIMULATED; not an OS background-tab certificate.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const base = process.env.BROWSER_BASE_URL;
const home = process.env.PW_HOME;
const evidenceDir = process.env.AOE2WAR_BROWSER_EVIDENCE;
if (base !== "http://127.0.0.1:3137" || !home || !evidenceDir) {
  throw new Error("Instrument acceptance requires isolated CI loopback and evidence paths");
}
if (process.env.AOE2WAR_PROD_DB_PREVIEW === "true") {
  throw new Error("Production preview forbidden");
}
const { chromium } = require(path.join(home, "node_modules", "playwright"));
const sha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const buildId = fs.readFileSync(".next/BUILD_ID", "utf8").trim();
fs.mkdirSync(evidenceDir, { recursive: true });
const receipt = {
  schema: 1,
  sourceSha: sha,
  buildId,
  environment: "GitHub Actions disposable Next production build + local Chromium",
  productionDatabase: false,
  authenticatedAdmin: false,
  financialActions: false,
  documentVisibility: "synthetic DOM visibilitychange only (NOT OS background)",
  status: "RUNNING",
  cases: [],
  errors: [],
  untested: [
    "real OS background-tab throttling",
    "authenticated staging operator and exact deployed source",
    "manual keyboard/screen-reader/mobile-device accessibility audit",
    "independent production/rollback approvals",
  ],
};
const routes = [
  { slug: "kingdom-tests", kind: "tests", urls: ["/api/general-inspections", "/api/kingdom-index"] },
  { slug: "kingdom-sensors", kind: "sensors", urls: ["/api/general-inspections", "/api/kingdom-intelligence"] },
  { slug: "kingdom-systems", kind: "systems", urls: ["/api/kingdom-route-census", "/api/kingdom-patrol", "/api/kingdom-intelligence"] },
  { slug: "kingdom-recovery", kind: "recovery", urls: ["/api/kingdom-intelligence", "/api/general-inspections"] },
  { slug: "replay-laboratory", kind: "replay", urls: ["/api/hd-replay-engine"] },
  { slug: "wolo-machine", kind: "wolo", urls: ["/api/wolo/status", "/api/kingdom-intelligence"] },
];
const allowed = new Set(routes.flatMap((r) => r.urls));
const mock = (url) => {
  if (url === "/api/general-inspections") {
    return { schema: 1, categories: [], overallScore: 60, overallState: "amber", notes: [] };
  }
  if (url === "/api/kingdom-index") return { schema: 1, pages: [] };
  if (url === "/api/kingdom-intelligence") return { available: false, stale: true };
  if (url === "/api/kingdom-route-census") return { status: "unavailable", counts: {} };
  if (url === "/api/kingdom-patrol") return { schema: 1, assigned: 0, registered: 0 };
  if (url === "/api/hd-replay-engine") return { schema: 1, counts: {}, unknown: {} };
  return { healthy: false, chainId: "unverified", peers: 0 };
};

function record(caseName, data = {}) {
  receipt.cases.push({ name: caseName, status: "PASS", ...data });
}
function save() {
  fs.writeFileSync(path.join(evidenceDir, "receipt.json"), JSON.stringify(receipt, null, 2) + "\n");
}
async function poll(fn, label, timeout = 12000) {
  const start = Date.now();
  while (!(await fn())) {
    if (Date.now() - start > timeout) throw new Error("Timed out: " + label);
    await new Promise((r) => setTimeout(r, 100));
  }
}
async function setVisibility(page, value) {
  const state = await page.evaluate((visible) => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => visible,
    });
    document.dispatchEvent(new Event("visibilitychange"));
    return document.visibilityState;
  }, value);
  assert.equal(state, value);
}
function stateLocator(page, source) {
  return page.locator('main[data-kind]:visible').first().locator('section[aria-label="Telemetry source states"] [title="' + source + '"] b');
}

async function run() {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      reducedMotion: "reduce",
    });
    // Network egress fail-closed. All allowed page data is synthetic GET-only.
    const blockedMutations = [];
    await context.route("**/*", async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      if (req.method() !== "GET" && req.method() !== "HEAD") {
        blockedMutations.push({ method: req.method(), path: url.pathname });
        return route.abort("blockedbyclient");
      }
      if (url.origin !== base) return route.abort("blockedbyclient");
      if (url.pathname.startsWith("/api/")) return route.abort("blockedbyclient");
      return route.continue();
    });

    const errors = [];
    for (const entry of routes) {
      const page = await context.newPage();
      page.on("pageerror", (e) => errors.push(entry.slug + ": " + e.message));
      const calls = Object.fromEntries(entry.urls.map((url) => [url, 0]));
      await page.route("**/api/**", async (route) => {
        const pathName = new URL(route.request().url()).pathname;
        if (route.request().method() !== "GET" || !allowed.has(pathName)) {
          return route.abort("blockedbyclient");
        }
        calls[pathName] = (calls[pathName] || 0) + 1;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(mock(pathName)),
        });
      });
      const response = await page.goto(base + "/" + entry.slug, {
        waitUntil: "domcontentloaded",
        timeout: 50000,
      });
      assert.equal(response?.status(), 200, entry.slug + " should return HTTP 200");
      await page.locator('main[data-kind="' + entry.kind + '"]:visible').first().waitFor();
      await poll(() => entry.urls.every((url) => calls[url] >= 1), entry.slug + " initial GET");
      await poll(async () => {
        for (const url of entry.urls) {
          if ((await stateLocator(page, url).textContent()) !== "OBSERVED") return false;
        }
        return true;
      }, entry.slug + " readable source badges");
      const summary = page.locator('main[data-kind]:visible').first().locator('section[aria-label="Telemetry source states"]');
      assert.ok((await summary.textContent()).includes("OBSERVED"));
      await page.screenshot({
        path: path.join(evidenceDir, entry.slug + "-desktop.png"),
        fullPage: true,
      });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(150);
      await page.screenshot({
        path: path.join(evidenceDir, entry.slug + "-mobile.png"),
        fullPage: true,
      });
      record("six-page isolated Chromium render: " + entry.slug, {
        httpStatus: response.status(), kind: entry.kind, calls,
        evidence: [entry.slug + "-desktop.png", entry.slug + "-mobile.png"],
      });
      await page.close();
    }
    assert.deepEqual(blockedMutations, [], "No client mutation must occur");
    assert.deepEqual(errors, [], "No uncaught errors on six public pages");

    // Real page lifecycle: one success, one never-resolving GET until a 10s timeout.
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push("lifecycle: " + e.message));
    const first = "/api/general-inspections";
    const second = "/api/kingdom-index";
    let totalFirst = 0;
    let totalSecond = 0;
    let holdIndex = true;
    let releaseOld;
    await page.route("**/api/**", async (route) => {
      const u = new URL(route.request().url()).pathname;
      if (!allowed.has(u) || route.request().method() !== "GET") {
        return route.abort("blockedbyclient");
      }
      if (u === first) totalFirst++;
      if (u === second) totalSecond++;
      if (u === second && holdIndex) {
        holdIndex = false;
        await new Promise((resolve) => { releaseOld = resolve; });
      }
      try {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(mock(u)),
        });
      } catch {
        // The real client aborted the old fetch; late transport settlement
        // must not overwrite the newer observation.
      }
    });
    await page.goto(base + "/kingdom-tests", { waitUntil: "domcontentloaded", timeout: 50000 });
    await poll(() => totalFirst >= 1 && totalSecond >= 1, "initial test readers");
    await poll(async () => (await stateLocator(page, first).textContent()) === "OBSERVED",
      "successful first reader");
    assert.equal(await stateLocator(page, second).textContent(), "UNKNOWN",
      "unresolved source must not display OBSERVED");
    await page.waitForTimeout(10600);
    assert.equal(await stateLocator(page, first).textContent(), "OBSERVED",
      "timing out the second source must retain verified first source");
    assert.equal(await stateLocator(page, second).textContent(), "UNKNOWN",
      "timed-out source remains unknown, not stale observed");
    record("partial-success 10s timeout", { firstStatus: "OBSERVED", secondStatus: "UNKNOWN" });

    await setVisibility(page, "hidden");
    await poll(async () => (await stateLocator(page, first).textContent()) === "UNKNOWN",
      "hide clears stale observed");
    const hiddenCount = totalFirst + totalSecond;
    await page.waitForTimeout(1700);
    assert.equal(totalFirst + totalSecond, hiddenCount, "no GET during simulated hidden interval");
    await setVisibility(page, "visible");
    await poll(() => totalFirst > 1 && totalSecond > 1, "fresh visible resume", 4000);
    await poll(async () => {
      return (await stateLocator(page, first).textContent()) === "OBSERVED" &&
        (await stateLocator(page, second).textContent()) === "OBSERVED";
    }, "fresh observed badges");
    releaseOld?.();
    await page.waitForTimeout(300);
    assert.equal(await stateLocator(page, second).textContent(), "OBSERVED",
      "late cancelled request cannot overwrite resumed evidence");
    record("simulated visibility hide-resume and stale-fenced reader", {
      requestsWhileHidden: 0, resumedRequests: { first: totalFirst, second: totalSecond },
      independentRealBackgroundTab: false,
    });
    assert.deepEqual(errors, [], "no uncaught lifecycle browser errors");
    await page.close();
    await context.close();
  } finally {
    await browser.close();
  }
}
run().then(
  () => {
    receipt.status = "PASS";
    save();
    console.log("PASS: six Kingdom instrument pages Chromium on exact SHA " + sha);
    console.log("NOTE: real OS tab throttle, authenticated staging and deployment remain UNTESTED");
  },
  (e) => {
    receipt.status = "FAIL";
    receipt.errors.push(e?.stack || String(e));
    save();
    console.error(e);
    process.exitCode = 1;
  },
);
