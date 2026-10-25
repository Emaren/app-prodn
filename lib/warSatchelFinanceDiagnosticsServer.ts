/** Server-owned READS only. Reuses the private Operator Bridge state directory,
 * native bounded body reader and current Satchel SQL buckets. No cache write,
 * migration, signer, receipt mutation, transaction retry or financial endpoint.
 */
import { constants } from "node:fs";
import { open,lstat,realpath } from "node:fs/promises";
import path from "node:path";
import { readWarSatchelBoundedUtf8 } from "./warSatchelBoundedBody.ts";
import { diagnoseSatchelFinance,type FinanceCensus,type FinanceEvidence } from "./warSatchelFinanceDiagnostics.ts";

const MAX_JSON=1024*1024,MAX_READS=64;
const RPC="http://127.0.0.1:27657/status";
type Json=Record<string,unknown>;
const record=(v:unknown):Json=>v!==null&&typeof v==="object"&&!Array.isArray(v)?v as Json:{};
function fail():never{throw Error("FINANCE_OBSERVATION_SOURCE_UNAVAILABLE");}

/** Existing private ops writers use JSON.stringify(...,null,2)+newline.
 * Requiring this form also refuses duplicate keys, nonfinite numbers and
 * truncated publications rather than accepting the last attacker value. */
export function parseFinanceObservationJson(raw:string,prettyOnly=false):Json{
 if(Buffer.byteLength(raw,"utf8")>MAX_JSON)fail();
 const value:unknown=JSON.parse(raw);if(value===null||typeof value!=="object"||Array.isArray(value))fail();
 const normalized=raw.trim();
 if(normalized!==JSON.stringify(value,null,2)&&(prettyOnly||normalized!==JSON.stringify(value)))fail();
 return value as Json;
}

/** No file content is returned to admin callers. Pin regular, owner-controlled
 * state files and detect rename/truncation/replacement during each read. */
export async function readPrivateFinanceOpsJson(root:string,name:"bridge.json"|"kingdom-intelligence.json"):Promise<Json>{
 if(!path.isAbsolute(root)||path.normalize(root)!==root)fail();
 const resolved=await realpath(root);if(resolved!==root)fail();
 const folder=path.join(root,"state"),file=path.join(folder,name);
 for(const p of [root,folder]){
  const m=await lstat(p);if(!m.isDirectory()||m.isSymbolicLink()||m.mode&0o022||m.uid!==process.getuid?.())fail();
 }
 const handle=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{
  const before=await handle.stat();
  if(!before.isFile()||before.uid!==process.getuid?.()||before.mode&0o022||before.size<=0||before.size>MAX_JSON)fail();
  const chunks:Buffer[]=[];let size=0;
  for(let i=0;i<MAX_READS;i++){
   const buf=Buffer.alloc(32768);const {bytesRead}=await handle.read(buf,0,buf.length,null);
   if(bytesRead===0)break;size+=bytesRead;if(size>MAX_JSON)fail();chunks.push(buf.subarray(0,bytesRead));
   if(i===MAX_READS-1)fail();
  }
  const after=await handle.stat(),current=await lstat(file);
  const same=(a:typeof before,b:typeof before)=>a.dev===b.dev&&a.ino===b.ino&&a.size===b.size&&a.mtimeMs===b.mtimeMs&&a.ctimeMs===b.ctimeMs&&a.uid===b.uid&&a.mode===b.mode;
  if(size!==before.size||!same(before,after)||!same(after,current)||current.isSymbolicLink())fail();
  const text=new TextDecoder("utf-8",{fatal:true}).decode(Buffer.concat(chunks));
  return parseFinanceObservationJson(text,true);
 }finally{await handle.close();}
}

/** Consume existing Bridge envelope, not request-supplied status/authority.
 * A private publisher can report observations; it cannot certify custody.
 * Optional finance field is a bounded namespace for existing read-only sensors.
 */
export function financeEvidenceFromOps(bridge:Json,intelligence:Json,nowMs:number):{evidence?:FinanceEvidence;publisherConflict:boolean}{
 const publisher=bridge.bridgeId,generated=intelligence.generatedAt,received=intelligence.receivedAt;
 if(typeof publisher!=="string"||!/^[A-Za-z0-9_.:-]{1,100}$/.test(publisher))return {publisherConflict:false};
 if(intelligence.bridgeId!==publisher)return {publisherConflict:true};
 const dates=[bridge.lastSeenAt,generated,received].map(x=>typeof x==="string"&&/Z$/.test(x)?Date.parse(x):NaN);
 if(dates.some(n=>!Number.isFinite(n)||n>nowMs+5000||nowMs-n>120000)||dates[1]>dates[2]+5000)return {publisherConflict:false};
 const payload=record(intelligence.payload),source=record(payload.source),local=record(source.local),production=record(source.production);
 const github=record(source.github),certification=record(source.certification),finance=record(payload.satchelFinanceObservations),storage=record(payload.storage);
 const evidence:FinanceEvidence={observedAt:generated as string,sourceSha:String(local.head??""),publisher,
  build:{expectedSource:String(github.main_sha??""),runningSource:String(production.source_sha??""),
   expectedBuild:String(certification.active_build_id??""),runningBuild:String(production.active_build_id??"")},
  writerRoster:finance.writerRoster as FinanceEvidence["writerRoster"],signerRoles:finance.signerRoles as FinanceEvidence["signerRoles"],
  backup:finance.backup as FinanceEvidence["backup"],recovery:finance.recovery as FinanceEvidence["recovery"],
  storage:{rootFreeBytes:storage.root_free_bytes as number,volumeFreeBytes:storage.volume_free_bytes as number,volumeUsedPercent:storage.volume_used_percent as number},
 };
 return {evidence,publisherConflict:false};
}

