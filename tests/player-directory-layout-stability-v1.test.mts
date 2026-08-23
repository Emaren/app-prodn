import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const players = readFileSync(
  "app/players/page.tsx",
  "utf8",
);

const livingKingdomCss = readFileSync(
  "components/presence/LivingKingdom.module.css",
  "utf8",
);

test("Player Registry preserves real card geometry while scrolling", () => {
  assert.doesNotMatch(
    players,
    /content-visibility:auto/,
  );

  assert.doesNotMatch(
    players,
    /contain-intrinsic-size/,
  );

  assert.match(
    players,
    /block w-full min-w-0 rounded-2xl/,
  );

  assert.match(
    players,
    /<section className="min-w-0 rounded-\[1\.75rem\]/,
  );
});

test("Living Kingdom rails are pure fixed overlays and cannot resize page layout", () => {
  assert.match(
    livingKingdomCss,
    /\.railRoot\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?inset:\s*0;[\s\S]*?overflow:\s*clip;[\s\S]*?contain:\s*strict;/,
  );

  assert.match(
    livingKingdomCss,
    /\.flightLayer\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?inset:\s*0;[\s\S]*?overflow:\s*hidden;[\s\S]*?contain:\s*strict;/,
  );
});
