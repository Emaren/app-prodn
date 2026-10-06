import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { sealNativeReplayManifest, validateNativeReplayManifest, nativeRosterFromSource, nativeSnapshotDigest } from "../lib/nativeReplayManifest.ts";

function fixture(size = 2) {
  return sealNativeReplayManifest({
    schema: "aoe2war-native-replay-manifest/v2", gameStatsId: 42, replaySha256: "a".repeat(64), logicalBattleId: `hash:${"a".repeat(64)}`,
    sourceGameStatsIds: [42, 43], sourceSnapshotSha256: "b".repeat(64),
    archive: { objectKey: `${"a".repeat(64)}.aoe2record`, sha256: "a".repeat(64), byteSize: 100 },
    roster: Array.from({ length: size }, (_, i) => ({ slot: i + 1, steamId: `7656119810381051${i}`, name: `Fixture 玩家 ${i}`, teamId: i < size / 2 ? 0 : 1 })),
    parser: { parserName: "aoe2war.mgz_hd", parserVersion: "1.8.51", schemaVersion: "2026-07-25.1", passName: "hd_deterministic_evidence", passVersion: "10", status: "completed" },
    result: { known: true, winningSlots: Array.from({ length: size / 2 }, (_, i) => i + 1), provenance: "public_result:fixture" },
    financialExposure: { markets: 0, wagers: 0, claims: 0, settlements: 0 }, candidateOnly: true,
    authority: { stats: false, bets: false, settlement: false, wolo: false }, executionKind: "control",
  });
}
for (const size of [2, 4, 6, 8]) test(`strict ${size / 2}v${size / 2} control manifest binds exact identities and explicit side 0`, () => {
  const m = fixture(size); assert.equal(validateNativeReplayManifest(m), m);
  assert.equal(m.roster[0].teamId, 0); assert.equal(m.result.winningSlots.length, size / 2);
});

const mutations: Array<[string, (m: any) => void]> = [
  ["unknown target", m => { m.result.known = false; }],
  ["arbitrary path", m => { m.path = "/tmp/attacker"; }],
  ["shell command", m => { m.archive.command = "false"; }],
  ["hash substitute", m => { m.archive.sha256 = "c".repeat(64); }],
  ["name-only identity", m => { m.roster[0].steamId = null; }],
  ["duplicate Steam", m => { m.roster[1].steamId = m.roster[0].steamId; }],
  ["duplicate slot", m => { m.roster[1].slot = 1; }],
  ["ambiguous team", m => { m.roster[0].teamId = -1; }],
  ["winner outside roster", m => { m.result.winningSlots = [8]; }],
  ["mixed winning side", m => { m.result.winningSlots = [1, 3]; }],
  ["partial winning side", m => { m.result.winningSlots = [1]; }],
  ["linked market", m => { m.financialExposure.markets = 1; }],
  ["linked claim", m => { m.financialExposure.claims = 1; }],
  ["bet authority", m => { m.authority.bets = true; }],
  ["stats authority", m => { m.authority.stats = true; }],
  ["Wolo authority", m => { m.authority.wolo = true; }],
  ["stale parser", m => { m.parser.passVersion = "9"; }],
  ["source identity missing", m => { m.sourceGameStatsIds = [43]; }],
];
for (const [label, mutate] of mutations) test(`rejects ${label} even with a recomputed digest`, () => {
  const m = structuredClone(fixture(4)); mutate(m);
  const { manifestSha256: _, ...unsigned } = m;
  m.manifestSha256 = nativeSnapshotDigest(unsigned);
  assert.throws(() => validateNativeReplayManifest(m));
});
test("altered complete source snapshot invalidates manifest", () => {
  const m = fixture(); m.sourceSnapshotSha256 = "d".repeat(64);
  assert.throws(() => validateNativeReplayManifest(m), /digest mismatch/);
});
test("Python independently accepts the exact TypeScript UTF8 contract", () => {
  const result = spawnSync("python3", ["-c", "import json,sys;sys.path.insert(0,'scripts');from native_replay_contract import load_manifest_json;print(load_manifest_json(sys.stdin.read())['manifestSha256'])"], { input: JSON.stringify(fixture(8)), encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr); assert.equal(result.stdout.trim(), fixture(8).manifestSha256);
});

test("raw roster admission refuses rounded slots, teams and conflicting aliases", () => {
  const raw = fixture(4).roster.map(r => ({ name: r.name, steam_id: r.steamId, player_number: r.slot, team_id: r.teamId }));
  assert.deepEqual(nativeRosterFromSource(raw), fixture(4).roster);
  for (const change of [ { player_number: 1.9 }, { team_id: 0.5 }, { player_number: "01" }, { number: 8 }, { team: 1 }, { steamId: "76561198103810519" } ]) {
    assert.throws(() => nativeRosterFromSource([{ ...raw[0], ...change }, ...raw.slice(1)]));
  }
});
