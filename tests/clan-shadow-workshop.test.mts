import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

test("shadow launcher refuses non-local base databases", () => {
  const launcher = read("scripts/dev-shadow.py");

  assert.match(
    launcher,
    /host not in \{None, "", "localhost", "127\.0\.0\.1", "::1"\}/,
  );
  assert.match(
    launcher,
    /refusing shadow mode because \.env\.local DATABASE_URL/,
  );
});

test("shadow refresh delegates to the FK-complete bounded V1.2 engine", () => {
  const launcher = read("scripts/dev-shadow.py");
  const engine = read("scripts/aoe2_shadow.py");

  assert.match(launcher, /from aoe2_shadow import/);
  assert.match(launcher, /refresh_shadow_v12/);

  for (const table of [
    "users",
    "clans",
    "clan_members",
    "clan_messages",
    "clan_message_reactions",
    "ai_agents",
    "ai_request_traces",
    "betting_bot_configs",
    "bet_counter_actions",
    "marketplace_shops",
  ]) {
    assert.match(engine, new RegExp(`"${table}"`));
  }

  assert.match(engine, /BOUNDED_TABLE = "user_activity_events"/);
  assert.match(engine, /table\.startswith\(\s*"direct_"\s*\)/);
  assert.match(engine, /compute_fk_closure/);
  assert.match(engine, /--data-only/);
  assert.match(engine, /--disable-triggers/);
  assert.match(
    engine,
    /automatic FK closure[\s\S]*replaced manual table chasing/,
  );
  assert.match(
    engine,
    /production DATABASE_URL[\s\S]*never left the VPS/,
  );
});

test("shadow schema is built from current Prisma schema", () => {
  const engine = read("scripts/aoe2_shadow.py");

  assert.match(engine, /"prisma",/);
  assert.match(engine, /"db",/);
  assert.match(engine, /"push",/);
  assert.match(engine, /"--accept-data-loss",/);
  assert.doesNotMatch(engine, /"migrate",\s*"deploy"/);
  assert.match(
    engine,
    /current Prisma schema could not[\s\S]*build the local shadow/,
  );
});

test("shadow data stream filters PG17 psql-only commands", () => {
  const engine = read("scripts/aoe2_shadow.py");

  assert.match(engine, /b"\\\\restrict "/);
  assert.match(engine, /b"\\\\unrestrict "/);
  assert.match(engine, /SET transaction_timeout = 0;/);
  assert.match(
    engine,
    /PostgreSQL compatibility[\s\S]*filter removed/,
  );
});

test("shadow serve lane strips production mutation credentials", () => {
  const launcher = read("scripts/dev-shadow.py");

  assert.match(launcher, /AOE2WAR_SHADOW_MODE/);
  assert.match(launcher, /env\.pop\("INTERNAL_API_KEY"/);
  assert.match(launcher, /env\.pop\("ADMIN_TOKEN"/);
  assert.match(launcher, /AOE2_BACKEND_UPSTREAM/);
  assert.match(launcher, /Production DB write path: NONE/);
});

test("package exposes explicit shadow commands", () => {
  const pkg = JSON.parse(read("package.json")) as {
    scripts?: Record<string, string>;
  };

  assert.equal(
    pkg.scripts?.["shadow:refresh"],
    "python3 scripts/dev-shadow.py refresh",
  );
  assert.equal(
    pkg.scripts?.["dev:shadow"],
    "npm run kill-ports && npm run cert && python3 scripts/dev-shadow.py serve",
  );
  assert.equal(
    pkg.scripts?.["dev:shadow:fresh"],
    "npm run shadow:refresh && npm run dev:shadow",
  );
});

test("shadow precreates dbgenerated battle sequence before Prisma push", () => {
  const engine = read("scripts/aoe2_shadow.py");

  assert.match(
    engine,
    /CREATE SEQUENCE IF NOT EXISTS[\s\S]*battle_public_number_seq/,
  );
  assert.match(engine, /START WITH 2820/);

  const sequenceAt = engine.indexOf(
    "CREATE SEQUENCE IF NOT EXISTS",
  );
  const pushAt = engine.indexOf(
    '"push",',
  );

  assert.notEqual(sequenceAt, -1);
  assert.notEqual(pushAt, -1);
  assert.ok(sequenceAt < pushAt);
});
