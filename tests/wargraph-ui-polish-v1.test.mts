import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const experience = readFileSync(
  new URL("../components/wargraph/WarGraphExperience.tsx", import.meta.url),
  "utf8",
);
const board = readFileSync(
  new URL("../components/wargraph/WarGraphBoard.tsx", import.meta.url),
  "utf8",
);
const drawer = readFileSync(
  new URL("../components/wargraph/WarriorDrawer.tsx", import.meta.url),
  "utf8",
);
const snapshot = readFileSync(
  new URL("../lib/wargraph/snapshot.ts", import.meta.url),
  "utf8",
);

test("WarGraph hero teaches the same system differently by view mode", () => {
  assert.match(
    experience,
    /viewMode === "basic"/,
  );
  assert.match(
    experience,
    /A persistent board of war tables\. Win verified battles, move inward, and claim the Crown\./,
  );
  assert.match(
    experience,
    /Run a <Link href="https:\/\/aoe2war\.com\/download" className="cursor-pointer text-inherit no-underline hover:text-inherit hover:no-underline">watcher<\/Link>\. Advance inward\. Take the Crown\. 2 battles per night\. 5–11 PM Mountain Time\./,
  );
  assert.match(experience, /\$\{actionsRemaining\} left/);
});

test("WarGraph phase language is operational instead of Static State", () => {
  assert.match(snapshot, /prime: "Prime Live"/);
  assert.match(snapshot, /static: staticBeforePrime \? "Board Locked" : "Night Complete"/);
  assert.doesNotMatch(snapshot, /static: "Static State"/);
});

test("WarGraph drawer clears the sticky app header without shrinking the full-size panel", () => {
  assert.match(drawer, /\[data-app-shell-header\]/);
  assert.match(drawer, /new ResizeObserver\(update\)/);
  assert.match(drawer, /sm:top-\[var\(--wargraph-drawer-top\)\]/);
  assert.match(drawer, /sm:bottom-3/);
});

test("WarGraph previews inward routes and animates verified seat movement without extra copy", () => {
  assert.match(board, /onMouseEnter=\{\(\) => onPreview\(node\.id\)\}/);
  assert.match(board, /inwardPathTarget/);
  assert.match(board, /focus-path:/);
  assert.match(board, /transition-\[left,top,transform\] duration-700/);
});

test("WarGraph public names use the canonical leaderboard latest-observed-name authority", () => {
  assert.match(
    snapshot,
    /import \{ loadPublicPlayerDirectory \} from "\.\.\/publicPlayerDirectory";/,
  );
  assert.match(
    snapshot,
    /await loadPublicPlayerDirectory\(prisma\)/,
  );
  assert.match(
    snapshot,
    /entry\.key,[\s\S]*entry\.latestObservedName/,
  );
  assert.match(
    snapshot,
    /latestObservedNameByPlayerKey[\s\S]*membership\.playerKey/,
  );
  assert.doesNotMatch(
    snapshot,
    /fetchSteamProfile/,
  );
  assert.doesNotMatch(
    snapshot,
    /scheduleWarGraphSteamPersonaRefresh/,
  );
  assert.doesNotMatch(
    snapshot,
    /displayName: membership\.displayNameSnapshot/,
  );
});
