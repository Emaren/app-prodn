import assert from "node:assert/strict";

import {
  readFileSync,
} from "node:fs";

import test from "node:test";

import {
  planChallengeReschedule,
  planChallengeTimeConfirmation,
  validateChallengeScheduledAtWindow,
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

const policy =
  readFileSync(
    "lib/challenge/domain/transitionPolicy.ts",
    "utf8",
  );


function expectError(
  fn: () => unknown,
  message: string,
  status = 409,
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


function baseRescheduleInput() {
  return {
    actorRole:
      "challenger" as const,

    actorIsAdmin:
      false,

    acceptedAt:
      null,

    displayState:
      "proposed",

    challengerFundedAt:
      null,

    challengedFundedAt:
      null,

    challengerCheckedInAt:
      null,

    challengedCheckedInAt:
      null,

    playBy:
      null,

    acceptBy:
      new Date(
        "2026-08-25T20:00:00.000Z",
      ),

    fundBy:
      null,

    requestedMatchTime:
      "2026-08-24T20:00:00.000Z",

    requestedScheduledAt:
      undefined,

    requestedChallengeNote:
      "  best   of five  ",

    requestedWagerAmountWolo:
      25,

    requestedGuaranteeAmountWolo:
      10,

    currentWagerAmountWolo:
      25,

    currentGuaranteeAmountWolo:
      10,

    now:
      new Date(
        "2026-08-23T20:00:00.000Z",
      ),
  };
}


test(
  "pre-acceptance terms remain challenger or admin authority",
  () => {
    expectError(
      () =>
        planChallengeReschedule({
          ...baseRescheduleInput(),

          actorRole:
            "challenged",
        }),

      "Only the challenger can change terms or propose a time before acceptance.",
      403,
    );

    assert.doesNotThrow(
      () =>
        planChallengeReschedule({
          ...baseRescheduleInput(),

          actorRole:
            "challenged",

          actorIsAdmin:
            true,
        }),
    );
  },
);


test(
  "exact Challenge schedule keeps two-minute and thirty-day bounds",
  () => {
    const now =
      new Date(
        "2026-08-23T20:00:00.000Z",
      );

    assert.equal(
      validateChallengeScheduledAtWindow(
        new Date(
          now.getTime() +
          119_999,
        ),
        now,
      ),
      "Schedule the game at least two minutes ahead.",
    );

    assert.equal(
      validateChallengeScheduledAtWindow(
        new Date(
          now.getTime() +
          30 *
          24 *
          60 *
          60 *
          1000 +
          1,
        ),
        now,
      ),
      "Keep exact match times inside the next 30 days.",
    );

    assert.equal(
      validateChallengeScheduledAtWindow(
        new Date(
          now.getTime() +
          60 *
          60 *
          1000,
        ),
        now,
      ),
      null,
    );
  },
);


test(
  "reschedule blocks live/check-in state and invalid timestamps",
  () => {
    expectError(
      () =>
        planChallengeReschedule({
          ...baseRescheduleInput(),

          challengerCheckedInAt:
            new Date(
              "2026-08-23T19:00:00.000Z",
            ),
        }),

      "This match is already checked in or live. Keep it on the existing rail.",
    );

    expectError(
      () =>
        planChallengeReschedule({
          ...baseRescheduleInput(),

          requestedMatchTime:
            "not-a-date",
        }),

      "Choose a valid new start time.",
      400,
    );
  },
);


test(
  "funded challenge cannot schedule beyond play window",
  () => {
    expectError(
      () =>
        planChallengeReschedule({
          ...baseRescheduleInput(),

          acceptedAt:
            new Date(
              "2026-08-23T18:00:00.000Z",
            ),

          challengerFundedAt:
            new Date(
              "2026-08-23T18:10:00.000Z",
            ),

          challengedFundedAt:
            new Date(
              "2026-08-23T18:20:00.000Z",
            ),

          playBy:
            new Date(
              "2026-08-24T19:00:00.000Z",
            ),
        }),

      "Choose an exact time before this funded challenge's play window expires.",
      400,
    );
  },
);


test(
  "accepted or funded reschedule preserves economic terms",
  () => {
    const result =
      planChallengeReschedule({
        ...baseRescheduleInput(),

        acceptedAt:
          new Date(
            "2026-08-23T18:00:00.000Z",
          ),

        challengerFundedAt:
          new Date(
            "2026-08-23T18:10:00.000Z",
          ),

        requestedWagerAmountWolo:
          999,

        requestedGuaranteeAmountWolo:
          999,

        currentWagerAmountWolo:
          25,

        currentGuaranteeAmountWolo:
          10,
      });

    assert.equal(
      result.preserveLifecycle,
      true,
    );

    assert.equal(
      result.hasAnyFunding,
      true,
    );

    assert.equal(
      result.wagerAmountWolo,
      25,
    );

    assert.equal(
      result.guaranteeAmountWolo,
      10,
    );

    assert.equal(
      result.nextFundingTotal,
      35,
    );
  },
);


test(
  "pre-acceptance reschedule may change terms and normalizes note",
  () => {
    const result =
      planChallengeReschedule({
        ...baseRescheduleInput(),

        requestedWagerAmountWolo:
          "40",

        requestedGuaranteeAmountWolo:
          "15",
      });

    assert.equal(
      result.preserveLifecycle,
      false,
    );

    assert.equal(
      result.wagerAmountWolo,
      40,
    );

    assert.equal(
      result.guaranteeAmountWolo,
      15,
    );

    assert.equal(
      result.nextFundingTotal,
      55,
    );

    assert.equal(
      result.nextChallengeNote,
      "best of five",
    );
  },
);


test(
  "admin time proposal remains immediately confirmed",
  () => {
    const now =
      new Date(
        "2026-08-23T20:00:00.000Z",
      );

    const result =
      planChallengeReschedule({
        ...baseRescheduleInput(),

        actorIsAdmin:
          true,

        acceptedAt:
          new Date(
            "2026-08-23T18:00:00.000Z",
          ),

        now,
      });

    assert.equal(
      result.matchTimeConfirmedAt,
      now,
    );
  },
);


test(
  "confirmation requires acceptance, proposal, future time and other player",
  () => {
    const now =
      new Date(
        "2026-08-23T20:00:00.000Z",
      );

    const base = {
      acceptedAt:
        new Date(
          "2026-08-23T18:00:00.000Z",
        ),

      matchTime:
        new Date(
          "2026-08-24T20:00:00.000Z",
        ),

      matchTimeProposedByUserId:
        10,

      matchTimeConfirmedAt:
        null,

      actorUserId:
        20,

      actorIsAdmin:
        false,

      challengerCheckedInAt:
        null,

      challengedCheckedInAt:
        null,

      displayState:
        "funded",

      now,
    };

    expectError(
      () =>
        planChallengeTimeConfirmation({
          ...base,

          acceptedAt:
            null,
        }),

      "Accept the challenge first. Acceptance confirms the initially proposed exact time.",
    );

    expectError(
      () =>
        planChallengeTimeConfirmation({
          ...base,

          actorUserId:
            10,
        }),

      "The other player must confirm the proposed exact time.",
    );

    assert.doesNotThrow(
      () =>
        planChallengeTimeConfirmation(
          base,
        ),
    );

    assert.doesNotThrow(
      () =>
        planChallengeTimeConfirmation({
          ...base,

          actorUserId:
            10,

          actorIsAdmin:
            true,
        }),
    );
  },
);


test(
  "confirmation plan preserves exact proposal identity for CAS",
  () => {
    const now =
      new Date(
        "2026-08-23T20:00:00.000Z",
      );

    const matchTime =
      new Date(
        "2026-08-24T20:00:00.000Z",
      );

    const result =
      planChallengeTimeConfirmation({
        acceptedAt:
          new Date(
            "2026-08-23T18:00:00.000Z",
          ),

        matchTime,

        matchTimeProposedByUserId:
          10,

        matchTimeConfirmedAt:
          null,

        actorUserId:
          20,

        actorIsAdmin:
          false,

        challengerCheckedInAt:
          null,

        challengedCheckedInAt:
          null,

        displayState:
          "funded",

        now,
      });

    assert.equal(
      result.confirmedAt,
      now,
    );

    assert.equal(
      result.matchTime,
      matchTime,
    );

    assert.equal(
      result.matchTimeProposedByUserId,
      10,
    );
  },
);


test(
  "HTTP timing family delegates without persistence consequences",
  () => {
    const start =
      route.indexOf(
        'if (action === "reschedule")',
      );

    const end =
      route.indexOf(
        'if (action === "fund")',
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

    assert.match(
      family,
      /await rescheduleChallenge\(/,
    );

    assert.match(
      family,
      /await confirmChallengeTime\(/,
    );

    for (
      const forbidden
      of [
        "$transaction",
        "scheduledMatch.update",
        "scheduledMatch.updateMany",
        "recordChallengeActivity",
        "postChallengeInboxNotice",
        "recordUserActivity",
      ]
    ) {
      assert.doesNotMatch(
        family,
        new RegExp(
          forbidden
            .replace(
              ".",
              "\\.",
            )
            .replace(
              "$",
              "\\$",
            ),
        ),
      );
    }
  },
);


test(
  "command service owns timing transaction and confirmation CAS",
  () => {
    assert.match(
      commands,
      /export async function rescheduleChallenge/,
    );

    assert.match(
      commands,
      /export async function confirmChallengeTime/,
    );

    assert.match(
      commands,
      /matchTimeProposedByUserId/,
    );

    assert.match(
      commands,
      /matchTimeConfirmedAt/,
    );

    assert.match(
      commands,
      /updated\.count !==/,
    );

    assert.match(
      commands,
      /fundingPreserved/,
    );

    assert.match(
      commands,
      /time_proposed/,
    );

    assert.match(
      commands,
      /time_confirmed/,
    );
  },
);


test(
  "pure timing policy remains framework and persistence free",
  () => {
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
      /postChallengeInboxNotice/,
    );

    assert.doesNotMatch(
      policy,
      /recordUserActivity/,
    );
  },
);
