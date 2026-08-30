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
  "E3 is the latest default while E1 and E2 remain selectable",
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
      /useState<BetsViewVersion>\("E3"\)/,
    );

    assert.match(
      page,
      /aoe2hdbets\.betsViewVersion\.v1/,
    );

    assert.match(
      versions,
      /"B1",\s*"A1",\s*"E1",\s*"E2",\s*"E3"/s,
    );

    assert.match(
      versions,
      /if \(version === "B1"\) return "basic"/,
    );

    assert.match(
      versions,
      /if \(version === "A1"\) return "advanced"/,
    );
  },
);

test(
  "the bets display rail is icon-resting and version discovery fans out",
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
      /Monitor/,
    );

    assert.match(
      rail,
      /group-hover:pointer-events-auto/,
    );

    assert.match(
      rail,
      /BETS_VIEW_VERSIONS/,
    );

    assert.doesNotMatch(
      rail,
      />\s*Layout\s*</,
    );

    assert.doesNotMatch(
      rail,
      />\s*View mode\s*</i,
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
  "legacy B A E preference remains preserved while new users receive E3",
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
      /useState<BetsViewVersion>\("E3"\)/,
    );

    assert.match(
      page,
      /LEGACY_BETS_VIEW_STORAGE_KEY/,
    );

    assert.match(
      page,
      /storedView \?\? legacyView/,
    );

    assert.match(
      versions,
      /"basic"\) return "B1"/,
    );

    assert.match(
      versions,
      /"advanced"\) return "A1"/,
    );

    assert.match(
      versions,
      /"extreme"\) return "E1"/,
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
