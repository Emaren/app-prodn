import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

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
    ["app/leaderboard/page.tsx", '<SpeedReadyMarker route="/leaderboard" />'],
    ["app/war-chest/page.tsx", '<SpeedReadyMarker route="/war-chest" />'],
    ["app/staking/page.tsx", '<SpeedReadyMarker route="/staking" />'],
  ]);

  for (const [path, marker] of expectations) {
    assert.ok(source(path).includes(marker), `${path} is missing ${marker}`);
  }
});

test("Bets does not claim authoritative ready until its board fetch resolves", () => {
  const bets = source("app/bets/page.tsx");
  assert.match(bets, /const \[loadingBoard, setLoadingBoard\] = useState\(true\)/);
  assert.match(bets, /<SpeedReadyMarker route="\/bets" ready={!loadingBoard} \/>/);
});

test("SPEED III still exposes no public Speed Proof UI", () => {
  const shell = source("app/AppShell.tsx");
  assert.doesNotMatch(shell, /<SpeedProof \/>/);
});
