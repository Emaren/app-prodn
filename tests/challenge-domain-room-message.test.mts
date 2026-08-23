import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  planChallengeRoomMessage,
} from "../lib/challenge/domain/transitionPolicy.ts";

import {
  ChallengeConflictError,
} from "../lib/challenge/domain/errors.ts";


const [
  commands,
  route,
] =
  await Promise.all([
    readFile(
      new URL(
        "../lib/challenge/domain/commands.ts",
        import.meta.url,
      ),
      "utf8",
    ),

    readFile(
      new URL(
        "../app/api/challenges/[id]/route.ts",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);


const now =
  new Date(
    "2026-08-23T23:45:00.000Z",
  );


function baseInput() {
  return {
    actor: {
      id:
        11,

      isAdmin:
        false,
    },

    match: {
      challengerUserId:
        11,

      challengedUserId:
        22,
    },

    message:
      "For the kingdom.",

    now,
  };
}


test(
  "only a duelist or commissioner may write to the Match Room",
  () => {
    assert.throws(
      () =>
        planChallengeRoomMessage(
          {
            ...baseInput(),

            actor: {
              id:
                99,

              isAdmin:
                false,
            },
          },
        ),
      (
        error:
          unknown,
      ) =>
        error instanceof
          ChallengeConflictError &&
        error.status ===
          403 &&
        error.message ===
          "You are not part of this scheduled match.",
    );

    assert.doesNotThrow(
      () =>
        planChallengeRoomMessage(
          {
            ...baseInput(),

            actor: {
              id:
                99,

              isAdmin:
                true,
            },
          },
        ),
    );

    assert.doesNotThrow(
      () =>
        planChallengeRoomMessage(
          {
            ...baseInput(),

            actor: {
              id:
                22,

              isAdmin:
                false,
            },
          },
        ),
    );
  },
);


test(
  "blank Match Room messages fail closed",
  () => {
    assert.throws(
      () =>
        planChallengeRoomMessage(
          {
            ...baseInput(),

            message:
              "   ",
          },
        ),
      (
        error:
          unknown,
      ) =>
        error instanceof
          ChallengeConflictError &&
        error.status ===
          400 &&
        error.message ===
          "Write a Match Room message first.",
    );
  },
);


test(
  "Match Room messages preserve the 2,000-character ceiling",
  () => {
    assert.doesNotThrow(
      () =>
        planChallengeRoomMessage(
          {
            ...baseInput(),

            message:
              "x".repeat(
                2_000,
              ),
          },
        ),
    );

    assert.throws(
      () =>
        planChallengeRoomMessage(
          {
            ...baseInput(),

            message:
              "x".repeat(
                2_001,
              ),
          },
        ),
      (
        error:
          unknown,
      ) =>
        error instanceof
          ChallengeConflictError &&
        error.status ===
          413 &&
        error.message ===
          "Match Room messages must be 2,000 characters or shorter.",
    );
  },
);


test(
  "room-message plan trims content and produces public Chronicle activity",
  () => {
    const plan =
      planChallengeRoomMessage(
        {
          ...baseInput(),

          message:
            "   Good luck, have fun.   ",
        },
      );

    assert.deepEqual(
      plan,
      {
        eventType:
          "room_message",

        metadata: {
          message:
            "Good luck, have fun.",

          publicMatchRoom:
            true,
        },

        createdAt:
          now,
      },
    );
  },
);


test(
  "pure room-message policy contains no persistence or delivery infrastructure",
  async () => {
    const policy =
      await readFile(
        new URL(
          "../lib/challenge/domain/transitionPolicy.ts",
          import.meta.url,
        ),
        "utf8",
      );

    const start =
      policy.indexOf(
        "export function planChallengeRoomMessage(",
      );

    assert.ok(
      start >= 0,
    );

    const block =
      policy.slice(
        start,
      );

    for (
      const forbidden
      of [
        "recordChallengeActivity",
        "scheduledMatchActivity",
        "postChallengeInboxNotice",
        "postChallengeCommissionerNotice",
        "$transaction",
      ]
    ) {
      assert.equal(
        block.includes(
          forbidden,
        ),
        false,
        `pure room policy gained infrastructure: ${forbidden}`,
      );
    }
  },
);


test(
  "room command materializes pure plan through shared activity rail",
  () => {
    const start =
      commands.indexOf(
        "export async function postChallengeRoomMessage(",
      );

    assert.ok(
      start >= 0,
    );

    const block =
      commands.slice(
        start,
      );

    assert.match(
      block,
      /planChallengeRoomMessage\(/,
    );

    assert.match(
      block,
      /recordChallengeActivity\(/,
    );

    assert.match(
      block,
      /scheduledMatchId:[\s\S]*input\.challengeId/,
    );

    assert.match(
      block,
      /actorUserId:[\s\S]*input\.actor\.id/,
    );

    assert.match(
      block,
      /eventType:[\s\S]*plan\.eventType/,
    );

    assert.match(
      block,
      /metadata:[\s\S]*plan\.metadata/,
    );

    assert.match(
      block,
      /createdAt:[\s\S]*plan\.createdAt/,
    );
  },
);


test(
  "HTTP forwards raw room-message transport input only",
  () => {
    const start =
      route.indexOf(
        'if (action === "room_message")',
      );

    const end =
      route.indexOf(
        'if (\n      action === "desync_rematch"',
        start,
      );

    assert.ok(
      start >= 0 &&
      end > start,
    );

    const block =
      route.slice(
        start,
        end,
      );

    assert.match(
      block,
      /postChallengeRoomMessage\(/,
    );

    assert.match(
      block,
      /message:[\s\S]*payload\.message/,
    );

    assert.doesNotMatch(
      block,
      /\.trim\(\)/,
    );

    assert.doesNotMatch(
      block,
      /2_000/,
    );

    assert.doesNotMatch(
      block,
      /recordChallengeActivity/,
    );
  },
);
