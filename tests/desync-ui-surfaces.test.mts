import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  currentConfirmedDesync,
  desyncIncidentHeading,
  type ReplayDesyncIncidentView,
} from "../components/game-stats/desyncIncidentView.ts";

function incident(
  overrides: Partial<ReplayDesyncIncidentView> = {}
): ReplayDesyncIncidentView {
  return {
    id: 11,
    gameStatsId: 24,
    scheduledMatchId: 25,
    supersedesId: null,
    desyncOccurred: true,
    competitiveResultStatus: "unresolved",
    settlementDisposition: "commissioner_review",
    reviewerUid: "commissioner_uid",
    reviewerDisplayName: "Commissioner",
    note: "Both players confirmed the replay desynced.",
    sourceReplayHash: "a".repeat(64),
    sourceParseIteration: 3,
    parserDesyncCandidate: true,
    machineEvidence: {
      disconnectDetected: true,
      parseSource: "watcher",
      parseReason: "disconnect_or_desync",
    },
    createdAt: "2026-07-22T20:30:00.000Z",
    ...overrides,
  };
}

test("latest append-only desync row alone controls current incident display", () => {
  const confirmed = incident();
  assert.equal(currentConfirmedDesync([confirmed]), confirmed);
  assert.equal(desyncIncidentHeading(confirmed), "Human · Desync Confirmed");

  const correction = incident({
    id: 12,
    supersedesId: 11,
    desyncOccurred: false,
    competitiveResultStatus: "not_applicable",
    settlementDisposition: "not_applicable",
  });
  assert.equal(currentConfirmedDesync([correction, confirmed]), null);
  assert.equal(desyncIncidentHeading(correction), "Human · Desync Correction");
});

