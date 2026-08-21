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

test("shadow refresh clones only the production-shaped social, AI and Marketplace control-plane slice", () => {
  const launcher = read("scripts/dev-shadow.py");

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
    "user_activity_events",
    "marketplace_shops",
  ]) {
    assert.match(launcher, new RegExp(`"${table}"`));
  }

  assert.match(
    launcher,
    /MARKETPLACE_TABLES = \([\s\S]*"user_activity_events"[\s\S]*"marketplace_shops"[\s\S]*\)/,
  );
  assert.match(
    launcher,
    /SHADOW_TABLES = \([\s\S]*SOCIAL_TABLES[\s\S]*CONTROL_PLANE_TABLES[\s\S]*MARKETPLACE_TABLES[\s\S]*\)/,
  );
  assert.match(launcher, /--data-only/);
  assert.match(
    launcher,
    /only selected social\/AI\/Marketplace control-plane[\s\S]*table data crossed SSH/,
  );
  assert.match(
    launcher,
    /replay\/parser\/game corpus was deliberately not cloned/,
  );
});

test("shadow schema is built from current Prisma schema", () => {
  const launcher = read("scripts/dev-shadow.py");

  assert.match(launcher, /"prisma",/);
  assert.match(launcher, /"db",/);
  assert.match(launcher, /"push",/);
  assert.match(launcher, /"--accept-data-loss",/);
  assert.doesNotMatch(launcher, /"--skip-generate"/);
  assert.doesNotMatch(
    launcher,
    /\["npx", "prisma", "migrate", "deploy"\]/,
  );
  assert.match(
    launcher,
    /local shadow schema built from current canonical Prisma schema/,
  );
  assert.match(
    launcher,
    /broken historical migration replay is not part of shadow startup/,
  );
});
test("shadow data stream filters PG17 psql-only commands", () => {
  const launcher = read("scripts/dev-shadow.py");

  assert.match(launcher, /\\\\restrict/);
  assert.match(launcher, /\\\\unrestrict/);
  assert.match(launcher, /SET transaction_timeout = 0;/);
  assert.match(
    launcher,
    /PG17 psql-only meta-commands were filtered/,
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


test("shadow precreates dbgenerated battle sequence", () => {
  const launcher = read("scripts/dev-shadow.py");
  assert.match(launcher, /AOE2WAR_SHADOW_BATTLE_SEQUENCE_PREREQ/);
  assert.match(launcher, /CREATE SEQUENCE IF NOT EXISTS battle_public_number_seq/);
  assert.match(launcher, /START WITH 2820/);
  const sequenceAt = launcher.indexOf("CREATE SEQUENCE IF NOT EXISTS battle_public_number_seq");
  const pushAt = launcher.indexOf('"push",');
  assert.notEqual(sequenceAt, -1);
  assert.notEqual(pushAt, -1);
  assert.ok(sequenceAt < pushAt);
});
