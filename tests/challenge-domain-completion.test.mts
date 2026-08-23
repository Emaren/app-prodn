import assert from "node:assert/strict";

import {
  readFileSync,
} from "node:fs";

import test from "node:test";

import {
  planChallengeManualCompletion,
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

const automatic =
  readFileSync(
    "lib/challenges.ts",
    "utf8",
  );

const settlements =
  readFileSync(
    "lib/scheduledMatchSettlements.ts",
    "utf8",
  );


function basePlan() {
  return {
    actorIsAdmin:
      true,

    currentDisplayState:
      "ready",

    currentLinkedSessionKey:
      null,

    currentLinkedMapName:
      null,

    currentLinkedWinner:
      null,

    currentLinkedDurationSeconds:
      null,

    submittedLinkedSessionKey:
      undefined,

    submittedMapName:
      undefined,

    submittedWinner:
      " Jim ",

    submittedDurationSeconds:
      undefined,

    completedAt:
      new Date(
        "2026-08-24T20:10:00.000Z",
      ),
  };
}


function expectConflict(
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
  "manual result authority remains admin only",
  () => {
    expectConflict(
      () =>
        planChallengeManualCompletion({
          ...basePlan(),

          actorIsAdmin:
            false,
        }),

      "Only admins can mark this match result-ready for settlement.",
      403,
    );
  },
);


test(
  "manual completion remains ready/live only",
  () => {
    for (
      const state
      of [
        "ready",
        "live",
      ]
    ) {
      assert.doesNotThrow(
        () =>
          planChallengeManualCompletion({
            ...basePlan(),

            currentDisplayState:
              state,
          }),
      );
    }

    expectConflict(
      () =>
        planChallengeManualCompletion({
          ...basePlan(),

          currentDisplayState:
            "funded",
        }),

      "Only ready or live-confirmed matches can move to result-ready.",
    );
  },
);


test(
  "commissioner may declare winner without manufacturing replay provenance",
  () => {
    const result =
      planChallengeManualCompletion(
        basePlan(),
      );

    assert.equal(
      result.linkedWinner,
      "Jim",
    );

    assert.equal(
      result
        .canonicalReplay
        .linkedSessionKey,
      null,
    );

    assert.equal(
      result
        .canonicalReplay
        .linkedMapName,
      null,
    );

    assert.equal(
      result
        .canonicalReplay
        .linkedDurationSeconds,
      null,
    );

    assert.equal(
      result
        .submittedEvidence
        .linkedWinner,
      "Jim",
    );
  },
);


test(
  "manual completion cannot establish arbitrary replay linkage",
  () => {
    expectConflict(
      () =>
        planChallengeManualCompletion({
          ...basePlan(),

          submittedLinkedSessionKey:
            "watcher-live-forged",
        }),

      "Manual completion cannot establish or replace replay linkage. Link the verified watcher/replay session first.",
    );
  },
);


test(
  "manual completion cannot replace verified replay linkage",
  () => {
    expectConflict(
      () =>
        planChallengeManualCompletion({
          ...basePlan(),

          currentLinkedSessionKey:
            "watcher-live-real",

          currentLinkedMapName:
            "Arabia",

          currentLinkedDurationSeconds:
            1800,

          submittedLinkedSessionKey:
            "watcher-live-other",
        }),

      "Manual completion cannot establish or replace replay linkage. Link the verified watcher/replay session first.",
    );
  },
);


test(
  "already verified replay linkage is preserved exactly",
  () => {
    const result =
      planChallengeManualCompletion({
        ...basePlan(),

        currentLinkedSessionKey:
          "watcher-live-real",

        currentLinkedMapName:
          "Arabia",

        currentLinkedWinner:
          null,

        currentLinkedDurationSeconds:
          1800,

        submittedLinkedSessionKey:
          "watcher-live-real",

        submittedMapName:
          "Arena",

        submittedDurationSeconds:
          9999,
      });

    assert.deepEqual(
      result.canonicalReplay,
      {
        linkedSessionKey:
          "watcher-live-real",

        linkedMapName:
          "Arabia",

        linkedDurationSeconds:
          1800,
      },
    );

    assert.equal(
      result
        .submittedEvidence
        .linkedMapName,
      "Arena",
    );

    assert.equal(
      result
        .submittedEvidence
        .linkedDurationSeconds,
      9999,
    );
  },
);


test(
  "omitted manual winner preserves existing server-linked winner while explicit blank clears it",
  () => {
    const preserved =
      planChallengeManualCompletion({
        ...basePlan(),

        currentLinkedWinner:
          "Jim",

        submittedWinner:
          undefined,
      });

    assert.equal(
      preserved.linkedWinner,
      "Jim",
    );

    const cleared =
      planChallengeManualCompletion({
        ...basePlan(),

        currentLinkedWinner:
          "Jim",

        submittedWinner:
          " ",
      });

    assert.equal(
      cleared.linkedWinner,
      null,
    );
  },
);


test(
  "HTTP completion family delegates without result persistence authority",
  () => {
    const start =
      route.indexOf(
        'if (action === "mark_completed")',
      );

    const end =
      route.indexOf(
        "await postChallengeCommissionerNotice",
        start,
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
      /await completeChallengeManually\(/,
    );

    for (
      const forbidden
      of [
        "$transaction",
        "scheduledMatch.update",
        "recordChallengeActivity",
        'status: "completed"',
        "settlementReadyAt:",
        "resultAt:",
      ]
    ) {
      assert.equal(
        family.includes(
          forbidden,
        ),
        false,
        `HTTP completion branch still owns ${forbidden}`,
      );
    }
  },
);


test(
  "manual completion command CAS binds lifecycle attendance funding and canonical replay identity",
  () => {
    const start =
      commands.indexOf(
        "export async function completeChallengeManually",
      );

    const end =
      commands.indexOf(
        "export async function checkInChallenge",
        start,
      );

    assert.ok(
      start >= 0 &&
      end > start,
    );

    const command =
      commands.slice(
        start,
        end,
      );

    assert.match(
      command,
      /\.updateMany\(\{/,
    );

    for (
      const field
      of [
        "status:",
        "timingMode:",
        "scheduledAt:",
        "matchTime:",
        "acceptedAt:",
        "wagerAmountWolo:",
        "guaranteeAmountWolo:",
        "challengerFundedAt:",
        "challengedFundedAt:",
        "challengerCheckedInAt:",
        "challengedCheckedInAt:",
        "liveConfirmedAt:",
        "resultAt:",
        "settlementReadyAt:",
        "linkedSessionKey:",
        "linkedMapName:",
        "linkedWinner:",
        "linkedDurationSeconds:",
      ]
    ) {
      assert.ok(
        command.includes(
          field,
        ),
        `completion CAS missing ${field}`,
      );
    }

    assert.match(
      command,
      /completed\.count !==\s*1/,
    );

    assert.match(
      command,
      /Challenge result state changed before manual completion finished/,
    );
  },
);


test(
  "losing completion race fails before chronicle consequence",
  () => {
    const start =
      commands.indexOf(
        "export async function completeChallengeManually",
      );

    const end =
      commands.indexOf(
        "export async function checkInChallenge",
        start,
      );

    const command =
      commands.slice(
        start,
        end,
      );

    const mutation =
      command.indexOf(
        ".updateMany({",
      );

    const fence =
      command.indexOf(
        "completed.count !==",
      );

    const activity =
      command.indexOf(
        "recordChallengeActivity(",
      );

    assert.ok(
      mutation >= 0,
    );

    assert.ok(
      fence > mutation,
    );

    assert.ok(
      activity > fence,
    );
  },
);


test(
  "commissioner result provenance is explicitly attributable",
  () => {
    const start =
      commands.indexOf(
        "export async function completeChallengeManually",
      );

    const end =
      commands.indexOf(
        "export async function checkInChallenge",
        start,
      );

    const command =
      commands.slice(
        start,
        end,
      );

    assert.match(
      command,
      /actorUserId:\s*actor\.id/,
    );

    assert.match(
      command,
      /resultAuthority:\s*"commissioner_manual"/,
    );

    assert.match(
      command,
      /replayProvenanceVerified:\s*false/,
    );

    assert.match(
      command,
      /titleResultAuthority:\s*false/,
    );

    assert.match(
      command,
      /settlementExecuted:\s*false/,
    );
  },
);


test(
  "manual completion cannot mutate title custody or execute settlement",
  () => {
    const start =
      commands.indexOf(
        "export async function completeChallengeManually",
      );

    const end =
      commands.indexOf(
        "export async function checkInChallenge",
        start,
      );

    const command =
      commands.slice(
        start,
        end,
      );

    for (
      const forbidden
      of [
        "trophyChallenge",
        "recordVerifiedScheduledMatchTitleResults",
        "attemptAutomaticScheduledMatchSettlement",
        "scheduledMatchSettlement.create",
        "executeScheduledMatchSettlement",
        "executeWolo",
      ]
    ) {
      assert.equal(
        command.includes(
          forbidden,
        ),
        false,
        `manual completion acquired ${forbidden}`,
      );
    }
  },
);


test(
  "automatic replay completion remains the sole replay verification and title proposal path",
  () => {
    assert.match(
      automatic,
      /function findLinkedSession\(/,
    );

    assert.match(
      automatic,
      /sessionMatchesScheduledPlayers/,
    );

    assert.match(
      automatic,
      /loadLockedScheduledMatchDesyncIncidents/,
    );

    assert.match(
      automatic,
      /assertWinnerSettlementAllowed/,
    );

    assert.match(
      automatic,
      /recordVerifiedScheduledMatchTitleResults/,
    );

    assert.match(
      automatic,
      /attemptAutomaticScheduledMatchSettlement/,
    );
  },
);


test(
  "manual winner remains explicit commissioner economic authority downstream",
  () => {
    assert.match(
      settlements,
      /const winnerKey = normalizeIdentity\(input\.row\.linkedWinner\)/,
    );

    assert.match(
      settlements,
      /participantAliases\(input\.row\.challenger\)/,
    );

    assert.match(
      settlements,
      /participantAliases\(input\.row\.challenged\)/,
    );

    assert.match(
      settlements,
      /awardWagerToParticipant/,
    );

    assert.match(
      settlements,
      /Completed match winner does not resolve uniquely to one challenge participant/,
    );
  },
);


test(
  "winner-value execution still acquires desync authority after manual completion",
  () => {
    assert.match(
      settlements,
      /scheduledMatchSettlementRequiresWinnerDesyncGuard/,
    );

    assert.match(
      settlements,
      /acquireChallengeDesyncAdvisoryLock/,
    );

    assert.match(
      settlements,
      /loadDesyncIncidentsForSettlement/,
    );

    assert.match(
      settlements,
      /assertWinnerSettlementAllowed/,
    );

    assert.match(
      settlements,
      /await assertLockedWinnerSettlementAllowed\(tx, matchId\)/,
    );
  },
);


test(
  "pure manual completion policy remains infrastructure free",
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
      /trophyChallenge/,
    );

    assert.doesNotMatch(
      policy,
      /next\//,
    );
  },
);
