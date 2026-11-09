/** Session A-gated C02 write-ahead admission, not public GET/SSR or custody. */
import { Prisma, type PrismaClient } from "@/lib/generated/prisma";
import { nativeReturnIdentity, type NativeAttemptIdentity, type NativeAttemptJournal } from "./warSatchelNativeOnlyReturn.ts";

type DB=Prisma.TransactionClient;
type Original={claim_id:bigint;owner_user_id:number;owner_uid:string;wager_operation_id:string;
 funding_tx_hash:string;funding_bank_root:string;independent_reserve_review_sha256:string;owner_permit_sha256:string};
type Saved={claim_id:bigint;operation_key:string;app_operation_id:string;approval_sha256:string;approval_json:unknown};
const SHA=/^[a-f0-9]{64}$/, TX=/^[A-F0-9]{64}$/;
function hold(x:string):never{throw Error("C02_NATIVE_JOURNAL_HOLD:"+x);}
export function nativeC02AttemptJournal(
 prisma:Pick<PrismaClient,"$transaction">,
 expected:Readonly<{claimId:string;ownerUserId:number;ownerUid:string;fundingTxHash:string;
  fundingBankRoot:string;independentReserveReviewSha256:string;ownerPermitSha256:string}>,
 approval:unknown,
):NativeAttemptJournal{
 const id=nativeReturnIdentity(approval);
 if(id.claimId!==expected.claimId||!Number.isSafeInteger(expected.ownerUserId)||
   expected.ownerUserId<1||!/^[A-Za-z0-9_.:-]{1,100}$/.test(expected.ownerUid)||
   !TX.test(expected.fundingTxHash)||!SHA.test(expected.fundingBankRoot)||
   !SHA.test(expected.independentReserveReviewSha256)||!SHA.test(expected.ownerPermitSha256)||
   [expected.fundingBankRoot,expected.independentReserveReviewSha256,expected.ownerPermitSha256]
    .some(x=>x==="0".repeat(64)))hold("original_review_identity_invalid");
 const claimId=BigInt(id.claimId);
 return Object.freeze({insertOnce:async(item:NativeAttemptIdentity)=>{
  if(JSON.stringify(item)!==JSON.stringify(id))hold("attempt_identity_changed");
  return prisma.$transaction(async(tx:DB)=>{
   const [r]=await tx.$queryRaw<Original[]>`
    SELECT claim_id,owner_user_id,owner_uid,wager_operation_id,funding_tx_hash,funding_bank_root,
    independent_reserve_review_sha256,owner_permit_sha256
    FROM public.war_satchel_native_return_operations WHERE claim_id=${claimId} FOR SHARE`;
   if(!r||r.claim_id!==claimId||r.owner_user_id!==expected.ownerUserId||
     r.owner_uid!==expected.ownerUid||r.wager_operation_id!==id.appOperationId||
     r.funding_tx_hash!==expected.fundingTxHash||r.funding_bank_root!==expected.fundingBankRoot||
     r.independent_reserve_review_sha256!==expected.independentReserveReviewSha256||
     r.owner_permit_sha256!==expected.ownerPermitSha256)
    hold("original_wager_reserve_or_owner_changed");
   const n=await tx.$executeRaw`
    INSERT INTO public.war_satchel_native_return_attempts
    (claim_id,operation_key,app_operation_id,approval_json,approval_sha256)
    VALUES(${claimId},${id.operationKey},${id.appOperationId},${JSON.stringify(approval)}::jsonb,${id.approvalSha256})
    ON CONFLICT DO NOTHING`;
   if(n!==0&&n!==1)hold("unexpected_insert_count");
   const [saved]=await tx.$queryRaw<Saved[]>`
    SELECT claim_id,operation_key,app_operation_id,approval_sha256,approval_json
    FROM public.war_satchel_native_return_attempts WHERE claim_id=${claimId} FOR SHARE`;
   if(!saved||saved.claim_id!==claimId||saved.operation_key!==id.operationKey||
     saved.app_operation_id!==id.appOperationId||saved.approval_sha256!==id.approvalSha256||
     nativeReturnIdentity(saved.approval_json).approvalSha256!==id.approvalSha256)
    hold("durable_attempt_conflict");
   return n===1;
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,maxWait:5000,timeout:9000});
 }});
}
