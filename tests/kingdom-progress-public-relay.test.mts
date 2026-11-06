import assert from "node:assert/strict";
import test from "node:test";
import { chmodSync, lstatSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readPublicQ12Relay, Q12_RELAY_FILE } from "../lib/kingdomProgressPublicRelay.ts";

const NOW = Date.parse("2026-11-06T03:36:00.000Z");
const SHA = "7a7f3e4af3d9e2d694f7666315be7f04800883a3";
const sample = () => ({
  schema: 1, status: "FRESH",
  observedAt: "2026-11-06T03:32:00.000Z", readAt: "2026-11-06T03:32:00.000Z",
  entries: [{
    id: "Q12", label: "Kingdom Progress", category: "experience",
    source: "PUBLIC CAMPAIGN", href: "/kingdom-progress", scopeVersion: "v1-20261106",
    milestones: [
      { id: "source-contract", label: "Source Contract", verified: true },
      { id: "public-feed", label: "Public Feed", verified: false },
      { id: "browser-acceptance", label: "Browser Acceptance", verified: false }
    ],
    verifiedCount: 1, percent: 33,
    lastWorkedAt: "2026-11-02T20:52:00.000Z",
    evidenceStatus: "VERIFIED"
  }],
  provenance: { issue: 984, issueUpdatedAt: "2026-11-06T02:59:27Z",
    runId: 41523546684, sourceSha: SHA },
  expiresAt: "2026-11-06T03:42:00.000Z"
});

function fixture(run: (args: {
  body: ReturnType<typeof sample>; path: string; parent: string;
  now: number; readerUid: number;
}) => void) {
  const root = mkdtempSync(join(tmpdir(), "r25-q12-sandbox-"));
  const parent = join(root, "public-priority");
  const path = join(parent, "current.json");
  mkdirSync(parent, { mode: 0o755 });
  chmodSync(parent, 0o755);
  const body = sample();
  writeFileSync(path, JSON.stringify(body) + "\n", { mode: 0o644 });
  chmodSync(path, 0o644);
  const readerUid = 9876543; // Must not match actual local producer account.
  try { run({ body, path, parent, now: NOW, readerUid }); }
  finally { rmSync(root, { recursive: true, force: true }); }
}

test("fixed reviewed production output path, no user/environment path injection", () => {
  assert.equal(Q12_RELAY_FILE, "/var/cache/aoe2war-public-priority/current.json");
});

test("source-only Q12 yields 33 and strips local provenance from public HTTP response", () => fixture(({ path, readerUid }) => {
  const result = readPublicQ12Relay(NOW, path, readerUid);
  assert.equal(result?.status, "FRESH");
  assert.equal(result?.entries.length, 1);
  assert.equal(result?.entries[0].percent, 33);
  assert.deepEqual(result?.entries[0].milestones.map(m => m.verified), [true, false, false]);
  assert.equal(result?.readAt, new Date(NOW).toISOString());
  assert.equal(JSON.stringify(result).includes("runId"), false);
  assert.equal(JSON.stringify(result).includes(SHA), false);
  assert.equal(JSON.stringify(result).includes("provenance"), false);
}));

test("stale, future, too-long and altered 100% receipts fail closed", () => fixture(({ path, body, readerUid }) => {
  const mutated = [
    { ...body, expiresAt: "2026-11-06T03:35:59.000Z" },
    { ...body, expiresAt: "2026-11-06T04:00:00.000Z" },
    { ...body, observedAt: "2026-11-06T04:00:00.000Z" },
    { ...body, entries: [{ ...body.entries[0], percent: 100 }] },
    { ...body, entries: [{ ...body.entries[0], milestones: body.entries[0].milestones.map(m => ({ ...m, verified: true })) }] },
    { ...body, entries: [{ ...body.entries[0], verifiedCount: 3 }] },
    { ...body, status: "STALE" as const },
  ];
  for (const candidate of mutated) {
    writeFileSync(path, JSON.stringify(candidate), { mode: 0o644 });
    assert.equal(readPublicQ12Relay(NOW, path, readerUid), null);
  }
}));

test("wrong source authority or unexpected data is rejected, not reflected", () => fixture(({ path, body, readerUid }) => {
  const cases = [
    { ...body, extraPrivateQueue: "DO NOT SEND" },
    { ...body, provenance: { ...body.provenance, issue: 985 } },
    { ...body, provenance: { ...body.provenance, runId: 0 } },
    { ...body, entries: [{ ...body.entries[0], href: "/admin/user-list" }] },
    { ...body, entries: [{ ...body.entries[0], lastWorkedAt: "2027-01-01T00:00:00.000Z" }] },
    { ...body, entries: [{ ...body.entries[0], scopeVersion: "malicious<>version" }] },
    { ...body, entries: [{ ...body.entries[0], proof: "private" }] },
    { ...body, entries: [] },
  ];
  for (const candidate of cases) {
    writeFileSync(path, JSON.stringify(candidate));
    assert.equal(readPublicQ12Relay(NOW, path, readerUid), null);
  }
}));

test("owner, file perms, parent perms and symlink fail closed", () => fixture(({ path, parent, readerUid }) => {
  assert.equal(readPublicQ12Relay(NOW, path, readerUid + 1)?.status, "FRESH");
  // Same OS identity cannot own both the production reader and the producer.
  // We pass the file's real owner ID as the simulated web UID.
  assert.equal(readPublicQ12Relay(NOW, path, lstatSync(path).uid), null);

  chmodSync(path, 0o666);
  assert.equal(readPublicQ12Relay(NOW, path, readerUid), null);
  chmodSync(path, 0o644);
  chmodSync(parent, 0o777);
  assert.equal(readPublicQ12Relay(NOW, path, readerUid), null);
  chmodSync(parent, 0o755);

  const symlink = join(parent, "symlink.json");
  symlinkSync(path, symlink);
  assert.equal(readPublicQ12Relay(NOW, symlink, readerUid), null);
}));

test("absent file, malformed JSON and oversized receipt remain UNKNOWN", () => fixture(({ path, readerUid }) => {
  assert.equal(readPublicQ12Relay(NOW, path + ".missing", readerUid), null);
  writeFileSync(path, "not json");
  assert.equal(readPublicQ12Relay(NOW, path, readerUid), null);
  writeFileSync(path, "x".repeat(8_193));
  assert.equal(readPublicQ12Relay(NOW, path, readerUid), null);
}));
