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

test("Watcher 1.5.11 keeps the existing 1.5.10 Extreme hero artwork", () => {
  assert.match(
    release,
    /version: "1\.5\.11"/,
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

test("Watcher 1.5.11 release advertises reliability and media shedding", () => {
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
    /Capability-negotiated media shedding/,
  );

  assert.match(
    release,
    /AoE2HDBets Watcher Setup 1\.5\.11\.exe/,
  );

  assert.match(
    release,
    /AoE2HDBets Watcher 1\.5\.11\.exe/,
  );
});
