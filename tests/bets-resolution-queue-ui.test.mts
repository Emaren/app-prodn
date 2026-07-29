import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(
  new URL("../app/bets/page.tsx", import.meta.url),
  "utf8",
);
const bookSource = readFileSync(
  new URL("../components/bets/YourBookSection.tsx", import.meta.url),
  "utf8",
);
const betsSource = readFileSync(
  new URL("../lib/bets.ts", import.meta.url),
  "utf8",
);

test("settlement proof excludes reviews and unresolved bettor liabilities", () => {
  assert.match(
    pageSource,
    /payoutProofResults = recentResults\.filter\([\s\S]*resolutionStatus !== "under_review"[\s\S]*isSettlementProofState\(result\.payoutState\)/,
  );
  assert.match(
    pageSource,
    /payoutQueueResults = recentResults\.filter\([\s\S]*!isSettlementProofState\(result\.payoutState\)/,
  );
  assert.match(pageSource, /<SettledSection results=\{payoutProofResults\}/);
  assert.match(pageSource, /<PayoutQueueSection results=\{payoutQueueResults\}/);
  assert.match(pageSource, /<ResolutionQueueSection results=\{reviewResults\}/);
  assert.match(pageSource, /These books are not settled proof/);
  assert.match(pageSource, /Optional Founders rewards are tracked separately/i);
});

test("review-market slips are grouped under awaiting verdict", () => {
  assert.match(
    bookSource,
    /\["awaiting_final_proof", "under_review"\]\.includes\(wager\.status\)/,
  );
  assert.match(bookSource, /Final proof is under review/);
});

test("the board independently preserves settlement attention, payout proof, and reviews", () => {
  assert.match(
    betsSource,
    /status:\s*\{ in: \["settled", "voided"\] \}[\s\S]*take: 60/,
  );
  assert.match(
    betsSource,
    /status: "under_review"[\s\S]*take: 20/,
  );
  assert.match(
    betsSource,
    /status: "pending"[\s\S]*claimKind:[\s\S]*BETTOR_SETTLEMENT_CLAIM_KINDS[\s\S]*distinct: \["sourceMarketId"\]/,
  );
  assert.match(
    betsSource,
    /!\["executed", "corrected"\]\.includes\(result\.payoutState\)[\s\S]*\.slice\(0, 4\)[\s\S]*\["executed", "corrected"\]\.includes\(result\.payoutState\)[\s\S]*\.slice\(0, 4\)/,
  );
});

test("routine fast-board capability deferral is not presented as an outage", () => {
  assert.match(
    pageSource,
    /settlement capability check deferred for fast bet-board load/i,
  );
  assert.match(
    pageSource,
    /buildPublicRailNotice[\s\S]*\.filter\([\s\S]*settlement capability check deferred for fast bet-board load/i,
  );
});
