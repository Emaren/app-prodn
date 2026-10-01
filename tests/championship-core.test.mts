import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { championshipBeltPolicy, championshipEligibility, soloDefenseLadder, splitTitleUwolo, championshipNftAggregate, retryableChampionshipNftSeats } from "../lib/champions/beltPolicy.ts";
const belt = (trophyId:string,overrides:Record<string,unknown>={})=>({trophyId,kind:"belt",family:"champion",tier:null,eligibleNationality:null,eloBandMin:null,eloBandMax:null,...overrides});
const eligible = {representedCountry:"Canada",genderDivision:"Woman",rmRating:1100,dmRating:1100};
test("solo defense ladder is weakest first, DM before RM and World last; team titles never enter it",()=>{
  const rows = soloDefenseLadder([belt("world"),belt("elo-challenger",{family:"elo",eloBandMax:1499}),belt("dm-rising",{family:"elo",eloBandMax:1199}),belt("elo-rising",{family:"elo",eloBandMax:1199}),belt("deathmatch_champion"),belt("random-map-champion"),belt("canada_champion_belt",{family:"national",eligibleNationality:"Canada"}),belt("2v2-rm")],eligible);
  assert.deepEqual(rows.map(row=>row.trophy.trophyId),["dm-rising","elo-rising","elo-challenger","deathmatch_champion","random-map-champion","canada_champion_belt","world"]);
  assert.equal(rows.filter(row=>row.attackable).length,1); assert.equal(rows[0].attackable,true); assert.equal(rows.at(-1)?.protected,true);
});
test("ordinary challengers retain nationality, ELO lane and Women's eligibility independent of holder assignment",()=>{
  assert.equal(championshipEligibility(belt("usa_champion_belt",{family:"national",eligibleNationality:"USA"}),eligible).reasonCode,"WINNER_NOT_ELIGIBLE_NATION");
  assert.equal(championshipEligibility(belt("dm-rising",{family:"elo",eloBandMax:1199}),{...eligible,rmRating:1100,dmRating:1800}).reasonCode,"ELO_NOT_ELIGIBLE");
  assert.equal(championshipEligibility(belt("dm-rising",{family:"elo",eloBandMax:1199}),{...eligible,dmRating:null}).reasonCode,"ELO_AUTHORITY_MISSING");
  assert.equal(championshipEligibility(belt("womens"),{...eligible,genderDivision:"Man"}).eligible,false);
  assert.equal(championshipEligibility(belt("usa_champion_belt",{family:"national",eligibleNationality:"USA"}),eligible,true).eligible,true);
  assert.equal(championshipEligibility(belt("world"),{representedCountry:null}).eligible,true);
});
test("six team identities require exact lane/size; Chaos remains popular-vote authority",()=>{
  for (const size of [2,3,4]) for (const mode of ["rm","dm"]) { const policy = championshipBeltPolicy(belt(`${size}v${size}-${mode}`)); assert.equal(policy.teamSize,size); assert.equal(policy.mode,mode); }
  assert.equal(championshipBeltPolicy(belt("chaos_champion")).transferPolicy,"POPULAR_VOTE");
  assert.equal(championshipEligibility(belt("chaos_champion"),eligible).eligible,false);
  assert.equal(championshipEligibility(belt("future_unknown_title"),eligible).reasonCode,"TITLE_POLICY_UNCONFIGURED");
});
test("title total splits exact integer uwolo with deterministic seat remainder",()=>{
  assert.deepEqual(splitTitleUwolo(BigInt(1000000),3),[BigInt(333334),BigInt(333333),BigInt(333333)]);
  for(const count of [2,3,4]) assert.equal(splitTitleUwolo(BigInt(9000001),count).reduce((sum,value)=>sum+value,BigInt(0)),BigInt(9000001));
});
test("a partial NFT transfer never reports complete; retry excludes confirmed or tx-backed seats",()=>{
  const seats=[{status:"confirmed",txHash:"ABC"},{status:"blocked",txHash:null},{status:"failed",txHash:"UNKNOWN_RETURN"}];
  assert.equal(championshipNftAggregate(seats,3),"partial"); assert.equal(championshipNftAggregate(seats,4),"blocked");
  assert.deepEqual(retryableChampionshipNftSeats(seats),[seats[1]]);
  assert.equal(championshipNftAggregate([{status:"confirmed",txHash:"A"},{status:"confirmed",txHash:"B"}],2),"confirmed");
});
test("actionable Championship payment SQL stays bundle-safe and fragment-free",()=>{
  const source=readFileSync(new URL("../lib/championshipChallenges.ts",import.meta.url),"utf8");
  const start=source.indexOf("export async function loadActionableChampionshipPayments");
  const end=source.indexOf("export async function commissionerChampionshipAction",start);
  assert.ok(start>=0&&end>start);
  const selector=source.slice(start,end);
  assert.doesNotMatch(selector,/Prisma\.(?:empty|sql|join)/);
  assert.match(selector,/WITH challenge_filter AS/);
  assert.match(selector,/string_to_array\(cf\.ids, ','\)::int\[\]/);
});
