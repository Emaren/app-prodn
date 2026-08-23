import assert from "node:assert/strict";

import {
  readFileSync,
} from "node:fs";

import test from "node:test";

import {
  assertChallengeDeclineAllowed,
  planChallengeAcceptance,
  planChallengeCancellation,
} from "../lib/challenge/domain/transitionPolicy.ts";

import {
  ChallengeConflictError,
} from "../lib/challenge/domain/errors.ts";


const route =
  readFileSync(
    "app/api/challenges/[id]/route.ts",
    "utf8",
  );

const commands =
  readFileSync(
    "lib/challenge/domain/commands.ts",
    "utf8",
  );

const activity =
  readFileSync(
    "lib/challenge/domain/activity.ts",
    "utf8",
  );


function expectChallengeError(
  fn: () => unknown,
  message: string,
  status: number,
) {
  assert.throws(
    fn,
    (
      error: unknown,
    ) => {
      assert.ok(
        error instanceof
          ChallengeConflictError,
      );

      assert.equal(
        error.message,
        message,
      );

      assert.equal(
        error.status,
        status,
      );

      return true;
    },
  );
}


test(
  "acceptance remains challenged-player only",
  () => {
    expectChallengeError(
      () =>
        planChallengeAcceptance({
          actorRole:
            "challenger",

          displayState:
            "proposed",

          acceptBy:
            null,

          now:
            new Date(
              "2026-08-23T20:00:00.000Z",
            ),

          fundingTotal:
            35,

          matchTime:
            null,

          timingMode:
            "anytime",

          matchTimeConfirmedAt:
            null,

          challengerFundedAt:
            null,

          challengedFundedAt:
            null,
        }),

      "Only the challenged player can accept this match.",
      403,
    );
  },
);


test(
  "acceptance rejects stale lifecycle state and expired acceptance",
  () => {
    const now =
      new Date(
        "2026-08-23T20:00:00.000Z",
      );

    expectChallengeError(
      () =>
        planChallengeAcceptance({
          actorRole:
            "challenged",

          displayState:
            "funded",

          acceptBy:
            null,

          now,

          fundingTotal:
            35,

          matchTime:
            null,

          timingMode:
            "anytime",

          matchTimeConfirmedAt:
            null,

          challengerFundedAt:
            null,

          challengedFundedAt:
            null,
        }),

      "This challenge is no longer awaiting terms acceptance.",
      409,
    );

    expectChallengeError(
      () =>
        planChallengeAcceptance({
          actorRole:
            "challenged",

          displayState:
            "proposed",

          acceptBy:
            now,

          now,

          fundingTotal:
            35,

          matchTime:
            null,

          timingMode:
            "anytime",

          matchTimeConfirmedAt:
            null,

          challengerFundedAt:
            null,

          challengedFundedAt:
            null,
        }),

      "This challenge expired before it was accepted.",
      409,
    );
  },
);


test(
  "funded acceptance preserves creator-funded next state",
  () => {
    const acceptedAt =
      new Date(
        "2026-08-23T20:00:00.000Z",
      );

    const result =
      planChallengeAcceptance({
        actorRole:
          "challenged",

        displayState:
          "creator_funded",

        acceptBy:
          new Date(
            "2026-08-24T20:00:00.000Z",
          ),

        now:
          acceptedAt,

        fundingTotal:
          35,

        matchTime:
          null,

        timingMode:
          "anytime",

        matchTimeConfirmedAt:
          null,

        challengerFundedAt:
          new Date(
            "2026-08-23T19:00:00.000Z",
          ),

        challengedFundedAt:
          null,
      });

    assert.equal(
      result.nextStatus,
      "creator_funded",
    );

    assert.equal(
      result.acceptedAt,
      acceptedAt,
    );

    assert.ok(
      result.fundBy,
    );

    assert.equal(
      result.playBy,
      null,
    );
  },
);


test(
  "zero-funding acceptance enters accepted runway",
  () => {
    const acceptedAt =
      new Date(
        "2026-08-23T20:00:00.000Z",
      );

    const result =
      planChallengeAcceptance({
        actorRole:
          "challenged",

        displayState:
          "pending",

        acceptBy:
          null,

        now:
          acceptedAt,

        fundingTotal:
          0,

        matchTime:
          null,

        timingMode:
          "anytime",

        matchTimeConfirmedAt:
          null,

        challengerFundedAt:
          null,

        challengedFundedAt:
          null,
      });

    assert.equal(
      result.nextStatus,
      "accepted",
    );

    assert.equal(
      result.fundBy,
      null,
    );

    assert.ok(
      result.playBy,
    );
  },
);


test(
  "decline remains challenged-player only and acceptance-state only",
  () => {
    expectChallengeError(
      () =>
        assertChallengeDeclineAllowed({
          actorRole:
            "challenger",

          displayState:
            "proposed",
        }),

      "Only the challenged player can decline this match.",
      403,
    );

    expectChallengeError(
      () =>
        assertChallengeDeclineAllowed({
          actorRole:
            "challenged",

          displayState:
            "funded",
        }),

      "This challenge is no longer awaiting terms acceptance.",
      409,
    );

    assert.doesNotThrow(
      () =>
        assertChallengeDeclineAllowed({
          actorRole:
            "challenged",

          displayState:
            "creator_funded",
        }),
    );
  },
);


