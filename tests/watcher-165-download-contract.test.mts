import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const file = (p: string) => readFile(new URL(p, root), "utf8");

test("website v1.6.5 metadata advertises French and pending financial features without claiming activation", async () => {
  const text = await file("lib/watcherRelease.ts");
  assert.match(text, /version: "1\.6\.5"/);
  assert.match(text, /previousVersion: "1\.6\.4"/);
  assert.match(text, /Oct 19, 2026/);
  assert.match(text, /English \/ Français Watcher language toggle/);
  assert.match(text, /War Satchel and Auto Bets — activation pending/);
  assert.match(text, /unsigned manual macOS downloads/);
  for (const artifact of ["Setup 1.6.5.exe", "Watcher 1.6.5.exe",
    "Watcher-1.6.5-arm64.dmg","Watcher-1.6.5.AppImage"]) {
    assert.ok(text.includes(artifact), artifact);
  }
});

test("website restores only the app-scoped macOS launch command", async () => {
  const page = await file("app/download/page.tsx");
  assert.ok(page.includes("Mac says “damaged and can’t be opened”?"));
  assert.ok(page.includes("official 1.6.5 release"));
  assert.ok(page.includes("published checksums"));
  assert.ok(page.includes("choose <strong>Cancel</strong>"));
  assert.ok(page.includes("does not"));
  assert.ok(page.includes("Do not run it on unverified downloads."));
  assert.ok(page.includes("xattr -dr com.apple.quarantine"));
  assert.ok(page.includes('"/Applications/AoE2HDBets Watcher.app"'));
  assert.ok(page.includes("open"));
  assert.ok(!page.includes("spctl --master-disable"));
  assert.ok(!page.includes("csrutil disable"));
});

test("site release promoter preserves exact file hashes while normalizing v1.6.5 inventory order", async () => {
  const py = await file("scripts/aoe2_watcher_release.py");
  const sync = await file("scripts/sync-watcher-release.mjs");
  assert.match(py, /for name in canonical:\s*\n\s*row = by_name\[name\]/);
  assert.match(py, /set\(names\) != set\(canonical\)/);
  assert.match(py, /tuple\(map\(int, version\.split\("\."\)\)\) < \(1, 6, 5\)/);
  assert.match(sync, /new Set\(manifestNames\)\.size === canonical\.length/);
  assert.match(sync, /Watcher release manifest inventory mismatch/);
});
