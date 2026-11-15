import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { paperFleetDesignPage, PAPER_FLEET_PAGE_COUNT, PAPER_FLEET_PAGE_SIZE } from "../lib/kingdomPaperFleetPreview.ts";

const preview = readFileSync("app/kingdom-traders/PaperFleetPreview.tsx", "utf8");
const page = readFileSync("app/kingdom-traders/page.tsx", "utf8");

test("two switchable, accessible render-only PAPER fleet views share one page and ten slots", () => {
  assert.match(preview, /type FleetView = "cards" \| "terminal"/);
  assert.match(preview, /useState<FleetView>\("cards"\)/);
  assert.match(preview, /aria-label="Fleet display mode"/);
  assert.match(preview, /aria-pressed=\{view === "cards"\}/);
  assert.match(preview, /aria-pressed=\{view === "terminal"\}/);
  assert.match(preview, /onClick=\{\(\) => setView\("terminal"\)\}/);
  assert.match(preview, /view === "cards" \?/);
  assert.match(preview, /aria-label="Read-only PAPER fleet terminal"/);
  assert.match(preview, /aria-label="Unprovisioned PAPER bot design slots"/);
  assert.equal((preview.match(/slots\.map\(\(number\) => \(/g) || []).length, 2);
  assert.equal(PAPER_FLEET_PAGE_SIZE, 10);
});

test("page picker, step controls and live label preserve bounded 1-to-100 navigation", () => {
  assert.match(preview, /aria-label="Jump to paper fleet page"/);
  assert.match(preview, /value=\{page\}/);
  assert.match(preview, /setPage\(Number\(event.target.value\)\)/);
  assert.match(preview, /aria-live="polite"/);
  assert.match(preview, /disabled=\{page === 1\}/);
  assert.match(preview, /disabled=\{page === PAPER_FLEET_PAGE_COUNT\}/);
  assert.equal(PAPER_FLEET_PAGE_COUNT, 10);
  assert.deepEqual(paperFleetDesignPage(1), Array.from({ length: 10 }, (_, i) => i + 1));
  assert.deepEqual(paperFleetDesignPage(10), Array.from({ length: 10 }, (_, i) => i + 91));
});

test("six visible desks are explicit future design, never live strategy, balances or alert claims", () => {
  for (const id of ["bots", "strategies", "ledger", "research", "activity", "alerts"]) {
    assert.match(page, new RegExp('id: "' + id + '"'));
  }
  for (const text of ["Twin Blades", "Pincer", "News & Activity", "Alerts", "Portfolio & Ledger"]) {
    assert.ok(page.includes(text), "Missing design desk " + text);
  }
  assert.match(page, /No market signals are currently connected/);
  assert.match(page, /No rules, notifications, or automatic actions are active here/);
  assert.match(page, /does not fabricate an activity stream/);
});

test("PAPER modes contain no private requests, command execution or invented positions", () => {
  const source = page + preview;
  assert.doesNotMatch(source, /\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\s*\(|\bprocess\.env\b|https?:\/\/|:809[2345]|:9447/);
  assert.doesNotMatch(source, /\b(placeOrder|executeOrder|submitOrder|transferFunds|closePosition|settleBets)\s*\(/);
  assert.doesNotMatch(source, /\$\d+[.,]?\d*|\bPnL\s*[:=]\s*\d+/);
  assert.match(preview, /not running bots/);
  assert.match(preview, /Not provisioned/);
  assert.match(preview, /No session/);
  assert.match(preview, /Not connected/);
});
