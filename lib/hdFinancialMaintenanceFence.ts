/** HD admission control only: never a bank, payout or global drain certificate.
 * The operator owns policy and the public authority. Application processes get
 * SELECT only. A durable HOLD survives restarts; no cached OPEN state exists.
 */
import {constants} from "node:fs";
import {open,realpath} from "node:fs/promises";
import {dirname,isAbsolute} from "node:path";
import {createPublicKey,verify} from "node:crypto";
import pg from "pg";

export type HdFinancialScope="hd-legacy"|"hd-satchel";
export type HdFinancialAdmission=Readonly<{scope:HdFinancialScope;producer:string;wallet:string}>;
type Authority=Readonly<{databaseUrl:string;databaseCA:string;readerRole:string;deployment:string;source:string;publicKey:string}>;
type Policy={generation:string;closed:boolean;permit:unknown;signature:string;now:Date};
type Client={connect():Promise<void>;end():Promise<void>;on(event:"error",callback:()=>void):void;
  query<T=Record<string,unknown>>(sql:string,values?:unknown[]):Promise<{rows:T[]}>};
const DOMAIN="aoe2war/hd-financial-admission/v1";
const PREFIX=Buffer.from("302a300506032b6570032100","hex");
const ROLE=/^[a-z][a-z0-9_]{0,62}$/;
const SHA=/^[a-f0-9]{40}$/;
const KEY=/^[a-f0-9]{64}$/;
const ID=/^[a-z][a-z0-9_-]{0,63}$/;
const WALLET=/^wolo1[023456789acdefghjklmnpqrstuvwxyz]{38,90}$/;
const scopes={"hd-legacy":48,"hd-satchel":49} as const;
// Webpack replaces this with a literal measured at build time. Raw Node/CLI
// workers have no compiled identity and stay HELD; environment variables cannot
// substitute one. A source/build tuple is not a custody or global-drain seal.
declare const __AOE2WAR_HD_FINANCIAL_BUILD__: Readonly<{source:string;deployment:string}> | null;
const BUILD=typeof __AOE2WAR_HD_FINANCIAL_BUILD__ === "undefined" ? null : __AOE2WAR_HD_FINANCIAL_BUILD__;
let active=0;
function held(reason:string):never{throw Error("HD_FINANCIAL_FENCE_HELD:"+reason);}
function record(value:unknown):Record<string,unknown>{
  if(!value||typeof value!=="object"||Array.isArray(value))held("invalid_policy");
  return value as Record<string,unknown>;
}
function exact(value:Record<string,unknown>,keys:readonly string[]){
  if(Object.keys(value).length!==keys.length||Object.keys(value).some(k=>!keys.includes(k)))held("invalid_policy");
}
function list(value:unknown,pattern:RegExp):string[]{
  if(!Array.isArray(value)||value.length<1||value.length>16||value.some(v=>typeof v!=="string"||!pattern.test(v)))held("invalid_policy");
  const a=value as string[];
  if(new Set(a).size!==a.length||JSON.stringify([...a].sort())!==JSON.stringify(a))held("invalid_policy");
  return a;
}
/** Canonical public signing bytes. Producing bytes conveys no admission rights. */
export function hdFinancialPermitMessage(value:unknown):Buffer{
  const p=record(value);
  exact(p,["protocol","scope","generation","deployment","source","producers","wallets","issued_at","expires_at"]);
  if(p.protocol!==1||(p.scope!=="hd-legacy"&&p.scope!=="hd-satchel")||
    typeof p.generation!=="string"||! /^[1-9][0-9]{0,17}$/.test(p.generation)||
    typeof p.deployment!=="string"||!KEY.test(p.deployment)||typeof p.source!=="string"||!SHA.test(p.source)||
    !Number.isSafeInteger(p.issued_at)||!Number.isSafeInteger(p.expires_at)||
    (p.issued_at as number)<=0||(p.expires_at as number)<=(p.issued_at as number)||
    (p.expires_at as number)-(p.issued_at as number)>60)held("invalid_policy");
  return Buffer.from(JSON.stringify([DOMAIN,p.protocol,p.scope,p.generation,p.deployment,p.source,
    list(p.producers,ID),list(p.wallets,WALLET),p.issued_at,p.expires_at]));
}
function authorize(policy:Policy,authority:Authority,input:HdFinancialAdmission){
  if(policy.closed||!policy.now||!Number.isFinite(policy.now.getTime()))held("closed_or_unavailable");
  const p=record(policy.permit),bytes=hdFinancialPermitMessage(p);
  if(p.scope!==input.scope||p.generation!==policy.generation||p.deployment!==authority.deployment||p.source!==authority.source||
    !(p.producers as string[]).includes(input.producer)||!(p.wallets as string[]).includes(input.wallet)||
    (p.issued_at as number)*1000>policy.now.getTime()||policy.now.getTime()>=(p.expires_at as number)*1000||
    typeof policy.signature!=="string"||policy.signature.length!==88)held("scope_or_expiry");
  const signature=Buffer.from(policy.signature,"base64");
  if(signature.length!==64||signature.toString("base64")!==policy.signature||
    !verify(null,bytes,createPublicKey({key:Buffer.concat([PREFIX,Buffer.from(authority.publicKey,"hex")]),format:"der",type:"spki"}),signature))held("signature");
}
async function rootFile(path:string,limit:number):Promise<string>{
  if(!isAbsolute(path)||await realpath(path)!==path)held("authority_path");
  for(let parent=dirname(path);;parent=dirname(parent)){
    const directory=await open(parent,constants.O_RDONLY|constants.O_NOFOLLOW);
    try{const s=await directory.stat();if(!s.isDirectory()||s.uid!==0||(s.mode&0o022)!==0)held("authority_owner");}finally{await directory.close();}
    if(dirname(parent)===parent)break;
  }
  const file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  try{
    const s=await file.stat();
    if(!s.isFile()||s.nlink!==1||s.uid!==0||(s.mode&0o022)!==0||s.size<1||s.size>limit)held("authority_owner");
    const data=await file.readFile();if(data.length>limit)held("authority_size");return data.toString("utf8");
  }finally{await file.close();}
}
async function authority():Promise<Authority>{
  if(typeof process.geteuid!=="function"||process.geteuid()===0)held("independent_service_identity_required");
  const raw=await rootFile(process.env.HD_FINANCIAL_FENCE_AUTHORITY_FILE||"",16384),a=record(JSON.parse(raw));
  exact(a,["protocol","database_url","database_ca_file","reader_role","deployment","source","public_key_hex"]);
  if(a.protocol!==1||typeof a.database_url!=="string"||typeof a.database_ca_file!=="string"||
    typeof a.reader_role!=="string"||!ROLE.test(a.reader_role)||typeof a.deployment!=="string"||!KEY.test(a.deployment)||
    typeof a.source!=="string"||!SHA.test(a.source)||typeof a.public_key_hex!=="string"||!KEY.test(a.public_key_hex))held("authority_configuration");
  const url=new URL(a.database_url);
  if(url.protocol!=="postgresql:"||!url.hostname||!url.username||!url.password||url.search||url.hash)held("authority_database");
  return Object.freeze({databaseUrl:a.database_url,databaseCA:await rootFile(a.database_ca_file,32768),readerRole:a.reader_role,
    deployment:a.deployment,source:a.source,publicKey:a.public_key_hex});
}
function assertRuntime(a:Authority){
  if(!BUILD||!SHA.test(BUILD.source)||!KEY.test(BUILD.deployment))held("compiled_runtime_identity_missing");
  if(a.source!==BUILD.source||a.deployment!==BUILD.deployment)held("runtime_identity_mismatch");
}
const postureSQL=`SELECT session_user AS login,current_user AS role,
 current_setting('transaction_read_only') AS readonly,
 EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND
 (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls OR rolreplication)) OR
 EXISTS(SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=current_user)) AS privileged,
 NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname='hd_financial_maintenance_policy' AND c.relkind='r' AND NOT c.relrowsecurity
 AND NOT pg_has_role(current_user,c.relowner,'USAGE')) OR
 has_table_privilege(current_user,'public.hd_financial_maintenance_policy','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR
 has_any_column_privilege(current_user,'public.hd_financial_maintenance_policy','INSERT,UPDATE,REFERENCES') AS writable`;

