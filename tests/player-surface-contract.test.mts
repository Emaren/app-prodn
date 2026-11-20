import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, existsSync } from "node:fs";
import { evaluatePlayerSurfaceEvidence } from "../scripts/player-surface-live-check.mjs";

const source = (p: string) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const contract = JSON.parse(source("config/player-surface-contract.json"));
const EXPECTED = [
  "community-lobby", "featured-contender", "recent-parsed-games", "lobby-chat",
  "online-players", "library", "clan", "direct",
];

test("all eight player tiles declare measurable source-vs-visible truth", () => {
  assert.equal(contract.schema, 1);
  assert.deepEqual(contract.surfaces.map((x: { id: string }) => x.id), EXPECTED);
  assert.deepEqual(contract.releaseRequired.requiredWidths, [375, 768, 1440]);
  assert.equal(contract.releaseRequired.acceptedLibraryHistoricalFloor, 7151);
  assert.equal(contract.releaseRequired.neverTreatUnverifiedEmptyAsPass, true);
  for (const s of contract.surfaces) {
    for (const field of ["id", "visiblePurpose", "page", "component", "authoritativeDataset",
      "minimumTruth", "permissions", "fallbackBehavior", "expectedErrors", "emptyEvidence"]) {
      assert.ok(typeof s[field] === "string" && s[field].trim().length > 0, s.id + ":" + field);
    }
    assert.ok(existsSync(new URL("../" + s.component, import.meta.url)), s.component);
    assert.ok(s.page.startsWith("/"));
    assert.ok(Array.isArray(s.readApis) && s.readApis.length);
    for (const api of [...s.readApis, ...(s.writeApi ? [s.writeApi] : [])]) {
      const route = api.split("?")[0];
      assert.ok(route.startsWith("/api/"));
      assert.ok(existsSync(new URL("../app" + route + "/route.ts", import.meta.url)), s.id + ":" + route);
    }
  }
});

test("source preserves verified public archive and no guest reaction raw-table widening", () => {
  const matches = source("lib/lobbyRecentMatches.ts");
  const lobbyChat = source("lib/communityStore.ts");
  const featured = source("components/lobby/LobbyHero.tsx");
  assert.match(matches, /isNonfinancialPublicReadProfile/);
  assert.match(matches, /loadPublicBattleArchivePage\(getPrisma\(\)/);
  assert.match(lobbyChat, /restrictedPublicProfile \? \{\} : \{/);
  assert.match(lobbyChat, /guestReactions" in message/);
  assert.match(featured, /unoptimized[\s\S]{0,250}alt=/);
  assert.match(source("app/api/social/clan-text/route.ts"), /callSocialWriter/);
  assert.match(source("app/api/contact-emaren/route.ts"), /callSocialWriter/);
  assert.match(source("app/api/library/games/route.ts"), /provenanceComplete/);
});

const ok = (data: unknown, sourceId = "sha-test", build = "build-test") => ({
  status: 200, data, source: sourceId, build,
});
const sample = (recent = [{ id: 100, map: "Black Forest" }]) => ({
  lobby: ok({ onlineUsers: [{ uid: "real-user" }] }),
  matches: ok({ matches: recent }),
  archive: ok({ total: 6916, matches: [{ id: 100 }] }),
  chat: ok({ messages: [{ id: 55 }] }),
  library: ok({ total: 7153, provenanceComplete: true }),
  activity: ok({ ok: true }),
});

test("positive real archive with empty Recent Parsed Games is a hard failure even with HTTP 200", () => {
  const evidence = sample([]);
  const result = evaluatePlayerSurfaceEvidence(evidence);
  assert.equal(result.status, "FAIL");
  assert.ok(result.failures.includes("recent_parsed_games:false_empty_when_archive_positive"));
});
test("restricted chat SQL failure is a hard failure, not a certified empty room", () => {
  const evidence = sample();
  evidence.chat = { ...evidence.chat, status: 500, data: { messages: [] } };
  const result = evaluatePlayerSurfaceEvidence(evidence);
  assert.equal(result.status, "FAIL");
  assert.match(result.failures.join(" "), /chat:expected_HTTP_200/);
});
test("Library cannot silently erase 7151 accepted historical records or source/build drift", () => {
  const evidence = sample();
  evidence.library = ok({ total: 0, provenanceComplete: false }, "wrong-sha");
  const result = evaluatePlayerSurfaceEvidence(evidence);
  assert.equal(result.status, "FAIL");
  assert.match(result.failures.join(" "), /library:accepted_history_floor/);
  assert.match(result.failures.join(" "), /release:source_header_missing_or_mismatch/);
});
test("empty online or lobby Chat remains unverified, not a decorative PASS", () => {
  const evidence = sample();
  evidence.lobby = ok({ onlineUsers: [] });
  evidence.chat = ok({ messages: [] });
  const result = evaluatePlayerSurfaceEvidence(evidence);
  assert.equal(result.status, "HOLD");
  assert.match(result.unverified.join(" "), /independent_presence_census/);
  assert.match(result.unverified.join(" "), /independent_DB_confirmation/);
});
test("bounded positive evidence is only PASS_READ_ONLY; real browser POST still required", () => {
  const result = evaluatePlayerSurfaceEvidence(sample());
  assert.equal(result.status, "PASS_READ_ONLY");
  assert.ok(result.notCovered.some((v: string) => v.includes("signed POST")));
});
