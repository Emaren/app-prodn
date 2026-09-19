import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appShell = readFileSync(
  new URL("../app/AppShell.tsx", import.meta.url),
  "utf8",
);

test("AppShell serves the shared header logo directly from the edge-cached public asset", () => {
  const logoBlocks = [
    ...appShell.matchAll(
      /<Image[\s\S]*?src="\/brand\/aoe2war-logo\.webp"[\s\S]*?\/>/g,
    ),
  ].map((match) => match[0]);

  assert.equal(logoBlocks.length, 2);

  for (const block of logoBlocks) {
    assert.match(block, /priority/);
    assert.match(block, /unoptimized/);
    assert.doesNotMatch(block, /quality=/);
  }
});
