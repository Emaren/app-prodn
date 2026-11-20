import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync("app/api/wolo/daemon-log/route.ts", "utf8");
const tile = readFileSync("components/wolo/WoloChainTerminalTile.tsx", "utf8");
const page = readFileSync("components/wolo/WoloPageClient.tsx", "utf8");

test("anonymous Wolo endpoint never reads protected journal or arbitrary paths", () => {
  assert.match(route, /export async function GET\(\)/);
  assert.match(route, /ok: false/);
  assert.match(route, /authorized operators/);
  assert.match(route, /\/rpc\/status/);
  assert.match(route, /\/var\/lib\/aoe2war-wolo-public-daemon-v1/);
  assert.match(route, /obj\.source !== UNIT/);
  assert.match(route, /Date\.now\(\) - time/);
  assert.match(route, /constants\.O_NOFOLLOW/);
  assert.doesNotMatch(route, /(?:execFile|spawn|error\.message|process\.env|\bjournalctl\s*[,("])/);
});

test("Wolo runtime remains read-only RPC, independent of daemon tile", () => {
  assert.doesNotMatch(page, /Rail standby/);
  assert.match(page, /Read-only chain monitor/);
  assert.match(tile, /fetch\("\/rpc\/status"/);
  assert.match(tile, /parseWoloBrowserRpcStatus/);
});

test("original April 1 plain/click-to-ANSI Easter egg is preserved", () => {
  assert.match(tile, /wolo-daemon-view/);
  assert.match(tile, /setPremiumDaemonView\(\(current\) => !current\)/);
  assert.match(tile, /plainDaemonLines = daemonLines\.map\(stripAnsi\)/);
  assert.match(tile, /renderDaemonLine\(line, index\)/);
  assert.match(tile, /text-cyan-300/);
  assert.match(tile, /text-emerald-400/);
  assert.match(tile, /raw live tail/);
  assert.match(tile, /last 40 lines/);
  assert.match(tile, /live validator output · control-room color rail/);
  assert.match(tile, /WOLO_DAEMON_POLL_MS = 3000/);
});

test("endpoint trusts only an approved fixed public-safe projection", () => {
  assert.match(route, /\/var\/lib\/aoe2war-wolo-public-daemon-v1/);
  assert.match(route, /obj\.source !== UNIT/);
  assert.match(route, /constants\.O_NOFOLLOW/);
  assert.match(route, /obj\.lines\.every\(validLine\)/);
  assert.doesNotMatch(route, /execFileAsync/);
});
