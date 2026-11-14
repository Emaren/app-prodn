import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  PAPER_FLEET_DESIGN_SLOTS,
  PAPER_FLEET_PAGE_SIZE,
  PAPER_FLEET_PAGE_COUNT,
  paperFleetDesignPage,
} from "../lib/kingdomPaperFleetPreview.ts";

const client = readFileSync(new URL("../app/kingdom-traders/PaperFleetPreview.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/kingdom-traders/page.tsx", import.meta.url), "utf8");

test("100 finite and unique PAPER design slots, ten per page", () => {
  assert.equal(PAPER_FLEET_DESIGN_SLOTS, 100);
  assert.equal(PAPER_FLEET_PAGE_SIZE, 10);
  assert.equal(PAPER_FLEET_PAGE_COUNT, 10);
  const all = Array.from({ length: PAPER_FLEET_PAGE_COUNT }, (_, i) => paperFleetDesignPage(i + 1)).flat();
  assert.equal(all.length, 100);
  assert.deepEqual(all, Array.from({ length: 100 }, (_, i) => i + 1));
  assert.deepEqual(paperFleetDesignPage(0), paperFleetDesignPage(1));
  assert.deepEqual(paperFleetDesignPage(11), paperFleetDesignPage(10));
  assert.deepEqual(paperFleetDesignPage(Number.NaN), paperFleetDesignPage(1));
});

test("the public entry renders a clearly disconnected and accessible fleet preview", () => {
  assert.match(page, /<PaperFleetPreview\s*\/>/);
  assert.match(client, /No telemetry connected/);
  assert.match(client, /Not provisioned/);
  assert.match(client, /aria-live="polite"/);
  assert.match(client, /disabled=\{page === 1\}/);
  assert.match(client, /disabled=\{page === PAPER_FLEET_PAGE_COUNT\}/);
});

test("PAPER design UI has zero trading, wallet, financial or private access paths", () => {
  const source = client + page + readFileSync(new URL("../lib/kingdomPaperFleetPreview.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\bfetch\s*\(|\bprocess\.env\b|localhost|127\.0\.0\.1|:9447|:809[2345]/);
  assert.doesNotMatch(source, /\b(placeOrder|executeOrder|transfer|settleBets)\s*\(/);
  assert.doesNotMatch(source, /\bUSD\s*\$?\d+|\$\d+[.,]?\d*/);
  assert.match(source, /not running bots/);
});
