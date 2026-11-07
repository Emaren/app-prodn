import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read=(file:string)=>readFileSync(new URL("../"+file,import.meta.url),"utf8");

test("owner can recover only their own prepared funding attempt, never the vault destination",()=>{
 const api=read("app/api/user/war-satchel/funding-intents/route.ts");
 const idx=api.lastIndexOf("export async function GET");
 assert(idx>0);
 const getter=api.slice(idx);
 assert.match(getter,/getSessionUid\(request\)/);
 assert.match(getter,/userId: actor\.id, senderAddress: actor\.walletAddress/);
 assert.match(getter,/take: 5/);
 assert.match(getter,/needsTransactionHash: true/);
 assert.match(getter,/Do not resend/);
 assert.doesNotMatch(getter,/memo: intent\.memo|vaultAddress: intent\.vaultAddress/);
});
test("a lost Keplr response can never offer the same send a second time",()=>{
 const ui=read("components/profile/WarSatchelFundingAction.tsx");
 assert.match(ui,/setIntentId\(quote\.intentId\)/);
 assert.match(ui,/setMayHaveSent\(true\)/);
 assert.match(ui,/knownIntents\.length > 0/);
 assert.match(ui,/mayHaveSent \|\|/);
 assert.match(ui,/VERIFY EXISTING TRANSFER — DO NOT RESEND/);
 assert.match(ui,/\/api\/user\/war-satchel\/deposit-evidence/);
 assert.match(ui,/\/api\/user\/war-satchel\/credit-verified/);
 assert.doesNotMatch(ui,/localStorage\.|sessionStorage\.|document\.cookie/);
});
test("recover a transaction ONLY after matching saved intent and 64-char hash",()=>{
 const ui=read("components/profile/WarSatchelFundingAction.tsx");
 assert.match(ui,/TX_HASH\.test\(recoveryHash\.toUpperCase\(\)\)/);
 assert.match(ui,/knownIntents\.some\(item => item\.id === recoveryIntent\)/);
 assert.match(ui,/setIntentId\(recoveryIntent\)/);
 assert.match(ui,/setTxHash\(recoveryHash\.toUpperCase\(\)\)/);
 assert.match(ui,/No WOLO will be resent/);
});

test("already-credited receipts cannot trap a player's next legitimate Keplr deposit",()=>{
 const api=read("app/api/user/war-satchel/funding-intents/route.ts");
 const locked=api.slice(api.indexOf("const outstanding ="));
 assert.match(locked,/proofCandidate: \{ is: null \}/);
 assert.match(locked,/fundedReceipt: \{ is: null \}/);
 const ui=read("components/profile/WarSatchelFundingAction.tsx");
 assert.match(ui,/setKnownIntents\(current => current\.filter\(x => x\.id !== intentId\)\)/);
 assert.match(ui,/PREPARE ANOTHER DEPOSIT/);
 assert.match(ui,/setMayHaveSent\(false\)/);
});
