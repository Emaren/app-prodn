import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const living =
  fs.readFileSync(
    "components/leaderboard/LivingLeaderboard.tsx",
    "utf8",
  );

const prefs =
  fs.readFileSync(
    "lib/livingLeaderboardPreferences.ts",
    "utf8",
  );

test(
  "Titanium Legion is the new canonical title default",
  () => {
    assert.match(
      prefs,
      /DEFAULT_LIVING_LEADERBOARD_HERO_TITLE_STYLE\s*=\s*2\s*;/,
    );
  },
);

test(
  "hero cycle is the six approved titles plus true off",
  () => {
    assert.match(
      living,
      /LIVING_HERO_TITLE_TOGGLE_STYLES/,
    );

    assert.match(
      living,
      /16,\s*\/\/ AoE2 Beveled Steel Dark/,
    );

    assert.match(
      living,
      /12,\s*\/\/ AoE2 Beveled Steel/,
    );

    assert.match(
      living,
      /1,\s*\/\/ Spartan Bronze/,
    );

    assert.match(
      living,
      /2,\s*\/\/ Titanium Legion/,
    );

    assert.match(
      living,
      /10,\s*\/\/ Cobalt Armor/,
    );

    assert.match(
      living,
      /11,\s*\/\/ AoE2 Logo Gunmetal/,
    );

    assert.match(
      living,
      /17,\s*\/\/ No Title/,
    );

    assert.match(
      living,
      /LIVING_HERO_TITLE_HIDDEN_STYLE\s*=\s*17/,
    );
  },
);

test(
  "three command boxes are real click-away boundaries",
  () => {
    const attributes =
      living.match(
        /^\s*data-living-command-popover\s*$/gm,
      ) ?? [];

    assert.equal(
      attributes.length,
      3,
    );

    assert.equal(
      (
        living.match(
          /\[data-living-command-popover\]/g,
        ) ?? []
      ).length,
      1,
    );
  },
);

test(
  "outside pointer and Escape close command popovers",
  () => {
    assert.match(
      living,
      /document\.addEventListener\(\s*"pointerdown"/,
    );

    assert.match(
      living,
      /target\.closest\(\s*"\[data-living-command-popover\]"/,
    );

    assert.match(
      living,
      /event\.key\s*===\s*"Escape"/,
    );

    assert.match(
      living,
      /setRankWindowOpen\(false\)/,
    );

    assert.match(
      living,
      /setHiddenOpen\(false\)/,
    );

    assert.match(
      living,
      /setColumnsOpen\(false\)/,
    );
  },
);
