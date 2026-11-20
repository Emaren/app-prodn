import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const contract = JSON.parse(readFileSync(new URL("../config/player-surface-contract.json", import.meta.url), "utf8"));
const FLOOR = contract.releaseRequired.acceptedLibraryHistoricalFloor;

export function evaluatePlayerSurfaceEvidence(e) {
  const failures = [], unverified = [];
  const check = (yes, name) => { if (!yes) failures.push(name); };
  const ok = (k) => e[k]?.status === 200;
  for (const key of ["lobby", "matches", "archive", "chat", "library", "activity"]) {
    check(ok(key), key + ":expected_HTTP_200_got_" + (e[key]?.status ?? "no_response"));
  }
  const live = e.library || {};
  check(Number.isSafeInteger(live.data?.total) && live.data.total >= FLOOR, "library:accepted_history_floor");
  check(live.data?.provenanceComplete === true, "library:complete_provenance");
  const archiveTotal = e.archive?.data?.total;
  const recent = e.matches?.data?.matches;
  if (ok("archive")) {
    check(Number.isSafeInteger(archiveTotal) && archiveTotal >= 0, "archive:invalid_authoritative_total");
    if (Number.isSafeInteger(archiveTotal) && archiveTotal > 0) {
      check(Array.isArray(recent) && recent.length > 0, "recent_parsed_games:false_empty_when_archive_positive");
    } else if (archiveTotal === 0) {
      unverified.push("recent_parsed_games:empty_requires_independent_zero_confirmation");
    }
  }
  if (ok("matches") && Array.isArray(recent)) {
    const ids = recent.map(x => x?.id);
    check(ids.every(x => Number.isSafeInteger(x) && x > 0), "recent_parsed_games:invalid_real_record_ids");
    check(new Set(ids).size === ids.length, "recent_parsed_games:duplicate_ids");
  }
  const messages = e.chat?.data?.messages;
  if (ok("chat")) {
    check(Array.isArray(messages), "lobby_chat:malformed_history");
    if (Array.isArray(messages) && messages.length === 0)
      unverified.push("lobby_chat:empty_requires_independent_DB_confirmation");
  }
  if (ok("lobby")) {
    const online = e.lobby?.data?.onlineUsers;
    check(Array.isArray(online), "online_players:malformed_presence");
    if (Array.isArray(online) && online.length === 0)
      unverified.push("online_players:empty_requires_independent_presence_census");
  }
  const identities = ["lobby", "matches", "archive", "chat", "library", "activity"].filter(k => ok(k)).map(k => e[k].source).filter(Boolean);
  const builds = ["lobby", "matches", "archive", "chat", "library", "activity"].filter(k => ok(k)).map(k => e[k].build).filter(Boolean);
  check(identities.length > 0 && new Set(identities).size === 1, "release:source_header_missing_or_mismatch");
  check(builds.length > 0 && new Set(builds).size === 1, "release:build_id_missing_or_mismatch");
  if (e.expectedSource) check(identities.every(x => x === e.expectedSource), "release:wrong_source");
  if (e.expectedBuild) check(builds.every(x => x === e.expectedBuild), "release:wrong_build");
  return {
    status: failures.length ? "FAIL" : unverified.length ? "HOLD" : "PASS_READ_ONLY",
    failures, unverified, source: identities[0] || null, buildId: builds[0] || null,
    observations: {
      archiveTotal: Number.isSafeInteger(archiveTotal) ? archiveTotal : null,
      recentCount: Array.isArray(recent) ? recent.length : null,
      libraryTotal: Number.isSafeInteger(live.data?.total) ? live.data.total : null,
      chatHistoryCount: Array.isArray(messages) ? messages.length : null,
      onlineCount: Array.isArray(e.lobby?.data?.onlineUsers) ? e.lobby.data.onlineUsers.length : null,
    },
    notCovered: [
      "featured portrait naturalWidth > 0 (real browser required)",
      "two authenticated real accounts and screenshot layout",
      "Clan, Direct, Lobby Chat signed POST (writer gate + persisted DB ID required)",
      "private-history and nonmember denial (real two-account test)",
      "Library historical page click and signed viewer continuity",
    ],
  };
}

async function runReadOnly() {
  const args = process.argv.slice(2);
  const option = (flag) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : null;
  };
  const origin = option("--origin") || "https://aoe2war.com";
  const valid = /^https:\/\/[A-Za-z0-9.-]+(?::\d+)?$/.test(origin) ||
    /^http:\/\/127\.0\.0\.1:\d+$/.test(origin);
  if (!valid) throw new Error("origin must be HTTPS host or local test listener");
  const routes = {
    lobby: "/api/lobby",
    matches: "/api/lobby/recent-matches?limit=24",
    archive: "/api/game_stats?archive=1&limit=1",
    chat: "/api/lobby/chat?limit=20",
    library: "/api/library/games?origin=all&limit=2",
    activity: "/api/library/activity",
  };
  const evidence = {
    expectedSource: option("--source") || undefined,
    expectedBuild: option("--build") || undefined,
  };
  for (const [key, route] of Object.entries(routes)) {
    try {
      const response = await fetch(origin + route, {
        method: "GET",
        headers: { Accept: "application/json", "User-Agent": "AoE2WAR-player-surface-readonly/1" },
        signal: AbortSignal.timeout(9000),
        cache: "no-store",
      });
      let data = null;
      if (response.headers.get("content-type")?.includes("application/json")) {
        const raw = await response.text();
        if (raw.length <= 1200000) data = JSON.parse(raw);
      }
      evidence[key] = {
        status: response.status, data,
        source: response.headers.get("x-aoe2war-source"),
        build: response.headers.get("x-aoe2war-build-id"),
      };
    } catch (error) {
      evidence[key] = { status: 0, data: null, error: String(error).slice(0, 160) };
    }
  }
  const result = evaluatePlayerSurfaceEvidence(evidence);
  console.log(JSON.stringify({
    timestampUTC: new Date().toISOString(), origin, ...result,
    http: Object.fromEntries(Object.entries(routes).map(([k, v]) => [v, evidence[k].status])),
  }, null, 2));
  process.exitCode = result.status === "FAIL" ? 1 : result.status === "HOLD" ? 2 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fileURLToPath(new URL("file://" + process.argv[1]).href)) {
  runReadOnly().catch(err => { console.error("PLAYER_SURFACE_CHECK_ERROR", err.message); process.exitCode = 1; });
}
