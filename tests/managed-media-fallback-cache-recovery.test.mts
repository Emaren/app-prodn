import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  fallbackMediaCacheControl,
  VERIFIED_MANAGED_MEDIA_CACHE_CONTROL,
} from "../lib/mediaFallbackCachePolicy.ts";

const source = readFileSync(
  new URL("../app/api/media-assets/[kind]/[target]/route.ts", import.meta.url),
  "utf8",
);

test("real managed uploads retain versioned 24-hour response cache", () => {
  assert.equal(
    VERIFIED_MANAGED_MEDIA_CACHE_CONTROL,
    "public, max-age=86400, stale-while-revalidate=604800",
  );
  assert.match(source, /const IMAGE_RESPONSE_CACHE_CONTROL = VERIFIED_MANAGED_MEDIA_CACHE_CONTROL;/);
});

test("missing assignment can retry after 60 seconds and cannot serve a seven-day stale fallback", () => {
  assert.equal(fallbackMediaCacheControl("unassigned"), "public, max-age=60, must-revalidate");
  assert.doesNotMatch(fallbackMediaCacheControl("unassigned"), /stale-while-revalidate|immutable/);
});

test("database permission failures must not be cached, including future unknown reasons", () => {
  assert.equal(fallbackMediaCacheControl("lookup-error"), "private, no-store");
  assert.equal(
    fallbackMediaCacheControl("unexpected-reason" as "lookup-error"),
    "private, no-store",
  );
});

test("normal route marks a static asset as fallback only on matched fallback path", () => {
  const route = source.split("export async function GET(")[1];
  assert.match(route, /const isFallback = url === \(mediaFallbackUrl\(kind, target, fallback\) \|\| "\/"\)/);
  assert.match(route, /return isFallback \? markFallbackMedia\(direct, "unassigned"\) : direct;/);
  assert.match(route, /return isFallback \? markFallbackMedia\(redirect, "unassigned"\) : redirect;/);
});

test("database lookup errors override HTTP 200 static fallback cache as uncached", () => {
  const failure = source.split('console.warn("Managed media route failed:", error);')[1];
  assert.match(failure, /const direct = await serveDirectAsset\(request, url\)/);
  assert.match(failure, /return markFallbackMedia\(direct, "lookup-error"\)/);
  assert.match(failure, /return markFallbackMedia\(redirectToInternalAsset\(url\), "lookup-error"\)/);
});

test("marking a fallback updates response headers, not mutable gift or image data", () => {
  const helper = source.split("function markFallbackMedia(")[1].split("function managedUploadParts(")[0];
  assert.match(helper, /response\.headers\.set\("Cache-Control", fallbackMediaCacheControl\(reason\)\)/);
  assert.match(helper, /response\.headers\.set\("X-AoE2WAR-Media-Fallback", "1"\)/);
  assert.doesNotMatch(helper, /writeFile|prisma|\.update\(|\.upsert\(/);
});

test("verified media response remains direct-managed, fallback only overlays outer GET", () => {
  const image = source.split("function imageResponse(")[1].split("function canGenerateWebpVariant(")[0];
  assert.match(image, /"X-AoE2WAR-Media-Proxy": "direct-managed"/);
  assert.match(image, /"Cache-Control": IMAGE_RESPONSE_CACHE_CONTROL/);
  assert.doesNotMatch(image, /markFallbackMedia/);
});

test("public fallback routes preserve static file sandbox and a separate opaque presence TTL", () => {
  assert.match(source, /if \(!original\.startsWith\(\x60\$\{root\}\$\{path\.sep\}\x60\)\)/);
  assert.match(source, /const OPAQUE_PRESENCE_CACHE_CONTROL =\s*"public, max-age=300, stale-while-revalidate=300"/);
  assert.match(source, /if \(kind === "avatar" && isLivingKingdomAvatarHandle\(target\)\)/);
});
