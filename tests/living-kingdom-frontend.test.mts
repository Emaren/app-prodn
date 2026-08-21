import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  clampPresenceDepthBand,
  layoutPresenceActors,
  presenceMaxItemsForViewport,
  presenceSideForId,
} from "../components/presence/presenceLayout.ts";

function actor(index: number, depthBand = index % 21) {
  return {
    id: `actor-${String(index).padStart(3, "0")}`,
    displayName: `Warrior ${index}`,
    avatarUrl: "/champions/players/jim.thumb.webp",
    realmId: "home" as const,
    href: "/players",
    depthBand,
    motion: index % 5 === 0 ? ("down" as const) : ("idle" as const),
  };
}

test("presence side assignment is deterministic and balanced enough for stable rails", () => {
  const ids = Array.from({ length: 100 }, (_, index) => `warrior-${index}`);
  const first = ids.map(presenceSideForId);
  const second = ids.map(presenceSideForId);
  assert.deepEqual(first, second);
  const left = first.filter((side) => side === "left").length;
  assert.ok(left >= 35 && left <= 65, `unexpected split: ${left}/100 on the left`);
});

test("rail collision layout keeps individual markers separated", () => {
  const items = layoutPresenceActors(
    Array.from({ length: 18 }, (_, index) => actor(index, 10)),
    {
      height: 900,
      top: 100,
      bottom: 100,
      markerSize: 32,
      gap: 6,
      maxItems: 24,
      selfId: "actor-000",
    },
  );

  for (const side of ["left", "right"] as const) {
    const positions = items
      .filter((item) => item.side === side)
      .map((item) => item.y)
      .sort((left, right) => left - right);
    for (let index = 1; index < positions.length; index += 1) {
      assert.ok(positions[index] - positions[index - 1] >= 38);
    }
  }
  assert.ok(items.some((item) => item.own && item.members[0]?.id === "actor-000"));
});

test("dense rooms cluster deterministically without losing represented warriors", () => {
  const actors = Array.from({ length: 60 }, (_, index) => actor(index, (index * 3) % 21));
  const items = layoutPresenceActors(actors, {
    height: 820,
    top: 96,
    bottom: 72,
    markerSize: 32,
    gap: 6,
    maxItems: 24,
    selfId: "actor-000",
  });

  assert.ok(items.length <= 24);
  assert.equal(items.flatMap((item) => item.members).length, actors.length);
  assert.equal(new Set(items.flatMap((item) => item.members.map((member) => member.id))).size, actors.length);
  assert.ok(items.some((item) => item.members.length > 1));
});

test("short landscape tablet derives its cap from physical rail height", () => {
  const maxItems = presenceMaxItemsForViewport({
    height: 320,
    top: 108,
    bottom: 128,
    markerSize: 27,
    gap: 6,
    oneRail: true,
    ceiling: 8,
  });
  assert.equal(maxItems, 2);

  const items = layoutPresenceActors(Array.from({ length: 30 }, (_, index) => actor(index)), {
    height: 320,
    top: 108,
    bottom: 128,
    markerSize: 27,
    gap: 6,
    maxItems,
    oneRail: true,
  });
  assert.ok(items.length <= 2);
  assert.equal(items.flatMap((item) => item.members).length, 30);

  const ultraShortItems = layoutPresenceActors(
    Array.from({ length: 12 }, (_, index) => actor(index)),
    {
      height: 280,
      top: 108,
      bottom: 128,
      markerSize: 27,
      gap: 6,
      maxItems: 1,
      oneRail: true,
      selfId: "actor-000",
    },
  );
  assert.equal(ultraShortItems.length, 1);
  assert.equal(ultraShortItems[0].members.length, 12);
  assert.equal(ultraShortItems[0].own, true);
});

test("coarse depth remains clamped to the 21-band public contract", () => {
  assert.equal(clampPresenceDepthBand(-9), 0);
  assert.equal(clampPresenceDepthBand(10.4), 10);
  assert.equal(clampPresenceDepthBand(99), 20);
  assert.equal(clampPresenceDepthBand(Number.NaN), 0);
});

test("global integration remains lazy, room-scoped, default-on, and demo-gated", async () => {
  const [shell, client, overlay, mobileNav, footer, leaderboard] = await Promise.all([
    readFile(new URL("../app/AppShell.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/presence/LivingKingdomClient.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/presence/LivingKingdomOverlay.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/pwa/MobileFloatingNav.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/pwa/AoE2WarFooter.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/leaderboard/LivingLeaderboard.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(shell, /dynamic\([\s\S]*LivingKingdomClient/);
  assert.match(shell, /deferredClientsReady[\s\S]*<LivingKingdomClient \/>/);
  assert.match(shell, /data-presence-door="kingdom"/);
  assert.match(mobileNav, /data-presence-door=/);
  assert.match(footer, /data-presence-door=/);
  assert.match(leaderboard, /data-presence-scroll-root/);

  assert.match(client, /new EventSource\(`\/api\/kingdom-presence\/events\?realm=/);
  assert.match(client, /addEventListener\("snapshot"/);
  assert.match(client, /addEventListener\("delta"/);
  assert.match(client, /addEventListener\("door"/);
  assert.match(client, /\/api\/user\/presence-preference/);
  assert.match(client, /featureAllowed/);
  assert.match(client, /preference\?\.mode === "public_coarse"/);
  assert.doesNotMatch(client, /showOptIn|preferenceLoaded/);
  assert.match(client, /document\.visibilityState === "visible"/);
  assert.match(client, /connection\?\.saveData/);
  assert.match(client, /process\.env\.NODE_ENV !== "production"/);
  assert.match(client, /now - removed\.removedAt > 3_000/);
  assert.match(client, /living-kingdom-demo/);
  assert.match(client, /if \(!demoChecked\) return;[\s\S]{0,220}localStorage\.setItem/);
  assert.doesNotMatch(client, /viewerMode=\{demoEnabled \? "full" : viewerMode\}/);
  assert.doesNotMatch(client, /sessionStorage/);
  assert.match(client, /doorDepartureRef\.current = \{ realmId, markedAt: Date\.now\(\) \}/);
  assert.match(client, /removeUnlessDoorDeparted/);
  assert.match(client, /pendingDoorPublishRef/);
  assert.match(client, /pendingDoor\.controller\.abort\(\), 1_500/);

  assert.match(overlay, /role="radiogroup"/);
  assert.match(overlay, /aria-modal="false"/);
  assert.match(overlay, /element\.animate\(/);
  assert.doesNotMatch(overlay, /OptInPrompt|Join the Living Kingdom|Join the map|Keep me private|showOptIn/);
  assert.match(overlay, /My roaming avatar/);
  assert.match(overlay, /aria-label=\{`My roaming avatar:/);
  assert.doesNotMatch(overlay, /aria-live/);

  const styles = await readFile(
    new URL("../components/presence/LivingKingdom.module.css", import.meta.url),
    "utf8",
  );
  assert.match(styles, /@media \(max-height: 479px\)[\s\S]*\.railRoot,[\s\S]*display: none/);
  assert.match(styles, /\.panel \{[\s\S]*overflow-y: auto/);
  assert.match(styles, /\.sharingControl \{[\s\S]*position: sticky;[\s\S]*bottom: 0/);
});
