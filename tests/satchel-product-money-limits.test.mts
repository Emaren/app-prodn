import assert from "node:assert/strict";
import test from "node:test";
import {BET_AUTOMATION_MAX_PER_GAME_WOLO,BET_AUTOMATION_MAX_RESERVE_WOLO,parseBetAutoPresetDraft} from "../lib/betAutomation.ts";
import {satchelAutoSpendChallengeText} from "../lib/warSatchelAutoSpendConsent.ts";
import {wagerReservationSignBytes} from "../lib/warSatchelWagerReservation.ts";
import {readFileSync} from "node:fs";
import {normalizeNewBetAmount,normalizeHistoricalBetRecoveryAmount,autoBetDailyBudgetAvailable} from "../lib/betMoneyLimits.ts";

test("owner product contract permits 10,000 per bet and 50,000 daily, never one WOLO more",()=>{
  assert.equal(BET_AUTOMATION_MAX_PER_GAME_WOLO,10_000);
  assert.equal(BET_AUTOMATION_MAX_RESERVE_WOLO,50_000);
  const plan={enabled:true,winnerStakeWolo:10_000,desyncSide:"none",desyncStakeWolo:0,untilOut:false,gamesRemaining:5,selfOnly:true};
  assert.doesNotThrow(()=>parseBetAutoPresetDraft(plan));
  assert.throws(()=>parseBetAutoPresetDraft({...plan,winnerStakeWolo:10_001,gamesRemaining:1}));
  assert.throws(()=>parseBetAutoPresetDraft({...plan,gamesRemaining:6}));
});

test("canonical ADR36 text accepts exact product ceilings while preserving smaller signed limits",()=>{
  const c={ownerUid:"owner-1",walletAddress:"wolo1dehxumnwdehxumnwdehxumnwdehxumnwep0k7e",presetId:1,presetVersion:1,
    winnerStakeWolo:10_000,desyncSide:"none" as const,desyncStakeWolo:0,perGameCapWolo:10_000,dailyCapWolo:50_000,
    untilOut:false,gamesRemaining:5,nonce:"a".repeat(32),issuedAtUtc:"2026-10-21T12:00:00.000Z",
    challengeExpiresAtUtc:"2026-10-21T12:05:00.000Z",spendExpiresAtUtc:"2026-10-22T12:00:00.000Z",signedAtUtc:null,revokedAtUtc:null};
  assert.match(satchelAutoSpendChallengeText(c),/MAX daily WOLO: 50000/);
  assert.throws(()=>satchelAutoSpendChallengeText({...c,winnerStakeWolo:10_001,perGameCapWolo:10_001}));
  assert.throws(()=>satchelAutoSpendChallengeText({...c,dailyCapWolo:50_001}));
  const old=satchelAutoSpendChallengeText({...c,winnerStakeWolo:1000,perGameCapWolo:1000,dailyCapWolo:10000});
  assert.match(old,/MAX per game WOLO: 1000\nMAX daily WOLO: 10000/);
});

test("independent wager review uses the same exact 10,000-WOLO native amount ceiling",()=>{
  const f=JSON.parse(readFileSync(new URL("fixtures/satchel-wager-financial-context-v1.json",import.meta.url),"utf8")).context.reservation;
  assert.doesNotThrow(()=>wagerReservationSignBytes({...f,amount_uwolo:"10000000000"}));
  assert.throws(()=>wagerReservationSignBytes({...f,amount_uwolo:"10001000000"}));
});

test("funded amount proposal parser rejects malformed or overcap amounts without rounding",()=>{
  for(const value of [1000,1001,9999,10_000,"10000",1,"1"]) assert.notEqual(normalizeNewBetAmount(value),null);
  for(const value of [10_001,"10001",50_000,0,-1,1.1,10000.1,"10000.1","10000junk","1e4","01"," 10",NaN,Infinity,null,{},10n])
    assert.equal(normalizeNewBetAmount(value),null,String(value));
  assert.equal(normalizeHistoricalBetRecoveryAmount("50000"),50_000);
  assert.equal(normalizeHistoricalBetRecoveryAmount("50001"),null);

});

test("daily budget sums all reservation attempts and never enlarges a smaller owner mandate",()=>{
  assert.equal(autoBetDailyBudgetAvailable(49_998_000_000n,1_000_000n,50_000),true);
  assert.equal(autoBetDailyBudgetAvailable(49_999_000_000n,1_000_000n,50_000),true);
  assert.equal(autoBetDailyBudgetAvailable(50_000_000_000n,1_000_000n,50_000),false);
  assert.equal(autoBetDailyBudgetAvailable(40_000_000_000n,10_000_000_000n,50_000),true);
  assert.equal(autoBetDailyBudgetAvailable(40_000_000_001n,10_000_000_000n,50_000),false);
  assert.equal(autoBetDailyBudgetAvailable(9_000_000_000n,1_000_000_000n,10_000),true);
  assert.equal(autoBetDailyBudgetAvailable(10_000_000_000n,1_000_000n,10_000),false);
  for(const [used,reserve,cap] of [[0n,10_001_000_000n,50_000],[0n,1_000_000n,50_001],[-1n,1_000_000n,50_000],[0n,1n,50_000]] as const)
    assert.equal(autoBetDailyBudgetAvailable(used,reserve,cap),false);
  const ledger=readFileSync(new URL("../lib/warSatchelFundedLedger.ts",import.meta.url),"utf8");
  const reserve=ledger.slice(ledger.indexOf("export async function reserveForWatcherExecution"),ledger.indexOf("export async function releaseUnbroadcastSatchelReservation"));
  assert.match(reserve,/return withExclusiveSatchelTx\(prisma/);
  assert.match(reserve,/eventKind: "wager_reserve"/);
  assert.match(reserve,/autoBetDailyBudgetAvailable\(dailySpent, input.reserveUwolo, mandate.dailyCapWolo\)/);
  assert.doesNotMatch(reserve,/eventKind: "wager_reserve"[\s\S]*?status:.*(released|confirmed)/);
});
