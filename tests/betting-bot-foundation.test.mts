import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  BETTING_BOT_COUNTERSTAKE_HARD_CAP_WOLO,
  BETTING_BOT_CUSTODY_CAPABILITY,
  BETTING_BOT_POLICY_ID,
  BETTING_BOT_POLICY_VERSION,
  BettingBotInputError,
  buildBetCounterIdempotencyKey,
  buildBetCounterProposal,
  buildBettingBotCommentaryPrompt,
  parseBettingBotConfigDraft,
  readBettingBotRuntime,
  type BettingBotPolicyConfig,
} from "../lib/bettingBots.ts";

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const BASE_CONFIG: BettingBotPolicyConfig = {
  id: 1,
  slug: "tony",
  reservedUid: "aoe2hd_betting_bot_tony",
  displayName: "Tony",
  avatarUrl: null,
  mode: "shadow",
  commentaryEnabled: false,
  commentaryPrompt: "Keep it dry.",
  oppositeOnly: true,
  defaultCounterstakeWolo: 10,
  maxCounterstakeWolo: 10,
  perMarketExposureWolo: 10,
  dailyExposureWolo: 50,
  balanceFloorWolo: 100,
  policyId: BETTING_BOT_POLICY_ID,
  policyVersion: BETTING_BOT_POLICY_VERSION,
};

test("counter-bettor input enforces opposite-only and a hard 10 WOLO action cap", () => {
  const parsed = parseBettingBotConfigDraft(BASE_CONFIG);
  assert.equal(parsed.oppositeOnly, true);
  assert.equal(parsed.defaultCounterstakeWolo, 10);
  assert.equal(parsed.maxCounterstakeWolo, BETTING_BOT_COUNTERSTAKE_HARD_CAP_WOLO);

  assert.throws(
    () =>
      parseBettingBotConfigDraft({
        ...BASE_CONFIG,
        maxCounterstakeWolo: 11,
      }),
    BettingBotInputError
  );
  assert.throws(
    () =>
      parseBettingBotConfigDraft({
        ...BASE_CONFIG,
        oppositeOnly: false,
      }),
    /opposite-only/
  );
  assert.throws(
    () =>
      parseBettingBotConfigDraft({
        ...BASE_CONFIG,
        dailyExposureWolo: 9,
      }),
    /cannot be lower/
  );
});

test("server readiness is a safety ceiling and every runtime remains non-executing", () => {
  const serverDisabled = readBettingBotRuntime(BASE_CONFIG, {});
  assert.equal(serverDisabled.effectiveMode, "disabled");
  assert.equal(serverDisabled.code, "SERVER_DISABLED");
  assert.equal(serverDisabled.canExecuteMoney, false);

  const shadow = readBettingBotRuntime(BASE_CONFIG, {
    BETTING_BOTS_MODE: "shadow",
  });
  assert.equal(shadow.effectiveMode, "shadow");
  assert.equal(shadow.canPropose, true);
  assert.equal(shadow.canExecuteMoney, false);

  const liveWithoutCustody = readBettingBotRuntime(
    { ...BASE_CONFIG, mode: "live" },
    { BETTING_BOTS_MODE: "live" }
  );
  assert.equal(liveWithoutCustody.effectiveMode, "disabled");
  assert.equal(liveWithoutCustody.code, "LIVE_CUSTODY_NOT_ADVERTISED");
});

test("advertised custody still fails closed without fresh funded verification and an executor", () => {
  const env = {
    BETTING_BOTS_MODE: "live",
    WOLO_BET_COUNTER_CUSTODY_CAPABILITY: BETTING_BOT_CUSTODY_CAPABILITY,
    WOLO_BET_COUNTER_CUSTODY_URL: "https://custody.invalid/counter-bets",
    WOLO_BET_COUNTER_CUSTODY_AUTH_TOKEN: "server-secret-present",
  };
  const liveConfig = { ...BASE_CONFIG, mode: "live" as const };

  const unverified = readBettingBotRuntime(liveConfig, env);
  assert.equal(unverified.code, "LIVE_CUSTODY_UNVERIFIED");
  assert.equal(unverified.effectiveMode, "disabled");

  const balanceBlocked = readBettingBotRuntime(liveConfig, env, {
    capability: BETTING_BOT_CUSTODY_CAPABILITY,
    verificationId: "proof-1",
    operatorFunded: true,
    accountAddress: `wolo1${"a".repeat(38)}`,
    availableBalanceWolo: 109,
    verifiedAt: new Date().toISOString(),
  });
  assert.equal(balanceBlocked.code, "LIVE_BALANCE_FLOOR_BLOCKED");
  assert.equal(balanceBlocked.effectiveMode, "disabled");

  const executorMissing = readBettingBotRuntime(liveConfig, env, {
    capability: BETTING_BOT_CUSTODY_CAPABILITY,
    verificationId: "proof-2",
    operatorFunded: true,
    accountAddress: `wolo1${"b".repeat(38)}`,
    availableBalanceWolo: 110,
    verifiedAt: new Date().toISOString(),
  });
  assert.equal(executorMissing.code, "LIVE_EXECUTOR_UNAVAILABLE");
  assert.equal(executorMissing.effectiveMode, "shadow");
  assert.equal(executorMissing.canExecuteMoney, false);
});

