import assert from "node:assert/strict";
import {test} from "node:test";
import {
  BET_MAX_STAKE_WOLO,AUTO_BET_MAX_DAILY_WOLO,BET_MAX_STAKE_UWOLO,
  normalizeNewBetAmount,normalizeHistoricalBetRecoveryAmount,autoBetDailyBudgetAvailable
} from "../lib/betMoneyLimits.ts";

test("new wager ceiling is 10k WOLO, not historical 50k",()=>{
  assert.equal(BET_MAX_STAKE_WOLO,10_000);
  assert.equal(BET_MAX_STAKE_UWOLO,10_000_000_000n);
  assert.equal(normalizeNewBetAmount("10000"),10_000);
  assert.equal(normalizeNewBetAmount(10_001),null);
  assert.equal(normalizeNewBetAmount(50_000),null);
  for(const v of [0,-1,1.5,NaN,Infinity,"01","1e4","10000.0","0","9999999",null])
    assert.equal(normalizeNewBetAmount(v),null,String(v));
  assert.equal(normalizeHistoricalBetRecoveryAmount(50_000),50_000);
  assert.equal(normalizeHistoricalBetRecoveryAmount(50_001),null);
});
test("owner-signed daily cap controls every new reserve, including boundary",()=>{
  assert.equal(AUTO_BET_MAX_DAILY_WOLO,50_000);
  assert.equal(autoBetDailyBudgetAvailable(40_000_000_000n,10_000_000_000n,50_000),true);
  assert.equal(autoBetDailyBudgetAvailable(40_000_000_001n,10_000_000_000n,50_000),false);
  assert.equal(autoBetDailyBudgetAvailable(0n,10_000_000_001n,50_000),false);
  assert.equal(autoBetDailyBudgetAvailable(0n,1_000_000n,50_001),false);
  assert.equal(autoBetDailyBudgetAvailable(9_000_000n,2_000_000n,10),false);
  assert.equal(autoBetDailyBudgetAvailable(9_000_000n,1_000_000n,10),true);
});
test("UNKNOWN or refunded reservations must stay counted; invalid inputs fail closed",()=>{
  // The caller sums original immutable wager_reserve journals, not net balance.
  assert.equal(autoBetDailyBudgetAvailable(50_000_000_000n,1_000_000n,50_000),false);
  for(const pair of [[-1n,1_000_000n],[0n,0n],[0n,-1n],[0n,999_999n]])
    assert.equal(autoBetDailyBudgetAvailable(pair[0],pair[1],50_000),false);
  for(const cap of [0,-1,1.5,NaN,Infinity,50_001])
    assert.equal(autoBetDailyBudgetAvailable(0n,1_000_000n,cap),false);
});