test(
  "cancellation blocks check-in and terminal states",
  () => {
    const now =
      new Date(
        "2026-08-23T20:00:00.000Z",
      );

    expectChallengeError(
      () =>
        planChallengeCancellation({
          displayState:
            "checkin_open",

          challengerFundedAt:
            null,

          challengedFundedAt:
            null,

          challengerCheckedInAt:
            now,

          challengedCheckedInAt:
            null,

          resultAt:
            null,

          settlementReadyAt:
            null,

          now,
        }),

      "This match is already checked in or live. Keep it on the rail for result resolution.",
      409,
    );

    expectChallengeError(
      () =>
        planChallengeCancellation({
          displayState:
            "completed",

          challengerFundedAt:
            null,

          challengedFundedAt:
            null,

          challengerCheckedInAt:
            null,

          challengedCheckedInAt:
            null,

          resultAt:
            now,

          settlementReadyAt:
            now,

          now,
        }),

      "Only active scheduled matches can be cancelled.",
      409,
    );
  },
);


test(
  "funded cancellation enters refund-review rail without executing money",
  () => {
    const now =
      new Date(
        "2026-08-23T20:00:00.000Z",
      );

    const result =
      planChallengeCancellation({
        displayState:
          "creator_funded",

        challengerFundedAt:
          new Date(
            "2026-08-23T19:00:00.000Z",
          ),

        challengedFundedAt:
          null,

        challengerCheckedInAt:
          null,

        challengedCheckedInAt:
          null,

        resultAt:
          null,

        settlementReadyAt:
          null,

        now,
      });

    assert.equal(
      result.hasAnyFunding,
      true,
    );

    assert.equal(
      result.cancelledAt,
      now,
    );

    assert.equal(
      result.resultAt,
      now,
    );

    assert.equal(
      result.settlementReadyAt,
      now,
    );
  },
);


test(
  "unfunded cancellation preserves prior result and settlement clocks",
  () => {
    const now =
      new Date(
        "2026-08-23T20:00:00.000Z",
      );

    const resultAt =
      new Date(
        "2026-08-20T20:00:00.000Z",
      );

    const settlementReadyAt =
      new Date(
        "2026-08-20T20:01:00.000Z",
      );

    const result =
      planChallengeCancellation({
        displayState:
          "pending",

        challengerFundedAt:
          null,

        challengedFundedAt:
          null,

        challengerCheckedInAt:
          null,

        challengedCheckedInAt:
          null,

        resultAt,

        settlementReadyAt,

        now,
      });

    assert.equal(
      result.hasAnyFunding,
      false,
    );

    assert.equal(
      result.resultAt,
      resultAt,
    );

    assert.equal(
      result.settlementReadyAt,
      settlementReadyAt,
    );
  },
);


test(
  "HTTP route delegates first lifecycle command family",
  () => {
    assert.match(
      route,
      /await acceptChallenge\(/,
    );

    assert.match(
      route,
      /await declineChallenge\(/,
    );

    assert.match(
      route,
      /await cancelChallenge\(/,
    );

    const start =
      route.indexOf(
        'if (action === "accept")',
      );

    const end =
      route.indexOf(
        'if (action === "reschedule")',
      );

    assert.ok(
      start >= 0 &&
      end > start,
    );

    const family =
      route.slice(
        start,
        end,
      );

    assert.doesNotMatch(
      family,
      /\$transaction/,
    );

    assert.doesNotMatch(
      family,
      /trophyChallenge/,
    );

    assert.doesNotMatch(
      family,
      /recordUserActivity/,
    );

    assert.doesNotMatch(
      family,
      /postChallengeInboxNotice/,
    );

    assert.doesNotMatch(
      family,
      /scheduledMatch\.(?:update|updateMany)/,
    );
  },
);


test(
  "domain commands own transaction and consequence rails",
  () => {
    assert.match(
      commands,
      /export async function acceptChallenge/,
    );

    assert.match(
      commands,
      /export async function declineChallenge/,
    );

    assert.match(
      commands,
      /export async function cancelChallenge/,
    );

    assert.match(
      commands,
      /prisma\.\$transaction/,
    );

    assert.match(
      commands,
      /trophyChallenge/,
    );

    assert.match(
      commands,
      /recordChallengeActivity/,
    );

    assert.match(
      commands,
      /postChallengeInboxNotice/,
    );

    assert.match(
      commands,
      /recordUserActivity/,
    );
  },
);


test(
  "shared Challenge activity append lives outside transport",
  () => {
    assert.match(
      activity,
      /scheduledMatchActivity/,
    );

    assert.match(
      activity,
      /eventType\.slice/,
    );

    assert.doesNotMatch(
      route,
      /async function recordChallengeActivity/,
    );

    assert.match(
      route,
      /recordChallengeActivity/,
    );
  },
);


test(
  "transition policy remains framework and persistence free",
  () => {
    const policy =
      readFileSync(
        "lib/challenge/domain/transitionPolicy.ts",
        "utf8",
      );

    assert.doesNotMatch(
      policy,
      /next\//,
    );

    assert.doesNotMatch(
      policy,
      /PrismaClient/,
    );

    assert.doesNotMatch(
      policy,
      /\$transaction/,
    );

    assert.doesNotMatch(
      policy,
      /contactInbox/,
    );

    assert.doesNotMatch(
      policy,
      /userExperience/,
    );

    assert.match(
      commands,
      /from "@\/lib\/challenge\/domain\/transitionPolicy"/,
    );
  },
);
