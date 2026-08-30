import assert from "node:assert/strict";
import {
  readFile,
} from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const repoRoot = process.cwd();

async function source(
  relativePath: string,
) {
  return readFile(
    path.join(
      repoRoot,
      relativePath,
    ),
    "utf8",
  );
}

test(
  "the Betting Hall hero remains shared by every preserved view version",
  async () => {
    const page =
      await source(
        "app/bets/page.tsx",
      );

    const heroIndex =
      page.indexOf(
        "<BettingHallImageHero />",
      );

    const branchIndex =
      page.indexOf(
        '{betsFamily === "basic"',
      );

    assert.ok(
      heroIndex >= 0,
      "shared Betting Hall hero is missing",
    );

    assert.ok(
      branchIndex > heroIndex,
      "hero must render before the version branch",
    );
  },
);

test(
  "B1 A1 E1 stay preserved while E2 and E3 share the live exchange",
  async () => {
    const page =
      await source(
        "app/bets/page.tsx",
      );

    assert.match(
      page,
      /betsFamily === "basic"/,
    );

    assert.match(
      page,
      /betsFamily === "advanced"/,
    );

    assert.match(
      page,
      /betsView === "E1"/,
    );

    assert.match(
      page,
      /data-testid="extreme-next-arena"/,
    );

    assert.match(
      page,
      /data-testid="bets-e2-exchange"/,
    );

    assert.match(
      page,
      /detailMode="exchange"/,
    );

    assert.match(
      page,
      /data-testid="bets-e2-market"/,
    );
  },
);

test(
  "E4 is the rollout default while every historical view remains selectable",
  async () => {
    const page =
      await source(
        "app/bets/page.tsx",
      );

    const versions =
      await source(
        "lib/betsViewVersions.ts",
      );

    assert.match(
      page,
      /const BETS_VIEW_DEFAULT:\s*BetsViewVersion\s*=\s*"E4"/,
    );

    assert.match(
      page,
      /useState<BetsViewVersion>\(BETS_VIEW_DEFAULT\)/,
    );

    assert.match(
      versions,
      /"B1"[\s\S]*"A1"[\s\S]*"E1"[\s\S]*"E2"[\s\S]*"E3"[\s\S]*"E4"/,
    );
  },
);

test(
  "the bets display rail opens by hover click and keyboard without a dead pointer gap",
  async () => {
    const rail =
      await source(
        "components/bets/BetsDisplayRail.tsx",
      );

    assert.match(
      rail,
      /data-testid="bets-display-rail"/,
    );

    assert.match(
      rail,
      /Layers3/,
    );

    assert.match(
      rail,
      /aria-expanded=\{viewMenuOpen\}/,
    );

    assert.match(
      rail,
      /onMouseEnter=/,
    );

    assert.match(
      rail,
      /setViewMenuOpen\(true\)/,
    );

    assert.match(
      rail,
      /bottom-full/,
    );

    assert.match(
      rail,
      /pb-2/,
    );

    assert.match(
      rail,
      /onFocus=/,
    );

    assert.match(
      rail,
      /BETS_VIEW_VERSIONS/,
    );
  },
);

test(
  "E2 product telemetry records impressions and explicit version choices",
  async () => {
    const page =
      await source(
        "app/bets/page.tsx",
      );

    const telemetry =
      await source(
        "lib/betsViewTelemetry.ts",
      );

    assert.match(
      page,
      /bets_view_impression/,
    );

    assert.match(
      page,
      /bets_view_selected/,
    );

    assert.match(
      telemetry,
      /\/api\/user\/experience/,
    );

    assert.match(
      telemetry,
      /keepalive: true/,
    );
  },
);

test(
  "WOLO suffix explicitly targets the custom stake input",
  async () => {
    const page =
      await source(
        "app/bets/page.tsx",
      );

    assert.match(
      page,
      /const generatedInputId = useId\(\)/,
    );

    assert.match(
      page,
      /id=\{stakeInputId\}/,
    );

    assert.match(
      page,
      /htmlFor=\{stakeInputId\}/,
    );
  },
);

test(
  "concurrent games sort newest-first without automatic focus replacement",
  async () => {
    const page =
      await source(
        "app/bets/page.tsx",
      );

    assert.match(
      page,
      /rightNumber - leftNumber/,
    );

    assert.match(
      page,
      /if \(focusedMarketId !== null\) return/,
    );

    assert.match(
      page,
      /Your current ticket stayed in focus/,
    );
  },
);