test("deterministic policy always takes the opposite side and never proposes above 10", () => {
  const runtime = readBettingBotRuntime(BASE_CONFIG, {
    BETTING_BOTS_MODE: "shadow",
  });
  const proposal = buildBetCounterProposal({
    config: { ...BASE_CONFIG, perMarketExposureWolo: 20 },
    runtime,
    marketId: 42,
    sourceWagerId: 99,
    propositionHash: "a".repeat(64),
    sourceSide: "left",
    sourceAmountWolo: 1000,
    marketExposureWolo: 0,
    dailyExposureWolo: 0,
    availableBalanceWolo: 1000,
  });
  assert.equal(proposal.decision, "shadow_proposed");
  assert.equal(proposal.counterSide, "right");
  assert.equal(proposal.amountWolo, 10);
  assert.equal(proposal.canExecuteMoney, false);

  const balanceGuard = buildBetCounterProposal({
    config: BASE_CONFIG,
    runtime,
    marketId: 42,
    sourceWagerId: 100,
    propositionHash: "a".repeat(64),
    sourceSide: "right",
    sourceAmountWolo: 10,
    marketExposureWolo: 0,
    dailyExposureWolo: 0,
    availableBalanceWolo: 100,
  });
  assert.equal(balanceGuard.counterSide, "left");
  assert.equal(balanceGuard.amountWolo, 0);
  assert.equal(balanceGuard.decision, "evaluation_skipped");
});

test("counter decision idempotency is policy, bot, market, wager, and proposition bound", () => {
  const input = {
    botConfigId: 1,
    policyId: BETTING_BOT_POLICY_ID,
    policyVersion: BETTING_BOT_POLICY_VERSION,
    marketId: 42,
    sourceWagerId: 99,
    propositionHash: "ABCDEF",
  };
  const first = buildBetCounterIdempotencyKey(input);
  assert.equal(first, buildBetCounterIdempotencyKey(input));
  assert.notEqual(
    first,
    buildBetCounterIdempotencyKey({ ...input, sourceWagerId: 100 })
  );
  assert.match(first, /^counter:[a-f0-9]{64}$/);
});

test("commentary prompt grants words only and no money authority", () => {
  const prompt = buildBettingBotCommentaryPrompt(BASE_CONFIG);
  assert.match(prompt, /flavour/);
  assert.match(prompt, /cannot choose a side, amount, market, exposure, custody action, transaction, or wager/);
  assert.match(prompt, /Never claim WOLO moved unless verified chain proof/);
  assert.match(prompt, /Keep it dry/);
});

test("migration seeds disabled Tony and Paulie and makes counter actions append-only", () => {
  const migration = source(
    "../prisma/migrations/20260801201500_add_counter_betting_bot_foundation/migration.sql"
  );
  assert.match(migration, /CREATE TABLE "betting_bot_configs"/);
  assert.match(migration, /CREATE TABLE "bet_counter_actions"/);
  assert.match(migration, /'aoe2hd_betting_bot_tony'/);
  assert.match(migration, /'aoe2hd_betting_bot_paulie'/);
  assert.match(migration, /'disabled'/);
  assert.match(migration, /"max_counterstake_wolo" BETWEEN 1 AND 10/);
  assert.match(migration, /"opposite_only" = TRUE/);
  assert.match(migration, /uq_bet_counter_actions_idempotency/);
  assert.match(migration, /BEFORE UPDATE OR DELETE ON "bet_counter_actions"/);
  assert.match(migration, /BEFORE TRUNCATE ON "bet_counter_actions"/);
  assert.match(migration, /"committed_counterstake_wolo" IS NULL/);
  assert.match(migration, /"stake_tx_hash" IS NOT NULL/);
  assert.doesNotMatch(migration, /auth_token|private_key|mnemonic/i);
});

test("counter-bettors are separate from AiAgent and admin API cannot wager or sign", () => {
  const schema = source("../prisma/schema.prisma");
  const api = source("../app/api/admin/betting-bots/route.ts");
  const page = source("../components/admin/ai/BettingBotControlPanel.tsx");
  const accounts = source("../lib/internalSystemAccounts.ts");

  assert.match(schema, /model BettingBotConfig/);
  assert.match(schema, /model BetCounterAction/);
  assert.doesNotMatch(
    schema.match(/model AiAgent \{[\s\S]*?\n\}/)?.[0] || "",
    /tony|paulie|BettingBot/i
  );
  assert.match(api, /parseBettingBotConfigDraft/);
  assert.match(api, /betCounterAction\.create/);
  assert.match(api, /updateMany/);
  assert.doesNotMatch(
    api,
    /placePooledBetWager|prepareBetStakeTicket|commitBetStakeTicket|offlineSigner|signAndBroadcast|requestAiConciergeReply/
  );
  assert.match(page, /No executor installed/);
  assert.match(page, /LLM boundary/);
  assert.match(page, /Live requested, fail closed/);
  assert.match(accounts, /BETTING_BOT_TONY_UID/);
  assert.match(accounts, /BETTING_BOT_PAULIE_UID/);
});
