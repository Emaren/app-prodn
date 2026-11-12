import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";
import { shippedManagedPortraitThumbName } from "../lib/featuredWarriorShippedThumb.ts";

const realPublishedSourceExamples = [
  "jim-1781560436622-52fb61a1",
  "julio-alvarez-1781569866259-256b2ad7",
] as const;

test("matching shipped portrait thumbnails are actual, compact, valid WebP bytes", () => {
  for (const stem of realPublishedSourceExamples) {
    const name = shippedManagedPortraitThumbName("avatar", stem + ".png", "card");
    assert.equal(name, stem + "-thumb.webp");
    const file = new URL("../public/featured-warriors/thumbs/" + name, import.meta.url);
    const stat = statSync(file);
    assert.ok(stat.isFile());
    assert.ok(stat.size > 12 && stat.size < 100_000, stem);
    const body = readFileSync(file);
    assert.equal(body.length, stat.size);
    assert.equal(body.toString("ascii", 0, 4), "RIFF");
    assert.equal(body.toString("ascii", 8, 12), "WEBP");
    assert.equal(shippedManagedPortraitThumbName("avatar", stem + ".png", "thumb"), name);
  }
});

test("unverified, sensitive, arbitrary and original-size requests never borrow a shipped portrait", () => {
  const valid = "jim-1781560436622-52fb61a1.png";
  for (const [kind, filename, size] of [
    ["crest", valid, "card"], ["avatar", valid, null],
    ["avatar", valid, "original"], ["avatar", valid, "presence"],
    ["avatar", "../" + valid, "card"], ["avatar", "/" + valid, "card"],
    ["avatar", "other/" + valid, "card"], ["avatar", "other.." + valid, "card"],
    ["avatar", "unknown.png", "card"], ["avatar", "jim.png", "card"],
    ["avatar", "jim-1781560436622-52fb61a1.svg", "card"],
    ["avatar", "jim-1781560436622-52fb61a1.png?redirect", "card"],
    ["avatar", "jim-1781560436622-52fb61a1.png\\\\private", "card"],
    ["avatar", "JIM-1781560436622-52fb61a1.png", "card"],
    ["avatar", "jim-1781560436622-52fb61a1-a.png", "card"],
    ["avatar", "x".repeat(160) + "-1781560436622-52fb61a1.png", "card"],
  ] as const) {
    assert.equal(shippedManagedPortraitThumbName(kind, filename, size), null, filename);
  }
});

test("published WebP never masquerades as a direct-managed original or enables private file traversal", () => {
  const route = readFileSync(new URL("../app/api/media-assets/[kind]/[target]/route.ts", import.meta.url), "utf8");
  assert.match(route, /if \(!originalPath \|\| !originalHit\) \{[\s\S]*?serveExactShippedPortraitThumb/);
  assert.match(route, /fs\.open\(filePath, fsConstants\.O_RDONLY \| fsConstants\.O_NOFOLLOW\)/);
  assert.match(route, /stat\.size > 750_000/);
  assert.match(route, /data\.toString\("ascii", 8, 12\) !== "WEBP"/);
  assert.match(route, /"X-AoE2WAR-Media-Proxy": "direct-shipped-thumbnail"/);
  assert.match(route, /"X-AoE2WAR-Media-Fallback": "matched-upload-thumb"/);
  const shipped = route.slice(
    route.indexOf("async function serveExactShippedPortraitThumb("),
    route.indexOf("async function serveManagedUploadDirect("),
  );
  assert.doesNotMatch(shipped, /"X-AoE2WAR-Media-Proxy": "direct-managed"/);
});
