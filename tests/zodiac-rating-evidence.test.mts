import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildZodiacRatingAudit } from "../lib/zodiacRatingAudit.ts";
import type { PublicPlayerDirectory } from "../lib/publicPlayerDirectory.ts";
import type { CurrentWatcherAccountState } from "../lib/currentWatcherAccountState.ts";
import type { VerifiedWatcherSteamRating } from "../lib/verifiedWatcherSteamRatings.ts";

const ids = ["76561198103810510","76561199849204394","76561198754754435"];
const gameEvidence = [
  {gameStatsId:9871,gameMode:"dm",observedName:"Zodiac",normalizedName:"zodiac",
   observedAt:"2026-10-09T12:00:00.000Z",ratingObservedAt:"2026-10-09T12:00:00.000Z",
   acceptedAt:"2026-10-09T13:00:00.000Z",result:"unknown",steamDmRating:2200,steamRmRating:null},
  {gameStatsId:9872,gameMode:"dm",observedName:"Zodiac",normalizedName:"zodiac",
   observedAt:"2026-10-09T13:00:00.000Z",ratingObservedAt:"2026-10-09T13:00:00.000Z",
   acceptedAt:"2026-10-09T14:00:00.000Z",result:"loss",steamDmRating:2210,steamRmRating:null},
];
const directory = {
  allEntries: ids.map((steamId,index)=>({
    key:"steam:"+steamId,steamId,name:["Zodiac","mYsTikaL_VeGeTa","mYsTikaL JiReN"][index],
    nameHistory: index===0 ? [{name:"Zodiac"},{name:"Earlier Zodiac"},{name:"Other Zodiac"}] : [],
    totalMatches:index===0?801:index===1?399:294,
    wins:100,losses:50,unknowns:index===0?60:23,
    lastPlayedAt:"2026-10-09T13:00:00.000Z",
    steamDmRating:index===0?2355:index===1?2328:2244,steamRmRating:null,
    replayEvidence:index===0?gameEvidence:[],
  })),
} as unknown as PublicPlayerDirectory;

const receipt = [{
  steamId:ids[0],latestObservedName:"Zodiac",nameObservedAt:null,
  steamRmRating:null,steamRmObservedAt:null,steamDmRating:2355,
  steamDmObservedAt:"2026-10-10T09:10:00.000Z",
  ratingObservedAt:"2026-10-10T09:10:00.000Z",
  lastObservedAt:"2026-10-10T09:10:00.000Z",
}] as CurrentWatcherAccountState[];
const qualified = [{
  steamId:ids[0],steamRmRating:null,steamRmObservedAt:null,
  steamDmRating:2390,steamDmObservedAt:"2026-10-09T16:00:00.000Z",
}] as VerifiedWatcherSteamRating[];

test("Zodiac trio remains three exact Steam IDs; three names on one Steam account never merge three accounts", () => {
  const audit=buildZodiacRatingAudit(directory,receipt,qualified);
  assert.equal(audit.readOnly,true);
  assert.deepEqual(audit.players.map(x=>x.steamId),ids);
  assert.deepEqual(audit.players.map(x=>x.counts.unresolved),[60,23,23]);
  assert.deepEqual(audit.players[0].aliases,["Zodiac","Earlier Zodiac","Other Zodiac"]);
  assert.deepEqual(audit.players[0].counts.sampleUnresolvedGameIds,[9871]);
});
test("newer authenticated Watcher receipt beats older higher signed upload and older HD header", () => {
  const p=buildZodiacRatingAudit(directory,receipt,qualified).players[0];
  assert.equal(p.dm.rating,2355);
  assert.equal(p.dm.observedAt,"2026-10-10T09:10:00.000Z");
  assert.equal(p.dm.source,"watcher_current_receipt");
  assert.equal(p.dm.qualifiedWatcherUpload.rating,2390);
  assert.equal(p.dm.historicalHeader.rating,2210);
  assert.equal(p.dm.differsFromDirectory,false);
});
test("qualifying uploaded Watcher snapshot wins if it is later than receipt, without invented W/L", () => {
  const current=receipt.map(x=>({...x,steamDmObservedAt:"2026-10-08T13:00:00.000Z"}));
  const p=buildZodiacRatingAudit(directory,current,qualified).players[0];
  assert.equal(p.dm.rating,2390);
  assert.equal(p.dm.source,"watcher_qualified_upload");
  assert.equal(p.dm.differsFromDirectory,true);
  assert.equal(p.counts.unresolved,60);
});
test("missing dated Watcher values fall back to dated HD evidence; missing Steam accounts stay unqualified", () => {
  const audit=buildZodiacRatingAudit(directory,[],[]);
  assert.equal(audit.players[0].dm.rating,2210);
  assert.equal(audit.players[0].dm.source,"accepted_hd_header");
  assert.equal(audit.players[1].dm.rating,null);
  assert.equal(audit.players[1].dm.source,"unavailable");
});
test("rating audit endpoint is admin-only and cannot adjudicate games or touch WOLO", () => {
  const api=readFileSync("app/api/admin/replay-operations/zodiac-rating-audit/route.ts","utf8");
  const ui=readFileSync("components/admin/PlayerResultRecovery.tsx","utf8");
  assert.match(api,/await requireAdmin\(request\)/);
  assert.match(api,/loadCurrentWatcherAccountStates\(gate\.prisma\)/);
  assert.match(api,/loadVerifiedWatcherSteamRatings\(gate\.prisma\)/);
  assert.doesNotMatch(api,/\.(create|upsert|update|delete|executeRaw)\(/);
  assert.match(ui,/Audit Zodiac ratings/);
  assert.match(ui,/rating\.observedAt/);
  assert.match(ui,/sampleUnresolvedGameIds/);
});
