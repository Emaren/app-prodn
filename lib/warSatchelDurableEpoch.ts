/**
 * Durable prospective Wolo epoch admission, read under the EXISTING global
 * Satchel financial transaction lock. Never creates or approves an epoch.
 * No REST/client fields, migrations, signer or money-moving entry point.
 *
 * A row labelled approved is an OPERATOR CLAIM, not independently certified
 * chain/custody/solvency. The immutable financial bridge HOLD remains separate.
 */
import {Prisma} from "@/lib/generated/prisma";
import type {PrismaClient} from "@/lib/generated/prisma";
import type {AuthenticatedWarSatchelBank} from "./warSatchelAuthenticatedBank.ts";
import type {AuthenticatedWarSatchelDeposit} from "./warSatchelAuthenticatedDeposit.ts";

const DIGEST=/^[a-f0-9]{64}$/;
const GIT_SHA=/^[a-f0-9]{40}$/;
const ADDRESS=/^wolo1[023456789acdefghjklmnpqrstuvwxyz]{38,90}$/;
type Transaction=Prisma.TransactionClient;
export type DurableProspectiveEpoch=Readonly<{
 epochId:string;chainId:string;vault:string;startHeight:bigint;startAppHash:string;
 manifestDigest:string;sourceCommit:string;legacyClaimsDigest:string;
 legacyLiabilitiesDigest:string;custodyWitnessDigest:string;recoveryWitnessDigest:string;
 reservesWitnessDigest:string;fiveReviewerDigest:string;chainAnchorWitnessDigest:string;
 state:string;approvedAt:Date|null;createdAt:Date;
}>;
export type ProspectiveDepositFacts=Readonly<{
 ownerUserId:number;ownerUid:string;ownerWallet:string;intentCreatedAt:Date;
 vault:string;txHeight:bigint;txHash:string;txOwnerUid:string;txSender:string;
 bankHeight:bigint;bankVault:string;
}>;
const hex=(x:unknown)=>typeof x==="string"&&DIGEST.test(x)&&x!=="0".repeat(64);
export function prospectiveEpochDepositIssue(
 e:DurableProspectiveEpoch|null, x:ProspectiveDepositFacts,
):string|null{
 if(!e)return "approved_epoch_missing";
 if(e.state!=="approved"||e.chainId!=="wolo-1"||
   !Number.isSafeInteger(x.ownerUserId)||x.ownerUserId<1||!x.ownerUid||
   x.ownerUid!==x.txOwnerUid||x.ownerWallet!==x.txSender)
   return "epoch_status_or_owner";
 if(!ADDRESS.test(e.vault)||x.vault!==e.vault||x.bankVault!==e.vault)
   return "epoch_vault_segregation";
 if(!Number.isSafeInteger(Number(e.startHeight))||e.startHeight<=BigInt(0)||
   x.txHeight<=e.startHeight||x.bankHeight<x.txHeight+BigInt(2))
   return "historical_or_unfinalized_deposit";
 if(!(e.approvedAt instanceof Date)||!(e.createdAt instanceof Date)||
   !(x.intentCreatedAt instanceof Date)||!Number.isFinite(x.intentCreatedAt.getTime())||
   !Number.isFinite(e.approvedAt.getTime())||
   x.intentCreatedAt.getTime()<e.approvedAt.getTime()||
   e.approvedAt.getTime()>e.createdAt.getTime())
   return "pre_epoch_or_unapproved_intent";
 if(!GIT_SHA.test(e.sourceCommit)||
   ![e.startAppHash,e.manifestDigest,e.legacyClaimsDigest,e.legacyLiabilitiesDigest,
     e.custodyWitnessDigest,e.recoveryWitnessDigest,e.reservesWitnessDigest,
     e.fiveReviewerDigest,e.chainAnchorWitnessDigest].every(hex))
   return "epoch_source_or_evidence_incomplete";
 if(!/^[A-F0-9]{64}$/.test(x.txHash))return "invalid_physical_receipt";
 return null;
}
function stop(issue:string):never{throw Error("WAR_SATCHEL_EPOCH_ADMISSION_REFUSED:"+issue);}
export async function requireDurableProspectiveDepositEpoch(
 tx:Transaction,input:{
 ownerUserId:number;ownerUid:string;ownerWallet:string;intentCreatedAt:Date;
 bank:AuthenticatedWarSatchelBank;deposit:AuthenticatedWarSatchelDeposit;
 }):Promise<DurableProspectiveEpoch>{
 // Must be invoked AFTER user, intent and native evidence match under the
 // global serializable financial lock. The ledger's opaque proof checks remain
 // separate, non-negotiable prerequisites.
 const rows=await tx.$queryRaw<Array<{
 epochId:string;chainId:string;vault:string;startHeight:bigint;startAppHash:string;
 manifestDigest:string;sourceCommit:string;legacyClaimsDigest:string;
 legacyLiabilitiesDigest:string;custodyWitnessDigest:string;recoveryWitnessDigest:string;
 reservesWitnessDigest:string;fiveReviewerDigest:string;chainAnchorWitnessDigest:string;
 state:string;approvedAt:Date|null;createdAt:Date;
 }>>(Prisma.sql`
 SELECT epoch_id AS "epochId",chain_id AS "chainId",vault_address AS vault,
 start_height AS "startHeight",start_app_hash AS "startAppHash",
 manifest_sha256 AS "manifestDigest",source_commit AS "sourceCommit",
 legacy_claims_sha256 AS "legacyClaimsDigest",legacy_liabilities_sha256 AS "legacyLiabilitiesDigest",
 custody_witness_sha256 AS "custodyWitnessDigest",
 recovery_witness_sha256 AS "recoveryWitnessDigest",reserve_witness_sha256 AS "reservesWitnessDigest",
 five_reviewer_approval_sha256 AS "fiveReviewerDigest",
 chain_anchor_witness_sha256 AS "chainAnchorWitnessDigest",
 state,approved_at AS "approvedAt",created_at AS "createdAt"
 FROM war_satchel_prospective_epochs WHERE state='approved'
 ORDER BY epoch_id LIMIT 2 FOR SHARE
 `);
 if(rows.length!==1)stop("one_operator_approved_epoch_required");
 const e=rows[0];
 const issue=prospectiveEpochDepositIssue(e,{
 ownerUserId:input.ownerUserId,ownerUid:input.ownerUid,ownerWallet:input.ownerWallet,
 intentCreatedAt:input.intentCreatedAt,vault:input.deposit.vault,
 txHeight:input.deposit.height,txHash:input.deposit.txHash,txOwnerUid:input.deposit.ownerUid,
 txSender:input.deposit.sender,bankHeight:input.bank.height,bankVault:input.bank.vaultAddress,
 });
 if(issue)stop(issue);
 return Object.freeze(e);
}
export async function bindDurableEpochReceipt(tx:Transaction,input:{
 epoch:DurableProspectiveEpoch;receiptId:bigint;ownerUserId:number;
 txHash:string;vault:string;height:bigint;amountUwolo:bigint;
}):Promise<void>{
 // The SQL trigger independently verifies that this immutable mapping
 // exactly equals the already inserted physical receipt and approved H*.
 const e=input.epoch;
 if(e.state!=="approved"||input.height<=e.startHeight||input.vault!==e.vault)
   stop("epoch_receipt_scope_changed");
 const affected=await tx.$executeRaw(Prisma.sql`
 INSERT INTO war_satchel_epoch_deposit_receipts
 (receipt_id,epoch_id,chain_id,tx_hash,message_index,owner_user_id,
  vault_address,canonical_height,amount_uwolo)
 VALUES (${input.receiptId},${e.epochId},'wolo-1',${input.txHash},0,${input.ownerUserId},
 ${input.vault},${input.height},${input.amountUwolo})
 `);
 if(affected!==1)stop("epoch_receipt_not_durable");
}
