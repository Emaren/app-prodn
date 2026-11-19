import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const shell = readFileSync("app/AppShell.tsx", "utf8");
const gateway = readFileSync("app/kingdom-traders/page.tsx", "utf8");
const list = shell.split("const KINGDOM_LINKS = [")[1]?.split("] as const;")[0] ?? "";
const headings = shell.split("const PAGE_HEADINGS:")[1]?.split("function getPageHeading(")[0] ?? "";

test("Kingdom dropdown exposes exactly one read-only Traders gateway", () => {
  const items = [...list.matchAll(/\{ href: "\/kingdom-traders", label: "Kingdom Traders", icon: BarChart3, body: "([^"]+)" \}/g)];
  assert.equal(items.length, 1, "Only one player-visible menu entry is allowed");
  assert.match(items[0][1], /Read-only PAPER/);
  assert.match(items[0][1], /no live orders/);
});

test("Kingdom page heading identifies the existing route instead of generic AoE2WAR", () => {
  assert.equal((headings.match(/prefix: "\/kingdom-traders", title: "Kingdom Traders"/g) ?? []).length, 1);
});

test("Menu target is the existing protected PAPER-only public gateway", () => {
  assert.match(gateway, /canonical: "\/kingdom-traders"/);
  assert.match(gateway, /public, read-only entry/);
  assert.match(gateway, /protected PAPER engine remains separate/);
  assert.match(gateway, /no bot\s*telemetry or trading commands are connected to this public page/);
});
