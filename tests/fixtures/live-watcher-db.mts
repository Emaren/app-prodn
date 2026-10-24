/** Disposable main-schema LIVE admission fixture. No custody SQL, inherited
 * DB endpoint, TCP listener, production mutation or signing authority. */
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import pg from "pg";
import {PrismaPg} from "@prisma/adapter-pg";
import {PrismaClient} from "../../lib/generated/prisma/index.js";
const REPOSITORY = fileURLToPath(new URL("../../", import.meta.url));
const ROLE = "live_watcher_fixture";
type FixtureSql = {
  connect():Promise<void>;end():Promise<void>;
  query<Row=Record<string,string>>(text:string,values?:unknown[]):Promise<{rows:Row[];rowCount:number|null}>;
};
export async function startLiveWatcherDatabase() {
  const bin = process.env.AOE2WAR_TEST_PG_BIN || "/opt/homebrew/opt/postgresql@16/bin";
  assert.ok(existsSync(path.join(bin, "initdb")), "isolated PostgreSQL 16 tools required");
  assert.match(execFileSync(path.join(bin, "postgres"), ["--version"], {encoding: "utf8"}), /PostgreSQL\) 16\./);
  const root = realpathSync(mkdtempSync("/tmp/aoe2-live-watcher-"));
  const data = path.join(root, "data"), socket = path.join(root, "socket");
  mkdirSync(socket, {mode: 0o700});
  let started = false, closed = false;
  let sql: FixtureSql | undefined, prisma: PrismaClient | undefined;
  const cleanup = async () => {
    if (closed) return; closed = true;
    try { await prisma?.$disconnect(); } finally {
      try { await sql?.end(); } finally {
        try {
          if (started) execFileSync(path.join(bin, "pg_ctl"), ["-D", data, "-m", "immediate", "-w", "stop"], {stdio: "pipe", timeout: 30000});
        } finally { rmSync(root, {recursive: true, force: true}); }
      }
    }
  };
  try {
    execFileSync(path.join(bin, "initdb"), ["-D", data, "-U", ROLE, "--auth-local=trust", "--auth-host=reject"], {stdio: "pipe", timeout: 30000});
    execFileSync(path.join(bin, "pg_ctl"), ["-D", data, "-l", path.join(root, "postgres.log"), "-o", `-h '' -k ${socket} -c timezone=UTC`, "-w", "start"], {stdio: "pipe", timeout: 30000});
    started = true;
    sql = new pg.Client({host: socket, port: 5432, user: ROLE, database: "postgres"}) as FixtureSql;
    await sql.connect(); await sql.query("SET statement_timeout='20s'");
    // Diff compares two datamodels offline. Explicit disposable configuration
    // wins over dotenv; neither datasource flag nor migration execution CLI
    // is used. Prisma adapters below connect only to our private Unix socket.
    const env: NodeJS.ProcessEnv = {...process.env, DATABASE_URL: "postgresql://fixture@127.0.0.1:1/unused_offline_schema"};
    for (const key of Object.keys(env)) if (key.startsWith("PG") || ["DIRECT_URL", "SHADOW_DATABASE_URL"].includes(key)) delete env[key];
    const ddl = execFileSync(path.join(REPOSITORY, "node_modules/.bin/prisma"), ["migrate", "diff", "--from-empty", "--to-schema", path.join(REPOSITORY, "prisma/schema.prisma"), "--script"],
      {cwd: REPOSITORY, env, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, timeout: 120000});
    assert.ok(ddl.includes('CREATE TABLE "bet_markets"') && ddl.includes('CREATE TABLE "game_stats"'), "offline Prisma diff omitted canonical LIVE tables");
    // The combined integration datamodel includes held Satchel table shapes.
    // This private DB has NO protected migration authorization, chain or signer.
    assert.ok(ddl.includes('CREATE TABLE "war_satchel_funded_balances"'), "combined funded datamodel absent");
    // The schema intentionally refers to this separately managed sequence.
    await sql.query("CREATE SEQUENCE battle_public_number_seq START 1");
    await sql.query(ddl);
    // Prisma creates synthetic TABLE SHAPES, not protected migrations or custody.
    // Original LIVE admission must never write into any funded balance.
    const forbidden = await sql.query("SELECT to_regclass('public.war_satchel_funded_balances') AS funded, to_regclass('public.hd_financial_maintenance_policy') AS policy");
    assert.ok(forbidden.rows[0].funded,"synthetic funded table schema must exist for joint qualification");
    assert.equal(forbidden.rows[0].policy, null,"protected financial-maintenance SQL never ran");
    const balance = await sql.query("SELECT count(*)::int AS n FROM war_satchel_funded_balances");
    assert.equal(balance.rows[0].n,0,"no funded custody data belongs in original LIVE fixture");
    const tableCount = Number((await sql.query("SELECT count(*) FROM pg_tables WHERE schemaname='public'")).rows[0].count);
    assert.ok(tableCount > 100, "existing main application dependencies must use full relational schema");
    prisma = new PrismaClient({adapter: new PrismaPg({host: socket, port: 5432, user: ROLE, database: "postgres", max: 6})});
    await prisma.$queryRaw`SELECT 1`;
    return {prisma, sql, root, socket, cleanup, tableCount};
  } catch (error) { await cleanup(); throw error; }
}
