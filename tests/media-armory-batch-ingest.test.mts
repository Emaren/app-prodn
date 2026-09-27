import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const helper = fs.readFileSync("lib/managedMediaBatch.ts", "utf8");
const route = fs.readFileSync(
  "app/api/admin/media-assets/batch/route.ts",
  "utf8",
);
const admin = fs.readFileSync("app/admin/media-assets/page.tsx", "utf8");
const champions = fs.readFileSync(
  "components/champions/ChampionsV2Experience.tsx",
  "utf8",
);
const championState = fs.readFileSync(
  "lib/champions/championsV2.ts",
  "utf8",
);

test("Media Armory exposes a one-shot ZIP batch lane", () => {
  assert.match(admin, /Batch asset pack/);
  assert.match(admin, /Import ZIP pack/);
  assert.match(admin, /\/api\/admin\/media-assets\/batch/);
  assert.match(admin, /asset-manifest\.json/);
  assert.match(admin, /targetPrefix/);
});

test("batch endpoint is admin-only and bounded", () => {
  assert.match(route, /requireAdmin\(request\)/);
  assert.match(route, /MAX_MANAGED_MEDIA_BATCH_ARCHIVE_BYTES/);
  assert.match(route, /Keep managed-media ZIP uploads under 64 MB/);
  assert.match(route, /mkdtemp/);
  assert.match(route, /finally[\s\S]*rm\(tmpRoot/);
});

test("batch manifest is validated before import", () => {
  assert.match(helper, /MANAGED_MEDIA_BATCH_SCHEMA_VERSION = 1/);
  assert.match(helper, /MAX_MANAGED_MEDIA_BATCH_ASSETS = 120/);
  assert.match(helper, /MAX_MANAGED_MEDIA_BATCH_TARGETS = 300/);
  assert.match(helper, /assigns .* more than once/);
  assert.match(helper, /normalizeManagedMediaArchivePath/);
  assert.match(helper, /part === "\.\."/);
});

test("one uploaded file may bind multiple managed targets without copying bytes", () => {
  assert.match(route, /saveManagedMediaUpload/);
  assert.match(route, /targets\.slice\(1\)/);
  assert.match(route, /saveManagedMediaReference/);
  assert.match(route, /url: primary\.url/);
});

test("ZIPs without manifests still get a deterministic filename lane", () => {
  assert.match(helper, /buildManagedMediaBatchManifest/);
  assert.match(helper, /targetPrefix/);
  assert.match(helper, /slugifyManagedMediaTarget/);
  assert.match(route, /manifestMode = "automatic"/);
});

test("Champions V2 can blend cinematic and regional belt pack entries", () => {
  assert.match(champions, /showcaseBackground/);
  assert.match(champions, /saudi-arabia/);
  assert.match(champions, /taiwan/);
  assert.match(champions, /Regional crown/);
  assert.match(championState, /regional-norse/);
  assert.match(championState, /regional-southeast-asia/);
});
