import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {test} from "node:test";

const read=(path:string)=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
test("player can cancel only own prebroadcast withdrawal; never arbitrary amount, recipient or UUID",()=>{
 const route=read("app/api/user/war-satchel/withdrawal/route.ts");
 const action=route.slice(route.lastIndexOf("export async function DELETE"));
 assert.match(action,/if \(!enabled\(\)\)/);
 assert.match(action,/if \(!origin\(request\)\)/);
 assert.match(action,/await actor\(request\)/);
 assert.match(action,/Object\.keys\(body\)\.join\(","\)!=="withdrawalId"/);
 assert.match(action,/ownerUserId:active\.user\.id/);
 assert.match(action,/ownerWalletAddress:active\.user\.walletAddress!/);
 assert.match(action,/withdrawal\.status==="unknown_hold"/);
 assert.match(action,/withdrawal\.status==="sent"/);
 assert.match(action,/cancelUnbroadcastSatchelWithdrawal\(active\.prisma/);
 assert.doesNotMatch(action,/submitOneShot|sendTokens|\.broadcastTx|signArbitrary/);
});
test("ledger controls win cancellation/signing race under one globally serialized vault lock",()=>{
 const ledger=read("lib/warSatchelFundedLedger.ts");
 const start=ledger.indexOf("export async function cancelUnbroadcastSatchelWithdrawal(");
 const end=ledger.indexOf("export async function finalizeProvenSatchelWithdrawal(",start);
 assert(start>0&&end>start);
 const fn=ledger.slice(start,end);
 assert.match(fn,/if\(!input\.independentlyNoBroadcast\)/);
 assert.match(fn,/withExclusiveSatchelTx\(prisma,async tx/);
 assert.match(fn,/if\(found\.status!=="reserved"\)/);
 assert.match(fn,/sourceKey:"satchel:withdraw:cancel:"\+found\.id/);
 assert.match(fn,/deltaAvailableUwolo:found\.amountUwolo/);
 assert.match(fn,/deltaWithdrawalPendingUwolo:-found\.amountUwolo/);
 assert.match(fn,/status:"cancelled"/);
 const mark=ledger.slice(ledger.indexOf("export async function markSatchelWithdrawalAttempt("),start);
 assert.match(mark,/withExclusiveSatchelTx\(prisma,async tx/);
 assert.match(mark,/status:"unknown_hold"/);
});
test("refresh exposes a pending withdrawal and enables cancellation only for reserved, never uncertain",()=>{
 const client=read("components/profile/WarSatchelWithdrawAction.tsx");
 assert.match(client,/response\.latest\.find/);
 assert.match(client,/row\.status==="reserved"\|\|row\.status==="unknown_hold"/);
 assert.match(client,/requestStatus!=="reserved"/);
 assert.match(client,/send\("DELETE",\{withdrawalId:requestId\}\)/);
 assert.match(client,/CANCEL UNSENT WITHDRAWAL — RETURN FULL AMOUNT/);
 assert.match(client,/SIGNING UNCERTAIN — NO RESEND OR CANCELLATION/);
});
