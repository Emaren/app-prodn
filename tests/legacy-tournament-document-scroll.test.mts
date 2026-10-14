import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isTournamentImmersiveRoute } from "../lib/tournamentShellRoutes.ts";

function source(relative: string) {
  return readFileSync(new URL(relative, import.meta.url), "utf8");
}

test("only modern tournament landing may own a fixed full-screen viewport", () => {
  assert.equal(isTournamentImmersiveRoute("/tournaments"), true);
  assert.equal(isTournamentImmersiveRoute("/tournaments/"), true);
  for (const path of [
    "/tournaments/aoe2hd-community-builders-cup",
    "/tournaments/legacy",
    "/tournaments/legacy/matches",
    "/tournaments-old",
    "/lobby",
    "/tournaments2",
    null,
    undefined,
  ]) {
    assert.equal(isTournamentImmersiveRoute(path), false, String(path));
  }
});

test("legacy tournament detail uses normal document scroll without redesigning page", () => {
  const shell = source("../app/AppShell.tsx");
  const detail = source("../app/tournaments/[slug]/page.tsx");
  assert.match(shell, /isLivingLeaderboardSurface \|\| isTournamentImmersiveSurface/);
  assert.match(shell, /isTournamentImmersiveSurface \? "fixed inset-x-0 top-0" : "sticky top-0"/);
  assert.match(shell, /isTournamentImmersiveSurface[\s\S]*?"!py-0 !pb-0 overflow-hidden"/);
  assert.match(shell, /isTournamentSurface[\s\S]*?"!py-0 !pb-0 overflow-x-clip"/);
  assert.match(shell, /isTournamentSurface[\s\S]*?"max-w-none px-0"/);
  assert.match(shell, /!isTournamentSurface \? \(/); // Historical footer policy untouched.
  assert.match(detail, /Theoretical bracket/);
  assert.match(detail, /100,000 WOLO/);
  assert.match(detail, /BracketPreviewTile/);
  assert.match(detail, /getTournamentBySlug/);
  assert.match(detail, /getTournamentRecentMessages/);
  assert.doesNotMatch(detail, /overflow-y-hidden|h-\[100dvh\]|document\.body\.style\.overflow/);
});

test("tournament viewing makes one canonical entrant snapshot, no extra viewer membership SQL", () => {
  const store = source("../lib/communityStore.ts");
  const tournamentPage = source("../app/tournaments/[slug]/page.tsx");
  assert.match(store, /const TOURNAMENT_INCLUDE = \{[\s\S]*?entries: \{[\s\S]*?user: \{/);
  assert.match(store, /const viewerJoined =[\s\S]*?tournament\.entries\.some\(\(entry\) => entry\.user\.uid === viewerUid\)/);
  assert.doesNotMatch(store, /async function viewerHasJoinedTournament/);
  assert.match(store, /sourceGameStats: \{[\s\S]*?replayHash: true/);
  assert.match(tournamentPage, /verifySession\(/);
  assert.doesNotMatch(tournamentPage, /readGuestReactionSessionIdFromCookies/);
  assert.match(tournamentPage, /getTournamentRecentMessages\(prisma, tournament\.roomSlug, 12\)/);
  const reader = store.slice(
    store.indexOf("export async function getTournamentRecentMessages("),
    store.indexOf("export async function getLobbyMessages(")
  );
  assert.match(reader, /take: Math\.max\(1, Math\.min\(30,/);
  assert.match(reader, /orderBy: \[\{ createdAt: "desc" \}, \{ id: "desc" \}\]/);
  assert.match(reader, /inGameName: true/);
  assert.match(reader, /steamPersonaName: true/);
  assert.doesNotMatch(reader, /reactions|guestReactions|include:/);
});
