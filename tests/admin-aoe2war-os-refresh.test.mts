import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { abandonAdminDashboardRead, isCurrentAdminDashboardRead } from "../app/admin/aoe2war-os/adminDashboardReadLease.ts";

const page = readFileSync("app/admin/aoe2war-os/page.tsx", "utf8");
const api = readFileSync("app/api/admin/aoe2war-os/route.ts", "utf8");

test("admin read-side poll stops while hidden and on unmount", () => {
  assert.match(page, /document\.visibilityState !== "visible"/);
  assert.match(page, /document\.visibilityState === "visible"/);
  assert.match(page, /document\.addEventListener\("visibilitychange", onVisibilityChange\)/);
  assert.match(page, /document\.removeEventListener\("visibilitychange", onVisibilityChange\)/);
  assert.match(page, /window\.clearInterval\(interval\)/);
  assert.match(page, /abandonAdminDashboardRead\(refreshAbortRef\)/);
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
  assert.match(page, /isCurrentAdminDashboardRead\(refreshAbortRef, controller\)/);
  assert.match(page, /refreshAbortRef\.current = null/);
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

test("hidden-to-visible succession immediately frees the old GET lease", () => {
  const first = new AbortController();
  const slot = { current: first as AbortController | null };

  assert.equal(isCurrentAdminDashboardRead(slot, first), true);
  abandonAdminDashboardRead(slot);
  assert.equal(first.signal.aborted, true);
  assert.equal(slot.current, null);

  // A new visible-tab request must start without awaiting the old fetch.
  const second = new AbortController();
  slot.current = second;
  assert.equal(isCurrentAdminDashboardRead(slot, first), false);
  assert.equal(isCurrentAdminDashboardRead(slot, second), true);

  // An old timeout or network completion must not own the resumed state.
  const lateOldTimeoutWouldAbort =
    isCurrentAdminDashboardRead(slot, first) && !first.signal.aborted;
  assert.equal(lateOldTimeoutWouldAbort, false);
  assert.equal(second.signal.aborted, false);

  abandonAdminDashboardRead(slot);
  assert.equal(second.signal.aborted, true);
  assert.equal(slot.current, null);
});

test("the page fences late GET success, errors, timeout, and loading cleanup", () => {
  assert.match(page, /if \(!isCurrentAdminDashboardRead\(refreshAbortRef, controller\)\) return;/);
  assert.match(page, /if \(isCurrentAdminDashboardRead\(refreshAbortRef, controller\) && \(!controller\.signal\.aborted \|\| timedOut\)\)/);
  assert.match(page, /if \(isCurrentAdminDashboardRead\(refreshAbortRef, controller\)\) \{\s*refreshAbortRef\.current = null;\s*setLoading\(false\);/);
  assert.match(page, /timedOut = true;\s*controller\.abort\(\);/);
});
