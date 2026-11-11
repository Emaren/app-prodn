import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { firstDecodableFeaturedImage } from "../lib/featuredWarriorDecodeFallback.ts";
const primary = "/api/media-assets/avatar/primary?size=card";
const profile = "/api/media-assets/avatar/profile?size=card";
const safe = "/champions/players/silhouette.card.webp";
test("decoded primary prevents extra requests", async () => {
  const calls = [];
  assert.equal(await firstDecodableFeaturedImage([primary,profile,safe], async p => {calls.push(p);}),primary);
  assert.deepEqual(calls,[primary]);
});
test("failed managed primary pre-decodes profile fallback first", async () => {
  const calls = [];
  assert.equal(await firstDecodableFeaturedImage([primary,profile,safe], async p => {
    calls.push(p); if(p===primary) throw new Error("unavailable/oversize");
  }),profile);
  assert.deepEqual(calls,[primary,profile]);
});
test("two failed managed images pre-decode the safe silhouette", async () => {
  const calls = [];
  assert.equal(await firstDecodableFeaturedImage([primary,profile,safe], async p => {
    calls.push(p);if(p!==safe) throw new Error("failed");
  }),safe);
  assert.deepEqual(calls,[primary,profile,safe]);
});
test("all failures reject and retain the existing painted card",async () => {
  const calls=[];
  await assert.rejects(firstDecodableFeaturedImage([primary,profile,safe],async p => {
    calls.push(p);throw new Error("failed");
  }),/retain the painted card/);
  assert.deepEqual(calls,[primary,profile,safe]);
});
test("duplicate candidates skipped and retries bounded",async () => {
  const calls=[];
  await assert.rejects(firstDecodableFeaturedImage(["",primary,primary,safe,"/fourth","/fifth"],async p=>{
    calls.push(p);throw new Error("failed");
  }),/retain the painted card/);
  assert.deepEqual(calls,[primary,safe,"/fourth"]);
  assert.ok(!calls.includes("/fifth"), "fourth distinct decode forbidden");
});
test("the actual pre-decoded fallback is passed to the double-buffered image layer", () => {
  const s=readFileSync(new URL("../app/HomePageClient.tsx",import.meta.url),"utf8");
  assert.match(s,/predecodedImageUrl\?: string/);
  assert.match(s,/warrior\.predecodedImageUrl\?\.startsWith\("\/"\)/);
  assert.match(s,/firstDecodableFeaturedImage\([\s\S]*\[primaryImage, profileFallback, UNKNOWN_FEATURED_WARRIOR_IMAGE\]/);
  assert.match(s,/\.then\(\(predecodedImageUrl\) => \{/);
  assert.match(s,/next\[slot\] = \{ \.\.\.nextWarrior, predecodedImageUrl \}/);
  assert.match(s,/pendingLayerRef\.current/);
  assert.match(s,/imageStillMatchesExpectedSource/);
});
test("opening SSR lineup and first critical preloaded bitmap remain identical",()=>{
  const s=readFileSync(new URL("../app/HomePageClient.tsx",import.meta.url),"utf8");
  assert.match(s,/const openingLineup = curatedFeaturedWarriorOpening\(pool, true, openingSeed\)/);
  assert.match(s,/openingPreloadSrcRef\.current = featuredWarriorImageSrc\(openingLineup\[0\]\)/);
  assert.match(s,/preload\(openingPreloadSrcRef\.current, \{ as: "image", fetchPriority: "high" \}\)/);
});
