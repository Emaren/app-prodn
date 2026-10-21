#!/usr/bin/env node
"use strict";

/**
 * Exact-commit Chromium acceptance against a disposable local Next.js runtime.
 * No production URL, credential, operator action, replay mutation, or Wolo I/O.
 *
 * Public Recovery API responses are intercepted in the browser, so this proves
 * the real client bundle and the read-only page's polling implementation. It
 * does not certify the separate real operator-preview endpoint or production.
 */
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const home = process.env.PW_HOME;
const base = process.env.BROWSER_BASE_URL;
const destination = process.env.AOE2WAR_BROWSER_EVIDENCE;
if (!home || !destination || base !== "http://127.0.0.1:3137") {
  throw new Error("Isolated browser proof must use the pinned local CI runner only");
}
if (process.env.AOE2WAR_PROD_DB_PREVIEW === "true") {
  throw new Error("Production-data preview is forbidden in browser CI");
}
const { chromium } = require(path.join(home, "node_modules", "playwright"));
fs.mkdirSync(destination, { recursive: true });
const sourceSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const buildId = fs.readFileSync(".next/BUILD_ID", "utf8").trim();
assert.match(sourceSha, /^[0-9a-f]{40}$/);
assert.ok(buildId);

const result = {
  schema: 1,
  sourceSha,
  buildId,
  proofEnvironment: "GitHub Actions local, disposable Next server and Chromium",
  usesProductionDatabase: false,
  hasAdminCredentials: false,
  operatorCommandsSent: false,
  browser: "Chromium",
  realBackgroundVisibility: false,
  visibilityEventSimulated: true,
  certifiedProduction: false,
  tested: [],
  untested: [
    "Known replay fixture 200, requires an independently sourced read-only staging database",
    "Authenticated admin GET refresh, requires an independently authorized staging admin session",
    "Real tab-background throttling and actual operator-preview endpoint",
    "Protected release and deployed BUILD_ID verification",
  ],
  errors: [],
};

async function waitUntil(fn, name, maxMs = 12000) {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > maxMs) throw new Error("Timed out: " + name);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

async function setSimulatedVisibility(page, value) {
  await page.evaluate((state) => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get() { return state; },
    });
    document.dispatchEvent(new Event("visibilitychange"));
  }, value);
  const observed = await page.evaluate(() => document.visibilityState);
  assert.equal(observed, value);
}

