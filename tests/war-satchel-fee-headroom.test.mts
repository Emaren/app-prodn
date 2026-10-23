import assert from "node:assert/strict";
import test from "node:test";
import { assessSatchelFeeHeadroom, type SatchelFeeHeadroomSnapshot } from "../lib/warSatchelFeeHeadroom.ts";

function base(): SatchelFeeHeadroomSnapshot {
  return {
    bankBalanceUwolo: 100000005n, totalOwnerLiabilitiesUwolo: 100000000n,
    pendingOperations: [
      {operationId:"satchel:ticket:1",feeUwolo:1n,status:"prepared"},
      {operationId:"satchel:withdrawal:2",feeUwolo:1n,status:"uncertain"},
    ],
    newOperationFeeUwolo:1n, minimumUnencumberedGasUwolo:2n,
    pendingOperationsComplete:true,
  };
}
test("exact boundary retains customer principal and every fee", () => {
  const r=assessSatchelFeeHeadroom(base());
  assert.equal(r.status,"BUDGET_SUFFICIENT_NONAUTHORIZING");
  assert.equal(r.requiredUwolo,100000005n);
  assert.equal(r.pendingFeeUwolo,2n);
  assert.equal(r.remainingAfterReservationUwolo,0n);
  assert.equal(r.spendingAuthorized,false);
  assert.equal(r.independentBankAuthenticated,false);
  assert.equal(r.independentLedgerAuthenticated,false);
  assert.ok(Object.isFrozen(r));
});
test("one micro-WOLO below boundary refuses, no principal spent", () => {
  const r=assessSatchelFeeHeadroom({...base(),bankBalanceUwolo:100000004n});
  assert.equal(r.status,"INSUFFICIENT_HEADROOM");
  assert.equal(r.remainingAfterReservationUwolo,null);
});
test("uncertain transfer still consumes prospective fee headroom", () => {
  const i=base();
  assert.equal(assessSatchelFeeHeadroom({...i,pendingOperations:i.pendingOperations.slice(0,1)}).pendingFeeUwolo,1n);
  assert.equal(assessSatchelFeeHeadroom(i).pendingFeeUwolo,2n);
});
test("incomplete producer / fee inventory holds regardless of apparent bank surplus", () => {
  const r=assessSatchelFeeHeadroom({...base(),pendingOperationsComplete:false,bankBalanceUwolo:900000000n});
  assert.equal(r.status,"CENSUS_INCOMPLETE");
  assert.equal(r.requiredUwolo,null);
  assert.equal(r.spendingAuthorized,false);
});
test("duplicate operation identities reject instead of undercounting fees", () => {
  assert.throws(()=>assessSatchelFeeHeadroom({...base(),pendingOperations:[
    {operationId:"same",feeUwolo:1n,status:"uncertain"},
    {operationId:"same",feeUwolo:2n,status:"prepared"},
  ]}),/noncanonical_or_duplicate_pending_operation/);
});
test("invalid and excessive pending / next fees refuse", () => {
  for (const fee of [-1n,0n,1000001n,5,undefined]) {
    assert.throws(()=>assessSatchelFeeHeadroom({...base(),newOperationFeeUwolo:fee as bigint}),/SATCHEL_FEE_HEADROOM_INVALID/);
    assert.throws(()=>assessSatchelFeeHeadroom({...base(),pendingOperations:[
      {operationId:"id",feeUwolo:fee as bigint,status:"prepared"},
    ]}),/SATCHEL_FEE_HEADROOM_INVALID/);
  }
});
test("overflow, unsafe identities, noninteger banks and excessive census sizes refuse", () => {
  assert.throws(()=>assessSatchelFeeHeadroom({...base(),totalOwnerLiabilitiesUwolo:9223372036854775807n}),/aggregate_overflow/);
  assert.throws(()=>assessSatchelFeeHeadroom({...base(),pendingOperations:Array.from({length:10001},(_,i)=>({
    operationId:"id:"+i,feeUwolo:1n,status:"prepared" as const,
  }))}),/pending_operations_not_bounded/);
  assert.throws(()=>assessSatchelFeeHeadroom({...base(),pendingOperations:[
    {operationId:"../../file",feeUwolo:1n,status:"prepared"},
  ]}),/noncanonical_or_duplicate_pending_operation/);
  assert.throws(()=>assessSatchelFeeHeadroom({...base(),bankBalanceUwolo:-1n}),/bank_balance/);
});
test("completeness is an exact boolean, never a truthy guess", () => {
  assert.equal(assessSatchelFeeHeadroom({...base(),pendingOperationsComplete:"true" as unknown as boolean}).status,"CENSUS_INCOMPLETE");
  assert.equal(assessSatchelFeeHeadroom({...base(),pendingOperationsComplete:undefined as unknown as boolean}).status,"CENSUS_INCOMPLETE");
});
