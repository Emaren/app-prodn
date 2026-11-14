import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync("app/api/wolo/daemon-log/route.ts", "utf8");
const tile = readFileSync("components/wolo/WoloChainTerminalTile.tsx", "utf8");
const page = readFileSync("components/wolo/WoloPageClient.tsx", "utf8");

test("public daemon endpoint is fail-closed without invoking or leaking journalctl", () => {
  assert.match(route, /export async function GET\(\)/);
  assert.match(route, /ok: false/);
  assert.match(route, /authorized operators/);
  assert.match(route, /\/rpc\/status/);
  assert.doesNotMatch(route, /(?:execFile|spawn|error\.message|process\.env|\bjournalctl\s*[,("])/);
});

test("public Wolo page cannot hard-code standby while RPC shows advancing blocks", () => {
  assert.doesNotMatch(page, /Rail standby/);
  assert.match(page, /Read-only chain monitor/);
  assert.match(tile, /fetch\("\/rpc\/status"/);
  assert.match(tile, /parseWoloBrowserRpcStatus/);
});

test("daemon panel truthfully labels restricted access without promising a live tail", () => {
  assert.doesNotMatch(tile, /raw live tail|last 40 lines|live validator output/);
  assert.match(tile, /protected operator journal/);
  assert.match(tile, /public access restricted/);
  assert.match(tile, /daemon \? "Restricted" : "Checking"/);
});
