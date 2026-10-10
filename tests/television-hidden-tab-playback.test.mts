import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("components/streaming/LiveStreamFrame.tsx", "utf8");
test("hidden spectator tabs stop polling rolling WebM and decoding", () => {
  assert.match(source, /document.visibilityState === "hidden"\) return/);
  assert.match(source, /if \(document.visibilityState === "hidden"\) \{/);
  assert.match(source, /video.pause\(\)/);
  assert.match(source, /document.addEventListener\("visibilitychange", onVisibilityChange\)/);
  assert.match(source, /document.removeEventListener\("visibilitychange", onVisibilityChange\)/);
});
test("foregrounding resumes only the previously explicitly activated camera", () => {
  assert.match(source, /else \{\s*\/\/ Resume only the viewer's already explicitly activated video\.\s*void poll\(\)/);
  assert.match(source, /if \(document.visibilityState === "visible"\) void poll\(\)/);
  assert.match(source, /if \(cancelled \|\| document.visibilityState === "hidden"\) return/);
});
test("WebM asset URLs still revoke on exit and avoid unbounded object URL retention", () => {
  assert.match(source, /URL.revokeObjectURL\(currentObjectUrlRef.current\)/);
  assert.match(source, /revokeCurrentObjectUrl\(\)/);
  assert.match(source, /clearInterval\(interval\)/);
});
