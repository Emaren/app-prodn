import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  TITLE_FORFEIT_REVIEW_SETTLEMENT_STATUS,
  TITLE_FORFEIT_REVIEW_STATUS,
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

test("verified watcher proof auto-settles zero-bounty held ELO titles by exact replay lane", () => {
  const routeSource = readFileSync(
    new URL("../app/api/challenges/route.ts", import.meta.url),
    "utf8"
  );
  const challengeSource = readFileSync(
    new URL("../lib/challenges.ts", import.meta.url),
    "utf8"
  );
  const liveSessionSource = readFileSync(
    new URL("../lib/liveSessionSnapshot.ts", import.meta.url),
    "utf8"
  );
  const resultRecorder = challengeSource.slice(
    challengeSource.indexOf("async function recordVerifiedScheduledMatchTitleResults"),
    challengeSource.indexOf("async function attemptAutomaticScheduledMatchSettlement")
  );

  assert.match(routeSource, /heldEloTitles/);
  assert.match(routeSource, /automatic_held_elo_title_defense/);
  assert.match(routeSource, /chainStatus: "app_only"/);
  assert.match(routeSource, /currentHolderUserId: \{ in: participantIds \}/);

  assert.match(liveSessionSource, /game_type: true/);
  assert.match(liveSessionSource, /gameType/);
  assert.match(resultRecorder, /replayEloLane\(session\.gameType\)/);
  assert.match(resultRecorder, /eloTrophyIdentity/);
  assert.match(resultRecorder, /mode_not_contested/);
  assert.match(resultRecorder, /projectedBounty === 0/);
  assert.match(resultRecorder, /\(session\.watcherCount \?\? 0\) >= 2/);
  assert.match(resultRecorder, /dual Watcher coverage/);
  assert.match(resultRecorder, /automatic_custody_transferred/);
  assert.match(resultRecorder, /tx\.trophy\.updateMany/);
  assert.match(resultRecorder, /woloMutation: false/);
  assert.doesNotMatch(resultRecorder, /trophyPayout\.create/);
  assert.match(resultRecorder, /TITLE_RESULT_REVIEW_STATUS/);
  assert.match(resultRecorder, /projected bounty; financial disposition remains commissioner-reviewed/);

  assert.match(challengeSource, /attemptAutomaticScheduledMatchSettlement/);
  assert.ok(TERMINAL_TITLE_CHALLENGE_STATUSES.includes("commissioner_vetoed"));
});
