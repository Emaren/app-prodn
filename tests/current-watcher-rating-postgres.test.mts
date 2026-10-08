import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import pg from "pg";

import {
  CURRENT_ACCOUNT_OBSERVATION_V1_PARSER,
  invalidateCurrentWatcherAccountStateCache,
  loadCurrentWatcherAccountStates,
} from "../lib/currentWatcherAccountState.ts";

const pgBin = process.env.AOE2WAR_TEST_PG_BIN || "/opt/homebrew/bin";
const initdb = path.join(pgBin, "initdb");
const pgctl = path.join(pgBin, "pg_ctl");
const enabled = process.env.RUN_PLAYER_CURRENT_RATING_PG_TESTS === "1";

test("current rating selection against isolated PostgreSQL", {
  skip: !enabled ? "Set RUN_PLAYER_CURRENT_RATING_PG_TESTS=1 to run the SQL integration controls" : false,
}, async (t) => {
  assert.ok(existsSync(initdb) && existsSync(pgctl), "A local PostgreSQL test runtime is required");
  const root = mkdtempSync("/tmp/aoe2-rating-pg-");
  const data = path.join(root, "data");
  const socket = path.join(root, "socket");
  mkdirSync(socket, { mode: 0o700 });
  let started = false;
  let client: pg.Client | null = null;
  try {
    // This private cluster never reads an inherited DATABASE_URL or opens TCP.
    execFileSync(initdb, ["-D", data, "-U", "rating_fixture", "--auth-local=trust", "--auth-host=reject"], { stdio: "pipe" });
    execFileSync(pgctl, ["-D", data, "-l", path.join(root, "server.log"), "-o", `-h '' -k ${socket}`, "-w", "start"], { stdio: "pipe" });
    started = true;
    client = new pg.Client({ host: socket, user: "rating_fixture", database: "postgres" });
    await client.connect();
    await client.query("SET statement_timeout = '5s'");
    await client.query(`CREATE TABLE game_stats (
      id integer PRIMARY KEY, replay_hash text NOT NULL, players jsonb,
      key_events jsonb, played_on timestamptz, parse_source text,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);

    await client.query(`CREATE TABLE replay_parse_attempts (
      id integer PRIMARY KEY, user_uid text, replay_hash text,
      played_on timestamp, created_at timestamp NOT NULL,
      parse_source text, upload_mode text, status text, evidence jsonb
    )`);
    const steamId = "76561198000000001";
    const replayHash = "a".repeat(64);
    const liveProof = {
      ingestion_provenance: "live_monitor",
      provenance_signature_verified: true,
      client_sha256_verified: true,
      server_sha256: replayHash,
      client_sha256: replayHash,
      file_role: "live_checkpoint",
    };
    const basePlayer = { name: "Current Warrior", steam_id: steamId, steam_rm_rating: 1671, steam_dm_rating: 2200 };
    const currentTime = "2026-10-05T00:00:00.000Z";
    let id = 0;
    const canonicalTime = (value: string) => new Date(value).toISOString().replace(/(\.\d{3})Z$/, "$1000Z");
    const capturedAt = "2026-10-10T00:00:00.000000Z";
    const insert = async (options: {
      source?: string; playedOn?: string | null; players?: unknown;
      proof?: Record<string, unknown> | null; hash?: string;
      observation?: Record<string, unknown>; outerUid?: string;
    } = {}) => {
      const ident = ++id;
      const digest = options.hash ?? (ident === 1 ? replayHash : ident.toString(16).padStart(64, "0"));
      const source = options.source ?? "watcher_live";
      const playedOn = options.playedOn === undefined ? currentTime : options.playedOn;
      const suppliedPlayers = options.players ?? [basePlayer];
      const fullPlayers = Array.isArray(suppliedPlayers) && suppliedPlayers.length === 1
        ? [...suppliedPlayers, { name: "Opponent", steam_id: "76561198000000009" }]
        : suppliedPlayers;
      const players = Array.isArray(fullPlayers) ? fullPlayers.map((p) => ({
        ...p,
        steam_rating_sources: p.steam_rating_sources ?? {
          steam_rm_rating: p.steam_rm_rating == null ? null : "hd_header",
          steam_dm_rating: p.steam_dm_rating == null ? null : "hd_header",
        },
      })) : fullPlayers;
      const proof = options.proof === null ? {} : {
        ...liveProof,
        server_sha256: digest,
        client_sha256: digest,
        file_role: source === "watcher_final" ? "final_recording" : "live_checkpoint",
        ...options.proof,
      };
      const observation = {
        schema: "aoe2war-current-account-observation/v1",
        uploader_uid: "u_current-fixture",
        replay_sha256: digest,
        parse_source: source,
        upload_mode: "watcher",
        observed_game_at: playedOn ? canonicalTime(playedOn) : null,
        captured_at: capturedAt,
        archive_verified: true,
        result_authority: false,
        candidate_result_authority: false,
        provenance: proof,
        parser: {
          name: CURRENT_ACCOUNT_OBSERVATION_V1_PARSER.parserName,
          version: CURRENT_ACCOUNT_OBSERVATION_V1_PARSER.parserVersion,
          schema_version: CURRENT_ACCOUNT_OBSERVATION_V1_PARSER.schemaVersion,
          pass_name: CURRENT_ACCOUNT_OBSERVATION_V1_PARSER.passName,
          pass_version: CURRENT_ACCOUNT_OBSERVATION_V1_PARSER.passVersion,
          options: { apply_hd_early_exit_rules: source === "watcher_final" },
        },
        players,
        ...options.observation,
      };
      await client!.query(
        "INSERT INTO game_stats (id, replay_hash, players, key_events, played_on, parse_source) VALUES ($1,$2,$3,$4,$5,$6)",
        [ident, digest, JSON.stringify(players), JSON.stringify({ watcher_upload: proof }), playedOn, source],
      );
      await client!.query(
        "INSERT INTO replay_parse_attempts (id,user_uid,replay_hash,played_on,created_at,parse_source,upload_mode,status,evidence) VALUES ($1,$2,$3,$4,$5,$6,'watcher','stored',$7)",
        [ident, options.outerUid ?? "u_current-fixture", digest, playedOn, capturedAt, source,
          JSON.stringify({ current_account_observation: observation })],
      );
    };
    const states = async () => {
      invalidateCurrentWatcherAccountStateCache();
      const prisma = {
        $queryRaw: async (sql: { text: string; values: unknown[] }) =>
          (await client!.query(sql.text, sql.values)).rows,
      };
      return loadCurrentWatcherAccountStates(prisma as never);
    };
    const reset = async () => {
      await client!.query("TRUNCATE game_stats, replay_parse_attempts");
      id = 0;
      await insert();
    };
    const current = async () => (await states()).find((state) => state.steamId === steamId);
    const assertCurrent = async (name = "Current Warrior", rm = 1671, dm = 2200) => {
      const state = await current();
      assert.equal(state?.latestObservedName, name);
      assert.equal(state?.steamRmRating, rm);
      assert.equal(state?.steamDmRating, dm);
      return state;
    };

    await t.test("the Python-produced v1 receipt is accepted with exact outer timestamps and lane provenance", async () => {
      const observation = JSON.parse(readFileSync(new URL(
        "./fixtures/current-account-observation-v1.json", import.meta.url,
      ), "utf8"));
      await client!.query("TRUNCATE game_stats, replay_parse_attempts");
      await client!.query(
        "INSERT INTO replay_parse_attempts (id,user_uid,replay_hash,played_on,created_at,parse_source,upload_mode,status,evidence) VALUES (1,$1,$2,$3,$4,$5,$6,'stored',$7)",
        [observation.uploader_uid, observation.replay_sha256,
          observation.observed_game_at, observation.captured_at,
          observation.parse_source, observation.upload_mode,
          JSON.stringify({ current_account_observation: observation })],
      );
      const state = await assertCurrent("Exact Steam alias", 2100, null);
      // PostgreSQL preserves all six digits in the outer binding; the public
      // JavaScript Date projection deliberately exposes millisecond precision.
      assert.equal(state?.nameObservedAt, "2026-01-01T01:02:03.456Z");
      assert.equal(state?.steamRmObservedAt, "2026-01-01T01:02:03.456Z");
      const other = (await states()).find((value) => value.steamId === "76561198000000002");
      assert.equal(other?.steamRmRating, 1400);
      assert.equal(other?.steamDmRating, 1300);
    });

    await t.test("manual upload and signed historical Watcher import cannot replace current account state", async () => {
      await reset();
      const before = await current();
      await insert({ source: "file_upload", playedOn: "2026-10-06T00:00:00.000Z", players: [{ ...basePlayer, name: "Historical Alias", steam_rm_rating: 900 }] });
      await insert({ source: "watcher_final", playedOn: "2026-10-07T00:00:00.000Z", proof: { ...liveProof, ingestion_provenance: "historical_import" }, players: [{ ...basePlayer, name: "Older Name", steam_rm_rating: 3000 }] });
      assert.deepEqual(await current(), before);
    });

    await t.test("random historical batch order and higher/lower imported ratings leave current state unchanged", async () => {
      for (const ratings of [[900, 3000, 1300], [3000, 1300, 900], [1300, 900, 3000]]) {
        await reset();
        for (const rating of ratings) {
          await insert({ source: "watcher_final", proof: { ...liveProof, ingestion_provenance: "historical_import" }, players: [{ ...basePlayer, name: `Historical ${rating}`, steam_rm_rating: rating, steam_dm_rating: 4000 - rating }] });
        }
        await assertCurrent();
      }
    });

    await t.test("duplicate imported replays and alias changes cannot transfer current state", async () => {
      await reset();
      await insert({ proof: { ...liveProof, ingestion_provenance: "historical_import" }, players: [{ ...basePlayer, steam_rm_rating: 3000 }] });
      await insert({ proof: { ...liveProof, ingestion_provenance: "historical_import" }, players: [{ ...basePlayer, steam_rm_rating: 3000 }] });
      await insert({ playedOn: "2026-10-06T00:00:00.000Z", players: [{ ...basePlayer, steam_id: "76561198000000002", steam_rm_rating: 999 }] });
      await assertCurrent();
      assert.equal((await states()).find((state) => state.steamId === "76561198000000002")?.steamRmRating, 999);
    });

    await t.test("new live RM and older live DM are selected with independent lane clocks", async () => {
      await client!.query("TRUNCATE game_stats, replay_parse_attempts");
      id = 0;
      await insert({ playedOn: "2026-10-01T00:00:00.000Z", players: [{ ...basePlayer, steam_rm_rating: null, steam_dm_rating: 2000 }] });
      await insert({ playedOn: currentTime, players: [{ ...basePlayer, steam_rm_rating: 1684, steam_dm_rating: null, rate_snapshot: 3999 }] });
      const state = await assertCurrent("Current Warrior", 1684, 2000);
      assert.equal(state?.steamRmObservedAt, currentTime);
      assert.equal(state?.steamDmObservedAt, "2026-10-01T00:00:00.000Z");
    });

    await t.test("reparse and row creation clocks cannot replace actual live played_on", async () => {
      await reset();
      const before = await current();
      await insert({ playedOn: "2015-04-01T00:00:00.000Z", players: [{ ...basePlayer, name: "Old Alias", steam_rm_rating: 3000 }] });
      await client!.query("UPDATE game_stats SET created_at = '2040-01-01' WHERE id = $1", [id]);
      assert.deepEqual(await current(), before);
    });

    await t.test("historical ratings remain queryable after they are excluded from current selection", async () => {
      await reset();
      await insert({ proof: { ...liveProof, ingestion_provenance: "historical_import" }, players: [{ ...basePlayer, steam_rm_rating: 1333, steam_dm_rating: 2444 }] });
      const row = (await client!.query("SELECT players FROM game_stats WHERE id = $1", [id])).rows[0];
      assert.equal(row.players[0].steam_rm_rating, 1333);
      assert.equal(row.players[0].steam_dm_rating, 2444);
      await assertCurrent();
    });

    await t.test("new signed hash-bound live observation legitimately advances name and rating", async () => {
      await reset();
      await insert({ source: "watcher_final", playedOn: "2026-10-06T00:00:00.000Z", players: [{ ...basePlayer, name: "New Current Name", steam_rm_rating: 1684, steam_dm_rating: 2210 }] });
      const state = await assertCurrent("New Current Name", 1684, 2210);
      assert.equal(state?.ratingObservedAt, "2026-10-06T00:00:00.000Z");
    });

    await t.test("mutating or deleting live GameStats cannot revoke or replace immutable current state", async () => {
      await reset();
      const before = await current();
      await client!.query("UPDATE game_stats SET parse_source='watcher_final', key_events='{}', players='[]', played_on='2040-01-01'");
      assert.deepEqual(await current(), before);
      await client!.query("DELETE FROM game_stats");
      assert.deepEqual(await current(), before);
    });

    await t.test("later same-artifact live receipt cannot rebase the game clock, ratings, name or missing lanes", async () => {
      await reset();
      const before = await current();
      await insert({ hash: replayHash, playedOn: "2026-10-06T00:00:00.000Z", players: [{ ...basePlayer, name: "Reparsed Alias", steam_rm_rating: 3000, steam_dm_rating: 900 }] });
      assert.deepEqual(await current(), before);
      await client!.query("TRUNCATE game_stats, replay_parse_attempts");
      id = 0;
      await insert({ players: [{ ...basePlayer, steam_dm_rating: null }] });
      await insert({ hash: replayHash, playedOn: "2026-10-06T00:00:00.000Z" });
      assert.equal((await current())?.steamDmRating, null);
    });

    await t.test("legacy signed-live mutable GameStats has no immutable current-rating authority", async () => {
      await reset();
      await client!.query("DELETE FROM replay_parse_attempts");
      assert.deepEqual(await states(), []);
    });

    await t.test("future parser evidence cannot revoke the frozen v1 observation or silently gain current authority", async () => {
      await reset();
      const before = await current();
      await insert({ playedOn: "2026-10-06T00:00:00.000Z", observation: { parser: {
        name: CURRENT_ACCOUNT_OBSERVATION_V1_PARSER.parserName,
        version: CURRENT_ACCOUNT_OBSERVATION_V1_PARSER.parserVersion,
        schema_version: CURRENT_ACCOUNT_OBSERVATION_V1_PARSER.schemaVersion,
        pass_name: CURRENT_ACCOUNT_OBSERVATION_V1_PARSER.passName,
        pass_version: "11",
        options: { apply_hd_early_exit_rules: false },
      } } });
      assert.deepEqual(await current(), before);
    });

    await t.test("unsigned, missing, malformed, mixed-hash and undated observations fail closed", async () => {
      for (const options of [
        { proof: null },
        { proof: { ...liveProof, provenance_signature_verified: false } },
        { proof: { ...liveProof, provenance_signature_verified: "true" } },
        { proof: { ...liveProof, client_sha256_verified: false } },
        { proof: { ...liveProof, server_sha256: "b".repeat(64) } },
        { proof: { ...liveProof, client_sha256: "b".repeat(64) } },
        { proof: { ...liveProof, file_role: "final_recording" } },
        { hash: "not-a-sha256" },
        { playedOn: null },
        { players: [{ ...basePlayer, steam_id: "not-a-steam-id" }] },
        { observation: { uploader_uid: "u_other-user" } },
        { outerUid: "u_other-user" },
        { observation: { observed_game_at: "malformed-date" } },
        { observation: { captured_at: "2026-10-10T00:00:00.001000Z" } },
        { observation: { result_authority: true } },
        { observation: { archive_verified: false } },
        { observation: { parser: { name: "untrusted-parser" } } },
        { players: [{ ...basePlayer, steam_rating_sources: { steam_rm_rating: "hd_header", steam_dm_rating: "summary_rate_snapshot" } }] },
        { players: [{ ...basePlayer, steam_rating_sources: {} }] },
        { players: [{ ...basePlayer, steam_rm_rating: "1600" }] },
        { players: [{ ...basePlayer, steam_rm_rating: -1 }] },
        { players: [{ ...basePlayer, steam_rm_rating: 2147483648 }] },
        { players: [basePlayer, { ...basePlayer, name: "Conflicting duplicate Steam" }] },
      ]) {
        await client!.query("TRUNCATE game_stats, replay_parse_attempts");
        id = 0;
        await insert(options);
        assert.deepEqual(await states(), []);
      }
    });
  } finally {
    invalidateCurrentWatcherAccountStateCache();
    await client?.end();
    if (started) execFileSync(pgctl, ["-D", data, "-m", "fast", "-w", "stop"], { stdio: "pipe" });
    rmSync(root, { recursive: true, force: true });
  }
});
