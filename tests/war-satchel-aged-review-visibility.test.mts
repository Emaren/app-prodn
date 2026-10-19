import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import {
  SATCHEL_AGED_REVIEW_SCAN_LIMIT, inspectAgedSatchelReviews,
  summarizeAgedSatchelReviews,
} from "../lib/warSatchelAgedReviewVisibility.ts";

test("unattempted aged reservations are operator liability, never self-releasing",()=>{
  const report=summarizeAgedSatchelReviews([
    {amountUwolo:12000000n,wagerAuthorization:null},
    {amountUwolo:5000000n,wagerAuthorization:{approval:{operationId:"one"},broadcast:null}},
    {amountUwolo:3000000n,wagerAuthorization:{approval:{operationId:"two"},broadcast:{operationId:"two"}}},
  ]);
  assert.equal(report.status,"operator_reconciliation_required");
  assert.equal(report.inspected,3);
  assert.equal(report.inspectedReservedUwolo,"20000000");
  assert.equal(report.noApproval,1);
  assert.equal(report.approvedButUnattempted,1);
  assert.equal(report.inconsistentBroadcastMarker,1);
  assert.equal(report.automaticSubmissionAuthorized,false);
  assert.equal(report.automaticRefundAuthorized,false);
  assert.equal(report.financialTotalCertified,false);
  assert.ok(!JSON.stringify(report).includes("operationId"));
});

test("sampled amounts are clearly incomplete when more aged rows exist",()=>{
  const rows=Array.from({length:SATCHEL_AGED_REVIEW_SCAN_LIMIT+1},
    ()=>({amountUwolo:1000000n,wagerAuthorization:null}));
  const report=summarizeAgedSatchelReviews(rows);
  assert.equal(report.moreRows,true);
  assert.equal(report.inspected,SATCHEL_AGED_REVIEW_SCAN_LIMIT);
  assert.equal(report.inspectedReservedUwolo,String(BigInt(SATCHEL_AGED_REVIEW_SCAN_LIMIT)*1000000n));
  assert.equal(report.financialTotalCertified,false);
  for(const bad of [0,-1,1.5,NaN,Infinity,SATCHEL_AGED_REVIEW_SCAN_LIMIT+1]){
    assert.throws(()=>summarizeAgedSatchelReviews(rows,bad),/SATCHEL_AGED_REVIEW_INVALID_BOUND/);
  }
  assert.throws(()=>summarizeAgedSatchelReviews([{amountUwolo:0n,wagerAuthorization:null}]),
    /SATCHEL_AGED_REVIEW_INVALID_LIABILITY/);
});

test("financial HOLD blocks the aged reservation scanner before any database query",async()=>{
  let read=0;
  const prisma={satchelFundedReservation:{findMany:async()=>{read++;throw Error("db query forbidden");}}};
  await assert.rejects(inspectAgedSatchelReviews(prisma as never),
    /SATCHEL_FINANCIAL_BRIDGE_UNVERIFIED_HOLD/);
  assert.equal(read,0);
});

test("operator dry-run reports aged reservation liabilities but does not attempt release",()=>{
 const src=readFileSync(new URL("../scripts/war-satchel-funded-mecha-worker.ts",import.meta.url),"utf8");
 const scan=readFileSync(new URL("../lib/warSatchelAgedReviewVisibility.ts",import.meta.url),"utf8");
 assert.match(src,/inspectAgedSatchelReviews\(prisma\)/);
 assert.match(src,/agedUnattemptedReservations:/);
 assert.match(src,/if \(!execute && !satchelFinancialBridgeReady\(\)\)/);
 assert.match(scan,/requireSatchelFinancialBridge\(\)/);
 assert.doesNotMatch(scan,/releaseUnbroadcastSatchelReservation|submitOneShot\(|broadcastTx|commitVerifiedSatchel/);
 assert.match(scan,/financialTotalCertified: false/);
});