async function run() {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox"],
  });
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      reducedMotion: "reduce",
    });
    // Fail closed on outbound traffic: do not let CI contact production hosts.
    await context.route("**/*", async (route) => {
      const url = route.request().url();
      if (url.startsWith(base + "/") || url === base) {
        return route.continue();
      }
      return route.abort("blockedbyclient");
    });

    const anonGet = await context.request.get(base + "/api/admin/aoe2war-os", {
      failOnStatusCode: false,
      timeout: 15000,
    });
    assert.equal(anonGet.status(), 401, "anonymous operator API GET must be 401");
    const denied = await anonGet.json();
    assert.equal(denied.detail, "Unauthorized");
    result.tested.push({ name: "anonymous admin GET denied", status: anonGet.status() });

    // Next server-component redirects can be emitted as a streamed 200 with
    // a client redirect instruction rather than a traditional HTTP 3xx.
    // Judge access by the actual Chromium navigation, not status-code folklore.
    const anonymousAdmin = await context.newPage();
    const anonymousNavigation = await anonymousAdmin.goto(base + "/admin/aoe2war-os", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    const initialStatus = anonymousNavigation?.status() ?? null;
    result.tested.push({ name: "anonymous admin page browser redirect", initialStatus });
    try {
      await anonymousAdmin.waitForURL(
        (url) => url.pathname === "/",
        { timeout: 12000 },
      );
    } catch (cause) {
      const html = await anonymousAdmin.content();
      result.errors.push("Admin redirect missing: initial HTTP " + initialStatus +
        "; final pathname " + new URL(anonymousAdmin.url()).pathname +
        "; streamed redirect marker " + /NEXT_REDIRECT|next-page-redirect/i.test(html));
      throw cause;
    }
    assert.equal(new URL(anonymousAdmin.url()).pathname, "/");
    result.tested.at(-1).finalPath = "/";
    await anonymousAdmin.close();

    const invalidIds = ["0", "-1", "1e3", "0x10", "2147483648", "9007199254740992"];
    const invalidHttpResults = [];
    for (const id of invalidIds) {
      const response = await context.request.get(base + "/game-stats/" + id, {
        failOnStatusCode: false,
        timeout: 15000,
      });
      const status = response.status();
      const html = status !== 404 ? (await response.text()).slice(0, 3000) : "";
      invalidHttpResults.push({
        id,
        status,
        fallback404Marker: /NEXT_NOT_FOUND|404|not found/i.test(html),
      });
    }
    result.tested.push({ name: "invalid replay URL status and streamed fallback", results: invalidHttpResults });

    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));

    // No operator authorization is installed in CI. Intercept only this local
    // read endpoint and prove public preview denial has terminal semantics.
    let deniedPolls = 0;
    await page.route("**/api/kingdom-intelligence/live-recovery", async (route) => {
      deniedPolls++;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ available: false, reason: "operator_preview_only" }),
      });
    });
    const loaded = await page.goto(base + "/kingdom-intelligence", {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });
    assert.ok(loaded && loaded.status() === 200,
      "disposable candidate Kingdom Intelligence page must render HTTP 200");
    await waitUntil(() => deniedPolls >= 1, "first public recovery GET");
    await page.waitForTimeout(6100);
    assert.equal(deniedPolls, 1, "public preview denial must terminate 5-second polling");
    assert.deepEqual(pageErrors, [], "page must not throw uncaught hydration errors");
    await page.screenshot({ path: path.join(destination, "kingdom-desktop.png"), fullPage: true });
    result.tested.push({
      name: "Chromium public Recovery denial stops repeat requests",
      requestsObserved: deniedPolls,
      clockWindowMs: 6100,
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(600);
    assert.equal(deniedPolls, 1, "mobile resize must not restart terminal-denied polling");
    await page.screenshot({ path: path.join(destination, "kingdom-mobile.png"), fullPage: true });
    result.tested.push({ name: "mobile 390px public page renders under reduced motion", width: 390 });
    await page.close();

    // Fresh browser document: the public-only terminal refusal is not carried
    // into a new tab, so the independently observable polling loop can be
    // tested with a non-terminal read-only fallback payload.
    const foreground = await context.newPage();
    const errors2 = [];
    foreground.on("pageerror", (e) => errors2.push(e.message));
    let count = 0;
    let active = 0;
    let maxConcurrent = 0;
    await foreground.route("**/api/kingdom-intelligence/live-recovery", async (route) => {
      count++;
      active++;
      maxConcurrent = Math.max(maxConcurrent, active);
      try {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ available: false, reason: "no_running_recovery_campaign" }),
        });
      } finally {
        active--;
      }
    });
    const opened = await foreground.goto(base + "/kingdom-intelligence", {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });
    assert.equal(opened?.status(), 200);
    await waitUntil(() => count >= 1, "shared initial foreground GET");
    const initialCount = count;
    assert.equal(initialCount, 1, "two panels must coalesce initial GET");
    await waitUntil(() => count >= 2, "shared second foreground GET", 10000);
    const beforeHide = count;
    await setSimulatedVisibility(foreground, "hidden");
    await foreground.waitForTimeout(5600);
    assert.equal(count, beforeHide, "simulated hidden document must not poll");
    await setSimulatedVisibility(foreground, "visible");
    await waitUntil(() => count >= beforeHide + 1, "immediate resumed GET", 2500);
    assert.equal(maxConcurrent, 1, "Recovery GET must not overlap");
    assert.deepEqual(errors2, [], "foreground Recovery page must not throw");
    result.tested.push({
      name: "Chromium real client coalesced foreground GET and DOM visibility pause/resume",
      firstRequests: initialCount,
      foregroundRequestsBeforeHide: beforeHide,
      hiddenRequests: count - beforeHide - 1,
      maxConcurrent,
      simulatedVisibility: true,
    });
    await foreground.close();
    await context.close();
    const wrongHttp = invalidHttpResults.filter((entry) => entry.status !== 404);
    if (wrongHttp.length) {
      throw new Error("Invalid replay URLs did not return HTTP 404: " + JSON.stringify(wrongHttp));
    }
  } finally {
    await browser.close();
  }
}

run().then(
  () => {
    result.status = "PASS";
    fs.writeFileSync(path.join(destination, "receipt.json"), JSON.stringify(result, null, 2) + "\n");
    console.log("PASS: isolated Chromium candidate acceptance " + sourceSha);
    console.log("NOTE: authenticated staging, true tab background and production remain UNTESTED");
  },
  (error) => {
    result.status = "FAIL";
    result.errors.push(error?.stack || String(error));
    fs.writeFileSync(path.join(destination, "receipt.json"), JSON.stringify(result, null, 2) + "\n");
    console.error(error);
    process.exitCode = 1;
  },
);
