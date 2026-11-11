import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createServer } from "node:http";
import { once } from "node:events";
import {
  firstDecodableFeaturedImage,
  admitFeaturedMediaByHead,
  isCanonicalPublicAvatarHeadSource,
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

test("direct 404 or known oversized avatar HEAD skips; redirect is unknown",async()=>{
  const mk=(status,length)=>({
    ok:status===200,status,headers:{get:()=>length},
  });
  assert.equal(await admitFeaturedMediaByHead(primary,async()=>mk(404,null)),false);
  assert.equal(await admitFeaturedMediaByHead(primary,async()=>mk(200,"2097153")),false);
  assert.equal(await admitFeaturedMediaByHead(primary,async()=>mk(200,"2097152")),true);
  assert.equal(await admitFeaturedMediaByHead(primary,async()=>mk(200,null)),true);
  assert.equal(await admitFeaturedMediaByHead(primary,async()=>mk(307,null)),true);
  assert.equal(await admitFeaturedMediaByHead(primary,async()=>mk(308,null)),true);
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
  assert.match(s,/redirect: "error"/);
  assert.doesNotMatch(
    s.slice(s.indexOf("async function admitFeaturedWarriorImage"),s.indexOf("const featuredWarriorDecodeCache")),
    /redirect: "follow"/,
  );
  assert.match(s,/cache: "no-store"/);
  assert.match(s,/controller\.abort\(\), 1500/);
  assert.match(s,/admitFeaturedWarriorImage\s*\n\s*\)/);
});

// Real local HTTP servers simulate attacker-controlled redirects. Neither
// internal privileged endpoints nor a second-origin listener may receive HEAD.
// The first avatar endpoint receives exactly one HEAD; redirect:error rejects
// before a Location is ever requested, so ordinary image.decode remains viable.
test("adversarial external and privileged API Location never receive a second HEAD",async()=>{
  let avatarHeads=0;
  let privilegedHeads=0;
  let externalHeads=0;
  const external=createServer((req,res)=>{
    if(req.method==="HEAD") externalHeads++;
    res.writeHead(200,{"Content-Type":"image/webp"});res.end();
  });
  external.listen(0,"127.0.0.1");await once(external,"listening");
  const foreign="http://127.0.0.1:"+external.address().port+"/exfil";
  let destination=foreign;
  const local=createServer((req,res)=>{
    if(req.url?.startsWith("/api/media-assets/avatar/")) {
      avatarHeads++;
      res.writeHead(307,{"Location":destination});res.end();return;
    }
    if(req.url==="/api/bets" || req.url==="/api/financial/admin")privilegedHeads++;
    res.writeHead(404);res.end();
  });
  local.listen(0,"127.0.0.1");await once(local,"listening");
  const base="http://127.0.0.1:"+local.address().port;
  try {
    for(const forbidden of [
      foreign,
      "/api/bets",
      "/api/financial/admin",
      "//127.0.0.1:"+external.address().port+"/exfil",
    ]) {
      destination=forbidden;
      const admitted=await admitFeaturedMediaByHead(primary,
        async source=>fetch(base+source,{
          method:"HEAD",redirect:"error",credentials:"omit",
          signal:AbortSignal.timeout(1500),
        }));
      assert.equal(admitted,true,"a blocked 307 preserves conservative decode");
    }
    assert.equal(avatarHeads,4);
    assert.equal(privilegedHeads,0,"no HEAD to privileged internal API");
    assert.equal(externalHeads,0,"no HEAD to external redirect target");
  } finally {
    await Promise.all([new Promise(resolve=>local.close(resolve)),
      new Promise(resolve=>external.close(resolve))]);
  }
});

test("rejected redirect uses existing decode/fallback without approving bad bytes",async()=>{
  const decoded=[];
  const result=await firstDecodableFeaturedImage(
    [primary,profile,safe],
    async source=>{
      decoded.push(source);
      if(source===primary)throw new Error("307 image decode unavailable");
    },
    async source=>admitFeaturedMediaByHead(source,async()=>{
      throw new TypeError("fetch rejected redirect before follow");
    }),
  );
  assert.equal(result,profile);
  assert.deepEqual(decoded,[primary,profile]);
});

// A browser normalizes raw dot segments and encoded dot segments before
// fetch, so a naive startsWith check is not a request-path trust boundary.
test("canonical avatar HEAD guard rejects normalization into any service API", async () => {
  const unsafe = [
    "/api/media-assets/avatar/../../../api/bets",
    "/api/media-assets/avatar/%2e%2e/%2e%2e/%2e%2e/api/bets",
    "/api/media-assets/avatar/..\\..\\..\\api\\bets",
    "/api/media-assets/avatar/%2F..%2fapi%2Fbets",
    "/api/media-assets/avatar/%5c..%5Capi%5Cbets",
    "/api/media-assets/avatar/a/../b",
    "/api/media-assets/avatar/a/./b",
    "/api/media-assets/avatar//evil",
    "/api/media-assets/avatar/a#fragment",
    "/api/media-assets/avatar/a;other",
    "/api/media-assets/avatar/",
    "https://app.example.test/api/media-assets/avatar/a",
    "//evil.example/api/media-assets/avatar/a",
    "/api/bets",
    "/api/media-assets/avatar/real\\..\\..\\..\\api\\bets",
    "/api/media-assets/avatar/%00malformed",
  ];
  let headCalls=0;
  for (const attack of unsafe) {
    assert.equal(isCanonicalPublicAvatarHeadSource(attack),false,
      "ambiguous URI must not enter HEAD: "+attack);
    assert.equal(await admitFeaturedMediaByHead(attack,async()=>{headCalls++;throw Error("unexpected network");}),
      true,"unknown URI preserves image decode fallback: "+attack);
  }
  assert.equal(headCalls,0,"no preflight HEAD callback for any attack");
});

test("canonical same-origin managed avatar with query preserves known-length policy",async()=>{
  const valid = [
    "/api/media-assets/avatar/portrait.webp?size=card&edgev=abc123",
    "/api/media-assets/avatar/abc-123?size=thumb",
  ];
  for(const source of valid) {
    assert.equal(isCanonicalPublicAvatarHeadSource(source),true);
    let observed=[];
    const blocked=await admitFeaturedMediaByHead(source,async url=>{
      observed.push(url);
      return {ok:true,status:200,headers:{get:()=>String(2097153)}};
    });
    assert.equal(blocked,false,"known >2MiB rejected");
    assert.deepEqual(observed,[source],"only original canonical request admitted");
  }
});

test("real HTTP fixture receives no network on normalized financial target",async()=>{
  let hits=[];
  const local=createServer((req,res)=>{
    hits.push({method:req.method,url:req.url});
    res.writeHead(200,{"Content-Length":"3000000"});res.end();
  });
  local.listen(0,"127.0.0.1");await once(local,"listening");
  try {
    const base="http://127.0.0.1:"+local.address().port;
    const attacks=[
      "/api/media-assets/avatar/../../../api/bets",
      "/api/media-assets/avatar/%2e%2e/%2e%2e/%2e%2e/api/bets",
      "/api/media-assets/avatar/..\\..\\..\\api\\bets",
    ];
    for(const source of attacks) {
      assert.equal(await admitFeaturedMediaByHead(source,
        async uri=>fetch(base+uri,{method:"HEAD",credentials:"omit",redirect:"error"})),
        true);
    }
    assert.deepEqual(hits,[]);
  }finally{
    await new Promise(resolve=>local.close(resolve));
  }
});
