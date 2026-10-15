import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL("../lib/pendingWoloClaims.ts", import.meta.url);

test("market claim synchronization cannot overwrite recorded payout evidence", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const start = source.indexOf("export async function createPendingWoloClaim(");
  const end = source.indexOf("export async function claimPendingWoloClaimsForUser(", start);
  assert.ok(start >= 0 && end > start);
  const body = source.slice(start, end);
  assert.doesNotMatch(body, /pendingWoloClaim\.upsert\(/);
  assert.match(body, /pendingWoloClaim\.update\(/);
  assert.match(body, /status: "pending",\s*payoutAttemptedAt: null,\s*payoutTxHash: null/);
  const predicate = body.indexOf('status: "pending",\n          payoutAttemptedAt: null,');
  const mutation = body.indexOf('data: {\n          displayPlayerName,');
  assert.ok(predicate >= 0 && mutation > predicate, "sensitive payout fields are protected in DB WHERE, not just an application precheck");
  assert.match(body, /sourceMarketId_normalizedPlayerName_claimKind_claimGroupKey/);
  assert.match(body, /error\.code !== "P2025"/);
  assert.match(body, /pendingWoloClaim\.create\(\{ data: createData \}\)/);
  assert.doesNotMatch(body, /pendingWoloClaim\.delete|pendingWoloClaim\.updateMany\(/);
});

test("prior payout attempt cannot be cleared by ordinary rescind either", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const start = source.indexOf("export async function rescindPendingWoloClaim(");
  const end = source.indexOf("export async function loadPendingWoloClaimsForAdmin(", start);
  assert.ok(start >= 0 && end > start);
  const body = source.slice(start, end);
  assert.match(body, /status: "pending",\s*payoutAttemptedAt: null,\s*payoutTxHash: null/);
  assert.match(body, /status: "rescinded"/);
  assert.doesNotMatch(body, /payoutAttemptedAt: undefined/);
});
