import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSatchelWagerAuthorization, wagerReviewContext, wagerFinancialContext, assertAuthenticatedSatchelWager } from '../lib/warSatchelWagerAuthorization.ts';
import { readFileSync } from 'node:fs';
const fixture=JSON.parse(readFileSync(new URL('fixtures/satchel-financial-bridge-v1.json',import.meta.url),'utf8'));
const input={executionId:1,ownerUserId:2,ownerUid:'owner-1',ownerWallet:fixture.betting_escrow,
  reservationId:'satchel:reserve:1',operationId:'satchel:ticket:1',ticketId:4,
  vault:fixture.vault,recipient:fixture.betting_escrow,amountUwolo:'12000000',
  memo:'AoE2HDBets bet ticket v1 · ticket 4',gameIdentityKey:'watcher:one',propositionHash:'a'.repeat(64),
  presetId:3,presetVersion:1,consentId:'c',challengeText:'original Keplr mandate',ownerSignatureJson:{signature:'original'},
  ledgerVersion:'1',availableUwolo:'88000000',reservedUwolo:'12000000',journalId:'7',
  legs:[{id:1,marketId:2,side:'left',amountWolo:12,propositionHash:'a'.repeat(64)}]};
test('durable wager snapshot binds all economics, consent, ledger and actual ticket legs',()=>{
 const a=buildSatchelWagerAuthorization(input);
 assert.equal(a.operationId,'satchel:ticket:1');
 for(const [key,value] of Object.entries({...input,ownerUid:'other',ownerUserId:3,ownerWallet:fixture.vault,
   ticketId:5,gameIdentityKey:'watcher:other',presetVersion:2,challengeText:'different',ledgerVersion:'2',journalId:'8',
   propositionHash:'b'.repeat(64),amountUwolo:'13000000',memo:'AoE2HDBets bet ticket v1 · ticket 5'})){
   if(input[key as keyof typeof input]===value)continue;
   try { assert.notEqual(buildSatchelWagerAuthorization({...input,[key]:value}).reservationDigest,a.reservationDigest,key); }
   catch(error){assert.match(String(error),/snapshot_identity_or_economics/);}
 }
 assert.notEqual(buildSatchelWagerAuthorization({...input,legs:[{...input.legs[0],side:'right'}]}).reservationDigest,a.reservationDigest);
 assert.deepEqual(buildSatchelWagerAuthorization({...input,ownerSignatureJson:{signature:'original'}}),a);
});
test('durable economic snapshot accepts 10000 WOLO and refuses 10001 or nonwhole amounts',()=>{
 const large={...input,amountUwolo:'10000000000',
   availableUwolo:'11000000000',reservedUwolo:'10000000000',
   legs:[{...input.legs[0],amountWolo:10000}]};
 assert.equal(buildSatchelWagerAuthorization(large).snapshot.amountUwolo,'10000000000');
 for(const invalid of ['10001000000','10000000001','010000000000','1e10','0']){
  assert.throws(()=>buildSatchelWagerAuthorization({
   ...large,amountUwolo:invalid,
   legs:[{...input.legs[0],amountWolo:10001}],
  }),/snapshot_identity_or_economics/,invalid);
 }
 assert.throws(()=>buildSatchelWagerAuthorization({
  ...large,amountUwolo:'10000000000',
  legs:[{...input.legs[0],amountWolo:9999}],
 }),/snapshot_identity_or_economics/,'signed amount never substitutes for exact ticket legs');
});

