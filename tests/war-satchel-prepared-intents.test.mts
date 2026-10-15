import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const route = readFileSync("app/api/user/war-satchel/funding-intents/route.ts","utf8");
const schema = readFileSync("prisma/schema.prisma","utf8");
const sql = readFileSync("prisma/migrations/20261014_103500_war_satchel_noncrediting_foundation/migration.sql","utf8");

test("intent preparation is gated, authenticated, origin-bound, and remains non-crediting", () => {
  assert.match(route, /WAR_SATCHEL_NONCREDITING_INTENTS_ENABLED === "true"/);
  assert.match(route, /WAR_SATCHEL_OWNER_PROOF_ENABLED === "true"/);
  assert.match(route, /request.headers.get\("origin"\) === "https:\/\/aoe2war.com"/);
  assert.match(route, /request.headers.get\("sec-fetch-site"\) !== "cross-site"/);
  assert.match(route, /getSessionUid\(request\)/);
  assert.match(route, /readWarSatchelBoundedUtf8\(request.body, MAX_BODY\)/);
  assert.match(route, /state: "PREPARED_UNFUNDABLE"/);
  assert.match(route, /vaultAddress: null, transferMemo: null/);
  assert.match(route, /depositAuthorized: false, creditAuthorized: false, wagerAuthorized: false/);
  assert.doesNotMatch(route, /sendTokens|signAndBroadcast|executeWoloSettlementRun|BetStakeTicket/);
});

test("immutable economic intent is tied to signed wallet, locked owner and one active intent", () => {
  assert.match(route, /SELECT id, uid, wallet_address FROM users WHERE id = \$\{actor.id\} FOR UPDATE/);
  assert.match(route, /locked\[0\]\.wallet_address !== actor.walletAddress/);
  assert.match(route, /warSatchelWalletChallenge.findFirst/);
  assert.match(route, /consumedAt: \{ gte: new Date/);
  assert.match(route, /OWNER_PROOF_ALREADY_USED_FOR_PREPARATION/);
  assert.match(route, /ONE_ACTIVE_INTENT_PER_OWNER/);
  assert.match(route, /isolationLevel: "Serializable"/);
  assert.match(route, /satchelDepositMemo\(uid, nonce\)/);
  assert.match(route, /randomBytes\(24\).toString\("base64url"\)/);
  assert.match(route, /BigInt\(1_000_000\)/);
  assert.match(route, /MAX_WOLO = BigInt\(10_000\)/);
  assert.match(route, /INTENT_TTL_MS = 30 \* 60_000/);
  assert.match(schema, /model WarSatchelDepositIntent/);
  assert.match(sql, /war_satchel_intents_economic_identity_lock/);
  assert.match(sql, /CREATE UNIQUE INDEX "uq_war_satchel_intents_nonce"/);
});

test("Satchel candidate vault cannot be manual betting/challenge, staking or payout custody", () => {
  assert.match(route, /WAR_SATCHEL_VAULT_CANDIDATE_ADDRESS/);
  for (const token of [
    "WOLO_BET_ESCROW_ADDRESS",
    "WOLO_CHALLENGE_ESCROW_ADDRESS",
    "WOLO_STAKING_WALLET_ADDRESS",
    "WOLO_BET_PAYOUT_ADDRESS",
    "WOLO_COMMUNITY_TREASURY_ADDRESS",
  ]) {
    assert.ok(route.includes(token), "missing vault exclusion " + token);
  }
  assert.match(route, /excluded.length < 2 \|\| !warSatchelVaultDistinctFromKnownWallets\(vault, excluded\)/);
  assert.match(route, /resolveCommunityTreasuryAddressConfig\(\)\.address/);
});
