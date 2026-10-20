import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import {
  SATCHEL_AGED_REVIEW_SCAN_LIMIT, agedSatchelReviewQuery,
  inspectAgedSatchelReviews, summarizeAgedSatchelReviews,
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

test("aged operator census uses execution creation time, never later reservation creation",()=>{
  const now = new Date("2026-10-20T17:00:00.000Z");
  const query = agedSatchelReviewQuery(now, 7);
  const cutoff = new Date("2026-10-20T16:56:00.000Z");
  assert.equal(query.where.status, "reserved");
  assert.equal("createdAt" in query.where, false,
    "using reservation.createdAt hides holds aged out of execution eligibility");
  assert.deepEqual(query.where.execution, {
    is: {
      status: "funded_reserved",
      attemptCount: 1,
      ticketId: null,
      createdAt: { lt: cutoff },
    },
  });
  assert.deepEqual(query.orderBy, [{ createdAt: "asc" }, { id: "asc" }]);
  assert.deepEqual(query.select, {
    amountUwolo: true,
    wagerAuthorization: {
      select: {
        approval: { select: { operationId: true } },
        broadcast: { select: { operationId: true } },
      },
    },
  });
  assert.equal(query.take, 8, "bounded census detects at most one extra row");

  // The original Watcher execution was 5 minutes ago, and its financial
  // reservation was created only 1 minute ago. Execution is already beyond
  // the automatic four-minute window: the operator scanner must include it.
  const executionCreated = new Date("2026-10-20T16:55:00.000Z");
  const reservationCreated = new Date("2026-10-20T16:59:00.000Z");
  assert.equal(executionCreated < query.where.execution.is.createdAt.lt, true);
  assert.equal(reservationCreated < query.where.execution.is.createdAt.lt, false);
});

test("four-minute automatic/aged execution clocks partition without a gap",()=>{
  const now = new Date("2026-10-20T17:00:00.000Z");
  const boundary = new Date("2026-10-20T16:56:00.000Z");
  const q = agedSatchelReviewQuery(now);
  assert.equal(q.where.execution.is.createdAt.lt.toISOString(), boundary.toISOString());
  assert.equal(q.take, SATCHEL_AGED_REVIEW_SCAN_LIMIT + 1);
  // At the boundary the automatic candidate window is still inclusive.
  // Exactly one millisecond older belongs to the operator-only census.
  const ageQuery = q.where.execution.is.createdAt.lt.getTime();
  assert.equal(new Date(ageQuery - 1).getTime() < ageQuery, true);
  assert.equal(new Date(ageQuery).getTime() < ageQuery, false);
  for (const bad of [0, -1, 1.5, Infinity, NaN, SATCHEL_AGED_REVIEW_SCAN_LIMIT + 1]) {
    assert.throws(() => agedSatchelReviewQuery(now, bad),
      /SATCHEL_AGED_REVIEW_INVALID_BOUND/);
  }
  assert.throws(() => agedSatchelReviewQuery(new Date(NaN)),
    /SATCHEL_AGED_REVIEW_INVALID_BOUND/);
});

test("operator scanner remains financially HELD and uses pure execution-clock query",()=>{
  const src=readFileSync(new URL("../lib/warSatchelAgedReviewVisibility.ts",import.meta.url),"utf8");
  assert.match(src,/requireSatchelFinancialBridge\(\)/);
  assert.match(src,/const query = agedSatchelReviewQuery\(now, limit\)/);
  assert.match(src,/createdAt: \{ lt: cutoff \}/);
  assert.match(src,/automaticRefundAuthorized: false/);
  assert.match(src,/automaticSubmissionAuthorized: false/);
  assert.doesNotMatch(src,/releaseUnbroadcastSatchelReservation|submitOneShot\(|broadcastTx\(/);
});
