import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("app/admin/aoe2war-os/page.tsx", "utf8");
const api = readFileSync("app/api/admin/aoe2war-os/route.ts", "utf8");

test("admin read-side poll stops while hidden and on unmount", () => {
  assert.match(page, /document\.visibilityState !== "visible"/);
  assert.match(page, /document\.visibilityState === "visible"/);
  assert.match(page, /document\.addEventListener\("visibilitychange", onVisibilityChange\)/);
  assert.match(page, /document\.removeEventListener\("visibilitychange", onVisibilityChange\)/);
  assert.match(page, /window\.clearInterval\(interval\)/);
  assert.match(page, /refreshAbortRef\.current\?\.abort\(\)/);
  assert.match(page, /setDashboard\(null\)/);
  assert.match(page, /}, 3_000\)/);
});

test("admin GET has one-in-flight guard, bounded cancellation and no-store", () => {
  assert.match(page, /if \(refreshAbortRef\.current\) return;/);
  assert.match(page, /const controller = new AbortController\(\)/);
  assert.match(page, /timeout = window\.setTimeout/);
  assert.match(page, /}, 8_000\)/);
  assert.match(page, /controller\.abort\(\)/);
  assert.match(page, /signal: controller\.signal/);
  assert.match(page, /cache: "no-store"/);
  assert.match(page, /window\.clearTimeout\(timeout\)/);
  assert.match(page, /if \(refreshAbortRef\.current === controller\) refreshAbortRef\.current = null/);
  assert.match(page, /if \(timedOut\) throw new Error/);
  assert.match(page, /setError\(/);
  assert.match(page, /setDashboard\(null\); \/\/ Never leave an unverified operator state/);
});

test("authenticated action paths are not switched to read-side polling logic", () => {
  assert.match(api, /export async function GET\(request: NextRequest\) \{\s*const admin = await requireAdmin\(request\)/);
  assert.match(api, /export async function POST\(request: NextRequest\) \{\s*const admin = await requireAdmin\(request\)/);
  assert.match(api, /export async function DELETE\(request: NextRequest\) \{\s*const admin = await requireAdmin\(request\)/);
  assert.match(api, /previewMutationBlocked/);
  assert.match(page, /async function queueAction/);
  assert.match(page, /method: "POST"/);
  assert.match(page, /async function cancelQueuedRun/);
  assert.match(page, /method: "DELETE"/);
});
