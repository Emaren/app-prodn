import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const route = readFileSync("app/api/user/war-satchel/wallet-proof/route.ts","utf8");
const schema = readFileSync("prisma/schema.prisma","utf8");
const sql = readFileSync("prisma/migrations/20261014_133000_war_satchel_wallet_owner_challenges/migration.sql","utf8");

test("Keplr proof cannot be enabled without operator release authorization",()=>{
  assert.match(route,/WAR_SATCHEL_OWNER_PROOF_ENABLED !== "true"/);
  assert.match(route,/origin === "https:\/\/aoe2war\.com"/);
  assert.match(route,/getSessionUid\(request\)/);
  assert.match(route,/walletAddress: actor\.user\.walletAddress/);
  assert.match(route,/randomBytes\(16\)/);
  assert.match(route,/CHALLENGE_TTL_MS = 5 \* 60_000/);
  assert.match(route,/CHALLENGE_HOURLY_LIMIT = 5/);
  assert.match(route,/attempts: \{ lt: 5 \}/);
  assert.match(route,/consumedAt: null, expiresAt: \{ gt: new Date\(\) \}/);
  assert.match(route,/walletControlVerified: true/);
  assert.match(route,/custodyApproved: false/);
  assert.match(route,/creditAuthorized: false/);
  assert.match(route,/wagerAuthorized: false/);
  assert.doesNotMatch(route,/prisma\.(warSatchelDepositIntent|warSatchelProofCandidate)\.(create|update|upsert)/);
  assert.doesNotMatch(route,/sendTokens|signAndBroadcast|StakeTicket|transferWallet|deposit\/fund/);
});

test("challenge persistence locks signer, UID, nonce and consumption at SQL level",()=>{
  assert.match(schema,/model WarSatchelWalletChallenge/);
  assert.match(sql,/CHECK \("attempts" >= 0 AND "attempts" <= 5\)/);
  assert.match(sql,/CREATE TABLE "war_satchel_wallet_challenges"/);
  assert.match(sql,/wallet challenge owner\/address\/nonce is immutable/i);
  assert.match(sql,/Consumed wallet challenge cannot be replayed/);
  assert.match(sql,/Wallet proof failed-attempt count cannot decrease/);
  assert.match(sql,/expires_at" <= "issued_at" \+ INTERVAL '10 minutes'/);
  assert.doesNotMatch(sql,/\b(UPDATE "war_satchel_deposit_intents"|ALTER TABLE "pending_wolo_claims"|CREATE TABLE "war_satchel_accounts")\b/);
});
