import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Mecha admin evidence is session-gated, no-store, bounded and read only", () => {
  const route = readFileSync(
    new URL("../app/api/admin/auto-bets/route.ts", import.meta.url),
    "utf8"
  );
  const page = readFileSync(
    new URL("../app/admin/auto-bets/page.tsx", import.meta.url),
    "utf8"
  );
  assert.match(route, /requireAdmin\(request\)/);
  assert.match(route, /private, no-store/);
  assert.match(route, /take: 100/);
  assert.match(route, /take: 75/);
  assert.match(route, /betAutoExecution\.groupBy/);
  assert.doesNotMatch(route, /export async function PATCH/);
  assert.doesNotMatch(route, /export async function POST/);
  assert.doesNotMatch(route, /sourceEvidence: true/);
  assert.doesNotMatch(route, /sessionKey: true/);
  assert.match(page, /FUNDED EXECUTOR/);
  assert.match(page, /SHADOW EXECUTIONS/);
  assert.match(page, /READ-ONLY COMMAND/);
});

test("Manual wager policy remains independently capped at 50000 WOLO", () => {
  const policy = readFileSync(new URL("../lib/betWagering.ts", import.meta.url), "utf8");
  assert.match(policy, /50_000/);
});