test(
  "each Betting Hall rollout promotes everyone once and then preserves the new explicit choice",
  async () => {
    const page =
      await source(
        "app/bets/page.tsx",
      );

    assert.match(
      page,
      /const BETS_VIEW_ROLLOUT = "E4"/,
    );

    const rollout =
      page.indexOf(
        "appliedRollout !==",
      );

    const restore =
      page.indexOf(
        "const storedView =",
      );

    assert.ok(
      rollout >= 0,
      "rollout gate must exist",
    );

    assert.ok(
      restore > rollout,
      "rollout must run before restoring an old preference",
    );

    assert.match(
      page,
      /localStorage\.setItem\(\s*BETS_VIEW_STORAGE_KEY,\s*BETS_VIEW_DEFAULT/,
    );

    assert.match(
      page,
      /localStorage\.setItem\(\s*BETS_VIEW_STORAGE_KEY,\s*next/,
    );
  },
);

test(
  "bets view impression metadata survives the server telemetry sanitizer",
  async () => {
    const route =
      await source(
        "app/api/user/experience/route.ts",
      );

    assert.match(
      route,
      /"view"/,
    );

    assert.match(
      route,
      /view: 16/,
    );
  },
);

test(
  "E2 design fixtures are development-only and bypass the live bet API",
  async () => {
    const page =
      await source(
        "app/bets/page.tsx",
      );

    assert.match(
      page,
      /"e2-1v1"/,
    );

    assert.match(
      page,
      /"e2-4v4"/,
    );

    assert.match(
      page,
      /"e3-1v1"/,
    );

    assert.match(
      page,
      /"e3-4v4"/,
    );

    assert.match(
      page,
      /process\.env\.NODE_ENV === "production"/,
    );

    assert.match(
      page,
      /readBetsDesignFixture\(\)/,
    );

    assert.match(
      page,
      /buildBetsDesignFixture/,
    );

    assert.match(
      page,
      /designFixture\.startsWith\("e3-"\)[\s\S]*?\? "E3"[\s\S]*?: "E2"/,
    );
  },
);

test(
  "E2 design fixtures never launch Steam authentication",
  async () => {
    const page =
      await source(
        "app/bets/page.tsx",
      );

    assert.match(
      page,
      /function handleBetsSignIn/,
    );

    assert.match(
      page,
      /if \(readBetsDesignFixture\(\)\)/,
    );

    assert.match(
      page,
      /Design fixture: signing is disabled/,
    );

    assert.match(
      page,
      /loginWithSteam=\{handleBetsSignIn\}/,
    );
  },
);

test(
  "E2 preserves the panel exchange while E3 preserves the cinematic exchange",
  async () => {
    const page =
      await source(
        "app/bets/page.tsx",
      );

    assert.match(
      page,
      /exchangePresentation\?:/,
    );

    assert.match(
      page,
      /"panel"/,
    );

    assert.match(
      page,
      /"cinematic"/,
    );

    assert.match(
      page,
      /betsView === "E3"[\s\S]*?"cinematic"[\s\S]*?"panel"/,
    );

    assert.match(
      page,
      /cinematicExchange/,
    );

    assert.match(
      page,
      /text-7xl/,
    );

    assert.match(
      page,
      /text-5xl/,
    );
  },
);

test(
  "E4 preserves the cinematic battle while replacing the form with an instrument",
  async () => {
    const page =
      await source(
        "app/bets/page.tsx",
      );

    const versions =
      await source(
        "lib/betsViewVersions.ts",
      );

    assert.match(
      versions,
      /"E4"/,
    );

    assert.match(
      page,
      /"e4-1v1"/,
    );

    assert.match(
      page,
      /"e4-4v4"/,
    );

    assert.match(
      page,
      /"instrument"/,
    );

    assert.match(
      page,
      /data-testid="bets-e4-instrument"/,
    );

    assert.match(
      page,
      /instrumentExchange/,
    );

    assert.match(
      page,
      /betsView === "E4"[\s\S]*?"instrument"/,
    );

    assert.match(
      page,
      /instrumentExchange[\s\S]*?\? "instrument"[\s\S]*?: "compact"/,
    );
  },
);

test(
  "design fixtures simulate bettor interaction without permitting a real wager",
  async () => {
    const page =
      await source(
        "app/bets/page.tsx",
      );

    assert.match(
      page,
      /const fixtureInteractionMode =[\s\S]*?betsViewReady[\s\S]*?readBetsDesignFixture/,
    );

    assert.match(
      page,
      /function requireSignIn\(\)[\s\S]*?if \(fixtureInteractionMode\)[\s\S]*?return true/,
    );

    assert.match(
      page,
      /isAuthenticated=\{isAuthenticated \|\| fixtureInteractionMode\}/,
    );

    assert.match(
      page,
      /async function handleLock[\s\S]*?if \(fixtureInteractionMode\)[\s\S]*?wager locking is disabled/,
    );
  },
);