/** Fixed SELECT over the nine-migration candidate's own tables. This is a
 * scoped local book census, never a complete legacy/external liability total.
 * FULL JOIN checks every owner, so offsetting cross-owner errors cannot cancel.
 * Historical committed funds have left the vault and are excluded from vault
 * liabilities; all journal buckets still participate in owner conservation.
 */
export const SATCHEL_FINANCE_CENSUS_SQL=`
WITH balances AS (
 SELECT owner_user_id,available_uwolo,reserved_uwolo,committed_uwolo,withdrawal_pending_uwolo
 FROM war_satchel_funded_balances
), journal AS (
 SELECT owner_user_id,sum(delta_available_uwolo) a,sum(delta_reserved_uwolo) r,
 sum(delta_committed_uwolo) c,sum(delta_withdrawal_pending_uwolo) w
 FROM war_satchel_funded_journal GROUP BY owner_user_id
), mismatches AS (
 SELECT 1 FROM balances b FULL JOIN journal j USING(owner_user_id)
 WHERE b.owner_user_id IS NULL OR coalesce(b.available_uwolo,0)<>coalesce(j.a,0) OR coalesce(b.reserved_uwolo,0)<>coalesce(j.r,0)
 OR coalesce(b.committed_uwolo,0)<>coalesce(j.c,0) OR coalesce(b.withdrawal_pending_uwolo,0)<>coalesce(j.w,0)
)
SELECT jsonb_build_object(
 'observedAt',to_char(transaction_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
 'availableUwolo',(SELECT coalesce(sum(available_uwolo),0)::text FROM balances),
 'reservedUwolo',(SELECT coalesce(sum(reserved_uwolo),0)::text FROM balances),
 'withdrawalPendingUwolo',(SELECT coalesce(sum(withdrawal_pending_uwolo),0)::text FROM balances),
 'ownerMismatchCount',(SELECT count(*) FROM mismatches),
 'negativeBucketCount',(SELECT count(*) FROM balances WHERE available_uwolo<0 OR reserved_uwolo<0 OR committed_uwolo<0 OR withdrawal_pending_uwolo<0),
 'unknownReservations',(SELECT count(*) FROM war_satchel_funded_reservations WHERE status='unknown_hold'),
 'unknownWithdrawals',(SELECT count(*) FROM war_satchel_funded_withdrawals WHERE status='unknown_hold'),
 'frozenReservations',(SELECT count(*) FROM war_satchel_funded_reservations WHERE status IN ('reserved','unknown_hold') AND updated_at<transaction_timestamp()-interval '5 minutes'),
 'pendingWithdrawals',(SELECT count(*) FROM war_satchel_funded_withdrawals WHERE status NOT IN ('sent','cancelled')),
 'pendingRefunds',(SELECT count(*) FROM war_satchel_claim_return_authorizations a LEFT JOIN war_satchel_funded_claim_returns r ON r.claim_id=a.claim_id WHERE a.claim_kind='bet_refund' AND r.id IS NULL),
 'orphanCandidates',(SELECT count(*) FROM war_satchel_proof_candidates p LEFT JOIN war_satchel_funded_receipts r ON r.proof_candidate_id=p.id WHERE r.id IS NULL),
 'lastWatcherAt',(SELECT to_char(max(created_at) AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') FROM watcher_client_events),
 'lastReceiptAt',(SELECT to_char(max(created_at) AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') FROM war_satchel_funded_receipts)
) AS census`;

type CensusTransaction={
 $executeRawUnsafe:(sql:string)=>Promise<unknown>;
 $queryRawUnsafe:(sql:string)=>Promise<unknown>;
};
export type FinanceCensusDatabase={
 $transaction:<T>(action:(tx:CensusTransaction)=>Promise<T>,options:{isolationLevel:"RepeatableRead";maxWait:number;timeout:number})=>Promise<T>;
};
export async function readSatchelFinanceCensus(database:FinanceCensusDatabase):Promise<FinanceCensus>{
 return database.$transaction(async tx=>{
  // Transaction settings only; no UPDATE/INSERT, leases, row locks or writes.
  await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
  await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '2500ms'");
  const result=await tx.$queryRawUnsafe(SATCHEL_FINANCE_CENSUS_SQL);
  if(!Array.isArray(result)||result.length!==1)fail();
  const census=record(result[0]).census;if(census===null||typeof census!=="object"||Array.isArray(census))fail();
  return census as FinanceCensus;
 },{isolationLevel:"RepeatableRead",maxWait:500,timeout:3500});
}

