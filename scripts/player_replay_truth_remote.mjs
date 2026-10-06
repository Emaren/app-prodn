import {createHash} from 'node:crypto';
import {existsSync,readFileSync,statSync,readdirSync} from 'node:fs';
import {getPrisma} from '@/lib/prisma';
import {applyReplayAdjudicationToGameStats,EFFECTIVE_REPLAY_RESULT_ADJUDICATION_RELATION} from '@/lib/replayAdjudications';
import {cleanPublicGameRows,publicReplayIdentity,publicReplayWinnerTruth} from '@/lib/publicReplayTruth';
import {isPublicBattleArchiveRow} from '@/lib/publicBattleArchiveEligibility';
import {publicReplayRosterV2DisplayState} from '@/lib/publicReplayRosterV2';
import {resolveReplayResultForPlayer} from '@/lib/replayPlayerResult';
import {normalizeReplayPlayers} from '@/lib/teamResolution';
import {buildClaimedPublicPlayerRef,buildReplayPublicPlayerRef,publicPlayerMatchesReplayParticipant} from '@/lib/publicPlayers';
import {readLeaderboardSteamId} from '@/lib/leaderboardIdentity';
import {HD_REPLAY_PARSER_CONTRACT} from '@/lib/replayEngineRoom';
import {loadCurrentWatcherAccountStates} from '@/lib/currentWatcherAccountState';
const p=getPrisma();
const norm=x=>String(x??'').trim().replace(/\s+/g,' ').toLowerCase();
const sha=b=>createHash('sha256').update(b).digest('hex');
const current=r=>['parserName','parserVersion','passName','passVersion','schemaVersion'].every(k=>r[k]===HD_REPLAY_PARSER_CONTRACT[k]);
const targets = []; // injected exact scope
if (!targets.length) throw Error("exact player scope required");
try {
const mode=await p.$queryRawUnsafe("SELECT current_setting('transaction_read_only') AS transaction_mode,current_setting('default_transaction_read_only') AS default_mode");
if(mode[0]?.transaction_mode!=='on'||mode[0]?.default_mode!=='on')throw Error('read-only required');
const data=await p.$transaction(async tx=>{
const users=await tx.user.findMany({select:{id:true,uid:true,inGameName:true,steamPersonaName:true,steamId:true,verified:true,verificationLevel:true,lockName:true}});
const acceptedSeedSnapshots=await tx.replayPlayerSnapshot.findMany({where:{normalizedName:{in:targets.map(t=>norm(t.name))},exact:true,projection:{projectionStatus:'accepted',affectsPublicAggregates:true,supersededBy:null}},select:{steamId:true,normalizedName:true,gameStatsId:true,provenance:true,playerKey:true}});
const all=await tx.gameStats.findMany({where:{is_final:true},orderBy:{id:'asc'},select:{id:true,userUid:true,replayHash:true,replay_file:true,original_filename:true,createdAt:true,played_on:true,timestamp:true,winner:true,players:true,map:true,key_events:true,event_types:true,parse_reason:true,parse_source:true,parse_iteration:true,is_final:true,disconnect_detected:true,duration:true,game_duration:true,replayResultAdjudications:EFFECTIVE_REPLAY_RESULT_ADJUDICATION_RELATION}});
const effective=all.map(applyReplayAdjudicationToGameStats);
const logical=cleanPublicGameRows(effective.filter(isPublicBattleArchiveRow),{includeReview:true,includeLive:false});
const coherent=g=>{const vs=normalizeReplayPlayers(g.players);const rs=vs.map(v=>resolveReplayResultForPlayer(g,x=>x.stablePlayerKey===v.stablePlayerKey));return vs.length>=2&&!rs.includes('unknown')&&rs.includes('win')&&rs.includes('loss')&&Boolean(publicReplayWinnerTruth(g).winner)};
const full=logical.filter(g=>coherent(g)&&publicReplayRosterV2DisplayState(g.players).complete).length;
const activeCurrentStates=await loadCurrentWatcherAccountStates(tx);
const identities=targets.map(t=>{
 const matched=users.filter(u=>t.uid?u.uid===t.uid:[u.inGameName,u.steamPersonaName].some(n=>norm(n)===norm(t.name)));
 const direct=[...new Set(all.flatMap(g=>normalizeReplayPlayers(g.players).filter(v=>norm(v.name)===norm(t.name)).map(readLeaderboardSteamId).filter(Boolean)))];
 let u=matched.length===1?matched[0]:null;
 const accepted=[...new Set(acceptedSeedSnapshots.filter(v=>v.normalizedName===norm(t.name)).map(v=>v.steamId).filter(v=>typeof v==='string'&&/^\d{17}$/.test(v)))];
 const steamIds=u?.steamId?[u.steamId]:accepted;
 const identityEvidence=u?.steamId?'registered_user_exact_steam':accepted.length===1?'accepted_exact_replay_snapshots':'unresolved_name_identity';
 const knownAccounts=users.filter(v=>v.steamId&&steamIds.includes(v.steamId));
 if(!u&&knownAccounts.length===1)u=knownAccounts[0];
 const ambiguous=steamIds.length!==1;
 const ref=u?buildClaimedPublicPlayerRef(u):buildReplayPublicPlayerRef(t.name);
 const match=v=>!ambiguous?readLeaderboardSteamId(v)===steamIds[0]:publicPlayerMatchesReplayParticipant(ref,v);
 return {...t,accountMatches:matched,knownAccounts,steamIds,rawObservedSteamIds:direct,identityEvidence,identityAmbiguous:ambiguous,ref,match};
});
const steamIds=[...new Set(identities.flatMap(i=>i.steamIds))];
const relatedNonfinal=await tx.$queryRawUnsafe(`SELECT g.id,g.user_uid AS "userUid",g.replay_hash AS "replayHash",g.players,g.winner,g.parse_source,g.parse_reason,g.parse_iteration,g.is_final,g.disconnect_detected,g.key_events,g.event_types,g.replay_file,g.original_filename,g.played_on,g.timestamp,g.created_at AS "createdAt",g.map FROM game_stats g WHERE NOT g.is_final AND EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(g.players::jsonb)='array' THEN g.players::jsonb ELSE '[]'::jsonb END) v WHERE COALESCE(v->>'steam_id',v->>'steamId',v->>'user_id')=ANY($1::text[]) OR lower(regexp_replace(btrim(v->>'name'),'\\s+',' ','g'))=ANY($2::text[])) ORDER BY g.id`,steamIds,targets.map(t=>norm(t.name)));
const scoped=[...effective,...relatedNonfinal].filter(g=>identities.some(i=>normalizeReplayPlayers(g.players).some(v=>i.match(v)||norm(v.name)===norm(i.name))));
const ids=scoped.map(g=>g.id),hashes=[...new Set(scoped.map(g=>g.replayHash))];
const aliases=await tx.playerIdentityAlias.findMany({where:{OR:[{steamId:{in:steamIds}},{observedNormalizedName:{in:targets.map(t=>norm(t.name))}}]}});
const platforms=await tx.platformAccount.findMany({where:{platform:'steam',externalAccountId:{in:steamIds}},include:{seedWarrior:true,warriorLinks:true,nameObservations:true}});
const snapshots=await tx.replayPlayerSnapshot.findMany({where:{OR:[{steamId:{in:steamIds}},{normalizedName:{in:targets.map(t=>norm(t.name))}}]},include:{projection:true,identityProjections:true}});
const publications=await tx.identityProjectionPublication.findMany({orderBy:{id:'desc'},take:10});
const runs=await tx.replayParseRun.findMany({where:{inputHash:{in:hashes}},orderBy:{id:'asc'}});
const attempts=await tx.replayParseAttempt.findMany({where:{gameStatsId:{in:ids}},orderBy:{id:'asc'},select:{id:true,gameStatsId:true,replayHash:true,userUid:true,parseSource:true,status:true,uploadMode:true,detail:true,createdAt:true,evidence:true}});
const archives=hashes.map(h=>{
 const dir=`/mnt/HC_Volume_105319120/aoe2-replay-archive/${h.slice(0,2)}/${h.slice(2,4)}`;
 const files=existsSync(dir)?readdirSync(dir).filter(n=>n.startsWith(h+'.')).map(n=>dir+'/'+n):[];
 return {sha256:h,files:files.map(path=>({path,bytes:statSync(path).size,verification:"presence_only"})),exists:files.length>0};
});
const players=identities.map(i=>{
 const ownRows=scoped.filter(g=>normalizeReplayPlayers(g.players).some(i.match));
 const ownLogical=logical.filter(g=>normalizeReplayPlayers(g.players).some(i.match));
 const cases=ownLogical.map(g=>{
 const result=resolveReplayResultForPlayer(g,i.match);
 const roster=publicReplayRosterV2DisplayState(g.players);
 const related=ownRows.filter(r=>publicReplayIdentity(r)===publicReplayIdentity(g));
 const ownRuns=runs.filter(r=>related.some(a=>a.replayHash===r.inputHash));
 const exact=ownRuns.filter(current);
 const rawReasons=[...new Set(related.map(r=>r.parse_reason))];
 const blockers=[];
 if(result==='unknown')blockers.push('unknown_result');
 if(result!=='unknown'&&!coherent(g))blockers.push('participant_result_disagreement');
 if(!roster.complete)blockers.push('roster_incomplete:'+roster.reason);
 if(g.disconnect_detected)blockers.push('disconnected/review');
 if(!exact.some(r=>['completed','recovered'].includes(r.status)))blockers.push(exact.length?'parser_incomplete':'stale_or_missing_current_parser');
 if(i.identityAmbiguous)blockers.push('identity_ambiguity');
 return {logicalBattleId:publicReplayIdentity(g),id:g.id,replayHash:g.replayHash,sourceIds:related.map(r=>r.id),sourceHashes:related.map(r=>r.replayHash),result,roster,fullBattleTruth:coherent(g)&&result!=='unknown'&&roster.complete,blockers,rawReasons,players:g.players};
 });
 const aliasKeys=new Set(ownRows.flatMap(g=>normalizeReplayPlayers(g.players).filter(i.match).map(v=>norm(v.name))));
 const aliasIdentityCandidates=effective.filter(g=>!ownRows.includes(g)&&normalizeReplayPlayers(g.players).some(v=>aliasKeys.has(norm(v.name)))).map(g=>({id:g.id,replayHash:g.replayHash,logicalBattleId:publicReplayIdentity(g),reason:'alias_without_exact_target_steam_identity',participants:normalizeReplayPlayers(g.players).filter(v=>aliasKeys.has(norm(v.name))).map(v=>({name:v.name,steamId:readLeaderboardSteamId(v)}))}));
 const unknown=cases.filter(c=>!c.fullBattleTruth);
 return {name:i.name,uid:i.uid??i.accountMatches[0]?.uid??null,accountMatches:i.accountMatches,knownAccounts:i.knownAccounts,steamIds:i.steamIds,rawObservedSteamIds:i.rawObservedSteamIds,identityEvidence:i.identityEvidence,identityAmbiguous:i.identityAmbiguous,aliasIdentityCandidates,aliases:[...new Set(ownRows.flatMap(g=>normalizeReplayPlayers(g.players).filter(i.match).map(v=>v.name)))].sort(),total:cases.length,resolved:cases.length-unknown.length,resultResolved:cases.filter(c=>c.result!=='unknown').length,unknown:unknown.length,unknownPercentage:cases.length?100*unknown.length/cases.length:0,sourceRowCount:ownRows.length,nonfinalRows:ownRows.filter(g=>!g.is_final).map(g=>g.id),nameOnlyRows:scoped.filter(g=>!ownRows.includes(g)&&normalizeReplayPlayers(g.players).some(v=>norm(v.name)===norm(i.name))).map(g=>g.id),blockerCounts:Object.fromEntries([...new Set(unknown.flatMap(c=>c.blockers))].sort().map(k=>[k,unknown.filter(c=>c.blockers.includes(k)).length])),rawBlockerCounts:Object.fromEntries([...new Set(unknown.flatMap(c=>c.rawReasons))].sort().map(k=>[k,unknown.filter(c=>c.rawReasons.includes(k)).length])),cases};
});
return {observedAt:new Date().toISOString(),productionSource:process.env.AOE2WAR_TRUTH_PRODUCTION_SOURCE,databaseReadOnly:mode,parserContract:HD_REPLAY_PARSER_CONTRACT,mutations:{production:0,parserRows:0,identityRows:0,currentRatingRows:0,wolo:0},grain:'canonical public archive logical battles; unknown means result unknown OR Workshop V2 roster incomplete',global:{fullBattleTruthNumerator:full,denominator:logical.length,percentage:100*full/logical.length,finalRowCount:all.filter(g=>g.is_final).length},players,identities:{aliases,platforms,snapshots,publications},sourceGames:scoped,runs,attempts,archives,currentWatcherAccountStates:activeCurrentStates.filter(s=>identities.some(i=>i.steamIds.includes(s.steamId)))};
},{isolationLevel:'RepeatableRead',timeout:120000,maxWait:5000});
process.stdout.write(JSON.stringify(data,(_,v)=>typeof v==='bigint'?String(v):v));
}finally{await p.$disconnect()}
