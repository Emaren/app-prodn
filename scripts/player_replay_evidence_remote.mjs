import {createHash} from 'node:crypto';
import {readFileSync,existsSync,readdirSync,statSync,realpathSync} from 'node:fs';
import {resolve,relative,isAbsolute} from 'node:path';
import {gunzipSync} from 'node:zlib';
import {getPrisma} from '@/lib/prisma';
import {HD_REPLAY_PARSER_CONTRACT} from '@/lib/replayEngineRoom';
import {planTargetedReplayRosterRecovery} from '@/lib/targetedReplayRosterRecovery';
const targets = []; // injected exact scope
const hash=b=>createHash('sha256').update(b).digest('hex');
const current=r=>['parserName','parserVersion','passName','passVersion','schemaVersion'].every(k=>r[k]===HD_REPLAY_PARSER_CONTRACT[k]);
function compactCandidate(c) {
 const projection=c.projection??{};const k=projection.key_events??{};const t=c.evidence?.terminal??{};
 const f=t.framing??{};
 return {artifact:c.artifact,parser:c.parser,run:c.run,candidate:c.candidate,
 projection:{winner:projection.winner,players:projection.players,parse_reason:projection.parse_reason,disconnect_detected:projection.disconnect_detected,event_types:projection.event_types,key_events:{team_resolution:k.team_resolution,result_resolution:k.result_resolution,resigned_player_names:k.resigned_player_names,resigned_player_numbers:k.resigned_player_numbers,resignations:k.resignations,result_evidence:k.result_evidence,hd_metadata:k.hd_metadata}},
 terminal:{artifact:t.artifact,parser:t.parser,authority_scope:t.authority_scope,candidate_result:t.candidate_result,terminal_state:t.terminal_state,resignations:t.resignations,postgames:t.postgames,saved_chapters:t.saved_chapters,diplomacy_commands:t.diplomacy_commands,framing:{...f,terminal_packets:(f.terminal_packets??[]).slice(-20)}},
 evidenceKeys:Object.keys(c.evidence??{}),projectionKeyEventKeys:Object.keys(k)};
}
const p=getPrisma();
try {
 const modes=await p.$queryRawUnsafe("SELECT current_setting('transaction_read_only') AS transaction_mode,current_setting('default_transaction_read_only') AS default_mode");
 if(modes[0].transaction_mode!=='on'||modes[0].default_mode!=='on')throw Error('read-only required');
 const result=await p.$transaction(async tx=>{
 const ids=[...new Set([...targets.ids,...targets.controls])];
 const games=await tx.gameStats.findMany({where:{id:{in:ids}},orderBy:{id:'asc'}});
 if (targets.bindings && games.some(g=>targets.bindings[String(g.id)]!==g.replayHash)) throw Error("baseline game/source drift");
 if (games.length!==ids.length) throw Error("baseline game missing");
 const hashes=[...new Set(games.map(g=>g.replayHash))];
 const runs=await tx.replayParseRun.findMany({where:{inputHash:{in:hashes}},orderBy:{id:'desc'}});
 const evidence=games.map(g=>{
  const dir=`/mnt/HC_Volume_105319120/aoe2-replay-archive/${g.replayHash.slice(0,2)}/${g.replayHash.slice(2,4)}`;
  const paths=existsSync(dir)?readdirSync(dir).filter(n=>n.startsWith(g.replayHash+'.')).map(n=>dir+'/'+n):[];
  const archive=paths.map(path=>({path,bytes:statSync(path).size,sha256:hash(readFileSync(path))}));
  const exact=runs.filter(r=>r.inputHash===g.replayHash&&current(r));
  const r=exact.find(r=>['completed','recovered'].includes(r.status))??exact[0]??null;
  let candidate=null,error=null,output=null;
  if(r?.candidateOutputStorageKey){
   const path=r.candidateOutputStorageKey;
   const root='/mnt/HC_Volume_105319120/aoe2-parser-engine';
   const resolved=resolve(path);const rel=relative(root,resolved);
   if(isAbsolute(rel)||rel.startsWith('..')||resolved!==path)error='candidate_path_outside_canonical_root';
   else if(!existsSync(path))error='candidate_output_missing';
   else if(realpathSync(path)!==path)error='candidate_symlink_rejected';
   else {const b=readFileSync(path);output={path,sha256:hash(b),expectedSha256:r.candidateOutputHash,bytes:b.length,expectedBytes:String(r.candidateOutputByteSize)};
    if(output.sha256!==r.candidateOutputHash||String(b.length)!==String(r.candidateOutputByteSize))error='candidate_stored_gzip_hash_or_size_mismatch';
    else {try{candidate=JSON.parse(gunzipSync(b))}catch(e){error='candidate_decode_failed:'+e.message}}
   }
  }
  const archiveBlockers=archive.length===0?['source_archive_missing']:archive.some(a=>a.sha256!==g.replayHash)?['source_archive_hash_mismatch']:[];
  if(candidate?.artifact?.sha256!==g.replayHash&&candidate)error='candidate_artifact_hash_mismatch';
  if(candidate && Object.entries({implementation:'parserName',implementation_version:'parserVersion',schema_version:'schemaVersion',pass_name:'passName',pass_version:'passVersion'}).some(([inner,outer])=>candidate.parser?.[inner]!==HD_REPLAY_PARSER_CONTRACT[outer]))error='candidate_parser_contract_mismatch';
  if(candidate && (candidate.candidate?.promotion_status!=='candidate_only'||candidate.candidate?.changes_effective_truth!==false))error='candidate_authority_escalation';
  return {archiveBlockers,gameStatsId:g.id,replayHash:g.replayHash,control:targets.controls.includes(g.id),archive,run:r,output,error,candidate:candidate?compactCandidate(candidate):null};
 });
 const rosterPlans=[];
 for(const id of targets.rosterIds)rosterPlans.push({gameStatsId:id,plan:await planTargetedReplayRosterRecovery(tx,id)});
 return {observedAt:new Date().toISOString(),productionSource:process.env.AOE2WAR_TRUTH_PRODUCTION_SOURCE,readOnly:modes,parserContract:HD_REPLAY_PARSER_CONTRACT,evidence,rosterPlans};
 },{isolationLevel:'RepeatableRead',timeout:120000,maxWait:5000});
 process.stdout.write(JSON.stringify(result,(_,v)=>typeof v==='bigint'?String(v):v));
}finally{await p.$disconnect()}
