import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const shadow = readFileSync("scripts/dev-shadow.py", "utf8");

test("shadow clones social and AI operator control-plane tables", () => {
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
  ]) {
    assert.match(shadow, new RegExp(`"${table}"`));
  }
  assert.match(shadow, /SHADOW_TABLES = SOCIAL_TABLES \+ CONTROL_PLANE_TABLES/);
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
