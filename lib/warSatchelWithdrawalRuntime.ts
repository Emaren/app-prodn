/** Server-owned withdrawal execution/recovery. No public request may choose a
 * transaction hash, approval, endpoint, vault or proof context. The first send
 * follows an atomic UNKNOWN fence; every later pass is reconcile-only. */
import type {PrismaClient} from "@/lib/generated/prisma";
import {requireSatchelFinancialBridge} from "./warSatchelFinancialBridgeHold.ts";
import {readWarSatchelBoundedUtf8} from "./warSatchelBoundedBody.ts";
import {markSatchelWithdrawalAttempt,finalizeProvenSatchelWithdrawal} from "./warSatchelFundedLedger.ts";

const ENDPOINT="http://127.0.0.1:8094";
const HASH=/^[A-F0-9]{64}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
function stop(reason:string):never{throw Error("SATCHEL_WITHDRAWAL_RUNTIME_REFUSED:"+reason);}
function token(){
  requireSatchelFinancialBridge();
  if(process.env.WAR_SATCHEL_WITHDRAWAL_EXECUTOR_READY!=="true"||
    process.env.WAR_SATCHEL_FINANCIAL_OPERATOR_ATTESTED!=="true"||
    process.env.WAR_SATCHEL_SIGNER_CLIENT_ENABLED!=="true")stop("runtime_not_certified");
  const key=process.env.WAR_SATCHEL_SIGNER_AUTH_TOKEN||"";
  if(!/^[A-Za-z0-9_-]{48,512}$/.test(key))stop("credential_missing");return key;
}
async function request(path:"/v1/satchel/withdrawals"|"/satchel/v1/reconcile",body:unknown,reader:typeof fetch){
  const response=await reader(ENDPOINT+path,{method:"POST",redirect:"error",cache:"no-store",
    headers:{Authorization:"Bearer "+token(),"Content-Type":"application/json",Accept:"application/json"},
    body:JSON.stringify(body),signal:AbortSignal.timeout(8500)});
  if(!response.ok||response.status!==200)stop("signer_outcome_unknown");
  const raw=await readWarSatchelBoundedUtf8(response.body,16384);
  if(!raw)stop("signer_outcome_unknown");
  const value:unknown=JSON.parse(raw);
  if(!value||typeof value!=="object"||Array.isArray(value))stop("signer_outcome_unknown");
  return value as Record<string,unknown>;
}
/** Exact transport identity is only a candidate hash. It never marks payment. */
export function withdrawalCandidateHash(result:Record<string,unknown>,operationId:string):string|null{
  if(result.operation_id!==operationId||result.request_id!==operationId||result.chain_id!=="wolo-1"||
    result.signer_role!=="exclusive-war-satchel-v1"||result.durable_request_fenced!==true||
    !["UNKNOWN","ACCEPTED","CONFIRMED"].includes(String(result.status)))return null;
  if(typeof result.tx_hash!=="string"||!HASH.test(result.tx_hash)||result.tx_hash==="0".repeat(64))return null;
  if(result.txHash!==undefined&&result.txHash!==result.tx_hash)return null;
  return result.tx_hash;
}
/** Receives only a durable server-selected ID. After a timeout, process restart,
 * refused response or crash, no path re-enters the submit endpoint. */
export async function processCertifiedSatchelWithdrawal(prisma:PrismaClient,withdrawalId:string,reader:typeof fetch=fetch){
  token();if(!UUID.test(withdrawalId))stop("invalid_durable_identity");
  const record=await prisma.satchelFundedWithdrawal.findUnique({where:{id:withdrawalId}});
  if(!record)stop("withdrawal_missing");
  if(record.status==="cancelled"||record.status==="sent")return {state:record.status};
  const operationId="satchel:withdrawal:"+withdrawalId;
  let reply:Record<string,unknown>|null=null;
  if(record.status==="reserved"){
    // Database commit completes BEFORE the only permitted submission call.
    const fenced=await markSatchelWithdrawalAttempt(prisma,{withdrawalId,ownerUserId:record.ownerUserId});
    try{reply=await request("/v1/satchel/withdrawals",fenced.request,reader);}catch{
      await prisma.satchelWithdrawalObservation.create({data:{operationId,txHash:null,state:"unknown"}});
      return {state:"unknown_hold"};
    }
  }else if(record.status==="unknown_hold"){
    // Existing operation reconciliation validates original signed bytes and
    // never signs/broadcasts again, including after authorization expiry.
    const attempt=await prisma.satchelWithdrawalAttempt.findUnique({where:{withdrawalId}});
    if(!attempt||attempt.operationId!==operationId)stop("missing_durable_attempt");
    try{reply=await request("/satchel/v1/reconcile",{operation_id:operationId},reader);}catch{return {state:"unknown_hold"};}
  }else stop("withdrawal_state_unknown");
  const hash=withdrawalCandidateHash(reply,operationId);
  await prisma.satchelWithdrawalObservation.create({data:{operationId,txHash:hash,state:hash?"candidate_hash":"unknown"}});
  if(!hash)return {state:"unknown_hold"};
  try{
    const final=await finalizeProvenSatchelWithdrawal(prisma,{withdrawalId,ownerUserId:record.ownerUserId,txHash:hash});
    await prisma.satchelWithdrawalObservation.create({data:{operationId,txHash:hash,state:"confirmed"}});
    return final;
  }catch{return {state:"unknown_hold"};}
}
/** Bounded private worker: oldest unknowns are recovered without rebroadcast;
 * newly reviewed reservations alone can reach the atomic first-send fence. */
export async function processNextCertifiedSatchelWithdrawal(prisma:PrismaClient,reader:typeof fetch=fetch){
  token();
  const unknown=await prisma.satchelFundedWithdrawal.findFirst({where:{status:"unknown_hold"},orderBy:{createdAt:"asc"}});
  if(unknown)return processCertifiedSatchelWithdrawal(prisma,unknown.id,reader);
  const approvals=await prisma.satchelWithdrawalApproval.findMany({orderBy:{createdAt:"asc"},take:20,select:{withdrawalId:true}});
  for(const approval of approvals){
    const record=await prisma.satchelFundedWithdrawal.findUnique({where:{id:approval.withdrawalId}});
    if(record?.status==="reserved")return processCertifiedSatchelWithdrawal(prisma,record.id,reader);
  }
  return {state:"idle"};
}
