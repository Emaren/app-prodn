import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../app/AppShell.tsx", import.meta.url),
  "utf8",
);

test("header exposes exactly five quiet persistent active effects", () => {
  const block =
    source.match(
      /const NAV_ACTIVE_EFFECTS = \[[\s\S]*?\] as const;/,
    )?.[0] ?? "";

  const effects =
    block.match(/^\s*"[^"]+",?$/gm) ?? [];

  assert.equal(effects.length, 5);

  assert.match(
    source,
    /NAV_ACTIVE_EFFECT_STORAGE_KEY/,
  );

  assert.match(
    source,
    /localStorage\.getItem\([\s\S]*NAV_ACTIVE_EFFECT_STORAGE_KEY/,
  );

  assert.match(
    source,
    /localStorage\.setItem\([\s\S]*NAV_ACTIVE_EFFECT_STORAGE_KEY/,
  );

  assert.doesNotMatch(
    source,
    /border-b-amber-200\/55/,
  );
});

test("normal chip surface and hover survive while active state adds only effect class", () => {
  const pill =
    source.match(
      /function HeaderPillLink\([\s\S]*?function KingdomNavItem\(/,
    )?.[0] ?? "";

  assert.match(
    pill,
    /\$\{className\}/,
  );

  assert.match(
    pill,
    /active \? activeEffectClass : ""/,
  );

  assert.match(
    pill,
    /onCycleActiveEffect\(\);[\s\S]*if \(active\) event\.preventDefault\(\);/,
  );
});

test("desktop and mobile each expose a left and right Kingdom door", () => {
  const navBlocks =
    (
      source.match(
        /<nav[\s\S]*?HEADER_LINKS\.map[\s\S]*?<\/nav>/g,
      ) ?? []
    );

  assert.equal(navBlocks.length, 2);

  for (const block of navBlocks) {
    assert.equal(
      (block.match(/<KingdomNavItem/g) ?? []).length,
      2,
    );
  }

  assert.equal(
    (source.match(/<KingdomNavItem/g) ?? []).length,
    4,
  );
});

test("Kingdom duplication does not duplicate page-change synchronization", () => {
  assert.equal(
    (
      source.match(
        /const unseenPageChanges = usePageChangeNotices\(\);/g,
      ) ?? []
    ).length,
    1,
  );

  const kingdom =
    source.match(
      /function KingdomNavItem\([\s\S]*?function KingdomMenuPanel\(/,
    )?.[0] ?? "";

  assert.doesNotMatch(
    kingdom,
    /usePageChangeNotices\(\)/,
  );

  assert.match(
    kingdom,
    /setOpen\(\(value\) => !value\);/,
  );

  assert.doesNotMatch(
    kingdom,
    /onCycleActiveEffect/,
  );
});
