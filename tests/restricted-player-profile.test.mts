import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { loadRestrictedViewerMemberships, loadRestrictedWatcherActivity } from "@/lib/restrictedPlayerProfile";
import type { PrismaClient } from "@/lib/generated/prisma";

test("V10 membership uses only the signed viewer digest and requested page IDs", async () => {
  const viewer = "synthetic-viewer";
  let calls = 0;
  const db = { $queryRaw: async (query: { sql: string; values: unknown[] }) => {
    calls++;
    assert.match(query.sql, /aoe2war_public_v10\.viewer_final_replay_memberships/);
    assert.deepEqual(query.values, [createHash("sha256").update(viewer).digest("hex"), 4, 7]);
    assert(!query.sql.includes(viewer));
    return [{ gameStatsId: 4 }, { gameStatsId: 99 }];
  }} as unknown as PrismaClient;
  assert.deepEqual(await loadRestrictedViewerMemberships(db, viewer, [4, 7, 4, -1, NaN]), new Set([4]));
  assert.deepEqual(await loadRestrictedViewerMemberships(db, null, [4]), new Set());
  assert.deepEqual(await loadRestrictedViewerMemberships(db, viewer, []), new Set());
  assert.equal(calls, 1);
});

test("V6 publishes scoped all-time aggregates; no row or invalid count is unavailable, not zero", async () => {
  const read = async (rows: unknown[]) => loadRestrictedWatcherActivity({
    $queryRaw: async (strings: TemplateStringsArray, uid: string) => {
      assert.match(strings.join("?"), /aoe2war_public_v6\.champions_chaos_activity/);
      assert.equal(uid, "synthetic-profile");
      return rows;
    },
  } as unknown as PrismaClient, "synthetic-profile");
  assert.equal(await read([]), null);
  assert.equal(await read([{ eventCount: -1n, streamedGames: 0n, hasWatcherKey: false, lastWatcherAt: null }]), null);
  assert.deepEqual(await read([{ eventCount: 0n, streamedGames: 0n, hasWatcherKey: false, lastWatcherAt: null }]),
    { eventCount: 0, streamedGames: 0, hasWatcherKey: false, lastWatcherAt: null });
  assert.deepEqual(await read([{ eventCount: 18n, streamedGames: 2n, hasWatcherKey: true, lastWatcherAt: new Date("2026-11-01T00:00:00Z") }]),
    { eventCount: 18, streamedGames: 2, hasWatcherKey: true, lastWatcherAt: "2026-11-01T00:00:00.000Z" });
});

test("restricted profile reads V7 final evidence and excludes private relation reads, marks diagnostics unavailable", () => {
  const source = readFileSync("lib/playerProfile.ts", "utf8");
  const corpus = source.slice(source.indexOf("async function loadCandidateFinalGamesFresh"), source.indexOf("const rows = await prisma.gameStats.findMany", source.indexOf("async function loadCandidateFinalGamesFresh")));
  assert.match(corpus, /aoe2war_public_v7\.parser_final_corpus/);
  assert.match(corpus, /RETIRED_AUTOMATIC_REPLAY_RESULT_POLICY_VERSIONS/);
  assert.doesNotMatch(corpus, /replay_parse_attempts|replayParseAttempts/);
  const watcher = source.slice(source.indexOf("async function loadWatcherStats"), source.indexOf("if (!user)", source.indexOf("async function loadWatcherStats")));
  for (const field of ["watcherKeys", "uniqueWatchers", "multiWatcherProofGames", "parserStoredAttempts", "parserFailedAttempts", "proofScore"]) {
    assert.match(watcher, new RegExp(field + ": null"));
  }
  assert.match(source, /submitterUids: isNonfinancialPublicReadProfile\(\) \? \[\]/);
  const route = readFileSync("app/api/player-profile/matches/route.ts", "utf8");
  assert.match(route, /applyProfileViewerMembership\(getPrisma\(\), page, await getSessionUid\(request\)\)/);
  assert.match(route, /private, no-store/);
  const ui = readFileSync("components/players/PlayerProfilePage.tsx", "utf8");
  assert.match(ui, /verifySession\(\(await cookies\(\)\)/);
  assert.match(ui, /Non-final candidates and private diagnostic statistics are unavailable/);
  assert.match(ui, /Published all-time events/);
});
