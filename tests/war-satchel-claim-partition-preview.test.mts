import assert from "node:assert/strict";
import test from "node:test";
import { inspectSatchelClaimPartitionPreview } from "../lib/warSatchelClaimPartitionPreview.ts";
import type { SatchelReturnWager } from "../lib/warSatchelClaimReturnAttribution.ts";

const vault="wolo1"+"v".repeat(38);
const ticket=(id:number,operation:number,hash:string)=>({
  id,userId:17,source:"auto",walletProvider:"satchel-vault",
  walletAddress:vault,status:"recorded",stakeTxHash:hash,
  clientRequestId:"satchel:ticket:"+operation,
});
const first:SatchelReturnWager={
  id:41,amountWolo:10,payoutWolo:14,status:"won",
  stakeLeg:{id:61,marketId:7,amountWolo:10,
    ticket:ticket(101,81,"AB".repeat(32))},
};
const second:SatchelReturnWager={
  id:42,amountWolo:20,payoutWolo:30,status:"won",
  stakeLeg:{id:62,marketId:7,amountWolo:20,
    ticket:ticket(102,82,"CD".repeat(32))},
};
const base={
  sourceClaimId:301,ownerUserId:17,marketId:7,
  claimKind:"bet_payout" as const,claimAmountWolo:44,
  vaultAddress:vault,wagers:[second,first],
};

test("aggregate claim previews sorted immutable per-ticket contributions without inventing claim IDs",()=>{
  const plan=inspectSatchelClaimPartitionPreview(base);
  assert.equal(plan.kind,"non_executing_claim_partition_preview");
  assert.equal(plan.sourceClaimId,301);
  assert.equal(plan.disposition,"new_claim_identities_required");
  assert.deepEqual(plan.contributions.map(c=>c.ticketId),[101,102]);
  assert.deepEqual(plan.contributions.map(c=>c.operationId),["satchel:ticket:81","satchel:ticket:82"]);
  assert.deepEqual(plan.contributions.map(c=>c.sourceStakeLegIds),[[61],[62]]);
  assert.equal(plan.totalPrincipalUwolo,BigInt(30_000_000));
  assert.equal(plan.totalReturnUwolo,BigInt(44_000_000));
  assert.equal(plan.creditAuthorized,false);
  assert.equal(plan.escrowExecutionAuthorized,false);
  assert(plan.contributions.every(c=>c.wholeTicketAllocationProved===false));
  assert(Object.isFrozen(plan)&&Object.isFrozen(plan.contributions));
  assert(plan.contributions.every(c=>Object.isFrozen(c)&&Object.isFrozen(c.sourceWagerIds)));
  assert.equal("claimId" in plan.contributions[0],false);
});

test("one funded ticket still produces preview not executable authorization",()=>{
  const plan=inspectSatchelClaimPartitionPreview({
    ...base,claimAmountWolo:14,wagers:[first],
  });
  assert.equal(plan.disposition,"single_ticket_source");
  assert.equal(plan.totalReturnUwolo,BigInt(14_000_000));
  assert.equal(plan.escrowExecutionAuthorized,false);
});

test("claim totals must be exactly conserved before any partition",()=>{
  for(const claimAmountWolo of [1,30,43,45,100]){
    assert.throws(()=>inspectSatchelClaimPartitionPreview({
      ...base,claimAmountWolo,
    }),/source_claim_not_exact_total_entitlement/);
  }
  assert.throws(()=>inspectSatchelClaimPartitionPreview({
    ...base,sourceClaimId:0,
  }),/invalid_or_unbounded_claim/);
  assert.throws(()=>inspectSatchelClaimPartitionPreview({
    ...base,wagers:Array.from({length:1001},()=>first),
  }),/invalid_or_unbounded_claim/);
});

test("duplicates cannot count one market wager or ticket leg twice",()=>{
  assert.throws(()=>inspectSatchelClaimPartitionPreview({
    ...base,claimAmountWolo:28,wagers:[first,first],
  }),/unverifiable_or_duplicate_source_wager/);
  assert.throws(()=>inspectSatchelClaimPartitionPreview({
    ...base,claimAmountWolo:28,
    wagers:[first,{...first,id:50}],
  }),/unverifiable_or_duplicate_source_wager/);
});

test("manual wallet, foreign owner and malformed funding cannot be partitioned as pooled custody",()=>{
  for(const changed of [
    {...first,stakeLeg:{...first.stakeLeg!,ticket:{...first.stakeLeg!.ticket!,userId:30}}},
    {...first,stakeLeg:{...first.stakeLeg!,ticket:{...first.stakeLeg!.ticket!,walletProvider:"keplr"}}},
    {...first,stakeLeg:{...first.stakeLeg!,ticket:{...first.stakeLeg!.ticket!,stakeTxHash:null}}},
    {...first,stakeLeg:{...first.stakeLeg!,marketId:8}},
    {...first,status:"lost"},
    {...first,payoutWolo:-1},
  ]){
    assert.throws(()=>inspectSatchelClaimPartitionPreview({
      ...base,claimAmountWolo:changed.payoutWolo??14,wagers:[changed],
    }),/SATCHEL_(PARTITION_PREVIEW|RETURN_ATTRIBUTION)_REFUSED/);
  }
});

test("every partial unmatched refund returns all principal, independently for each ticket",()=>{
  const a:SatchelReturnWager={...first,status:"void",payoutWolo:10};
  const b:SatchelReturnWager={...second,status:"void",payoutWolo:20};
  const plan=inspectSatchelClaimPartitionPreview({
    ...base,claimKind:"bet_refund",claimAmountWolo:30,wagers:[b,a],
  });
  assert.equal(plan.totalReturnUwolo,plan.totalPrincipalUwolo);
  assert.equal(plan.disposition,"new_claim_identities_required");
  for(const p of plan.contributions)assert.equal(p.returnUwolo,p.principalUwolo);
  assert.throws(()=>inspectSatchelClaimPartitionPreview({
    ...base,claimKind:"bet_refund",claimAmountWolo:29,
    wagers:[a,{...b,payoutWolo:19}],
  }),/unmatched_principal_not_fully_refunded/);
});

test("one ticket cannot masquerade as two operations or funding transactions",()=>{
  const drift:SatchelReturnWager={...second,
    stakeLeg:{...second.stakeLeg!,ticket:{
      ...first.stakeLeg!.ticket!,stakeTxHash:"EF".repeat(32),
    }}};
  assert.throws(()=>inspectSatchelClaimPartitionPreview({
    ...base,wagers:[first,drift],
  }),/multi_ticket_or_conflicting_funding_requires_claim_partition/);
});

test("two ticket IDs cannot claim one physical transfer or one durable request",()=>{
  const sameHash:SatchelReturnWager={...second,stakeLeg:{
    ...second.stakeLeg!,ticket:{
      ...second.stakeLeg!.ticket!,stakeTxHash:first.stakeLeg!.ticket!.stakeTxHash,
    },
  }};
  assert.throws(()=>inspectSatchelClaimPartitionPreview({
    ...base,wagers:[first,sameHash],
  }),/multiple_tickets_share_one_chain_effect_or_operation/);
  const sameRequest:SatchelReturnWager={...second,stakeLeg:{
    ...second.stakeLeg!,ticket:{
      ...second.stakeLeg!.ticket!,
      clientRequestId:first.stakeLeg!.ticket!.clientRequestId,
    },
  }};
  assert.throws(()=>inspectSatchelClaimPartitionPreview({
    ...base,wagers:[first,sameRequest],
  }),/multiple_tickets_share_one_chain_effect_or_operation/);
});
