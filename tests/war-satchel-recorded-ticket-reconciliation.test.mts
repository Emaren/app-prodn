import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
const code=(path:string)=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("recover only the same owner and same source id from a previously verified ticket",()=>{
 const src=code("lib/warSatchelRecordedTicketReconciliation.ts");
 assert.match(src,/reserve\.ticketRequestId !== "satchel:ticket:" \+ input\.executionId/);
 assert.match(src,/reserve\.id !== "satchel:reserve:" \+ input\.executionId/);
 assert.match(src,/reserve\.ownerUserId !== input\.ownerUserId/);
 assert.match(src,/ticket\.status !== "recorded"/);
 assert.match(src,/ticket\.recordedAt === null/);
 assert.match(src,/ticket\.userId !== input\.ownerUserId/);
 assert.match(src,/ticket\.walletAddress !== \(process\.env\.WAR_SATCHEL_CERTIFIED_VAULT_ADDRESS/);
 assert.match(src,/commitVerifiedSatchelAutoTicket\(prisma/);
});
test("a payout timeout cannot be promoted to acceptance without a recorded ticket",()=>{
 const src=code("lib/warSatchelRecordedTicketReconciliation.ts");
 assert.match(src,/state: "requires_independent_chain_reconciliation"/);
 assert.match(src,/reserve\.status === "released"/);
 assert.match(src,/reserve\.status === "reserved"/);
 assert.match(src,/reserve\.status !== "unknown_hold"/);
 assert.match(src,/WAR_SATCHEL_RECORD_ONLY_RECONCILIATION_ENABLED/);
 assert.doesNotMatch(src,/\.submitOneShot\(|sendTokens\(|\.signArbitrary\(|releaseUnbroadcastSatchelReservation\(/);
});
