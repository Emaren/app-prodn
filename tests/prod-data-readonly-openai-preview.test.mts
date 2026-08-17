import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  "scripts/dev-prod-readonly.py",
  "utf8",
);

test("dev:prod OpenAI access is explicit opt-in", () => {
  assert.match(source, /AOE2WAR_PROD_PREVIEW_WITH_OPENAI/);
  assert.match(source, /env\["OPENAI_API_KEY"\] = read_prod_openai_key\(\)/);
});

test("production OpenAI credential is fetched over SSH and remains memory-only", () => {
  assert.match(source, /def read_prod_openai_key\(\) -> str:/);
  assert.match(source, /OPENAI_API_KEY_FILE/);
  assert.match(source, /env\.pop\("OPENAI_API_KEY_FILE", None\)/);
  assert.doesNotMatch(source, /print\(value\)/);
});

test("dev:prod can suppress automatic browser launch for isolated canaries", () => {
  assert.match(source, /AOE2WAR_PROD_PREVIEW_NO_BROWSER/);
  assert.match(source, /if no_browser:/);
});

test("mutation credentials remain excluded and database remains read-only", () => {
  assert.match(source, /env\.pop\("INTERNAL_API_KEY", None\)/);
  assert.match(source, /env\.pop\("ADMIN_TOKEN", None\)/);
  assert.match(source, /default_transaction_read_only=on/);
});
