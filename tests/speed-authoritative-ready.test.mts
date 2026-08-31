import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { shouldAcceptFirstExplicitReady } from "../lib/speed/readiness.ts";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("authoritative ready runtime can upgrade fallback samples idempotently", () => {
  const runtime = source("components/speed/SpeedRuntime.tsx");
  const store = source("lib/speed/clientStore.ts");
  assert.match(runtime, /SPEED_READY_EVENT/);
  assert.match(runtime, /patchSpeedSample/);
  assert.match(runtime, /ready_source: "explicit"/);
  assert.match(runtime, /readExplicitSpeedReady/);
  assert.match(store, /includeDetails/);
});

test("the first authoritative ready signal wins for one route measurement", () => {
  const startedAt = 1_000;
  const firstReadyAt = 1_250;

  assert.equal(
    shouldAcceptFirstExplicitReady(null, firstReadyAt, startedAt),
    true,
  );
  assert.equal(
    shouldAcceptFirstExplicitReady(firstReadyAt, 61_000, startedAt),
    false,
  );
  assert.equal(
    shouldAcceptFirstExplicitReady(null, 999, startedAt),
    false,
  );
  assert.equal(
    shouldAcceptFirstExplicitReady(null, Number.NaN, startedAt),
    false,
  );

  const runtime = source("components/speed/SpeedRuntime.tsx");
  assert.match(runtime, /shouldAcceptFirstExplicitReady\(/);
});

test("missing navigation intent never turns tab age into a page-load duration", () => {
  const runtime = source("components/speed/SpeedRuntime.tsx");
  assert.match(runtime, /\[inMemoryPendingRef\.current, storedPending\]/);
  assert.match(
    runtime,
    /isInitialDocumentSample \? performance\.timeOrigin : nowEpoch/,
  );
  assert.match(
    runtime,
    /isInitialDocumentSample[\s\S]*?\? 0[\s\S]*?: nowPerf/,
  );
  assert.match(runtime, /missing_navigation_intent/);
});

test("the Speed chart excludes invalid and non-authoritative route-paint samples", () => {
  const observatory = source("components/speed/SpeedObservatory.tsx");
  assert.match(observatory, /const validSamples = useMemo/);
  assert.match(observatory, /sample\.valid_for_aggregation/);
  assert.match(observatory, /!sample\.visibility_tainted/);
  assert.match(
    observatory,
    /sample\.ready_source === "explicit"[\s\S]*?sample\.ready_source === "initial_hydration"/,
  );
  assert.match(observatory, /\[\.\.\.chartSamples\]\.reverse\(\)\.slice\(-20\)/);
});

test("the readiness marker publishes only after the marked experience is ready", () => {
  const marker = source("components/speed/SpeedReadyMarker.tsx");
  assert.match(marker, /if \(!ready\) return/);
  assert.match(marker, /requestAnimationFrame/);
  assert.match(marker, /publishExplicitSpeedReady\(route\)/);
});

test("all primary battlefield routes publish explicit readiness", () => {
  const expectations = new Map([
    ["app/HomePageClient.tsx", '<SpeedReadyMarker route="/" />'],
    ["app/bets/page.tsx", '<SpeedReadyMarker route="/bets" ready={!loadingBoard} />'],
    ["components/live/LiveGamesBoard.tsx", '<SpeedReadyMarker route="/live-games" />'],
    ["app/players/page.tsx", '<SpeedReadyMarker route="/players" />'],
    ["app/rivalries/page.tsx", '<SpeedReadyMarker route="/rivalries" />'],
    ["app/war-chest/page.tsx", '<SpeedReadyMarker route="/war-chest" />'],
    ["app/staking/page.tsx", '<SpeedReadyMarker route="/staking" />'],
    [
      "components/wolo/WoloPageClient.tsx",
      '<SpeedReadyMarker route="/wolo" ready={speedReady} />',
    ],
    [
      "app/academy/AcademyHero.tsx",
      'route="/academy"',
    ],
  ]);

  for (const [path, marker] of expectations) {
    assert.ok(source(path).includes(marker), `${path} is missing ${marker}`);
  }
});

test("WOLO and Contact Emaren wait for their critical data paths", () => {
  const wolo = source("components/wolo/WoloPageClient.tsx");
  const contact = source("components/contact/ContactEmarenWorkspace.tsx");
  const proof = source("components/speed/SpeedProof.tsx");

  assert.match(wolo, /const speedReady =/);
  assert.match(wolo, /!chainLoading/);
  assert.match(wolo, /balanceState !== "loading"/);
  assert.match(contact, /const \[initialLoadSettled, setInitialLoadSettled\]/);
  assert.match(
    contact,
    /<SpeedReadyMarker route="\/contact-emaren" ready=\{initialLoadSettled\} \/>/,
  );
  assert.match(proof, /"\/wolo"/);
  assert.match(proof, /"\/contact-emaren"/);
  assert.match(proof, /"\/academy"/);
  assert.match(proof, /\^\\\/game-stats\\\//);
  const academy = source("app/academy/AcademyHero.tsx");
  assert.match(academy, /heroPreferenceSettled/);
  assert.match(academy, /readyHeroVariant === heroVariant/);
});

test("Leaderboard does not claim authoritative ready until its board exists", () => {
  const leaderboard = source(
    "components/leaderboard/ModernLeaderboardPage.tsx",
  );

  assert.match(
    leaderboard,
    /<SpeedReadyMarker\s+route="\/leaderboard"\s+ready=\{!loading\}\s*\/>/,
  );

  assert.doesNotMatch(
    source("app/leaderboard/page.tsx"),
    /SpeedReadyMarker/,
  );
});

test("Bets does not claim authoritative ready until its board fetch resolves", () => {
  const bets = source("app/bets/page.tsx");
  assert.match(bets, /const \[loadingBoard, setLoadingBoard\] = useState\(true\)/);
  assert.match(bets, /<SpeedReadyMarker route="\/bets" ready={!loadingBoard} \/>/);
});

test("SPEED III authoritative readiness remains globally wired", () => {
  const shell = source("app/AppShell.tsx");
  assert.match(shell, /<SpeedRuntime \/>/);
});
