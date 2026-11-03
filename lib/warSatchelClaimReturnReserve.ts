/** Fail-closed boundary for the pending native escrow execution-reserve guard.
 * The current bank capability authenticates physical assets only. Neither the
 * immutable ticket allocation nor an imported review DTO establishes complete
 * current liabilities, paid-claim discharge, pending fees or spend authority.
 */
import {
  authenticatedWarSatchelBankFreshAt,
  type AuthenticatedWarSatchelBank,
} from "./warSatchelAuthenticatedBank.ts";
import type {SatchelClaimReturnEconomics} from "./warSatchelClaimReturnAuthorization.ts";

const DIGEST=/^[a-f0-9]{64}$/;
const ORIGINAL_DIGEST=/^[A-F0-9]{64}$/;
const AMOUNT=/^[1-9][0-9]{0,18}$/;
function refuse(reason:string):never{throw Error("SATCHEL_CLAIM_RETURN_RESERVE_REFUSED:"+reason);}
function object(value:unknown):Record<string,unknown>{
  if(!value||typeof value!=="object"||Array.isArray(value))refuse("original_allocation_required");
  return value as Record<string,unknown>;
}

/** Required native input identity, not evidence or an executable request.
 * A future fixed native reader must load protected reviewer keys, producer
 * enrollment/pins, complete signed execution inventory and current journal
 * itself. No caller-selected endpoint, fee, key, root or complete flag belongs
 * in that authority. The original reconciliation digest remains unchanged.
 */
export type SatchelReturnReserveNativeBinding=Readonly<{
  protocol:1;
  operationId:string;claimId:string;ownerId:string;ticketId:string;
  marketId:string;legId:string;entitlementId:string;claimKind:"bet_payout"|"bet_refund";
  amountUwolo:string;escrowAddress:string;vaultAddress:string;
  allocationDigest:string;originalBankEvidenceDigest:string;fundsBudgetId:string;
  currentBankHeight:string;currentBankCommitHeight:string;
  currentBankBlockHash:string;currentBankAppHash:string;
}>;

/** Rebuild only a nonauthorizing binding from the independently loaded claim
 * and the opaque Go-authenticated CURRENT escrow bank capability. In particular,
 * original allocation height/root need not equal the bank after a prior leg
 * paid. A bank balance is never converted into funds_available_uwolo here.
 */
export function satchelReturnReserveNativeBinding(
  economics:SatchelClaimReturnEconomics,
  bank:AuthenticatedWarSatchelBank,
):SatchelReturnReserveNativeBinding{
  if(!authenticatedWarSatchelBankFreshAt(bank)||bank.chainId!=="wolo-1"||bank.denom!=="uwolo"||
     bank.vaultAddress!==economics.escrowAddress||economics.escrowAddress===economics.vaultAddress||
     bank.height<BigInt(1)||bank.commitHeight!==bank.height+BigInt(1))refuse("current_authenticated_escrow_bank_required");
  const approval=object(economics.approval),allocation=object(approval.allocation);
  if(typeof approval.allocation_digest!=="string"||!DIGEST.test(approval.allocation_digest)||
     typeof allocation.bank_evidence_digest!=="string"||!ORIGINAL_DIGEST.test(allocation.bank_evidence_digest)||
     typeof allocation.funds_budget_id!=="string"||allocation.funds_budget_id.length<1||allocation.funds_budget_id.length>160||
     approval.version!==2||allocation.version!==2||approval.ticket_id!==economics.ticketId||approval.market_id!==economics.marketId||
     approval.leg_id!==economics.legId||approval.entitlement_id!==economics.entitlementId||approval.claim_kind!==economics.claimKind||approval.amount_uwolo!==economics.amountUwolo||
     approval.operation_id!==economics.operationId||approval.claim_id!==economics.claimId||approval.owner_id!==economics.ownerId||
     allocation.operation_id!==economics.operationId||allocation.ticket_id!==economics.ticketId||allocation.owner_id!==economics.ownerId||
     allocation.funding_tx_hash!==economics.fundingTxHash||!AMOUNT.test(economics.amountUwolo))
    refuse("original_allocation_identity_changed");
  return Object.freeze({protocol:1 as const,operationId:economics.operationId,claimId:economics.claimId,ownerId:economics.ownerId,
    ticketId:economics.ticketId,marketId:economics.marketId,legId:economics.legId,entitlementId:economics.entitlementId,
    claimKind:economics.claimKind,amountUwolo:economics.amountUwolo,escrowAddress:economics.escrowAddress,vaultAddress:economics.vaultAddress,
    allocationDigest:approval.allocation_digest,originalBankEvidenceDigest:allocation.bank_evidence_digest,fundsBudgetId:allocation.funds_budget_id,
    currentBankHeight:String(bank.height),currentBankCommitHeight:String(bank.commitHeight),
    currentBankBlockHash:bank.blockHash,currentBankAppHash:bank.appHash});
}

/** There is intentionally no success branch until Wolo supplies the protected
 * complete-inventory verifier and the same exact-return pre-sign enforcement.
 * A signed JSON review, balance surplus, feature flag or forged receipt cannot
 * bypass this hold; the existing caller cannot create its durable attempt.
 */
export function assertCurrentSatchelReturnReserve(
  economics:SatchelClaimReturnEconomics,
  independentlySignedExecutionInventory:unknown,
  bank:AuthenticatedWarSatchelBank,
):void{
  satchelReturnReserveNativeBinding(economics,bank);
  if(!independentlySignedExecutionInventory||typeof independentlySignedExecutionInventory!=="object"||Array.isArray(independentlySignedExecutionInventory))
    refuse("protected_independent_execution_inventory_required");
  refuse("native_execution_inventory_verifier_unavailable");
}
