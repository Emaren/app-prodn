import assert from "node:assert/strict";

import {
  readFileSync,
} from "node:fs";

import test from "node:test";

import {
  planChallengeCheckIn,
  planChallengeNoShowResolution,
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

const settlements =
  readFileSync(
    "lib/scheduledMatchSettlements.ts",
    "utf8",
  );


const scheduledAt =
  new Date(
    "2026-08-24T20:00:00.000Z",
  );


function baseAttendance() {
  return {
    actorRole:
      "challenger" as const,

    status:
      "funded",

    scheduledAt,

    timingMode:
      "scheduled",

    matchTime:
      scheduledAt,

    acceptedAt:
      new Date(
        "2026-08-23T18:00:00.000Z",
      ),

    resultAt:
      null,

    liveConfirmedAt:
      null,

    settlementReadyAt:
      null,

    wagerAmountWolo:
      25,

    guaranteeAmountWolo:
      10,

    challengerFundingTxHash:
      "LEFT",

    challengerFundingWalletAddress:
      "wolo1left",

    challengerFundedAt:
      new Date(
        "2026-08-23T18:10:00.000Z",
      ),

    challengedFundingTxHash:
      "RIGHT",

    challengedFundingWalletAddress:
      "wolo1right",

    challengedFundedAt:
      new Date(
        "2026-08-23T18:20:00.000Z",
      ),

    challengerCheckedInAt:
      null,

    challengedCheckedInAt:
      null,
  };
}


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


test(
  "play-anytime Challenge does not require check-in",
  () => {
    expectError(
      () =>
        planChallengeCheckIn({
          ...baseAttendance(),

          timingMode:
            "open",

          matchTime:
            null,

          checkInWindowState:
            "disabled",

          now:
            new Date(
              "2026-08-24T19:55:00.000Z",
            ),
        }),

      "Play-anytime challenges do not require check-in. Propose an exact time first if you want the scheduling rail.",
    );
  },
);


test(
  "check-in remains participant-only",
  () => {
    expectError(
      () =>
        planChallengeCheckIn({
          ...baseAttendance(),

          actorRole:
            "admin",

          checkInWindowState:
            "open",

          now:
            new Date(
              "2026-08-24T19:55:00.000Z",
            ),
        }),

      "Only match participants can check in.",
      403,
    );
  },
);


test(
  "check-in consumes the canonical economy window state",
  () => {
    expectError(
      () =>
        planChallengeCheckIn({
          ...baseAttendance(),

          checkInWindowState:
            "upcoming",

          now:
            new Date(
              "2026-08-24T19:45:00.000Z",
            ),
        }),

      "Check-in opens exactly 10 minutes before the scheduled start and closes at start.",
    );

    assert.doesNotThrow(
      () =>
        planChallengeCheckIn({
          ...baseAttendance(),

          checkInWindowState:
            "open",

          now:
            new Date(
              "2026-08-24T19:55:00.000Z",
            ),
        }),
    );
  },
);


test(
  "one side cannot check in twice",
  () => {
    expectError(
      () =>
        planChallengeCheckIn({
          ...baseAttendance(),

          checkInWindowState:
            "open",

          challengerCheckedInAt:
            new Date(
              "2026-08-24T19:52:00.000Z",
            ),

          now:
            new Date(
              "2026-08-24T19:55:00.000Z",
            ),
        }),

      "Creator check-in is already on file.",
    );

    expectError(
      () =>
        planChallengeCheckIn({
          ...baseAttendance(),

          actorRole:
            "challenged",

          checkInWindowState:
            "open",

          challengedCheckedInAt:
            new Date(
              "2026-08-24T19:52:00.000Z",
            ),

          now:
            new Date(
              "2026-08-24T19:55:00.000Z",
            ),
        }),

      "Opponent check-in is already on file.",
    );
  },
);


test(
  "first check-in records exact side and keeps the other side empty",
  () => {
    const checkedInAt =
      new Date(
        "2026-08-24T19:55:00.000Z",
      );

    const plan =
      planChallengeCheckIn({
        ...baseAttendance(),

        checkInWindowState:
          "open",

        now:
          checkedInAt,
      });

    assert.equal(
      plan.participantSide,
      "left",
    );

    assert.equal(
      plan.checkedInAt,
      checkedInAt,
    );

    assert.equal(
      plan.nextShape
        .challengerCheckedInAt,
      checkedInAt,
    );

    assert.equal(
      plan.nextShape
        .challengedCheckedInAt,
      null,
    );

    assert.equal(
      plan
        .nextSurface
        .persistedStatus,
      "left_checked_in",
    );
  },
);


test(
  "second check-in makes the Challenge ready",
  () => {
    const leftCheckedInAt =
      new Date(
        "2026-08-24T19:52:00.000Z",
      );

    const rightCheckedInAt =
      new Date(
        "2026-08-24T19:55:00.000Z",
      );

    const plan =
      planChallengeCheckIn({
        ...baseAttendance(),

        actorRole:
          "challenged",

        checkInWindowState:
          "open",

        challengerCheckedInAt:
          leftCheckedInAt,

        now:
          rightCheckedInAt,
      });

    assert.equal(
      plan.participantSide,
      "right",
    );

    assert.equal(
      plan
        .nextSurface
        .persistedStatus,
      "ready",
    );

    assert.equal(
      plan
        .nextSurface
        .economy
        .statusLabel,
      "Ready",
    );
  },
);


test(
  "no-show truth cannot be materialized before economy reaches terminal attendance state",
  () => {
    expectError(
      () =>
        planChallengeNoShowResolution({
          ...baseAttendance(),

          actorRole:
            "challenger",

          actorIsAdmin:
            false,

          now:
            new Date(
              "2026-08-24T19:59:00.000Z",
            ),
        }),

      "This match is not in a no-show resolution state.",
    );
  },
);


test(
  "left attendance and right absence resolve no_show_right",
  () => {
    const leftCheckedInAt =
      new Date(
        "2026-08-24T19:55:00.000Z",
      );

    const plan =
      planChallengeNoShowResolution({
        ...baseAttendance(),

        actorRole:
          "challenger",

        actorIsAdmin:
          false,

        challengerCheckedInAt:
          leftCheckedInAt,

        now:
          new Date(
            "2026-08-24T20:00:01.000Z",
          ),
      });

    assert.equal(
      plan
        .resolvedSurface
        .persistedStatus,
      "no_show_right",
    );

    assert.equal(
      plan.resolvedAt.toISOString(),
      scheduledAt.toISOString(),
    );

    assert.equal(
      plan.resultAt.toISOString(),
      scheduledAt.toISOString(),
    );

    assert.equal(
      plan
        .settlementReadyAt
        .toISOString(),
      scheduledAt.toISOString(),
    );
  },
);


test(
  "right attendance and left absence resolve no_show_left",
  () => {
    const plan =
      planChallengeNoShowResolution({
        ...baseAttendance(),

        actorRole:
          "challenged",

        actorIsAdmin:
          false,

        challengedCheckedInAt:
          new Date(
            "2026-08-24T19:55:00.000Z",
          ),

        now:
          new Date(
            "2026-08-24T20:00:01.000Z",
          ),
      });

    assert.equal(
      plan
        .resolvedSurface
        .persistedStatus,
      "no_show_left",
    );
  },
);


test(
  "no attendance resolves double_no_show",
  () => {
    const plan =
      planChallengeNoShowResolution({
        ...baseAttendance(),

        actorRole:
          "admin",

        actorIsAdmin:
          true,

        now:
          new Date(
            "2026-08-24T20:00:01.000Z",
          ),
      });

    assert.equal(
      plan
        .resolvedSurface
        .persistedStatus,
      "double_no_show",
    );

    assert.equal(
      plan.participant,
      false,
    );
  },
);


test(
  "participant or admin may resolve no-show but unrelated user may not",
  () => {
    assert.doesNotThrow(
      () =>
        planChallengeNoShowResolution({
          ...baseAttendance(),

          actorRole:
            "challenger",

          actorIsAdmin:
            false,

          now:
            new Date(
              "2026-08-24T20:00:01.000Z",
            ),
        }),
    );

    assert.doesNotThrow(
      () =>
        planChallengeNoShowResolution({
          ...baseAttendance(),

          actorRole:
            "admin",

          actorIsAdmin:
            true,

          now:
            new Date(
              "2026-08-24T20:00:01.000Z",
            ),
        }),
    );
  },
);


test(
  "HTTP attendance family delegates without persistence or settlement logic",
  () => {
    const start =
      route.indexOf(
        'if (action === "check_in")',
      );

    const end =
      route.indexOf(
        'if (action === "mark_completed")',
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
      /await checkInChallenge\(/,
    );

    assert.match(
      family,
      /await resolveChallengeNoShow\(/,
    );

    for (
      const forbidden
      of [
        "$transaction",
        "scheduledMatch.update",
        "scheduledMatchSettlement",
        "recordChallengeActivity",
        "postChallengeInboxNotice",
        "recordUserActivity",
      ]
    ) {
      assert.equal(
        family.includes(
          forbidden,
        ),
        false,
        `HTTP attendance family still owns ${forbidden}`,
      );
    }
  },
);


test(
  "no-show command materializes truth but cannot create or execute settlement",
  () => {
    const start =
      commands.indexOf(
        "export async function resolveChallengeNoShow",
      );

    assert.ok(
      start >= 0,
    );

    const noShow =
      commands.slice(
        start,
      );

    assert.match(
      noShow,
      /settlementReadyAt/,
    );

    assert.match(
      noShow,
      /recordChallengeActivity/,
    );

    assert.doesNotMatch(
      noShow,
      /scheduledMatchSettlement\./,
    );

    assert.doesNotMatch(
      noShow,
      /executeScheduledMatchSettlement/,
    );

    assert.doesNotMatch(
      noShow,
      /executeWolo/,
    );
  },
);


test(
  "existing settlement engine remains sole no-show financial planner",
  () => {
    assert.match(
      settlements,
      /status === "double_no_show"/,
    );

    assert.match(
      settlements,
      /status === "no_show_left"/,
    );

    assert.match(
      settlements,
      /status === "no_show_right"/,
    );

    assert.match(
      settlements,
      /left_wager_refund/,
    );

    assert.match(
      settlements,
      /right_wager_refund/,
    );

    assert.match(
      settlements,
      /guarantees_to_treasury/,
    );
  },
);


test(
  "pure attendance policy remains framework persistence and execution free",
  () => {
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
      /scheduledMatchSettlement/,
    );

    assert.doesNotMatch(
      policy,
      /executeScheduledMatchSettlement/,
    );

    assert.doesNotMatch(
      policy,
      /next\//,
    );
  },
);
