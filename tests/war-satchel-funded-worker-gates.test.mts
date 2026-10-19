import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const read=(name:string)=>readFileSync(new URL("../"+name,import.meta.url),"utf8");

test("funded Mecha worker has no public timer and always fails shut without certified operator approvals",()=>{
 const worker=read("scripts/war-satchel-funded-mecha-worker.ts");
 const selector=read("lib/warSatchelEligibleOutbox.ts");
 assert.match(worker,/const execute = args\[0\] === "--execute"/);
 assert.match(worker,/!approved\(\)/);
 assert.match(worker,/return satchelFinancialBridgeReady\(\) &&/);
 assert.match(worker,/if \(!execute && !satchelFinancialBridgeReady\(\)\)/);
 assert.match(worker,/financial_bridge_unverified_hold/);
 assert.ok(worker.indexOf("if (execute && !approved())") < worker.indexOf("const prisma = getPrisma()"),
   "execute must be stopped before Prisma queue initialization");
 assert.match(worker,/WAR_SATCHEL_SIGNER_OPERATOR_APPROVED/);
 assert.match(worker,/WAR_SATCHEL_SIGNER_CLIENT_ENABLED/);
 assert.doesNotMatch(worker,/createLocalIsolatedSatchelSigner|assertLocalSatchelSignerHealth/);
 assert.match(worker,/WAR_SATCHEL_VAULT_WITHDRAWAL_CERTIFIED/);
 assert.match(worker,/WAR_SATCHEL_UNMATCHED_REFUND_CREDIT_CERTIFIED/);
 assert.match(worker,/WAR_SATCHEL_BET_PAYOUT_ROUTING_CERTIFIED/);
 assert.match(worker,/await connectCertifiedSatchelSigner\(\)/);
 assert.match(worker,/executeFundedMechaTicketBatch\(prisma, signer, ids\)/);
 assert.match(selector,/take: max/);
 assert.match(selector,/ticketId:\s*null/);
 assert.match(selector,/status: "shadow_ready", reservationId: null, attemptCount: 0/);
 assert.match(selector,/status: "funded_reserved", reservationId: \{ not: null \}, attemptCount: 1/);
 assert.match(selector,/wagerAuthorization: \\{ isNot: null \\}/);
 assert.doesNotMatch(selector,/status: "unknown_hold"|status: "funded_submitting"/);
 assert.match(worker,/readEligibleFundedMechaIds\(prisma,\{limit:MAX_BATCH\}\)/);
 assert.doesNotMatch(worker,/betAutoExecution\.findMany/);
 assert.match(selector,/nextAttemptAt/);
 assert.match(selector,/gamesRemaining: \{ gt: 0 \}/);
 assert.match(worker,/process\.exitCode = 3/);
 assert.doesNotMatch(worker,/fromMnemonic\(|runuser|exec\(|systemctl|cron\(/);
});
test("retired camel-case signer cannot retain a financial or health I/O path",()=>{
 const src=read("lib/warSatchelIsolatedSignerTransport.ts");
 assert.match(src,/SATCHEL_SIGNER_INTERFACE_RETIRED:use_connectCertifiedSatchelSigner/);
 assert.match(src,/createLocalIsolatedSatchelSigner/);
 assert.match(src,/assertLocalSatchelSignerHealth/);
 assert.doesNotMatch(src,/https?:\/\/|submitOneShot|Authorization|reader\(|fetch\(|setTimeout\(|retry\(|while\s*\(/);
});

test("protected Watcher tick and one-off operator CLI share ONE signer implementation",()=>{
 const tick=read("lib/warSatchelFundedWatcherTick.ts");
 const worker=read("scripts/war-satchel-funded-mecha-worker.ts");
 const source=read("lib/warSatchelDedicatedSignerClient.ts");
 assert.match(tick,/connectCertifiedSatchelSigner/);
 assert.match(worker,/connectCertifiedSatchelSigner/);
 assert.match(source,/const ENDPOINT = "http:\/\/127\.0\.0\.1:8094"/);
 assert.match(source,/build_sha256 !== cfg\.build/);
 assert.match(source,/durable_request_fenced\s*!==\s*true/);
 assert.match(source,/execution_protocol !== 2/);
 assert.match(source,/owner_bound_wager_reservation_required !== true/);
 assert.doesNotMatch(tick+worker+read("lib/warSatchelFundedOutboxTick.ts"),/warSatchelIsolatedSignerClient|warSatchelIsolatedSignerTransport|makeSatchelLoopbackSigner|createLocalIsolatedSatchelSigner|assertLocalSatchelSignerHealth/);
});

test("stale player/market/consent rejection cannot starve the Watcher queue or trigger an unsafe retry",()=>{
 const source=read("lib/warSatchelAutoBetExecutor.ts");
 assert.match(source,/error\.message\.startsWith\("WAR_SATCHEL_FUNDED_REFUSED:"\)/);
 assert.match(source,/return \{ kind: "ineligible" as const \}/);
 assert.match(source,/throw error;/);
 // Only explicitly thrown business vetoes made inside the rolled-back
 // reservation transaction are skippable. A DB timeout or commit failure
 // remains an unknown state and MUST stop rather than submit again.
 assert.doesNotMatch(source,/catch \{\s*return \{ kind: "ineligible"/);
});