test("review desk exposes a two-step admin-only incident control", () => {
  const source = readFileSync(
    new URL(
      "../app/game-stats/[id]/review/ReplayResultReviewWorkspace.tsx",
      import.meta.url
    ),
    "utf8"
  );

  assert.match(source, /canAdminister \? \(\s*<DesyncIncidentControl/);
  assert.match(source, /data-admin-desync-control/);
  assert.match(source, /onClick=\{\(\) => onArm\("confirm"\)\}/);
  assert.match(source, /⚡ Confirm DESYNCED ⚡/);
  assert.match(source, /\/desync-incidents/);
  assert.match(source, /Winner Lock Paused — Desync Review/);

  const desyncSubmit = source.slice(
    source.indexOf("async function submitDesyncIncident"),
    source.indexOf("if (loading)")
  );
  assert.doesNotMatch(desyncSubmit, /winningTeamKey|winnerUserId|linkedWinner/);
  assert.match(desyncSubmit, /desyncOccurred/);
  assert.match(desyncSubmit, /supersedesId/);
});

test("public battle record and Verdict Trail render attributable desync provenance", () => {
  const page = readFileSync(
    new URL("../app/game-stats/[id]/page.tsx", import.meta.url),
    "utf8"
  );
  const trail = readFileSync(
    new URL("../components/game-stats/ReplayVerdictTrail.tsx", import.meta.url),
    "utf8"
  );

  assert.match(page, /loadReplayDesyncIncidentProvenance/);
  assert.match(page, /<ConfirmedDesyncBanner incident=\{confirmedDesync\}/);
  assert.match(page, /Unresolved — human-confirmed desync/);
  assert.match(page, /confirmedDesync\s*\? null/);
  assert.match(trail, /kind:\s*"desync" as const/);
  assert.match(trail, /data-desync-provenance-entry/);
  assert.match(trail, /Machine evidence ·/);
  assert.match(trail, /Competitive result ·/);
  assert.match(trail, /Settlement ·/);
});

test("private Parser Observatory links directly to the result and incident desk", () => {
  const source = readFileSync(
    new URL("../app/admin/parser-lab/page.tsx", import.meta.url),
    "utf8"
  );
  assert.match(source, /Result \/ Desync Desk/);
  assert.match(source, /⚡ Human · Desync Confirmed/);
  assert.match(source, /latestDesyncIncident\?\.desyncOccurred/);
});

test("Challenge room exposes three independent axes without projecting a winner", () => {
  const page = readFileSync(
    new URL("../app/challenge/[id]/page.tsx", import.meta.url),
    "utf8"
  );
  const card = readFileSync(
    new URL("../components/challenge/ScheduledMatchCard.tsx", import.meta.url),
    "utf8"
  );
  const challengeTiles = readFileSync(
    new URL("../lib/challenges.ts", import.meta.url),
    "utf8"
  );

  assert.match(page, /data-challenge-desync-banner/);
  assert.match(page, /Desync occurred/);
  assert.match(page, /Competitive result/);
  assert.match(page, /Settlement disposition/);
  assert.match(page, /Unresolved · no winner/);
  assert.match(page, /Append-only incident provenance/);
  assert.match(card, /data-challenge-desync-incident/);
  assert.match(card, /Unresolved — machine winner quarantined/);
  assert.match(challengeTiles, /linkedWinner: desyncReviewActive \? null/);
});

test("commissioner desync actions are two-step, admin-only, idempotent, and domain delegated", () => {
  const controls = readFileSync(
    new URL("../components/challenge/ChallengeRoomControls.tsx", import.meta.url),
    "utf8"
  );
  const route = readFileSync(
    new URL("../app/api/challenges/[id]/route.ts", import.meta.url),
    "utf8"
  );
  const commands = readFileSync(
    new URL("../lib/challenge/domain/commands.ts", import.meta.url),
    "utf8"
  );

  assert.match(controls, /data-desync-commissioner-controls/);
  assert.match(controls, /\{isAdmin \? \(/);
  assert.match(controls, /desyncAcknowledged/);
  assert.match(controls, /Confirm Rematch/);
  assert.match(controls, /Confirm Void & Refund/);
  assert.match(controls, /crypto\.randomUUID\(\)/);

  assert.match(route, /action === "desync_rematch"/);
  assert.match(route, /action === "desync_void_refund"/);
  assert.match(route, /resolveChallengeDesync\(/);
  assert.doesNotMatch(route, /resolveChallengeDesyncDisposition/);
  assert.doesNotMatch(route, /validateScheduledAtWindow/);

  assert.match(commands, /export async function resolveChallengeDesync\(/);
  assert.match(commands, /!input\.actor\.isAdmin/);
  assert.match(commands, /idempotencyKey/);
  assert.match(commands, /validateChallengeScheduledAtWindow\(/);
  assert.match(commands, /resolveChallengeDesyncDisposition\(/);
});

test("main lobby match cards project current human-confirmed desync truth", () => {
  const panel = readFileSync(
    new URL("../components/lobby/RecentMatchesPanel.tsx", import.meta.url),
    "utf8"
  );
  const loader = readFileSync(
    new URL("../lib/lobbyRecentMatches.ts", import.meta.url),
    "utf8"
  );
  const desyncHydrator = readFileSync(
    new URL("../lib/lobbyDesync.ts", import.meta.url),
    "utf8"
  );

  assert.match(loader, /hydrateLobbyDesyncMarkers/);
  assert.match(loader, /return hydrateLobbyDesyncMarkers/);

  assert.match(desyncHydrator, /replayDesyncIncident\.findMany/);
  assert.match(desyncHydrator, /orderBy:/);
  assert.match(desyncHydrator, /createdAt:/);
  assert.match(desyncHydrator, /desyncOccurred/);
  assert.match(desyncHydrator, /humanConfirmedDesync/);

  assert.match(panel, /readLobbyHumanConfirmedDesync/);
  assert.match(panel, /headline:\s*h\("DESYNCED"\)/);
  assert.match(panel, /humanConfirmedDesync/);
});

test("review and lobby controls avoid browser-native hover tooltips", () => {
  const reviewDesk = readFileSync(
    new URL(
      "../app/game-stats/[id]/review/ReplayResultReviewWorkspace.tsx",
      import.meta.url
    ),
    "utf8"
  );
  const panel = readFileSync(
    new URL("../components/lobby/RecentMatchesPanel.tsx", import.meta.url),
    "utf8"
  );

  assert.doesNotMatch(
    reviewDesk,
    /title=\{\s*(?:h\(\s*)?option\.title/
  );
  assert.doesNotMatch(
    panel,
    /title=\{\s*h\(\s*resultReview\.reviewLabel/
  );
  assert.match(reviewDesk, /aria-pressed/);
  assert.match(panel, /aria-label=\{/);
});
