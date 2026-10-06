import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import pg from "pg";

import {
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

    const steamId = "76561198000000001";
    const replayHash = "a".repeat(64);
    const liveProof = {
      ingestion_provenance: "live_monitor",
      provenance_signature_verified: true,
      client_sha256_verified: true,
      server_sha256: replayHash,
      client_sha256: replayHash,
    };
    const basePlayer = { name: "Current Warrior", steam_id: steamId, steam_rm_rating: 1671, steam_dm_rating: 2200 };
    const currentTime = "2026-10-05T00:00:00.000Z";
    let id = 0;
    const insert = async (options: {
      source?: string; playedOn?: string | null; players?: unknown;
      proof?: Record<string, unknown> | null; hash?: string;
    } = {}) => {
      await client!.query(
        "INSERT INTO game_stats (id, replay_hash, players, key_events, played_on, parse_source) VALUES ($1,$2,$3,$4,$5,$6)",
        [++id, options.hash ?? replayHash, JSON.stringify(options.players ?? [basePlayer]),
          JSON.stringify(options.proof === null ? {} : { watcher_upload: options.proof ?? liveProof }),
          options.playedOn === undefined ? currentTime : options.playedOn, options.source ?? "watcher_live"],
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
      await client!.query("TRUNCATE game_stats");
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
      await client!.query("TRUNCATE game_stats");
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

    await t.test("unsigned, missing, malformed, mixed-hash and undated observations fail closed", async () => {
      for (const options of [
        { proof: null },
        { proof: { ...liveProof, provenance_signature_verified: false } },
        { proof: { ...liveProof, provenance_signature_verified: "true" } },
        { proof: { ...liveProof, client_sha256_verified: false } },
        { proof: { ...liveProof, server_sha256: "b".repeat(64) } },
        { proof: { ...liveProof, client_sha256: "b".repeat(64) } },
        { hash: "not-a-sha256" },
        { playedOn: null },
        { players: [{ ...basePlayer, steam_id: "not-a-steam-id" }] },
      ]) {
        await client!.query("TRUNCATE game_stats");
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
