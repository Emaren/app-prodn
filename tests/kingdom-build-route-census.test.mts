import assert from "node:assert/strict";
import test from "node:test";
import { classifyKingdomBuildRoutes } from "../lib/kingdomBuildRouteClassifier.ts";

test("deployed build manifest gives exact page templates, utilities, sensitive pages and API handlers", () => {
  const result = classifyKingdomBuildRoutes({
    "/page": "app/page.js",
    "/speed/page": "app/speed/page.js",
    "/kingdom-brain/page": "app/kingdom-brain/page.js",
    "/players/[uid]/page": "app/players/[uid]/page.js",
    "/profile/page": "app/profile/page.js",
    "/market/invoices/[publicId]/page": "app/market/invoices/[publicId]/page.js",
    "/admin/page": "app/admin/page.js",
    "/admin/settings/page": "app/admin/settings/page.js",
    "/api/speed/check/route": "app/api/speed/check/route.js",
    "/api/kingdom-route-census/route": "app/api/kingdom-route-census/route.js",
  });
  assert.deepEqual(result, { publicStatic: 3, publicDynamic: 1, publicUtility: 1, admin: 2, sensitiveDynamic: 1, apiHandlers: 2, totalPages: 8 });
});

test("route groups and parallel slots do not multiply the canonical page count", () => {
  const result = classifyKingdomBuildRoutes({
    "/page": "app/page.js",
    "/(public)/about/page": "app/(public)/about/page.js",
    "/about/page": "app/about/page.js",
    "/@sidebar/activity/page": "app/@sidebar/activity/page.js",
  });
  assert.equal(result?.totalPages, 3);
  assert.equal(result?.publicStatic, 3);
});

test("empty, oversized, malformed, and forged build manifests fail closed", () => {
  for (const input of [null, [], {}, { "/page": "/etc/passwd" }, { "/page": 3 }, { "/page": "app/page.js", "!!/secrets": "app/leak.js" }]) {
    assert.equal(classifyKingdomBuildRoutes(input), null);
  }
});

test("route census is source-classification only, not a guessed quality score", () => {
  const r = classifyKingdomBuildRoutes({ "/page": "app/page.js" });
  assert.ok(r && r.totalPages === 1);
  assert.ok(!("score" in r) && !("certified" in r));
});