/** One exact safe READ, at most one read retry; no user endpoints or tokens.
 * Stream, timeout, redirects, bytes, chunks and cancellation are bounded. */
export async function readFinanceChainHead(reader:typeof fetch=fetch,canceled?:AbortSignal,now:()=>number=Date.now){
 for(let attempt=0;attempt<2;attempt++){
  if(canceled?.aborted)break;
  const controller=new AbortController();const signal=AbortSignal.any([controller.signal,...(canceled?[canceled]:[])]);
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{
   const work=(async()=>{
    const response=await reader(RPC,{method:"GET",cache:"no-store",redirect:"error",signal,headers:{Accept:"application/json"}});
    if(response.status!==200)fail();
    const body=response.body?.pipeThrough(new TransformStream<Uint8Array,Uint8Array>(),{signal})??null;
    const raw=await readWarSatchelBoundedUtf8(body,65536);if(!raw)fail();
    const d=parseFinanceObservationJson(raw),result=record(d.result),node=record(result.node_info),sync=record(result.sync_info);
    if(signal.aborted)fail();
    return {observedAt:new Date(now()).toISOString(),chainId:node.network,height:sync.latest_block_height,blockAt:sync.latest_block_time,catchingUp:sync.catching_up};
   })();
   const timeout=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error("FINANCE_READ_TIMEOUT"));},1400);});
   return await Promise.race([work,timeout]);
  }catch{if(canceled?.aborted)break;}
  finally{if(timer)clearTimeout(timer);controller.abort();}
 }
 fail();
}

let collectors=0;
export async function collectSatchelFinanceDiagnostics(options:{
 storeRoot?:string;database?:FinanceCensusDatabase;reader?:typeof fetch;now?:()=>number;
 canceled?:AbortSignal;
}={}){
 const now=options.now??Date.now,started=now();
 if(collectors>=2||options.canceled?.aborted)return diagnoseSatchelFinance({nowMs:now(),collectionStartedAtMs:started,
  failureCode:options.canceled?.aborted?"CANCELED":"COLLECTOR_CAPACITY_HELD"});
 collectors++;
 const abort=new AbortController();const canceled=AbortSignal.any([abort.signal,...(options.canceled?[options.canceled]:[])]);
 const root=options.storeRoot??process.env.AOE2WAR_OS_STORE_DIR?.trim()??(process.env.NODE_ENV==="production"?
  "/mnt/HC_Volume_105319120/aoe2war/os-control":path.join(process.cwd(),"storage","aoe2war-os"));
 const ops=Promise.all([readPrivateFinanceOpsJson(root,"bridge.json"),readPrivateFinanceOpsJson(root,"kingdom-intelligence.json")])
  .then(async ([bridge,intelligence])=>{
   // Recheck the publisher/generation after I/O; never blend two publications.
   const [current,currentIntelligence]=await Promise.all([readPrivateFinanceOpsJson(root,"bridge.json"),readPrivateFinanceOpsJson(root,"kingdom-intelligence.json")]);
   const state=financeEvidenceFromOps(bridge,intelligence,now());
   return current.bridgeId===bridge.bridgeId&&JSON.stringify(currentIntelligence)===JSON.stringify(intelligence)?state:{publisherConflict:true};
  });
 const census=options.database?readSatchelFinanceCensus(options.database):Promise.resolve(undefined);
 const chain=readFinanceChainHead(options.reader??fetch,canceled,now);
 const work=Promise.allSettled([ops,census,chain]);
 // Keep the resource slot until underlying reads really end, even if a broken
 // test/future adapter ignores cancellation. No timeout permits unbounded work.
 void work.then(()=>{collectors--;});
 let timer:ReturnType<typeof setTimeout>|undefined;
 const timeout=new Promise<null>(resolve=>{timer=setTimeout(()=>{abort.abort();resolve(null);},5500);});
 const result=await Promise.race([work,timeout]);if(timer)clearTimeout(timer);
 if(!result)return diagnoseSatchelFinance({nowMs:now(),collectionStartedAtMs:started,sourceError:true,failureCode:"COLLECTION_DEADLINE"});
 if(options.canceled?.aborted)return diagnoseSatchelFinance({nowMs:now(),collectionStartedAtMs:started,failureCode:"CANCELED"});
 const o=result[0].status==="fulfilled"?result[0].value:undefined;
 return diagnoseSatchelFinance({nowMs:now(),collectionStartedAtMs:started,
  evidence:o?.evidence,publisherConflict:o?.publisherConflict,
  census:result[1].status==="fulfilled"?result[1].value:undefined,
  chain:result[2].status==="fulfilled"?result[2].value:undefined});
}
