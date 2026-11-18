/**
 * WE3 public release smoke. No cookies, tokens, accounts, server mutation, build
 * or browser automation. Transport truth ≠ authenticated browser acceptance.
 *
 * Normal (offline): node --test tests/we3-public-release-smoke.test.mjs
 * Opt-in against qualified candidate (NO secret env):
 * WE3_SMOKE_ORIGIN=https://aoe2war.com \
 * WE3_SMOKE_SOURCE=<40hex_qualified_artifact_sha> \
 * WE3_SMOKE_BUILD=<exact_next_build_id> \
 * node --test tests/we3-public-release-smoke.test.mjs
 *
 * Authenticated Emaren/Scribe browser, Chronicle ZIP, Storage L2, session
 * persistence and physical Factory T10 MUST be witnessed separately. Never
 * infer T10 success from this tool. Do not follow off-origin redirects.
 */
import test from "node:test";
import assert from "node:assert/strict";

const ROUTES = Object.freeze([
  "/", "/traffic", "/kingdom", "/kingdom-traders", "/wargraph",
  "/factory", "/workshop", "/players",
]);
const PUBLIC_API = Object.freeze([
  ["/api/health", 200], ["/api/auth/session", 401], ["/api/traffic", 401],
]);
const env = {
  origin: process.env.WE3_SMOKE_ORIGIN,
  source: process.env.WE3_SMOKE_SOURCE,
  build: process.env.WE3_SMOKE_BUILD,
  certified: process.env.WE3_SMOKE_CERTIFIED_DAY,
};
const active = Boolean(env.origin || env.source || env.build || env.certified);
const SHA = /^[a-f0-9]{40}$/;
const BUILD = /^[A-Za-z0-9_-]{8,96}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const UA = "AoE2WAR-WE3-readonly-release-smoke/1.0";
const LIMIT = 1250000;

function configured(cfg) {
  if (!cfg.origin || !SHA.test(cfg.source || "") || !BUILD.test(cfg.build || "")) {
    throw new Error("HOLD_EXACT_QUALIFIED_SOURCE_BUILD_REQUIRED");
  }
  const url = new URL(cfg.origin);
  if (url.href !== url.origin + "/" || url.username || url.password) {
    throw new Error("HOLD_ORIGIN_MUST_BE_BARE");
  }
  if (!(url.protocol === "https:" && ["aoe2war.com", "www.aoe2war.com"].includes(url.hostname))
      && !(url.protocol === "http:" && url.hostname === "127.0.0.1")) {
    throw new Error("HOLD_UNEXPECTED_ORIGIN");
  }
  if (cfg.certified && (!DAY.test(cfg.certified) || !Number.isFinite(Date.parse(cfg.certified + "T00:00:00Z")))) {
    throw new Error("HOLD_INVALID_CERTIFIED_DATE");
  }
  return url.origin;
}

async function boundedGet(origin, path, { accept = "text/html,application/json", range = false } = {}) {
  assert.ok(path.startsWith("/") && !path.startsWith("//"), "fixed relative path");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  let response;
  try {
    response = await fetch(new URL(path, origin), {
      method: "GET", redirect: "manual", credentials: "omit",
      headers: { "User-Agent": UA, "Accept": accept, ...(range ? { Range: "bytes=0-63" } : {}) },
      signal: ctrl.signal, cache: "no-store"
    });
    assert.ok(![301,302,303,307,308].includes(response.status), "HOLD_REDIRECT:" + path);
    assert.equal(new URL(response.url).origin, origin, "HOLD_ORIGIN_DRIFT");
    if (range) {
      assert.ok([200,206].includes(response.status), "HOLD_IMAGE_HTTP_" + response.status);
      const reader = response.body?.getReader();
      assert.ok(reader, "HOLD_EMPTY_IMAGE_STREAM");
      const {value} = await reader.read();
      await reader.cancel();
      return { status: response.status, headers: response.headers, head: value ?? new Uint8Array() };
    }
    const reported = Number(response.headers.get("content-length") || 0);
    assert.ok(reported <= LIMIT, "HOLD_BODY_TOO_LARGE");
    const body = await response.text();
    assert.ok(Buffer.byteLength(body, "utf8") <= LIMIT, "HOLD_BODY_TOO_LARGE");
    return { status: response.status, headers: response.headers, body };
  } finally {
    clearTimeout(timer);
    if (!range) await response?.body?.cancel().catch(() => {});
  }
}

function verifyReleaseHeaders(result, cfg, path) {
  const liveSource = result.headers.get("x-aoe2war-source");
  const liveBuild = result.headers.get("x-aoe2war-build-id");
  assert.equal(liveSource, cfg.source, "HOLD_SOURCE_MISMATCH:" + path);
  assert.equal(liveBuild, cfg.build, "HOLD_BUILD_MISMATCH:" + path);
}

function plainText(html) {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ").trim();
}

