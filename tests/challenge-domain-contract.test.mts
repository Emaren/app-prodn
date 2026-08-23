import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";
import test from "node:test";

import {
  CHALLENGE_ACTIONS,
  parseChallengeAction,
} from "../lib/challenge/domain/contracts.ts";

import {
  ChallengeConflictError,
} from "../lib/challenge/domain/errors.ts";


const route =
  readFileSync(
    "app/api/challenges/[id]/route.ts",
    "utf8",
  );


test(
  "Challenge command vocabulary is exact and centralized",
  () => {
    assert.deepEqual(
      [
        ...CHALLENGE_ACTIONS,
      ],
      [
        "accept",
        "decline",
        "cancel",
        "reschedule",
        "confirm_time",
        "fund",
        "check_in",
        "resolve_no_show",
        "mark_completed",
        "desync_rematch",
        "desync_void_refund",
        "room_message",
      ],
    );
  },
);


test(
  "Challenge action parser accepts only canonical commands",
  () => {
    for (
      const action
      of CHALLENGE_ACTIONS
    ) {
      assert.equal(
        parseChallengeAction(
          action,
        ),
        action,
      );
    }

    assert.equal(
      parseChallengeAction(
        "settle_everything",
      ),
      null,
    );

    assert.equal(
      parseChallengeAction(
        "",
      ),
      null,
    );

    assert.equal(
      parseChallengeAction(
        null,
      ),
      null,
    );

    assert.equal(
      parseChallengeAction(
        42,
      ),
      null,
    );
  },
);


test(
  "Challenge conflict semantics live outside HTTP transport",
  () => {
    const error =
      new ChallengeConflictError(
        "changed",
      );

    assert.equal(
      error.name,
      "ChallengeConflictError",
    );

    assert.equal(
      error.status,
      409,
    );

    assert.equal(
      error.message,
      "changed",
    );

    assert.equal(
      new ChallengeConflictError(
        "forbidden",
        403,
      ).status,
      403,
    );
  },
);


test(
  "HTTP route imports domain command vocabulary instead of owning an allowlist",
  () => {
    assert.match(
      route,
      /parseChallengeAction/,
    );

    assert.match(
      route,
      /ChallengeMutationPayload/,
    );

    assert.doesNotMatch(
      route,
      /payload\.action !== "accept"/,
    );

    assert.doesNotMatch(
      route,
      /class ChallengeConflictError/,
    );
  },
);


test(
  "transport action is parsed exactly once",
  () => {
    const matches =
      route.match(
        /payload\.action/g,
      ) ??
      [];

    assert.equal(
      matches.length,
      1,
    );
  },
);


test(
  "every mutation branch consumes the typed action",
  () => {
    for (
      const action
      of CHALLENGE_ACTIONS
    ) {
      assert.match(
        route,
        new RegExp(
          `action === "${action}"`,
        ),
      );
    }
  },
);