// Kept private. Isolated tests export only this kernel with synthetic authority
// and a disposable PostgreSQL role; production always uses rootFile above.
async function withConfiguredLease<T>(client:Client,a:Authority,input:HdFinancialAdmission,action:(signal:AbortSignal)=>Promise<T>):Promise<T>{
  let expiry:ReturnType<typeof setTimeout>|undefined;
  const cancel=new AbortController();client.on("error",()=>cancel.abort(Error("financial_fence_connection_lost")));
  try{
    await client.connect();
    await client.query("BEGIN TRANSACTION READ ONLY");
    await client.query("SET LOCAL search_path='pg_catalog'; SET LOCAL lock_timeout='1s'; SET LOCAL statement_timeout='2s'; SET LOCAL idle_in_transaction_session_timeout='70s'");
    // READ ONLY ACCESS SHARE stabilizes the checked relation/RLS posture.
    await client.query("LOCK TABLE public.hd_financial_maintenance_policy IN ACCESS SHARE MODE");
    const posture=(await client.query<{login:string;role:string;readonly:string;privileged:boolean;writable:boolean}>(postureSQL)).rows;
    if(posture.length!==1||posture[0].login!==a.readerRole||posture[0].role!==a.readerRole||posture[0].readonly!=="on"||posture[0].privileged||posture[0].writable)held("reader_role");
    await client.query("SELECT pg_advisory_xact_lock_shared(724176,$1)",[scopes[input.scope]]);
    const rows=(await client.query<Policy>(`SELECT generation::text,closed,permit,signature,clock_timestamp() AS now
      FROM public.hd_financial_maintenance_policy WHERE scope=$1`,[input.scope])).rows;
    if(rows.length!==1)held("missing_policy");authorize(rows[0],a,input);cancel.signal.throwIfAborted();
    const remaining=(record(rows[0].permit).expires_at as number)*1000-rows[0].now.getTime();
    expiry=setTimeout(()=>cancel.abort(Error("financial_admission_expired")),remaining);
    // Do not race this callback against a timer and release its lease while a
    // delayed send is still executing. Transports must honor the signal and
    // their existing bounded timeout. Lost connections remain UNKNOWN.
    const result=await action(cancel.signal);cancel.signal.throwIfAborted();
    await client.query("COMMIT");return result;
  }finally{if(expiry)clearTimeout(expiry);await client.query("ROLLBACK").catch(()=>{});await client.end().catch(()=>{});}
}
export async function withHdFinancialLease<T>(input:HdFinancialAdmission,action:(signal:AbortSignal)=>Promise<T>):Promise<T>{
  if(!input||(input.scope!=="hd-legacy"&&input.scope!=="hd-satchel")||typeof input.producer!=="string"||!ID.test(input.producer)||typeof input.wallet!=="string"||!WALLET.test(input.wallet)||active>=4)held("invalid_or_busy");
  active++;let entered=false;
  try{
    if(!BUILD||!SHA.test(BUILD.source)||!KEY.test(BUILD.deployment))held("compiled_runtime_identity_missing");
    const a=await authority();
    assertRuntime(a);
    const client=new pg.Client({connectionString:a.databaseUrl,ssl:{ca:a.databaseCA,rejectUnauthorized:true},
      connectionTimeoutMillis:3000,query_timeout:3000,application_name:"aoe2war_hd_financial_fence"}) as Client;
    return await withConfiguredLease(client,a,input,signal=>{entered=true;return action(signal);});
  }catch{
    if(entered)throw Error("HD_FINANCIAL_FENCE_OUTCOME_UNKNOWN:admitted_action_or_connection_failed");
    held("unavailable_or_refused");
  }finally{active--;}
}
