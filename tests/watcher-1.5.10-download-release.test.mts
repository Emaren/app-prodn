import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const page = fs.readFileSync(
  new URL("../app/download/page.tsx", import.meta.url),
  "utf8",
);

const release = fs.readFileSync(
  new URL("../lib/watcherRelease.ts", import.meta.url),
  "utf8",
);

test("Download Extreme hero is explicitly bound to Watcher 1.5.10 artwork", () => {
  assert.match(
    release,
    /version: "1\.5\.10"/,
  );

  assert.match(page, /watcher-v1510-desktop\.png/);
  assert.match(page, /watcher-v1510-mobile\.png/);
  assert.doesNotMatch(page, /watcher-v159-(?:desktop|mobile)\.png/);
  assert.match(
    page,
    /<section className=\{extreme \? "hidden" : heroClass\}>/,
  );
  assert.match(page, /WATCHER_RELEASE\.label/);

  for (const artwork of [
    "public/watcher/watcher-v1510-desktop.png",
    "public/watcher/watcher-v1510-mobile.png",
  ]) {
    assert.ok(
      fs.statSync(new URL("../" + artwork, import.meta.url)).size > 1_000_000,
      artwork + " should be a real release image",
    );
  }
});

test("Watcher 1.5.10 release advertises the Scavanger reliability fixes", () => {
  assert.match(
    release,
    /Active replay-folder recovery/,
  );

  assert.match(
    release,
    /Replay-priority streaming/,
  );

  assert.match(
    release,
    /AoE2HDBets Watcher Setup 1\.5\.10\.exe/,
  );

  assert.match(
    release,
    /AoE2HDBets Watcher 1\.5\.10\.exe/,
  );
});
