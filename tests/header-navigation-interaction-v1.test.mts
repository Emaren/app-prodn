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

test("desktop Kingdom doors are hover-owned while touch retains tap toggle", () => {
  const kingdom =
    source.match(
      /function KingdomNavItem\([\s\S]*?function KingdomMenuPanel\(/,
    )?.[0] ?? "";

  assert.match(
    kingdom,
    /onMouseEnter=\{openMenu\}/,
  );

  assert.match(
    kingdom,
    /onMouseLeave=\{scheduleClose\}/,
  );

  assert.match(
    kingdom,
    /window\.matchMedia\("\(hover: none\)"\)\.matches/,
  );

  assert.match(
    kingdom,
    /setOpen\(\(value\) => !value\);/,
  );

  assert.match(
    kingdom,
    /return;[\s\S]*openMenu\(\);/,
  );
});

test("desktop Kingdom doors hug the center navigation rail", () => {
  assert.equal(
    (
      source.match(
        /className=\{`\$\{headerSkin\.surface\} -mr-2`\}/g,
      ) ?? []
    ).length,
    1,
  );

  assert.equal(
    (
      source.match(
        /className=\{`\$\{headerSkin\.surface\} -ml-2`\}/g,
      ) ?? []
    ).length,
    1,
  );
});


test("Kingdom hover and click cooperate instead of fighting each other", () => {
  const kingdom =
    source.match(
      /function KingdomNavItem\([\s\S]*?function KingdomMenuPanel\(/,
    )?.[0] ?? "";

  assert.match(
    kingdom,
    /const desktopClickLatchRef = React\.useRef\(false\);/,
  );

  // Hover remains a first-class opener.
  assert.match(
    kingdom,
    /onMouseEnter=\{openMenu\}/,
  );

  assert.match(
    kingdom,
    /onMouseLeave=\{scheduleClose\}/,
  );

  // Touch keeps an ordinary tap toggle.
  assert.match(
    kingdom,
    /window\.matchMedia\("\(hover: none\)"\)\.matches[\s\S]*setOpen\(\(value\) => !value\);/,
  );

  // A desktop click on an already hover-open door arms the
  // click latch and explicitly keeps the menu open.
  assert.match(
    kingdom,
    /if \(!desktopClickLatchRef\.current\)[\s\S]*desktopClickLatchRef\.current = true;[\s\S]*openMenu\(\);[\s\S]*return;/,
  );

  // A subsequent click may close it.
  assert.match(
    kingdom,
    /desktopClickLatchRef\.current = false;[\s\S]*setOpen\(false\);/,
  );

  // Leaving resets the cycle and closes naturally.
  const scheduleClose =
    kingdom.match(
      /const scheduleClose = React\.useCallback\([\s\S]*?\}, \[clearCloseTimer\]\);/,
    )?.[0] ?? "";

  assert.match(
    scheduleClose,
    /desktopClickLatchRef\.current = false;/,
  );
});
