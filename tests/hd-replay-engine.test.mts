import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { projectHdReplayEngine } from "../lib/hdReplayEngine.ts";
import type { PublicParserObservatory } from "../lib/parserObservatory.ts";

const source = (path: string) => readFileSync(path, "utf8");

function sample(): PublicParserObservatory {
  return {
    generatedAt: "2026-10-12T15:00:00.000Z",
    corpus: {
      finalReplayRecords: 5867, resolvedResults: 4014, unresolvedResults: 1853,
      resolvedTeams: 5590, unresolvedTeams: 277, resultCoverageBps: 6842,
      teamCoverageBps: 9528, publicBattleRecords: 5720,
      uniqueLogicalBattles: 5630, logicalBattleTruthComplete: 3862,
      logicalBattleTruthIncomplete: 1768, logicalBattleTruthCoverageBps: 6860,
      logicalNeedsResultOnly: 1650, logicalNeedsRosterOnly: 100, logicalNeedsBoth: 18,
      confirmedIrrecoverableArtifacts: 0,
    },
    unknowns: {
      byReason: [{ key: "watcher_final_unparsed", count: 440 }],
      byOwner: [{ key: "Uploader", count: 25 }],
      byRosterPlayer: [{ key: "Player", count: 26 }],
      byGameType: [{ key: "HD 5.x", count: 330 }],
      byMap: [{ key: "Forest Prison", count: 100 }],
      latest: [{
        id: 13371, players: ["Player", "Opponent"], owner: "Uploader",
        mapName: "Forest Prison", gameType: "HD 5.x",
        parseReason: "terminal_unverified", neededEvidence: ["winner proof"],
        teamsResolved: true, observedPlayers: 2, gameVersion: "HD 5.8",
        playedAt: "2026-10-12T14:00:00Z",
      }, {
        id: 13384, players: ["Player"], owner: "Uploader",
        mapName: "Yucatan", gameType: "HD 5.x",
        parseReason: "disconnect", neededEvidence: ["defensible terminal"],
        teamsResolved: false, observedPlayers: 1, gameVersion: "HD 5.8",
        playedAt: null,
      }],
    },
    parser: {
      frontier: {
        artifacts: 2000, completed: 1900, failed: 100, savedSnapshots: 202,
        modes: [{ key: "mgz_full", count: 1500, label: "Full summary" }],
      },
      totalRuns: 2500, observations: 250000,
      failureRecovery: {
        total: 100,
        lanes: [{ label: "Unsupported format", count: 68 }],
      },
      jobs: [{ id: 42, status: "completed",
        createdAt: "2026-10-11T10:00:00Z",
        latestEvent: { eventType: "completed" },
      }],
    },
  } as unknown as PublicParserObservatory;
}

test("public replay telemetry derives real counts, not winner guesses", () => {
  const snapshot = projectHdReplayEngine(sample());
  assert.equal(snapshot.counts.final, 5867);
  assert.equal(snapshot.counts.verifiedResult, 4014);
  assert.equal(snapshot.counts.unknownResult, 1853);
  assert.equal(snapshot.counts.uniqueLogicalBattles, 5630);
  assert.equal(snapshot.counts.logicalFullTruth, 3862);
  assert.equal(snapshot.counts.indexedArtifacts, 2000);
  assert.equal(snapshot.unknown.maps[0]?.label, "Forest Prison");
  assert.equal(snapshot.unknown.reasons[0]?.count, 440);
  assert.equal(snapshot.unknown.cases[0]?.gatesPassed, 3);
  assert.equal(snapshot.unknown.cases[0]?.gates.resultVerified, false);
  assert.equal(snapshot.unknown.cases[1]?.gatesPassed, 1);
  assert.equal(snapshot.unknown.cases[1]?.gates.sidesVerified, false);
  assert.equal(snapshot.parser.failureTotal, 100);
});

test("unknown-game labels are bounded and full private evidence does not leak", () => {
  const payload = sample();
  payload.unknowns.latest[0]!.owner = "A".repeat(250);
  payload.unknowns.latest[0]!.players = Array.from({ length: 15 }, (_, i) => `Warrior ${i}`);
  const snapshot = projectHdReplayEngine(payload);
  assert.equal(snapshot.unknown.cases[0]?.owner.length, 64);
  assert.equal(snapshot.unknown.cases[0]?.players.length, 8);
  assert.equal(JSON.stringify(snapshot).includes("sourceReplayHash"), false);
  assert.equal(JSON.stringify(snapshot).includes("replay_file"), false);
});

test("placeholder-only roster slots cannot pass the participants-observed gate", () => {
  const payload = sample();
  payload.unknowns.latest[0]!.players = ["Roster unresolved", "Roster unresolved"];
  payload.unknowns.latest[0]!.observedPlayers = 2;
  const snapshot = projectHdReplayEngine(payload);
  assert.equal(snapshot.unknown.cases[0]?.players.length, 0);
  assert.equal(snapshot.unknown.cases[0]?.gates.participantsObserved, false);
  assert.equal(snapshot.unknown.cases[0]?.gates.resultVerified, false);
  assert.equal(snapshot.unknown.cases[0]?.gatesPassed, 2);
});

test("new public route, navigation and presentation are read-only and honest", () => {
  const page = source("app/hd-replay-engine/page.tsx");
  const api = source("app/api/hd-replay-engine/route.ts");
  const client = source("components/replay-engine/HdReplayEngine.tsx");
  const nav = source("app/AppShell.tsx");
  const css = source("app/hd-replay-engine/engine.css");
  assert.match(page, /loadPublicParserObservatory/);
  assert.match(api, /loadPublicParserObservatory/);
  assert.match(api, /Cache-Control": "no-store"/);
  assert.match(client, /document.visibilityState/);
  assert.match(client, /Evidence checkpoints/);
  assert.match(client, /Not a win probability/);
  assert.match(client, /PRIVATE CODEX WORKTREE NOT CONNECTED/);
  assert.match(client, /PhoenixRecoveryDashboard snapshot=\{phoenix\}/);
  assert.match(page, /loadPhoenixDashboardCache/);
  assert.match(client, /aria-expanded/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(nav, /href: "\/hd-replay-engine", label: "HD Replay Engine"/);
  assert.ok(nav.indexOf('href: "/game-stats"') < nav.indexOf('href: "/hd-replay-engine"'));
  assert.ok(nav.indexOf('href: "/hd-replay-engine"') < nav.indexOf('href: "/speed"'));
  assert.doesNotMatch(api, /prisma\.|\$executeRaw|\$queryRaw|POST|PUT|DELETE/);
});

test("unavailable result coverage stays unavailable while an empty corpus remains distinct", () => {
  const client = source("components/replay-engine/HdReplayEngine.tsx");
  assert.match(client, /resultCoverageBps \?\? null/);
  assert.match(client, /resolved=\{counts\?\.verifiedResult \?\? null\}/);
  assert.match(client, /value !== null && resolved !== null && total !== null/);
  assert.match(client, /total === 0 \? "Empty corpus" : "Evidence bound" : "Awaiting evidence"/);
  assert.match(client, /Verified result coverage unavailable/);
});