test('review context uses durable snapshot, never signer supplied economics',()=>{
 const a=buildSatchelWagerAuthorization(input);
 const c=wagerReviewContext(a,{fee_uwolo:'5000',issued_at:1800000000,expires_at:1800000120});
 assert.equal(c.ownerUid,input.ownerUid);assert.equal(c.amountUwolo,input.amountUwolo);
 assert.equal(c.reservationDigest,a.reservationDigest);assert.equal(c.memo,input.memo);
 const financial=wagerFinancialContext(a,{...c} as never,'A'.repeat(64));
 assert.equal(financial.operation_id,input.operationId);assert.equal(financial.recipient,input.recipient);
});
test('untrusted or copied JSON cannot authorize canonical ticket acceptance',()=>{
 const a=buildSatchelWagerAuthorization(input);
 for(const fake of [null,{}, {kind:'wager',ownerUid:input.ownerUid,operationId:input.operationId,txHash:'A'.repeat(64),height:100n,
    contextDigest:a.reservationDigest,verifiedAtMs:Date.now(),authenticatedHeadExpiresAtMs:Date.now()+30000}]){
  assert.throws(()=>assertAuthenticatedSatchelWager(fake,a,{} as never,'A'.repeat(64)),/authenticated_wager_proof_required/);
 }
});

test('same-total canonical promotion cannot reuse the old independently reviewed legs',async()=>{
 const {assertSatchelWagerTicketLegs}=await import('../lib/warSatchelWagerAuthorization.ts');
 const a=buildSatchelWagerAuthorization(input);
 assert.doesNotThrow(()=>assertSatchelWagerTicketLegs(a,input.legs));
 for(const change of [{side:'right'},{marketId:3},{id:2},{amountWolo:11},{propositionHash:'b'.repeat(64)}])
  assert.throws(()=>assertSatchelWagerTicketLegs(a,[{...input.legs[0],...change}]),/reviewed_ticket_legs_changed/);
 assert.throws(()=>assertSatchelWagerTicketLegs(a,[input.legs[0],input.legs[0]]),/reviewed_ticket_legs_changed/);
});

test('financial context digest equals golden emitted by actual Go FinancialContextDigest',async()=>{
 const {wagerFinancialContextDigest}=await import('../lib/warSatchelWagerAuthorization.ts');
 const g=JSON.parse(readFileSync(new URL('fixtures/satchel-wager-financial-context-v1.json',import.meta.url),'utf8'));
 const c=g.context,r=c.reservation;
 const a=buildSatchelWagerAuthorization({...input,executionId:1,operationId:c.operation_id,ticketId:1,
   ownerUid:c.owner_id,vault:c.sender,recipient:c.recipient,amountUwolo:c.amount_uwolo,memo:c.memo,
   legs:[{...input.legs[0],amountWolo:Number(c.amount_uwolo)/1000000}]});
 assert.equal(wagerFinancialContextDigest(a,r,c.tx_hash),g.expected_context_digest);
});

test('waiting review keeps the original reserve; restart resumes once and unknown never re-enters signing',async()=>{
 const {runFundedMechaTransitionBatch}=await import('../lib/betAutomationFundedTransition.ts');
 const claim={kind:'atomically_reserved' as const,executionId:1,reservationId:'satchel:reserve:1',
  ticketRequestId:'satchel:ticket:1',ownerUid:'owner-1',gameIdentityKey:'watcher:one',reserveUwolo:'12000000'};
 let state='reserved',approved=false,sends=0,commits=0,releases=0,holds=0;
 const ports={claimAndReserve:async()=>state==='reserved'?claim:{kind:'already_handled' as const},
  submitReservedTicket:async()=>{if(!approved)return {kind:'waiting_for_review' as const,reason:'independent_review_missing'};
   sends++;state='unknown';return {kind:'unknown_after_broadcast' as const,reason:'lost ACK'};},
  commitAccepted:async()=>{commits++;},releaseUnbroadcast:async()=>{releases++;},holdUnknown:async()=>{holds++;state='unknown';}};
 const first=await runFundedMechaTransitionBatch([1],ports);assert.equal(first.accepted,0);
 assert.equal(state,'reserved');assert.equal(sends+commits+releases+holds,0);
 approved=true;await runFundedMechaTransitionBatch([1],ports);
 await runFundedMechaTransitionBatch([1],ports);
 assert.equal(sends,1);assert.equal(holds,1);assert.equal(commits+releases,0);
});
