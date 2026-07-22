import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  TITLE_FORFEIT_REVIEW_SETTLEMENT_STATUS,
  TITLE_FORFEIT_REVIEW_STATUS,
  TITLE_RESULT_REVIEW_SETTLEMENT_STATUS,
  TITLE_RESULT_REVIEW_STATUS,
  TERMINAL_TITLE_CHALLENGE_STATUSES,
  buildTitleChallengeAcceptBy,
  unacceptedTitleExpiryNeedsCommissionerReview,
} from "../lib/challengeTitlePolicy.ts";

test("title challenges always allow seven days to respond unless the exact match is earlier", () => {
  const createdAt = new Date("2026-07-22T18:00:00.000Z");

  assert.equal(
    buildTitleChallengeAcceptBy(createdAt).toISOString(),
    "2026-07-29T18:00:00.000Z"
  );
  assert.equal(
    buildTitleChallengeAcceptBy(
      createdAt,
      new Date("2026-07-24T18:00:00.000Z")
    ).toISOString(),
    "2026-07-24T18:00:00.000Z"
  );
  assert.equal(
    buildTitleChallengeAcceptBy(
      createdAt,
      new Date("2026-08-05T18:00:00.000Z")
    ).toISOString(),
    "2026-07-29T18:00:00.000Z"
  );
});

test("only an unaccepted linked title expiry enters commissioner forfeit review", () => {
  assert.equal(
    unacceptedTitleExpiryNeedsCommissionerReview({
      expiryKind: "expired",
      acceptedAt: null,
      linkedTitleCount: 1,
    }),
    true
  );
  assert.equal(
    unacceptedTitleExpiryNeedsCommissionerReview({
      expiryKind: "expired",
      acceptedAt: new Date("2026-07-22T19:00:00.000Z"),
      linkedTitleCount: 1,
    }),
    false
  );
  assert.equal(
    unacceptedTitleExpiryNeedsCommissionerReview({
      expiryKind: "funding_expired",
      acceptedAt: new Date("2026-07-22T19:00:00.000Z"),
      linkedTitleCount: 1,
    }),
    false
  );
  assert.equal(
    unacceptedTitleExpiryNeedsCommissionerReview({
      expiryKind: "expired",
      acceptedAt: null,
      linkedTitleCount: 0,
    }),
    false
  );

  assert.equal(TITLE_FORFEIT_REVIEW_STATUS, "forfeit_pending_commissioner");
  assert.equal(
    TITLE_FORFEIT_REVIEW_SETTLEMENT_STATUS,
    "commissioner_forfeit_review_required"
  );
});

test("watcher proof records title results for commissioner review without automatic custody or bounty writes", () => {
  const routeSource = readFileSync(
    new URL("../app/api/challenges/route.ts", import.meta.url),
    "utf8"
  );
  const challengeSource = readFileSync(
    new URL("../lib/challenges.ts", import.meta.url),
    "utf8"
  );
  const trophyActionSource = readFileSync(
    new URL("../lib/trophies/actions.ts", import.meta.url),
    "utf8"
  );
  const resultRecorder = challengeSource.slice(
    challengeSource.indexOf("async function recordVerifiedScheduledMatchTitleResults"),
    challengeSource.indexOf("async function persistScheduledMatchResults")
  );

  assert.doesNotMatch(routeSource, /scheduled_match_auto_stakes|const heldTitles/);
  assert.match(routeSource, /buildTitleChallengeAcceptBy\(now, matchTime\)/);
  assert.match(resultRecorder, /TITLE_RESULT_REVIEW_STATUS/);
  assert.match(resultRecorder, /commissionerReviewRequired: true/);
  assert.doesNotMatch(resultRecorder, /tx\.trophy\.update|tx\.trophyPayout\.create/);
  assert.match(trophyActionSource, /COMMISSIONER_TITLE_VETOED/);
  assert.match(trophyActionSource, /status: \{ not: "commissioner_vetoed" \}/);
  assert.match(trophyActionSource, /winnerPreserved: Boolean\(challenge\.winnerUserId\)/);
  assert.match(challengeSource, /title_result_pending_review/);
  assert.match(challengeSource, /attemptAutomaticScheduledMatchSettlement/);
  assert.match(routeSource, /pg_advisory_xact_lock/);
  assert.match(routeSource, /titleContender = viewerIsCurrentCustodian \? challenged : viewer/);
  assert.ok(TERMINAL_TITLE_CHALLENGE_STATUSES.includes("commissioner_vetoed"));
  assert.equal(TITLE_RESULT_REVIEW_STATUS, "commissioner_review");
  assert.equal(
    TITLE_RESULT_REVIEW_SETTLEMENT_STATUS,
    "commissioner_review_required"
  );
});
