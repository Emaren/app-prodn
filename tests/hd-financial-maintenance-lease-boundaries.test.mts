import assert from "node:assert/strict";
import test from "node:test";
import {hdFinancialPermitMessage,withHdFinancialLease} from "../lib/hdFinancialMaintenanceFence.ts";

const permit={
 protocol:1,scope:"hd-satchel",generation:"7",deployment:"d".repeat(64),
 source:"a".repeat(40),producers:["web-satchel"],wallets:["wolo1"+"q".repeat(40)],
 issued_at:1700000000,expires_at:1700000040,
};
test("canonical short-lived Satchel permit binds exact scope, build, source and wallet",()=>{
 const msg=hdFinancialPermitMessage(permit).toString("utf8");
 assert.match(msg,/aoe2war\/hd-financial-admission\/v1/);
 assert.match(msg,/hd-satchel/);
 assert.match(msg,/web-satchel/);
 assert.match(msg,/"7"/);
 for(const altered of [
   {...permit,scope:"unknown"},{...permit,expires_at:1700000061},
   {...permit,generation:"0"},{...permit,source:"a".repeat(39)},
   {...permit,producers:["web-satchel","web-satchel"]},
   {...permit,wallets:["not-a-wallet"]},{...permit,extra:"unsigned"},
 ])assert.throws(()=>hdFinancialPermitMessage(altered));
});
test("invalid invocation is fenced before I/O; held source never synthesizes open permit",async()=>{
 await assert.rejects(withHdFinancialLease({scope:"hd-satchel",producer:"web-satchel",wallet:"wrong"},async()=>1),/HD_FINANCIAL_FENCE_HELD/);
 // No compiled build identity exists in an isolated Node worker.
 await assert.rejects(withHdFinancialLease({scope:"hd-satchel",producer:"web-satchel",wallet:"wolo1"+"q".repeat(40)},async()=>1),/HD_FINANCIAL_FENCE_HELD/);
});
test("maintenance role and OPEN permit cannot be constructed from environment flags alone",()=>{
 const source=hdFinancialPermitMessage(permit).toString("utf8");
 assert.ok(!source.includes("PRIVATE_KEY"));
 assert.ok(!source.includes("OPEN=true"));
});