function getCertifiedDay(html) {
  const readable = plainText(html);
  const match = readable.match(/LAST PUBLISHED UTC DAY:\s*(\d{4}-\d{2}-\d{2})/i);
  assert.ok(match, "HOLD_TRAFFIC_LAST_CERTIFIED_DAY_NOT_VISIBLE");
  return match[1];
}

function imagePaths(html, prefix, max) {
  const images = [...html.matchAll(/<img\b[^>]*?\bsrc="([^"]+)"/gi)]
    .map(match => match[1].replace(/&amp;/g, "&"))
    .filter(src => src.startsWith(prefix));
  return [...new Set(images)].slice(0, max);
}

function imageMagic(bytes) {
  const b = Buffer.from(bytes);
  return b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ||
    (b.toString("ascii",0,4) === "RIFF" && b.toString("ascii",8,12) === "WEBP") ||
    (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) ||
    b.toString("ascii",0,3) === "GIF";
}

test("release probe is strictly source/build-bound and same-origin", () => {
  const good={origin:"https://aoe2war.com",source:"a".repeat(40),build:"sampleBuild123"};
  assert.equal(configured(good),"https://aoe2war.com");
  for (const bad of [
    {...good,source:"a"}, {...good,build:"??"}, {...good,origin:"https://evil.example"},
    {...good,origin:"https://aoe2war.com/kingdom"},
    {...good,origin:"https://user:pass@aoe2war.com"},
  ]) assert.throws(() => configured(bad),/HOLD_/);
});
test("release matrix uses exact existing public routes, not guessed paths", () => {
  assert.ok(ROUTES.includes("/wargraph"));
  assert.ok(ROUTES.includes("/traffic"));
  assert.ok(ROUTES.includes("/kingdom-traders"));
  assert.ok(!ROUTES.includes("/wargraphs"));
});
test("traffic certification parser cannot silently substitute browser observations", () => {
  assert.equal(getCertifiedDay('<p>LAST PUBLISHED UTC DAY: 2026-10-19</p><p>BROWSER OBSERVED 2026-11-17</p>'),"2026-10-19");
  assert.throws(() => getCertifiedDay("<p>BROWSER OBSERVED 2026-11-17</p>"),/HOLD_/);
});
test("WEB RELEASE: source/build, public pages, anon API denial, graph date and image bytes",
  {skip: !active},
  async () => {
    const origin=configured(env);
    const findings=[];
    for (const path of ROUTES) {
      const r=await boundedGet(origin,path);
      verifyReleaseHeaders(r,env,path);
      assert.equal(r.status,200,"HOLD_PUBLIC_PAGE:"+path);
      assert.match(r.headers.get("content-type")||"",/text\/html/);
      findings.push({path,http:r.status,sourceMatch:true,buildMatch:true});
      if (path === "/traffic") {
        const last=getCertifiedDay(r.body);
        if(env.certified)assert.equal(last,env.certified,"HOLD_UNEXPECTED_TRAFFIC_DATE");
        const utcNow = new Date().toISOString().slice(0,10);
        assert.ok(last <= utcNow, "HOLD_FUTURE_CERTIFIED_DAY");
        findings.push({trafficLastCertifiedUtcDay:last,graphContentSource:"SSR; BROWSER_HYDRATION_SEPARATE"});
      }
      if (path === "/") {
        const h=imagePaths(r.body,"/uploads/managed-assets/background/hero-chain",2);
        const a=imagePaths(r.body,"/api/media-assets/avatar/",3);
        assert.ok(h.length >= 1, "HOLD_NO_MANAGED_HERO_SOURCE");
        assert.ok(a.length >= 1, "HOLD_NO_AVATAR_SOURCE");
        for (const src of [...h,...a]) {
          const im=await boundedGet(origin,src,{accept:"image/webp,image/png,image/jpeg,image/gif",range:true});
          assert.match(im.headers.get("content-type")||"",/^image\//);
          assert.ok(imageMagic(im.head),"HOLD_INVALID_IMAGE_SIGNATURE:"+src.split("?")[0]);
          findings.push({mediaClass:h.includes(src)?"chronicleHero":"avatar",http:im.status,realImageBytes:true});
        }
      }
    }
    for (const [path,status] of PUBLIC_API) {
      const r=await boundedGet(origin,path,{accept:"application/json"});
      verifyReleaseHeaders(r,env,path);
      assert.equal(r.status,status,"HOLD_ANON_API_PERMISSION:"+path);
      findings.push({path,http:status,anonymousOnly:true});
    }
    console.log("WE3_PUBLIC_RELEASE_ACCEPTANCE",JSON.stringify({
      schema:"aoe2war.we3.public-smoke.v1",qualifiedSource:env.source,
      qualifiedBuildId:env.build,role:"ANONYMOUS_ONLY_NO_COOKIES",
      cannotCertify:["signed_in_user","owner_admin","Storage_L2_hydrated","Chronicle_ZIP","T10_physical",
        "session_restart","artifact_zip_sha256","Traffic_chart_pixels"],
      findings
    }));
  });
