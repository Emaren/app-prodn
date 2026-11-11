import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  firstDecodableFeaturedImage,
  admitFeaturedMediaByHead,
  exceedsFeaturedCompactMediaBytes,
  FEATURED_COMPACT_MEDIA_MAX_BYTES,
} from "../lib/featuredWarriorDecodeFallback.ts";
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

test("2 MiB compact cutoff only rejects known oversized Content-Length", () => {
  assert.equal(FEATURED_COMPACT_MEDIA_MAX_BYTES,2097152);
  for (const n of [null,"","0","83184","2097152","bad","-1"]) {
    assert.equal(exceedsFeaturedCompactMediaBytes(n),false);
  }
  for (const n of ["2097153","7340032","9999999999999999999999"]) {
    assert.equal(exceedsFeaturedCompactMediaBytes(n),true);
  }
});

test("a known oversized primary never reaches decode; compact fallback wins",async()=>{
  const decoded=[];
  const admitted=[];
  const winner=await firstDecodableFeaturedImage([primary,profile,safe],
    async src=>{decoded.push(src);},
    async src=>{admitted.push(src);return src!==primary;});
  assert.equal(winner,profile);
  assert.deepEqual(decoded,[profile]);
  assert.deepEqual(admitted,[primary,profile]);
});

test("public avatar HEAD 307-followed-404 or >2 MiB skips, smaller passes",async()=>{
  const mk=(status,length)=>({
    ok:status===200,status,headers:{get:()=>length},
  });
  assert.equal(await admitFeaturedMediaByHead(primary,async()=>mk(404,null)),false);
  assert.equal(await admitFeaturedMediaByHead(primary,async()=>mk(200,"2097153")),false);
  assert.equal(await admitFeaturedMediaByHead(primary,async()=>mk(200,"2097152")),true);
  assert.equal(await admitFeaturedMediaByHead(primary,async()=>mk(200,null)),true);
  assert.equal(await admitFeaturedMediaByHead(primary,async()=>mk(405,null)),true);
  assert.equal(await admitFeaturedMediaByHead(primary,async()=>{throw new Error("HEAD blocked")}),true);
});

test("static silhouette and unrelated routes make no network probe",async()=>{
  const noProbe=async()=>{throw new Error("unexpected HEAD")};
  assert.equal(await admitFeaturedMediaByHead(safe,noProbe),true);
  assert.equal(await admitFeaturedMediaByHead("/api/finance/status",noProbe),true);
  assert.equal(await admitFeaturedMediaByHead("https://example.test/image.png",noProbe),true);
});

test("client image HEAD uses no credentials, bounded timeout, no body",()=>{
  const s=readFileSync(new URL("../app/HomePageClient.tsx",import.meta.url),"utf8");
  assert.match(s,/method: "HEAD"/);
  assert.match(s,/credentials: "omit"/);
  assert.match(s,/cache: "no-store"/);
  assert.match(s,/controller\.abort\(\), 1500/);
  assert.match(s,/admitFeaturedWarriorImage\s*\n\s*\)/);
});
