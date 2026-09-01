import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  clampPresenceDepthBand,
  layoutPresenceActors,
  presenceMaxItemsForViewport,
  presenceSideForId,
} from "../components/presence/presenceLayout.ts";
import { orderLivingKingdomChipActors } from "../components/presence/livingKingdomVisualStore.ts";

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

  const items = layoutPresenceActors(
    Array.from({ length: 7 }, (_, index) => actor(index)),
    {
      height: 900,
      top: 100,
      bottom: 100,
      markerSize: 32,
      gap: 6,
      maxItems: 24,
    },
  );
  const leftItems = items.filter((item) => item.side === "left").length;
  const rightItems = items.filter((item) => item.side === "right").length;
  assert.ok(Math.abs(leftItems - rightItems) <= 1, `${leftItems}/${rightItems} rails were not alternated`);
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

test("the speed chip preserves the complete bounded warrior roster", () => {
  const actors = Array.from({ length: 12 }, (_, index) => actor(index));
  const ordered = orderLivingKingdomChipActors(actors, "actor-000");

  assert.equal(ordered.length, 12);
  assert.equal(new Set(ordered.map((entry) => entry.id)).size, 12);
  assert.equal(ordered.at(-1)?.id, "actor-000");
});

test("global integration publishes eagerly, stays room-scoped/default-on, and keeps demo gated", async () => {
  const [shell, client, overlay, speedProof, visualStore, publicPresence, mobileNav, footer, leaderboard] = await Promise.all([
    readFile(new URL("../app/AppShell.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/presence/LivingKingdomClient.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/presence/LivingKingdomOverlay.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/speed/SpeedProof.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/presence/livingKingdomVisualStore.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/presence/PublicPresenceProvider.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/pwa/MobileFloatingNav.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/pwa/AoE2WarFooter.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/leaderboard/LivingLeaderboard.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(shell, /dynamic\([\s\S]*LivingKingdomClient/);
  assert.match(shell, /<LivingKingdomClient \/>\s*\{deferredClientsReady \? \(/);
  assert.match(shell, /data-presence-door="kingdom"/);
  assert.match(mobileNav, /data-presence-door=/);
  assert.match(footer, /data-presence-door=/);
  assert.match(leaderboard, /data-presence-scroll-root/);

  assert.match(client, /new EventSource\(`\/api\/kingdom-presence\/events\?realm=/);
  assert.match(client, /addEventListener\("snapshot"/);
  assert.match(client, /addEventListener\("delta"/);
  assert.match(client, /addEventListener\("door"/);
  assert.match(client, /\/api\/user\/presence-preference/);
  assert.match(client, /const canPublish =\s*Boolean\(uid\)[\s\S]{0,180}Boolean\(realmId\)/);
  assert.doesNotMatch(client, /const canPublish =[\s\S]{0,300}preference\?\.mode/);
  assert.doesNotMatch(client, /showOptIn|preferenceLoaded/);
  assert.match(client, /document\.visibilityState === "visible"/);
  assert.doesNotMatch(client, /Boolean\(realmId\)\s*&&\s*pageVisible\s*&&/);
  assert.match(client, /document\.addEventListener\("visibilitychange", renewAcrossVisibilityChange\)/);
  assert.match(client, /connection\?\.saveData/);
  assert.match(client, /process\.env\.NODE_ENV !== "production"/);
  assert.match(client, /now - removed\.removedAt > 3_000/);
  assert.match(client, /living-kingdom-demo/);
  assert.doesNotMatch(client, /VIEWER_MODE_STORAGE_KEY|viewerMode|setViewerMode/);
  assert.match(client, /HEARTBEAT_INTERVAL_MS = 8_000/);
  assert.match(client, /window\.addEventListener\("pageshow", republishVisibleState\)/);
  assert.match(client, /window\.addEventListener\("focus", republishVisibleState\)/);
  assert.doesNotMatch(client, /queueArrivalFlight/);
  assert.match(client, /door\.actor\.id === selfIdRef\.current && !selfVisibleRef\.current/);
  assert.match(client, /publishLivingKingdomVisualSnapshot\(\{ actors, overflowCount, selfId, selfVisible \}\)/);
  assert.match(client, /doorDepartureRef\.current = \{ realmId, markedAt: Date\.now\(\) \}/);
  assert.match(client, /removeUnlessDoorDeparted/);
  assert.match(client, /pendingDoorPublishRef/);
  assert.match(client, /pendingDoor\.controller\.abort\(\), 1_500/);

  assert.match(overlay, /element\.animate\(/);
  assert.doesNotMatch(overlay, /PeoplePanel|People here|role="radiogroup"|\bFull\b|\bCalm\b|My roaming avatar/);
  assert.doesNotMatch(overlay, /roamingButton|warriors? roaming/);
  assert.match(overlay, /props\.selfVisible \|\| actor\.id !== props\.selfId/);
  assert.match(overlay, /props\.selfVisible \|\| flight\.actor\.id !== props\.selfId/);
  assert.match(overlay, /props\.onHideSelf\(\)/);
  assert.doesNotMatch(overlay, /aria-live/);

  assert.match(speedProof, /data-living-kingdom-speed-stack/);
  assert.match(speedProof, /requestLivingKingdomSelfAvatar/);
  assert.match(speedProof, /livingKingdomRealmForPath\(route\)/);
  assert.match(speedProof, /if \(!authoritative && !livingKingdomRealm\) return null/);
  assert.match(speedProof, /-ml-2/);
  assert.match(speedProof, /orderLivingKingdomChipActors/);
  assert.doesNotMatch(speedProof, /\.slice\(0, self \? 7 : 8\)/);
  assert.match(speedProof, /presence\.overflowCount/);
  assert.match(speedProof, /document\.addEventListener\("pointerdown", closeOutside\)/);
  assert.match(visualStore, /publishLivingKingdomVisualSnapshot/);
  assert.match(visualStore, /subscribeLivingKingdomSelfAvatarRequest/);
  assert.match(publicPresence, /refreshIfVisible\(\);/);
  assert.match(publicPresence, /window\.addEventListener\("pageshow", refreshIfVisible\)/);

  const styles = await readFile(
    new URL("../components/presence/LivingKingdom.module.css", import.meta.url),
    "utf8",
  );
  assert.match(styles, /@media \(max-height: 479px\)[\s\S]*\.railRoot,[\s\S]*display: none/);
  assert.match(styles, /\.own \.portrait \{[\s\S]{0,240}opacity: 0\.38/);
  assert.match(
    styles,
    /\.portrait \{[\s\S]{0,320}overflow: visible;[\s\S]{0,160}border: 0;[\s\S]{0,160}border-radius: 0;[\s\S]{0,160}background: transparent;/
  );
  assert.match(
    styles,
    /\.clusterPortrait \{[\s\S]{0,320}overflow: visible;[\s\S]{0,160}border: 0;[\s\S]{0,160}border-radius: 0;/
  );
  assert.match(
    styles,
    /\.flight \{[\s\S]{0,360}overflow: visible;[\s\S]{0,160}border: 0;[\s\S]{0,160}border-radius: 0;[\s\S]{0,160}background: transparent;/
  );
  assert.match(
    styles,
    /\.portrait img,[\s\S]*\.clusterPortrait img,[\s\S]*\.flight img \{[\s\S]{0,220}object-fit: contain;[\s\S]{0,220}drop-shadow/
  );
  assert.doesNotMatch(styles, /\.panel|\.roamingButton|\.sharingControl|\.modeGroup/);
});
