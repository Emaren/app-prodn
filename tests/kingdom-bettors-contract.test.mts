import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {join} from "node:path";
import {isInternalSystemUid} from "../lib/internalSystemAccounts.ts";
import {readBettingBotRuntime} from "../lib/bettingBots.ts";
const root=process.cwd();
const source=(p:string)=>readFileSync(join(root,p),"utf8");
test("all four house bot reserved identities excluded from public human source",()=>{
  for(const uid of ["aoe2hd_betting_bot_tony","aoe2hd_betting_bot_paulie","aoe2hd_betting_bot_tommy","aoe2hd_betting_bot_henry"]){
    assert.equal(isInternalSystemUid(uid),true);
  }
  assert.equal(isInternalSystemUid("aoe2hd_actual_human"),false);
});
test("existing counter-bet authority remains preview-only for all modes",()=>{
  for(const mode of ["disabled","shadow","live"] as const){
    const runtime=readBettingBotRuntime({mode,maxCounterstakeWolo:10,balanceFloorWolo:100},{BETTING_BOTS_MODE:"live"});
    assert.equal(runtime.canExecuteMoney,false);
    assert.equal(runtime.executorImplemented,false);
  }
});
test("admin provision can only add disabled policies and cannot mint wallets",()=>{
 const s=source("app/api/admin/kingdom-bettors/personas/route.ts");
 assert.match(s,/requireAdmin/);
 assert.match(s,/mode:"disabled"/);
 assert.match(s,/skipDuplicates:true/);
 assert.doesNotMatch(s,/walletAddress|sendTokens|stakeTxHash|betWager.create/);
});
test("spectator challenge does not call wager, mint, or canonical title transfer",()=>{
 const s=source("app/api/kingdom-bettors/nominations/route.ts");
 assert.match(s,/getSessionUid/);assert.match(s,/isInternalSystemUid/);
 assert.match(s,/pg_advisory_xact_lock/);assert.match(s,/LIMIT_REACHED/);
 assert.match(s,/kingdom_match_nomination/);
 assert.doesNotMatch(s,/betWager.create|trophy.update|transferWolo|woloTx|createChampionshipChallenge/);
});
test("public bet records disclose only actual transaction references",()=>{
 const s=source("lib/kingdomBettors.ts");
 assert.match(s,/payoutTxHash/);assert.match(s,/chain-reference/);
 assert.match(s,/recorded-only/);
 assert.match(s,/isInternalSystemUid/);
 assert.doesNotMatch(s,/Math.random\(/);
});
test("both arena and ledger are actually interactive",()=>{
 const s=source("components/kingdom-bettors/KingdomBettors.tsx");
 assert.match(s,/setView\("arena"\)/);
 assert.match(s,/setView\("ledger"\)/);
 assert.match(s,/api.+kingdom-bettors.+nominations/);
 assert.match(s,/left\.map/);assert.match(s,/right\.map/);
 assert.match(s,/REQUEST THIS MATCHUP/);
});

test("canonical Kingdom Bettors spelling is consistent across the arena and public route",()=>{
 const ui=source("components/kingdom-bettors/KingdomBettors.tsx");
 const page=source("app/kingdom-bettors/page.tsx");
 const personas=source("components/kingdom-bettors/ProvisionKingdomPersonas.tsx");
 const house=source("lib/kingdomBettors.ts");
 assert.ok(ui.includes("<em>BETTORS</em>"));
 assert.doesNotMatch(ui,/BETTERS|Betters/);
 assert.ok(page.includes('"/kingdom-bettors"'));
 assert.ok(page.includes('"/kingdom-bettors"'));
 assert.match(personas,/Tony · Paulie · Tommy · Henry/);
 assert.match(house,/name:"Paulie"/);
 assert.doesNotMatch(house,/Pauly/);
});
