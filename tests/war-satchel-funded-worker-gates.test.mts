import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const read=(name:string)=>readFileSync(new URL("../"+name,import.meta.url),"utf8");

test("funded Mecha worker has no public timer and always fails shut without certified operator approvals",()=>{
 const worker=read("scripts/war-satchel-funded-mecha-worker.ts");
 assert.match(worker,/const execute = args\[0\] === "--execute"/);
 assert.match(worker,/!approved\(\)/);
 assert.match(worker,/WAR_SATCHEL_SIGNER_OPERATOR_APPROVED/);
 assert.match(worker,/WAR_SATCHEL_SIGNER_CLIENT_ENABLED/);
 assert.doesNotMatch(worker,/createLocalIsolatedSatchelSigner|assertLocalSatchelSignerHealth/);
 assert.match(worker,/WAR_SATCHEL_VAULT_WITHDRAWAL_CERTIFIED/);
 assert.match(worker,/WAR_SATCHEL_UNMATCHED_REFUND_CREDIT_CERTIFIED/);
 assert.match(worker,/WAR_SATCHEL_BET_PAYOUT_ROUTING_CERTIFIED/);
 assert.match(worker,/await connectCertifiedSatchelSigner\(\)/);
 assert.match(worker,/executeFundedMechaTicketBatch\(prisma, signer, ids\)/);
 assert.match(worker,/take: MAX_BATCH/);
 assert.match(worker,/attemptCount: 0/);
 assert.match(worker,/reservationId: null/);
 assert.match(worker,/process\.exitCode = 3/);
 assert.doesNotMatch(worker,/fromMnemonic\(|runuser|exec\(|systemctl|cron\(/);
});
test("the signer client only accepts approved local port, owner-fenced memo and the correct betting escrow",()=>{
 const src=read("lib/warSatchelIsolatedSignerTransport.ts");
 assert.match(src,/http:\/\/127\.0\.0\.1:8094/);
 assert.match(src,/const ROLE = "exclusive-war-satchel-v1"/);
 assert.match(src,/recipientAddress !== config\.escrowAddress/);
 assert.match(src,/approvedByOperator !== true/);
 assert.match(src,/await assertLocalSatchelSignerHealth\(config, reader\)/);
 assert.match(src,/keyFingerprint !== config\.keyFingerprint/);
 assert.match(src,/reason: "signer_request_or_acknowledgement_unknown"/);
 assert.doesNotMatch(src,/setTimeout\(|retry\(|while\s*\(/);
});

test("protected Watcher tick and one-off operator CLI share ONE signer implementation",()=>{
 const tick=read("lib/warSatchelFundedWatcherTick.ts");
 const worker=read("scripts/war-satchel-funded-mecha-worker.ts");
 const source=read("lib/warSatchelDedicatedSignerClient.ts");
 assert.match(tick,/connectCertifiedSatchelSigner/);
 assert.match(worker,/connectCertifiedSatchelSigner/);
 assert.match(source,/const ENDPOINT = "http:\/\/127\.0\.0\.1:8094"/);
 assert.match(source,/build_sha256 !== cfg\.build/);
 assert.match(source,/durable_request_fenced !== true/);
 assert.doesNotMatch(tick+worker,/createLocalIsolatedSatchelSigner|assertLocalSatchelSignerHealth/);
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
