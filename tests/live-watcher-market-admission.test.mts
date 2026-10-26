import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {committedLiveWatcherAdmissionIssue,LIVE_WATCHER_ADMISSION_MAX_AGE_MS} from "../lib/liveWatcherMarketAdmission.ts";
import {classifyReplayIngestReceipt,coordinateReplayPostIngest,replayPostIngestReportSucceeded} from "../lib/replayPostIngest.ts";
import {controlledOriginalLiveRow} from "./fixtures/live-watcher-market-admission.mts";
const now=new Date("2026-10-21T23:00:00.000Z");
for(const mode of ["Random Map","Deathmatch"] as const)for(const team of [false,true]){
  test(`controlled original HD LIVE ${team?"2v2":"1v1"} ${mode} has exact admission evidence`,()=>{
    assert.equal(committedLiveWatcherAdmissionIssue(controlledOriginalLiveRow({mode,team,now}),now.getTime()),null);
  });
}
test("stale, DE, unknown/custom mode, terminal and spoofed Watcher inputs cannot admit",()=>{
  for(const change of [
    {createdAt:new Date(now.getTime()-LIVE_WATCHER_ADMISSION_MAX_AGE_MS-1)},
    {played_on:new Date(now.getTime()-LIVE_WATCHER_ADMISSION_MAX_AGE_MS-1)},
    {played_on:new Date(now.getTime()+1)}, {game_version:"Version.DE"},{game_version:null},
    {game_type:"Unknown"},{game_type:"Regicide"},{is_final:true},{parse_source:"upload"},{winner:"LiveOwner"},
    {user:{uid:"spoofed-owner",steamId:"76561198000000999"}},
  ])assert.notEqual(committedLiveWatcherAdmissionIssue({...controlledOriginalLiveRow({now}),...change},now.getTime()),null);
  const base=controlledOriginalLiveRow({now});
  const events=base.key_events as Record<string,unknown>,upload=events.watcher_upload as Record<string,unknown>;
  for(const change of [{provenance_signature_verified:false},{provenance_signature_supplied:false},
    {ingestion_provenance:"historical_import"},{client_sha256_verified:false},{server_sha256:"f".repeat(64)},
    {watcher_session_id:""},{replay_fingerprint:""}]){
    assert.notEqual(committedLiveWatcherAdmissionIssue({...base,key_events:{...events,watcher_upload:{...upload,...change}}},now.getTime()),null);
  }
  assert.notEqual(committedLiveWatcherAdmissionIssue({...base,key_events:{...events,completed:true}},now.getTime()),null);
  assert.notEqual(committedLiveWatcherAdmissionIssue({...base,key_events:{...events,settings:{type:"Deathmatch"}}},now.getTime()),null);
});
test("LIVE post-ingest admission is awaited and never requests result settlement",async()=>{
  const receipt=classifyReplayIngestReceipt({game_id:42,is_final:false,finality_status:"live",parse_completed:true},true);
  const calls:string[]=[];
  const report=await coordinateReplayPostIngest({prisma:{},receipts:[receipt,receipt],source:"api_direct",dependencies:{
    admitLiveWatcherMarkets:async(_prisma,ids)=>{assert.deepEqual(ids,[42]);await Promise.resolve();calls.push("admitted");return {createdCount:2,existingCount:0,skippedCount:0};},
    ensureBetMarkets:async()=>{throw Error("LIVE cannot invoke full financial ensure");},
    reconcileTournamentMatchProofs:async()=>{throw Error("LIVE cannot invoke result tournament settlement");},
  }});
  assert.deepEqual(calls,["admitted"]);assert.equal(report.admission.liveMarkets.succeeded,true);
  assert.equal(report.financial.markets.requested,false);assert.equal(report.financial.tournament.requested,false);
  assert.equal(replayPostIngestReportSucceeded(report),true);
});
test("private ingest returns a retryable failure when awaited admission fails",async()=>{
  const report=await coordinateReplayPostIngest({prisma:{},source:"api_direct",receipts:[classifyReplayIngestReceipt({game_id:42,is_final:false,finality_status:"live"},true)],dependencies:{
    admitLiveWatcherMarkets:async()=>{throw Error("temporary database failure");},ensureBetMarkets:async()=>{},reconcileTournamentMatchProofs:async()=>{},
  }});
  assert.equal(report.admission.liveMarkets.succeeded,false);assert.equal(replayPostIngestReportSucceeded(report),false);
});
test("authenticated ingest awaits metadata admission without any GET/HTTP finance wakeup",()=>{
  for(const route of ["app/api/replay/post-ingest/route.ts","app/api/replay/upload/route.ts"]){
    const source=readFileSync(new URL("../"+route,import.meta.url),"utf8");
    assert.match(source, /await coordinateReplayPostIngest\(/);
    assert.doesNotMatch(source, /queueBetMarketEnsure|executeWolo|settleMarketIntegrityCorrections/);
  }
  const privateRoute=readFileSync(new URL("../app/api/replay/post-ingest/route.ts",import.meta.url),"utf8");
  assert.ok(privateRoute.indexOf("if (!authorized(request))")<privateRoute.indexOf("coordinateReplayPostIngest({"));
});

test("existing private recovery handles missed LIVE commits before parser work and preserves dry-run",()=>{
  const source=readFileSync(new URL("../app/api/admin/replay-auto-recovery/route.ts",import.meta.url),"utf8");
  assert.ok(source.indexOf("!authorized(request)")<source.indexOf("await recoverCommittedLiveWatcherMarkets("));
  assert.ok(source.indexOf("await recoverCommittedLiveWatcherMarkets(")<source.indexOf("await prisma.$queryRaw<"));
  assert.match(source,/recoverCommittedLiveWatcherMarkets\(prisma,\{dryRun,targetGameStatsId\}\)/);
  assert.match(source,/liveAdmission,/);
});


test("new preview admission cannot invoke financial identity promotion or repair old parent links",()=>{
  const source=readFileSync(new URL("../lib/bets.ts",import.meta.url),"utf8");
  const admission=source.split("export async function admitCommittedLiveWatcherMarkets(")[1]
    ?.split("export async function recoverCommittedLiveWatcherMarkets(")[0];
  assert.ok(admission);
  assert.doesNotMatch(admission,/reconcileWatcherMarketIdentityPromotions|betMarket\.updateMany/);
});

test("public bets GET never schedules market ensure, corrective refunds or any signer",()=>{
  const source=readFileSync(new URL("../app/api/bets/route.ts",import.meta.url),"utf8");
  assert.match(source,/export async function GET\(/);
  assert.match(source,/ensureMarkets:\s*false/);
  assert.doesNotMatch(source,/queueBetMarketEnsure|ensureBetMarkets\(|settleMarketIntegrityCorrections\(|executeWolo/);
  assert.doesNotMatch(source,/\.\$transaction\(|\.\$executeRaw/);
});

test("corrective-refund writer and existing-LIVE family admission independently check persisted finance origin",()=>{
  const source=readFileSync(new URL("../lib/bets.ts",import.meta.url),"utf8");
  const correction=source.split("export async function settleMarketIntegrityCorrections(")[1]
    ?.split("\nasync function ")[0];
  assert.ok(correction);
  assert.match(correction,/bookPhase:\s*\{\s*not:\s*"preview_only"\s*\}/);
  assert.match(correction,/adjustment\.wager\.marketId\s*!==\s*adjustment\.incident\.marketId/);
  assert.match(correction,/adjustment\.wager\.userId\s*!==\s*adjustment\.userId/);
  const admission=source.split("async function persistBetMarketSeeds(")[1]
    ?.split("async function runBetMarketEnsure(")[0];
  assert.ok(admission);
  assert.match(admission,/existing\.bookPhase\s*!==\s*"preview_only"/);
  assert.match(admission,/existing\.firstStakeAcceptedAt\s*!==\s*null/);
  assert.match(admission,/Object\.values\(existing\._count\)\.some/);
  assert.match(admission,/LIVE_MARKET_ADMISSION_FAMILY_NOT_ADMITTED/);
});

test("dual claim origins are both validated before any payout or legacy cleanup",()=>{
  const source=readFileSync(new URL("../lib/adminWoloClaims.ts",import.meta.url),"utf8");
  const retry=source.split("export async function retryPendingClaimSettlement(")[1];
  assert.ok(retry);
  assert.ok(retry.indexOf("source_attribution_conflict")<retry.indexOf("hasAmbiguousPriorWoloPayoutAttempt(claim)"));
  assert.ok(retry.indexOf('founderOrigin?.market.bookPhase === "preview_only"')<retry.indexOf("hasAmbiguousPriorWoloPayoutAttempt(claim)"));
  assert.ok(retry.indexOf("source_attribution_conflict")<retry.indexOf("executeFounderWoloPayout"));
});
