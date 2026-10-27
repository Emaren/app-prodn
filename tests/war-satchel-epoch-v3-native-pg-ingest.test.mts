import {test} from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {ingestNativeVerifiedV3Receipt,EPOCH_V3_NATIVE_PG_FINANCIAL_ENABLED,
  EPOCH_V3_NATIVE_SOURCE_PIN} from "../lib/warSatchelEpochV3NativePgIngest.ts";

test("Phase7 held native-Comet verifier refuses ALL inputs before any PG query or legacy fallback",async()=>{
 let calls=0;
 const pg={query:async(_q:string,_v?:unknown[])=>{calls++;throw Error("UNEXPECTED_POSTGRES_OR_PAYMENT_OPERATION")}};
 const cfg={binaryPath:"/tmp/fake-woloescrowd",binarySha256:"a".repeat(64),
   trustAnchorSha256:"b".repeat(64),observedWoloSource:EPOCH_V3_NATIVE_SOURCE_PIN,
   expectedEpoch:"epoch_20261027_funding",expectedOwnerUid:"warrior:alpha",
   expectedTxHash:"C".repeat(64),expectedMessageIndex:0 as const};
 assert.equal(EPOCH_V3_NATIVE_PG_FINANCIAL_ENABLED,false);
 await assert.rejects(
  ()=>ingestNativeVerifiedV3Receipt(cfg,JSON.stringify({native_verdict:"COMET_ICS23_NATIVE_VERIFIED",
    bank_proof:true,credit_authorized:true,source:"legacy-8092",owner_uid:"warrior:alpha"}),pg),
  /NEW_ESCROW_NATIVE_VERIFIER_ABSENT/);
 assert.equal(calls,0);
});
test("Financial read-only preflight cannot manufacture GO when no auditor is enrolled",()=>{
 const src=fileURLToPath(new URL("../scripts/review/epoch_v3_readonly_production_preflight.mjs",import.meta.url));
 const p=spawnSync(process.execPath,[src],{encoding:"utf8",maxBuffer:256*1024,timeout:10000,
   env:{PATH:process.env.PATH||"",NODE_ENV:"test"}});
 assert.equal(p.status,2);
 const x=JSON.parse(p.stdout);
 assert.equal(x.financial_admission,"HOLD");
 assert.equal(x.real_money_authorized,false);
 assert.equal(x.database.queried,false);
 assert.equal(x.actual_native_bank_proof_authenticated_by_this_process,false);
 assert.ok(x.findings.some((f:{code:string})=>f.code==="AUDITOR_CONNECTION_UNAVAILABLE"));
 assert.ok(x.findings.some((f:{code:string})=>f.code==="HISTORICAL_HD_DE_LIABILITIES_UNKNOWN"));
});
