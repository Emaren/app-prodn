import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {BET_MAX_STAKE_WOLO,AUTO_BET_MAX_DAILY_WOLO} from "../lib/betMoneyLimits.ts";

const files=[
  "components/profile/MechaAutoBetCard.tsx",
  "components/profile/AutoBetReserveCard.tsx",
  "components/profile/WarSatchelSpendAuthorization.tsx",
] as const;
const contents=files.map(p=>readFileSync(new URL("../"+p,import.meta.url),"utf8"));

test("client-side Mecha and Keplr limits stay coupled to owner signed 10k/50k financial policy",()=>{
 assert.equal(BET_MAX_STAKE_WOLO,10_000);
 assert.equal(AUTO_BET_MAX_DAILY_WOLO,50_000);
 for(const [i,s] of contents.entries()){
  assert.ok(s.startsWith('"use client";'),files[i]+" must remain a Next client component");
  assert.match(s,/import \{BET_MAX_STAKE_WOLO,AUTO_BET_MAX_DAILY_WOLO\} from "@\/lib\/betMoneyLimits"/);
  assert.doesNotMatch(s,/MAX_AUTO_GAME_WOLO = 1_000|FALLBACK_MAX_RESERVE_WOLO = 10_000|cap <= 10000|plannedStakeWolo <= 1000|max=\{10000\}|1–1,000 WOLO PER MATCH|10,000 PLAN MAX/);
 }
 const [mecha,reserve,keplr]=contents;
 assert.match(mecha,/MAX_AUTO_GAME_WOLO = BET_MAX_STAKE_WOLO/);
 assert.match(mecha,/Math\.min\(server\?\.limits\.maxEstimatedReserveWolo \?\? AUTO_BET_MAX_DAILY_WOLO,AUTO_BET_MAX_DAILY_WOLO\)/);
 assert.match(reserve,/FALLBACK_MAX_RESERVE_WOLO = AUTO_BET_MAX_DAILY_WOLO/);
 assert.match(reserve,/Math\.min\(payload\?\.limits\.maxPerGameWolo \?\? BET_MAX_STAKE_WOLO,BET_MAX_STAKE_WOLO\)/);
 assert.match(keplr,/cap <= AUTO_BET_MAX_DAILY_WOLO/);
 assert.match(keplr,/plannedStakeWolo <= BET_MAX_STAKE_WOLO/);
 assert.match(keplr,/max=\{AUTO_BET_MAX_DAILY_WOLO\}/);
});
test("lower server-plan limits remain binding in presentation and exact Keplr challenge",()=>{
 const [mecha,reserve,keplr]=contents;
 assert.match(mecha,/Math\.min\(server\?\.limits\.maxEstimatedReserveWolo/);
 assert.match(reserve,/Math\.min\(payload\?\.limits\.maxEstimatedReserveWolo/);
 assert.match(keplr,/expectedPresetVersion: presetVersion/);
 assert.match(keplr,/MAX daily WOLO: /);
 assert.match(keplr,/signArbitrary\("wolo-1", walletAddress, challenge.message\)/);
});
