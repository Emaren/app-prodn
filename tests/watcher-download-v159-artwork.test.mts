import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const page =
  fs.readFileSync(
    new URL(
      "../app/download/page.tsx",
      import.meta.url,
    ),
    "utf8",
  );

test(
  "Download Extreme view uses Watcher 1.5.9 desktop and mobile artwork",
  () => {
    assert.match(
      page,
      /\/watcher\/watcher-v159-desktop\.png/,
    );

    assert.match(
      page,
      /\/watcher\/watcher-v159-mobile\.png/,
    );

    assert.doesNotMatch(
      page,
      /watcher-v158-(?:desktop|mobile)\.png/,
    );

    for (const rel of [
      "../public/watcher/watcher-v159-desktop.png",
      "../public/watcher/watcher-v159-mobile.png",
    ]) {
      const file =
        new URL(
          rel,
          import.meta.url,
        );

      assert.equal(
        fs.existsSync(file),
        true,
        rel,
      );

      assert.ok(
        fs.statSync(file).size >
          100_000,
        rel,
      );
    }
  },
);

test(
  "v1.5.9 artwork keeps the existing desktop and mobile hotspot rails",
  () => {
    assert.match(
      page,
      /data-watcher-hero-hotspot="windows-installer"/,
    );

    assert.match(
      page,
      /data-watcher-hero-hotspot="profile-pairing"/,
    );

    assert.match(
      page,
      /data-watcher-hero-hotspot="mobile-windows-installer"/,
    );

    assert.match(
      page,
      /data-watcher-hero-hotspot="mobile-profile-pairing"/,
    );
  },
);
