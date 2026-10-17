import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const get=(p:string)=>readFileSync(new URL("../"+p,import.meta.url),"utf8");

test("Keplr mandate revocation and final signer authorization serialize on one global DB lock",()=>{
  const ledger=get("lib/warSatchelFundedLedger.ts");
  const route=get("app/api/user/war-satchel/auto-consent/route.ts");
  const lock=ledger.match(/const FINANCIAL_LOCK_CLASS = (\d+);[\s\S]*?const FINANCIAL_LOCK_ID = (\d+);/);
  assert(lock);assert.equal(lock[1],"724176");assert.equal(lock[2],"47");
  assert.match(ledger,/await tx\.\$executeRaw`SELECT pg_advisory_xact_lock\(\$\{FINANCIAL_LOCK_CLASS\}, \$\{FINANCIAL_LOCK_ID\}\)`/);
  assert.match(route,/await tx\.\$executeRaw`SELECT pg_advisory_xact_lock\(724176, 47\)`/);
  assert.match(ledger,/keplr_auto_spending_mandate_revoked_before_broadcast/);
  assert.match(ledger,/watcher_proposition_not_live_before_broadcast/);
  assert.match(ledger,/signedAt: \{ not: null \}, revokedAt: null, spendExpiresAt: \{ gt: now \}/);
  assert.match(route,/inFlightTransfersMayStillSettle: true/);
  assert.match(route,/Do not assume it succeeded/);
});
test("unknown transfer quarantine must not turn a possibly submitted wager into a refund",()=>{
  const ledger=get("lib/warSatchelFundedLedger.ts");
  const executor=get("lib/warSatchelAutoBetExecutor.ts");
  assert.match(ledger,/reservation\.status === "committed" \|\| reservation\.status === "released"/);
  assert.match(ledger,/status: "funded_unknown_hold"/);
  assert.match(executor,/await quarantineUnknownSatchelWager\(prisma/);
  assert.doesNotMatch(executor,/async holdUnknown\(\)\s*\{/);
});
