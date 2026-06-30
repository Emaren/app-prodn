import assert from "node:assert/strict";
import test from "node:test";

import {
  audienceAllowedByPolicy,
  normalizeClanAudience,
  normalizeClanMessage,
} from "../lib/clans.ts";

test("public hall policy permits all three post audiences", () => {
  assert.equal(audienceAllowedByPolicy("public", "public"), true);
  assert.equal(audienceAllowedByPolicy("users", "public"), true);
  assert.equal(audienceAllowedByPolicy("clan", "public"), true);
});

test("users hall policy hides public posts while preserving narrower posts", () => {
  assert.equal(audienceAllowedByPolicy("public", "users"), false);
  assert.equal(audienceAllowedByPolicy("users", "users"), true);
  assert.equal(audienceAllowedByPolicy("clan", "users"), true);
});

test("clan hall policy permits clan-only posts only", () => {
  assert.equal(audienceAllowedByPolicy("public", "clan"), false);
  assert.equal(audienceAllowedByPolicy("users", "clan"), false);
  assert.equal(audienceAllowedByPolicy("clan", "clan"), true);
});

test("clan inputs are normalized and bounded", () => {
  assert.equal(normalizeClanAudience("not-an-audience", "users"), "users");
  assert.equal(normalizeClanMessage("hello  \r\nworld"), "hello\nworld");
  assert.equal(normalizeClanMessage("x".repeat(1300)).length, 1200);
});
