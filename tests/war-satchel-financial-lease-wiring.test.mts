import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const source=(file:string)=>readFileSync(new URL("../"+file,import.meta.url),"utf8");

test("funded outbox wraps EVERY one-shot Wolo signer submission in an independent financial lease",()=>{
 const s=source("lib/warSatchelFundedOutboxTick.ts");
 assert.match(s,/withHdFinancialLease\(/);
 assert.match(s,/scope:"hd-satchel",producer:"war-satchel-auto-bet"/);
 assert.match(s,/wallet:signer\.attestedVaultAddress/);
 assert.match(s,/connectCertifiedSatchelSigner\(fetch,signal\)/);
 assert.match(s,/current\.attestedVaultAddress!==signer\.attestedVaultAddress/);
 assert.match(s,/prisma,leaseBoundSigner,ids/);
 assert.doesNotMatch(s,/prisma,signer,ids/);
});
test("new withdrawals acquire a signed lease BEFORE the only atomic durable attempt",()=>{
 const s=source("lib/warSatchelWithdrawalRuntime.ts");
 const start=s.indexOf('if(record.status==="reserved")');
 const end=s.indexOf('}else if(record.status==="unknown_hold")',start);
 assert.ok(start>=0 && end>start);
 const first=s.slice(start,end);
 const lease=first.indexOf("withHdFinancialLease(");
 const attempt=first.indexOf("markSatchelWithdrawalAttempt(");
 const post=first.indexOf('request("/v1/satchel/withdrawals"');
 assert.ok(lease>=0 && attempt>lease && post>attempt);
 assert.match(first,/scope:"hd-satchel",producer:"war-satchel-withdrawal"/);
 assert.match(first,/fenced\.request,reader,signal/);
 assert.match(first,/if\(!admissionEntered\)return \{state:"release_held"\}/);
 assert.match(first,/return \{state:"unknown_hold"\}/);
 assert.doesNotMatch(first,/satchelWithdrawalAttempt\.findUnique/,"uncertainty must not depend on a successful follow-up database read");
 assert.doesNotMatch(first,/allowUnfenced|permitOverride|skipAuthorization/);
 assert.ok(s.includes('request("/satchel/v1/reconcile"'),"recovery remains strictly reconciliation-only");
});
test("environment flags cannot convert the currently source-held financial bridge into spending authority",()=>{
 const hold=source("lib/warSatchelFinancialBridgeHold.ts");
 assert.match(hold,/SATCHEL_FINANCIAL_BRIDGE_READY = false as const/);
 const policy=source("lib/hdFinancialMaintenanceFence.ts");
 assert.match(policy,/compiled_runtime_identity_missing/);
 assert.match(policy,/financial_admission_expired/);
 assert.match(policy,/verify\(null,bytes/);
 assert.match(policy,/pg_advisory_xact_lock_shared/);
});
