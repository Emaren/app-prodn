import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const read=(path:string)=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("a pooled War Satchel auto ticket is never treated as the player's Keplr wallet",()=>{
  const tickets=read("lib/betStakeTickets.ts");
  assert.match(tickets,/const custodialAuto = ticket\.source === "auto" &&\s*ticket\.walletProvider === "satchel-vault"/);
  assert.match(tickets,/if \(!custodialAuto && input\.viewer\.walletAddress !== ticket\.walletAddress\)/);
  assert.match(tickets,/custodialAuto \? input\.viewer\.walletAddress! : ticket\.walletAddress/);
  assert.match(tickets,/\.\.\.\(custodialAuto \? \{ userId: input\.viewer\.id \} : \{ walletAddress \}\)/);
  assert.match(tickets,/WAR_SATCHEL_UNMATCHED_REFUND_CREDIT_CERTIFIED/);
  assert.match(tickets,/WAR_SATCHEL_BET_PAYOUT_ROUTING_CERTIFIED/);
  const endpoint=read("app/api/bets/tickets/route.ts");
  assert.match(endpoint,/source: "manual"/);
});

test("the live executor cannot sign until dedicated vault, refund and withdrawal authorities exist",()=>{
  const source=read("lib/warSatchelAutoBetExecutor.ts");
  const ledger=read("lib/warSatchelFundedLedger.ts");
  assert.match(source,/custodyRole: "exclusive-war-satchel-v1"/);
  assert.match(source,/WAR_SATCHEL_LIVE_EXECUTOR_ENABLED/);
  assert.match(source,/WAR_SATCHEL_VAULT_WITHDRAWAL_CERTIFIED/);
  assert.match(source,/WAR_SATCHEL_FUNDED_WITHDRAWALS_ENABLED/);
  assert.match(source,/markSatchelSubmissionAttempt\(prisma/);
  assert.match(source,/commitBetStakeTicket\(prisma/);
  assert.match(source,/commitVerifiedSatchelAutoTicket\(prisma/);
  assert.match(source,/releaseUnbroadcastSatchelReservation\(prisma/);
  assert.match(source,/signer\.submitOneShot\(/);
  assert.match(ledger,/status: "unknown_hold"/);
  assert.match(ledger,/already_processed_do_not_resubmit/);
  assert.doesNotMatch(source,/DirectSecp256k1HdWallet|fromMnemonic|process\.env\.WOLO_BET_PAYOUT_MNEMONIC/);
});

test("a player-signed Mecha mandate cannot be forged by a boolean in a funded queue",()=>{
  const consent=read("lib/warSatchelAutoSpendConsent.ts");
  const api=read("app/api/user/war-satchel/auto-consent/route.ts");
  const ledger=read("lib/warSatchelFundedLedger.ts");
  assert.match(consent,/verifyEcdsa\("sha256"/);
  assert.match(consent,/MAX daily WOLO:/);
  assert.match(consent,/Exact preset version:/);
  assert.match(api,/satchelAutoSpendConsent\.updateMany/);
  assert.match(api,/revokedAt: new Date\(\)/);
  assert.match(ledger,/signedAt: \{ not: null \}, revokedAt: null/);
  assert.match(ledger,/keplr_signed_spending_mandate_missing_or_stale/);
  assert.doesNotMatch(ledger,/signedSpendingConsentVerified/);
});
