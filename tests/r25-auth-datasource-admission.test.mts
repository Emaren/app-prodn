import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";
import { requireNonfinancialAuthDatasource } from "../lib/nonfinancialRuntimeAdmission.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const url = "postgresql://aoe2war_web_prod:fixture-no-real-secret@127.0.0.1:5432/aoe2hd_db";
const profile = {
  NODE_ENV: "production",
  AOE2WAR_RUNTIME_PROFILE: "nonfinancial-production-v1",
  WARGRAPH_RUNTIME_DISABLED: "true",
  AOE2WAR_PROD_DB_PREVIEW: "false",
};

function admission(nextEnv: Record<string, string | undefined>, nextUrl = url) {
  return () => requireNonfinancialAuthDatasource(nextUrl, nextEnv);
}

test("A05 allows only explicit local nonfinancial web-auth DB role with finance fence", () => {
  assert.doesNotThrow(admission(profile));
  assert.doesNotThrow(admission({ ...profile, AOE2WAR_PROD_DB_PREVIEW: undefined }));
  assert.doesNotThrow(admission(profile, url.replace("postgresql:", "postgresql+asyncpg:")));
});

test("A05 fails before pool creation if read-only preview environment is inherited", () => {
  assert.throws(admission({ ...profile, AOE2WAR_PROD_DB_PREVIEW: "true" }),
    /A05_AUTH_PREVIEW_READ_ONLY_DB_CONFLICT/);
});

test("A05 rejects missing production/financial runtime isolation", () => {
  assert.throws(admission({ ...profile, NODE_ENV: "development" }),
    /A05_AUTH_PRODUCTION_NODE_MODE_REQUIRED/);
  assert.throws(admission({ ...profile, WARGRAPH_RUNTIME_DISABLED: "false" }),
    /A05_AUTH_FINANCIAL_RUNTIME_FENCE_REQUIRED/);
  assert.throws(admission({ ...profile, WARGRAPH_RUNTIME_DISABLED: undefined }),
    /A05_AUTH_FINANCIAL_RUNTIME_FENCE_REQUIRED/);
});

test("A05 prevents broad production DB users or remote hosts even when URL is valid", () => {
  for (const target of [
    url.replace("aoe2war_web_prod", "postgres"),
    url.replace("aoe2war_web_prod", "aoe2war_web_readonly"),
    url.replace("127.0.0.1", "evil.example.invalid"),
    url.replace("127.0.0.1", "192.168.1.67"),
    "https://aoe2war_web_prod:secret@127.0.0.1:5432/aoe2hd_db",
    "postgresql://aoe2war_web_prod:secret@127.0.0.1:5432/",
  ]) {
    assert.throws(admission(profile, target), /A05_AUTH_EXPECTS_LOCAL_SCOPED_POSTGRES_ROLE/);
  }
});

test("A05 forbids connection and process options that force read-only transactions", () => {
  for (const target of [
    url + "?options=-c%20default_transaction_read_only%3Don",
    url + "?default_transaction_read_only=on",
  ]) {
    assert.throws(admission(profile, target), /A05_AUTH_READ_ONLY_CONNECTION_OPTIONS/);
  }
  assert.throws(admission({ ...profile, PGOPTIONS: "-c default_transaction_read_only=on" }),
    /A05_AUTH_READ_ONLY_CONNECTION_OPTIONS/);
});

test("A05 never echoes datasource credentials in a refusal", () => {
  let message = "";
  try {
    requireNonfinancialAuthDatasource(
      "postgresql://root:do-not-print-this-secret@untrusted.example.invalid/db", profile);
  } catch (error) {
    message = String(error);
  }
  assert.match(message, /A05_AUTH_EXPECTS_LOCAL_SCOPED_POSTGRES_ROLE/);
  assert.ok(!message.includes("do-not-print-this-secret"));
});

test("nonproduction and existing isolated release profiles stay unchanged", () => {
  for (const env of [
    {},
    { NODE_ENV: "production", AOE2WAR_PROD_DB_PREVIEW: "true" },
    { ...profile, AOE2WAR_RUNTIME_PROFILE: "isolated-w1-readonly-preview" },
  ]) {
    assert.doesNotThrow(admission(env, "postgresql://legacy:any@remote.example.invalid/db"));
  }
});

test("the actual Prisma pool constructor invokes this guard before client creation", () => {
  const text = readFileSync(join(root, "lib/prisma.ts"), "utf8");
  const guard = text.indexOf("requireNonfinancialAuthDatasource(databaseUrl, process.env)");
  const pool = text.indexOf("new Pool(");
  assert.ok(guard > 0 && pool > guard);
});
