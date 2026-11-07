import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
const read=(p:string)=>readFileSync(new URL("../"+p,import.meta.url),"utf8");

test("record-only operator CLI requires exact owner, exact execution and explicit finance authorization",()=>{
 const cli=read("scripts/war-satchel-reconcile-recorded-ticket.ts");
 assert.match(cli,/argv\.length!==3/);
 assert.match(cli,/parsePositive\(argv\[1\]\),ownerUserId=parsePositive\(argv\[2\]\)/);
 assert.match(cli,/WAR_SATCHEL_RECORD_ONLY_RECONCILIATION_ENABLED/);
 assert.match(cli,/WAR_SATCHEL_FINANCIAL_OPERATOR_ATTESTED/);
 assert.match(cli,/reserve\.ownerUserId!==ownerUserId/);
 assert.match(cli,/reconcileRecordedSatchelTicket\(prisma,\{executionId,ownerUserId\}\)/);
 assert.match(cli,/transferSent:false/);
 assert.doesNotMatch(cli,/sendTokens\(|submitOneShot\(|\.broadcastTx\(|\.txBankSend\(/);
});
test("uninstalled production DB is not queried for nonexistent financial tables",()=>{
 const cli=read("scripts/war-satchel-reconcile-recorded-ticket.ts");
 const i=cli.indexOf('if (process.env.WAR_SATCHEL_FUNDED_LEDGER_ENABLED!=="true")');
 const q=cli.indexOf("prisma.satchelFundedReservation.findUnique");
 assert(i>=0&&q>i);
 assert.match(cli,/source:"not_installed"/);
});
