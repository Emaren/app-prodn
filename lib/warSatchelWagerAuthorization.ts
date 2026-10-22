/** Immutable HD reservation snapshots; no issuer, key, broadcast or balance authority. */
import { createHash } from 'node:crypto';
import { financialProofFreshAt, type AuthenticatedWarSatchelFinancialProof } from './warSatchelAuthenticatedFinancialProof.ts';
import type { SatchelWagerReservation, SatchelWagerReservationContext } from './warSatchelWagerReservation.ts';

export type SatchelWagerSnapshot = Readonly<{
  executionId:number;ownerUserId:number;ownerUid:string;ownerWallet:string;
  reservationId:string;operationId:string;ticketId:number;vault:string;recipient:string;amountUwolo:string;memo:string;
  gameIdentityKey:string;propositionHash:string;presetId:number;presetVersion:number;
  consentId:string;challengeText:string;ownerSignatureJson:unknown;
  ledgerVersion:string;availableUwolo:string;reservedUwolo:string;journalId:string;
  legs:readonly Readonly<{id:number;marketId:number;side:string;amountWolo:number;propositionHash:string}>[];
}>;
export type DurableSatchelWagerAuthorization = Readonly<{
  snapshot:SatchelWagerSnapshot;operationId:string;ownerUserId:number;reservationId:string;
  reservationDigest:string;ledgerRevision:string;consentDigest:string;
}>;
function stop(reason:string):never{throw Error('SATCHEL_WAGER_AUTHORIZATION_REFUSED:'+reason);}
function canonical(x:unknown):unknown{
  if(Array.isArray(x))return x.map(canonical);
  if(x&&typeof x==='object')return Object.fromEntries(Object.entries(x).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>[k,canonical(v)]));
  return x;
}
const sha=(value:unknown)=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
/** All fields come from DB rows under the existing global Satchel lock. */
export function buildSatchelWagerAuthorization(input:SatchelWagerSnapshot):DurableSatchelWagerAuthorization{
  const s=JSON.parse(JSON.stringify(input)) as SatchelWagerSnapshot;
  if(![s.executionId,s.ownerUserId,s.ticketId,s.presetId,s.presetVersion].every(n=>Number.isSafeInteger(n)&&n>0)||
    s.reservationId!=='satchel:reserve:'+s.executionId||s.operationId!=='satchel:ticket:'+s.executionId||
    s.memo!=='AoE2HDBets bet ticket v1 · ticket '+s.ticketId||!s.ownerUid||!s.ownerWallet||s.vault===s.recipient||
    !/^[1-9][0-9]{0,9}$/.test(s.amountUwolo)||BigInt(s.amountUwolo)>BigInt(1000000000)||
    !s.challengeText||!s.ownerSignatureJson||!s.legs.length||s.legs.length>2||
    s.legs.some(l=>!Number.isSafeInteger(l.amountWolo)||l.amountWolo<=0||!['left','right'].includes(l.side)||
      l.propositionHash!==s.propositionHash)||
    s.legs.reduce((sum,l)=>sum+BigInt(l.amountWolo)*BigInt(1000000),BigInt(0))!==BigInt(s.amountUwolo))stop('snapshot_identity_or_economics');
  const consentDigest=sha(['aoe2war/satchel/hd-wager-consent/v1',s.consentId,s.challengeText,s.ownerSignatureJson]);
  const ledgerRevision=sha(['aoe2war/satchel/hd-wager-ledger/v1',s.ownerUserId,s.ledgerVersion,s.availableUwolo,s.reservedUwolo,s.journalId]);
  const reservationDigest=sha(['aoe2war/satchel/hd-wager-reservation/v1',s,consentDigest,ledgerRevision]);
  return Object.freeze({snapshot:s,operationId:s.operationId,ownerUserId:s.ownerUserId,reservationId:s.reservationId,
    consentDigest,ledgerRevision,reservationDigest});
}
export function wagerReviewContext(a:DurableSatchelWagerAuthorization,
  review:Pick<SatchelWagerReservation,'fee_uwolo'|'issued_at'|'expires_at'>):SatchelWagerReservationContext{
  const s=a.snapshot;
  return {operationId:s.operationId,ownerUid:s.ownerUid,vault:s.vault,recipient:s.recipient,amountUwolo:s.amountUwolo,
    memo:s.memo,reservationDigest:a.reservationDigest,ledgerRevision:a.ledgerRevision,consentDigest:a.consentDigest,
    feeUwolo:review.fee_uwolo,issuedAt:review.issued_at,expiresAt:review.expires_at};
}
/** Fixed Go FinancialProofContext + WagerReservation field ordering. */
export function wagerFinancialContext(a:DurableSatchelWagerAuthorization,r:SatchelWagerReservation,txHash:string){
  const s=a.snapshot;
  return {protocol:1,kind:'wager',owner_id:s.ownerUid,operation_id:s.operationId,sender:s.vault,recipient:s.recipient,
    amount_uwolo:s.amountUwolo,memo:s.memo,tx_hash:txHash,reservation:{version:r.version,operation_id:r.operation_id,
      owner_id:r.owner_id,vault:r.vault,recipient:r.recipient,amount_uwolo:r.amount_uwolo,memo:r.memo,
      reservation_digest:r.reservation_digest,ledger_revision:r.ledger_revision,consent_digest:r.consent_digest,
      fee_uwolo:r.fee_uwolo,issued_at:r.issued_at,expires_at:r.expires_at,signature:r.signature}};
}
export function wagerFinancialContextDigest(a:DurableSatchelWagerAuthorization,r:SatchelWagerReservation,txHash:string){
  const json=JSON.stringify(wagerFinancialContext(a,r,txHash)).replace(/[<>&\u2028\u2029]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'));
  return createHash('sha256').update(json).digest('hex');
}
/** HTTP JSON, copied opaque symbols, ACKs and expired proofs never satisfy this guard. */
export function assertAuthenticatedSatchelWager(value:unknown,a:DurableSatchelWagerAuthorization,
  r:SatchelWagerReservation,txHash:string):asserts value is AuthenticatedWarSatchelFinancialProof{
  if(!financialProofFreshAt(value)||value.kind!=='wager'||value.ownerUid!==a.snapshot.ownerUid||
    value.operationId!==a.operationId||value.txHash!==txHash||
    value.contextDigest!==wagerFinancialContextDigest(a,r,txHash))stop('authenticated_wager_proof_required');
}

export type SatchelWagerTicketLeg=Readonly<{id:number;marketId:number;side:string;amountWolo:number;propositionHash:string}>;
/** Canonical market promotion can mutate ticket legs. A review never follows
 * that mutation implicitly, even if the total and memo happen to be unchanged. */
export function assertSatchelWagerTicketLegs(a:DurableSatchelWagerAuthorization,legs:readonly SatchelWagerTicketLeg[]){
 const normalized=(xs:readonly SatchelWagerTicketLeg[])=>xs.map(l=>[l.id,l.marketId,l.side,l.amountWolo,l.propositionHash]).sort((x,y)=>Number(x[0])-Number(y[0]));
 if(JSON.stringify(normalized(a.snapshot.legs))!==JSON.stringify(normalized(legs)))stop('reviewed_ticket_legs_changed');
}
