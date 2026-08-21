import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const shadow = readFileSync("scripts/dev-shadow.py", "utf8");

test("shadow clones social, AI operator and Marketplace control-plane tables", () => {
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
    assert.match(shadow, new RegExp(`"${table}"`));
  }
  assert.match(
    shadow,
    /MARKETPLACE_TABLES = \([\s\S]*"user_activity_events"[\s\S]*"marketplace_shops"[\s\S]*\)/,
  );
  assert.match(
    shadow,
    /SHADOW_TABLES = \([\s\S]*SOCIAL_TABLES[\s\S]*CONTROL_PLANE_TABLES[\s\S]*MARKETPLACE_TABLES[\s\S]*\)/,
  );
});

test("shadow keeps production database and app mutation authority out", () => {
  assert.match(shadow, /DATABASE_URL"\] = shadow_url/);
  assert.match(shadow, /env\.pop\("INTERNAL_API_KEY", None\)/);
  assert.match(shadow, /env\.pop\("ADMIN_TOKEN", None\)/);
  assert.match(shadow, /refusing shadow mode because \.env\.local DATABASE_URL/);
});

test("OpenAI parity is process-only and non-persistent", () => {
  assert.match(shadow, /read_safe_production_runtime/);
  assert.match(shadow, /env\["OPENAI_API_KEY"\] = ephemeral_openai_key/);
  assert.match(shadow, /process memory only; never written or printed/);
});

test("safe Hall Scribe provider settings can follow production", () => {
  assert.match(shadow, /AOE2WAR_HALL_SCRIBE_PROMPT_ID/);
  assert.match(shadow, /AOE2WAR_HALL_SCRIBE_PROMPT_VERSION/);
  assert.match(shadow, /SAFE_PRODUCTION_ENV_KEYS/);
});
