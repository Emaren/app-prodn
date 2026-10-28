import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { projectPrivateStorage } from "../lib/storageCommandCenterProjection.ts";

const now = new Date("2026-10-28T19:00:00Z");
const route = readFileSync("app/api/admin/storage-os/route.ts", "utf8");
const page = readFileSync("app/admin/storage-os/page.tsx", "utf8");
const source = readFileSync("lib/aoe2Os.ts", "utf8");

test("private route requires admin, has no write method or shell and disables caching", () => {
  assert.match(route, /requireAdmin\(request\)/);
  assert.match(route, /readAuthenticatedStorageAtlas\(\)/);
  assert.match(route, /readAoe2OsStorageEvidence\(\)/);
  assert.match(route, /private, no-store/);
  assert.doesNotMatch(route, /export async function (POST|DELETE|PUT|PATCH)/);
  assert.doesNotMatch(route, /child_process|execFile|spawn\(/);
});

test("dashboard remains unknown without signed or cached evidence", () => {
  const d = projectPrivateStorage({}, null, now);
  assert.equal(d.schema, "aoe2war.private-storage-command-center.v1");
  assert.equal(d.planes.length, 3);
  for (const p of d.planes) {
    assert.equal(p.status, "UNKNOWN");
    assert.equal(p.freeBytes, null);
    assert.equal(p.usedPercent, null);
    assert.equal(p.reclaimedBytes, null);
  }
  assert.equal(d.macLevel1.percent, null);
  assert.equal(d.macLevel1.certifiedReclaimedBytes, null);
  assert.equal(d.release.sourceRemoteParity, null);
  assert.equal(d.bridgeOnline, false);
});

test("cached operator estate is labeled as a receipt, not a live Mac measurement", () => {
  const sha = "a".repeat(40);
  const d = projectPrivateStorage({
    bridge: {online: true, lastSeenAt: "2026-10-28T18:59:50Z"},
    snapshot: {
      generatedAt: "2026-10-28T18:58:00Z",
      payload: {info: {release: {
        root_free_kb: 7000, volume_free_kb: 5000,
        production_source: "b".repeat(40),
        internal_build_version: "A", public_build_version: "B"
      }, source_repositories: {"app-prodn": {head: sha, remote: sha}}}}
    },
  }, null, now);
  assert.equal(d.bridgeOnline, true);
  assert.equal(d.planes[0].source, "NONE");
  assert.equal(d.planes[0].freeBytes, null);
  assert.equal(d.planes[1].freeBytes, 7000 * 1024);
  assert.equal(d.planes[2].freeBytes, 5000 * 1024);
  assert.equal(d.planes[1].usedPercent, null);
  assert.equal(d.planes[1].source, "OPERATOR_ESTATE_SNAPSHOT");
  assert.equal(d.release.sourceRemoteParity, true);
  assert.equal(d.release.sourceProductionParity, false);
  assert.equal(d.release.runtimeVersionParity, false);
  assert.equal(d.macLevel1.percent, null);
});

test("stale estate and unsigned fake collectors cannot be promoted to live", () => {
  const d = projectPrivateStorage({
    snapshot: { generatedAt:"2026-10-27T10:00:00Z",
      payload:{info:{release:{root_free_kb: 5500}}}},
  }, {schema:"aoe2war.storage-atlas.authenticated-public.v1",
      provenance:"FAKE", admission:"HOLD", live:false,
      snapshot:{as_of:"2026-10-28T18:59:00Z",planes:[{
        plane:"mac", ordinary_free_bytes:12345, effective_used_percent:10
      }]}}, now);
  assert.equal(d.signedAdmission, "NO_SIGNED_RECEIPT");
  assert.equal(d.planes[0].freeBytes, null);
  assert.equal(d.planes[1].status, "STALE");
  assert.equal(d.planes[1].freeBytes, 5500 * 1024);
});

test("authenticated receipt is still a historical HOLD, never a live GO", () => {
  const d = projectPrivateStorage({}, {
    schema:"aoe2war.storage-atlas.authenticated-public.v1",
    provenance:"ED25519_THREE_HOST_RECEIPTS",
    admission:"HOLD", live:false,
    snapshot:{
      as_of:"2026-10-28T18:59:00Z",
      planes:[{plane:"mac", stale:false,
        ordinary_free_bytes:1024 ** 3,
        effective_used_percent:97.25,
        measured_reclaimed_bytes:null,
        top_consumer_classes:["generated_rebuildable","protected"]}]
    }
  }, now);
  assert.equal(d.signedAdmission, "HOLD");
  assert.equal(d.planes[0].source, "SIGNED_THREE_PLANE_RECEIPT");
  assert.equal(d.planes[0].status, "RECEIPT");
  assert.equal(d.planes[0].usedPercent, 97.25);
  assert.equal(d.planes[0].reclaimedBytes, null);
  assert.equal(d.macLevel1.percent, null);
});

test("browser has bounded foreground-only polling and no destructive controls", () => {
  assert.match(page, /document.visibilityState === "visible"/);
  assert.match(page, /15_000/);
  assert.match(page, /if \(pending.current\) return/);
  assert.match(page, /controller.abort\(\)/);
  assert.match(page, /setData\(null\)/);
  assert.match(page, /cache: "no-store"/);
  assert.doesNotMatch(page, /--apply|method: "POST"/);
});


test("private Storage OS source reads only existing receipt files and never initializes state", () => {
  const begin = source.indexOf("export async function readAoe2OsStorageEvidence()");
  const end = source.indexOf("export async function loadAoe2OsDashboard()", begin);
  assert.ok(begin >= 0 && end > begin);
  const reader = source.slice(begin, end);
  assert.match(reader, /readJson<Aoe2OsBridgeHeartbeat>\(bridgePath\(\)\)/);
  assert.match(reader, /readJson<Aoe2OsSnapshot>\(snapshotPath\(\)\)/);
  assert.doesNotMatch(reader, /ensureStore\(|listRuns\(|fs\.mkdir|fs\.writeFile/);
  assert.match(route, /readAoe2OsStorageEvidence\(\)/);
  assert.doesNotMatch(route, /loadAoe2OsDashboard\(/);
});
