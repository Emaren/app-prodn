import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { satchelFinancialBridgeReady, SATCHEL_FINANCIAL_BRIDGE_READY } from "../lib/warSatchelFinancialBridgeHold.ts";

const route = readFileSync(new URL("../app/api/user/war-satchel/balance/route.ts", import.meta.url), "utf8");

test("owner balance API never claims availability while the financial source HOLD is active",()=>{
  assert.equal(SATCHEL_FINANCIAL_BRIDGE_READY,false);
  assert.equal(satchelFinancialBridgeReady(),false);
  const guard=route.indexOf("const activated = satchelFinancialBridgeReady()");
  const disabled=route.indexOf("if (!activated) return NextResponse.json");
  const session=route.indexOf("await getSessionUid(request)");
  const prisma=route.indexOf("getPrisma()");
  assert.ok(guard>=0&&disabled>guard&&session>disabled&&prisma>session);
  assert.match(route,/available: false, depositEnabled: false, wageringEnabled: false/);
  assert.match(route,/Cache-Control": "private, no-store"/);
  assert.match(route,/source: "not_installed_or_not_certified"/);
});

test("the owner balance read cannot bypass the source HOLD through environment switches",()=>{
 const names=["WAR_SATCHEL_FUNDED_LEDGER_ENABLED","WAR_SATCHEL_FINANCIAL_OPERATOR_ATTESTED",
   "WAR_SATCHEL_DEPOSIT_INSTRUCTIONS_ENABLED","WAR_SATCHEL_FUNDED_WITHDRAWALS_ENABLED"];
 const previous=names.map(k=>process.env[k]);
 try {
   for(const n of names) process.env[n]="true";
   assert.equal(satchelFinancialBridgeReady(),false);
   assert.match(route,/const activated = satchelFinancialBridgeReady\(\) &&/);
 } finally {
   names.forEach((n,i)=>{if(previous[i]===undefined)delete process.env[n];else process.env[n]=previous[i];});
 }
});
