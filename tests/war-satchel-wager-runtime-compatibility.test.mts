import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {fromBech32} from "@cosmjs/encoding";
import {wagerReservationSignBytes} from "../lib/warSatchelWagerReservation.ts";

// Public Go test fixture. This test checks primitives used by the signed
// review validator, without weakening or mocking the production verifier.
const fixture = JSON.parse(readFileSync(new URL("./fixtures/satchel-wager-financial-context-v1.json",import.meta.url),"utf8"));
const r = fixture.context.reservation;
test("Go reservation fixture remains canonical on Linux and Mac runtimes",()=>{
 const encodedAddress=(v:unknown)=>{
   if(typeof v!=="string")return false;
   try {const x=fromBech32(v);return x.prefix==="wolo"&&x.data.length===20;}
   catch{return false;}
 };
 const amount=(v:unknown,limit:bigint)=>typeof v==="string"&&/^[1-9][0-9]{0,18}$/.test(v)
   && BigInt(v)<=9223372036854775807n&&BigInt(v)<=limit;
 const digest=(v:unknown)=>typeof v==="string"&&/^[a-f0-9]{64}$/.test(v)&&v!=="0".repeat(64);
 const checks={
   version:r.version===1,
   operation:/^satchel:ticket:[1-9][0-9]{0,11}$/.test(r.operation_id),
   owner:/^[a-zA-Z0-9_.:-]{1,100}$/.test(r.owner_id),
   vault:encodedAddress(r.vault),
   recipient:encodedAddress(r.recipient),
   distinct:r.vault!==r.recipient,
   amount:amount(r.amount_uwolo,1000000000n),
   wholeWolo:BigInt(r.amount_uwolo)%1000000n===0n,
   memo:/^AoE2HDBets bet ticket v1 · ticket [1-9][0-9]{0,11}$/.test(r.memo),
   reservationDigest:digest(r.reservation_digest),
   ledgerRevision:digest(r.ledger_revision),
   consentDigest:digest(r.consent_digest),
   fee:amount(r.fee_uwolo,1000000n),
   issued:Number.isSafeInteger(r.issued_at),
   expires:Number.isSafeInteger(r.expires_at),
 };
 for(const [name,passed] of Object.entries(checks)){
   assert.equal(passed,true, `cross-runtime fixture rejection in ${name}`);
 }
 assert.doesNotThrow(()=>wagerReservationSignBytes(r));
});
