import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BETS_PUBLIC_READ_HOLD_SCHEMA, BETS_PUBLIC_READ_HOLD_STATUS,
  isRestrictedBetsReadDenied, publicBetsReadHoldPayload,
  isPublicBetsReadHoldPayload,
} from "../lib/betsPublicReadHold.ts";

function error(table: string, code = "P2039", sqlState = "42501") {
  return Object.assign(
    new Error("Database error. Code: `" + sqlState +
      "`. Message: `permission denied for table " + table + "`"),
    { code },
  );
}

test("known restricted public board read surfaces fail shut", () => {
  for (const name of [
    "bet_markets", "bet_wagers", "pending_wolo_claims",
    "bet_counter_actions", "bet_stake_intents", "bet_stake_tickets",
    "bet_auto_executions", "wolo_indexed_transfers",
  ]) {
    assert.equal(isRestrictedBetsReadDenied(error(name)), true, name);
  }
  assert.equal(isRestrictedBetsReadDenied(error("wolo_indexed_transfers", "P2010")), true);
});

test("Prisma P2039 across separate JavaScript realm still preserves narrow finance HOLD", async () => {
  // An actual Next/Prisma error can cross package/compiler or VM realms.
  // Its visible SQLSTATE and protected table are necessary, never sufficient
  // without an actual Prisma error code.
  const { runInNewContext } = await import("node:vm");
  const alien = runInNewContext(
    'Object.assign(new Error("Database error. Code: `42501`. Message: `permission denied for table pending_wolo_claims`"), {code:"P2039"})',
  );
  assert.equal(alien instanceof Error, false);
  assert.equal(isRestrictedBetsReadDenied(alien), true);
  assert.equal(isRestrictedBetsReadDenied({
    code: "P2010",
    message: "Raw query failed. Code: `42501`. Message: `permission denied for table bet_stake_intents`",
  }), true);
  assert.equal(isRestrictedBetsReadDenied({
    code: "P2039", message: "Raw query failed. Code: `42501`. Message: `permission denied for table users`",
  }), false);
  assert.equal(isRestrictedBetsReadDenied({
    code: "P2039", message: {}, toString() { throw Error("untrusted toString"); },
  }), false);
});

test("unknown SQL, table, unrelated database errors and malicious payload are not silently hidden", () => {
  assert.equal(isRestrictedBetsReadDenied(error("users")), false);
  assert.equal(isRestrictedBetsReadDenied(error("bet_markets", "P2002")), false);
  assert.equal(isRestrictedBetsReadDenied(error("bet_markets", "P2039", "23505")), false);
  assert.equal(isRestrictedBetsReadDenied(new Error("permission denied for table bet_markets 42501")), false);
  assert.equal(isRestrictedBetsReadDenied(null), false);
  assert.equal(isRestrictedBetsReadDenied({ code: "P2039", message: "untrusted" }), false);
});

test("published-only HOLD is explicit, immutable in shape and never funds", () => {
  const payload = publicBetsReadHoldPayload();
  assert.equal(payload.schema, BETS_PUBLIC_READ_HOLD_SCHEMA);
  assert.equal(payload.status, BETS_PUBLIC_READ_HOLD_STATUS);
  assert.equal(payload.financialExecutionAuthorized, false);
  assert.equal(payload.acceptingWagers, false);
  assert.equal(payload.approvingPayouts, false);
  assert.equal(payload.onchainPaymentFinalityVerified, false);
  assert.equal(payload.personalWagersIncluded, false);
  assert.equal(payload.publicHistoryUrl, "/api/bets/public-history");
  assert.equal(isPublicBetsReadHoldPayload(payload), true);
  for (const field of [
    "financialExecutionAuthorized", "acceptingWagers", "approvingPayouts",
    "onchainPaymentFinalityVerified", "personalWagersIncluded",
  ]) {
    assert.equal(isPublicBetsReadHoldPayload({ ...payload, [field]: true }), false, field);
  }
  assert.equal(isPublicBetsReadHoldPayload({ ...payload, publicHistoryUrl: "http://127.0.0.1:8092" }), false);
  assert.equal(isPublicBetsReadHoldPayload({ ...payload, schema: "untrusted" }), false);
});

test("App source uses reviewed hold and existing archival-only fallback, never creates finance privileges", () => {
  const root = join(import.meta.dirname, "..");
  const api = readFileSync(join(root, "app/api/bets/route.ts"), "utf8");
  const page = readFileSync(join(root, "app/bets/page.tsx"), "utf8");
  assert.match(api, /isRestrictedBetsReadDenied\(error\)/);
  assert.match(api, /status: 503/);
  assert.match(api, /publicBetsReadHoldPayload\(\)/);
  assert.match(page, /isPublicBetsReadHoldPayload\(held\)/);
  assert.match(page, /PublishedBetHistoryFallback/);
  assert.match(page, /FINANCIAL RELEASE ON HOLD|Financial release on hold/i);
  assert.match(page, /isInitialBoardLoad && process\.env\.NODE_ENV !== "production"/);
  assert.match(page, /isPublicBetsReadHoldPayload\(held\)[\s\S]*?setBoard\(null\)/);
  assert.match(page, /Unknown failures also invalidate previously cached live market state\.[\s\S]*?setBoard\(null\)/);
  for (const source of [api, page]) {
    for (const forbidden of ["ALTER ROLE", "GRANT ALL", "systemctl unmask", "127.0.0.1:8092"]) {
      assert.equal(source.includes(forbidden), false);
    }
  }
});
