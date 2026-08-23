import assert from "node:assert/strict";

import {
  readFileSync,
} from "node:fs";

import test from "node:test";


const commands =
  readFileSync(
    "lib/challenge/domain/commands.ts",
    "utf8",
  );

const reconciler =
  readFileSync(
    "lib/challenges.ts",
    "utf8",
  );

const settlements =
  readFileSync(
    "lib/scheduledMatchSettlements.ts",
    "utf8",
  );


function commandBlock(
  name: string,
  nextName?: string,
) {
  const start =
    commands.indexOf(
      `export async function ${name}`,
    );

  assert.ok(
    start >= 0,
    `${name} missing`,
  );

  if (
    !nextName
  ) {
    return commands.slice(
      start,
    );
  }

  const end =
    commands.indexOf(
      `export async function ${nextName}`,
      start + 1,
    );

  assert.ok(
    end > start,
    `${nextName} boundary missing`,
  );

  return commands.slice(
    start,
    end,
  );
}


const checkIn =
  commandBlock(
    "checkInChallenge",
    "resolveChallengeNoShow",
  );

const noShow =
  commandBlock(
    "resolveChallengeNoShow",
  );


const attendanceSnapshotFields = [
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
];


test(
  "check-in uses write-time compare-and-swap against the full attendance snapshot",
  () => {
    assert.match(
      checkIn,
      /\.updateMany\(\{/,
    );

    assert.doesNotMatch(
      checkIn,
      /\.scheduledMatch\s*\.update\(\{/,
    );

    for (
      const field
      of attendanceSnapshotFields
    ) {
      assert.ok(
        checkIn.includes(
          field,
        ),
        `check-in CAS missing ${field}`,
      );
    }

    assert.match(
      checkIn,
      /resultAt:\s*null/,
    );

    assert.match(
      checkIn,
      /settlementReadyAt:\s*null/,
    );

    assert.match(
      checkIn,
      /checkedIn\.count !==\s*1/,
    );

    assert.match(
      checkIn,
      /Attendance state changed before check-in completed/,
    );
  },
);


test(
  "no-show verdict is compare-and-swap bound to the exact attendance evidence",
  () => {
    assert.match(
      noShow,
      /\.updateMany\(\{/,
    );

    assert.doesNotMatch(
      noShow,
      /\.scheduledMatch\s*\.update\(\{/,
    );

    for (
      const field
      of attendanceSnapshotFields
    ) {
      assert.ok(
        noShow.includes(
          field,
        ),
        `no-show CAS missing ${field}`,
      );
    }

    assert.match(
      noShow,
      /resultAt:\s*null/,
    );

    assert.match(
      noShow,
      /settlementReadyAt:\s*null/,
    );

    assert.match(
      noShow,
      /resolved\.count !==\s*1/,
    );

    assert.match(
      noShow,
      /Attendance state changed before no-show resolution completed/,
    );
  },
);


test(
  "losing check-in race fails before every consequence append",
  () => {
    const mutation =
      checkIn.indexOf(
        ".updateMany({",
      );

    const fence =
      checkIn.indexOf(
        "checkedIn.count !==",
      );

    const activity =
      checkIn.indexOf(
        "recordChallengeActivity(",
      );

    const inbox =
      checkIn.indexOf(
        "postChallengeInboxNotice(",
      );

    const userActivity =
      checkIn.indexOf(
        "recordUserActivity(",
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

    assert.ok(
      inbox > fence,
    );

    assert.ok(
      userActivity > fence,
    );
  },
);


test(
  "losing no-show race fails before terminal chronicle or notice",
  () => {
    const mutation =
      noShow.indexOf(
        ".updateMany({",
      );

    const fence =
      noShow.indexOf(
        "resolved.count !==",
      );

    const activity =
      noShow.indexOf(
        "recordChallengeActivity(",
      );

    const inbox =
      noShow.indexOf(
        "postChallengeInboxNotice(",
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

    assert.ok(
      inbox > fence,
    );
  },
);


test(
  "manual no-show CAS now preserves the proven automatic reconciler invariant",
  () => {
    assert.match(
      reconciler,
      /const noShowTransition = await prisma\.scheduledMatch\.updateMany/,
    );

    assert.match(
      reconciler,
      /status:\s*row\.status/,
    );

    assert.match(
      reconciler,
      /challengerCheckedInAt:\s*row\.challengerCheckedInAt/,
    );

    assert.match(
      reconciler,
      /challengedCheckedInAt:\s*row\.challengedCheckedInAt/,
    );

    assert.match(
      noShow,
      /status:\s*match\.status/,
    );

    assert.match(
      noShow,
      /challengerCheckedInAt:\s*match\.challengerCheckedInAt/,
    );

    assert.match(
      noShow,
      /challengedCheckedInAt:\s*match\.challengedCheckedInAt/,
    );
  },
);


test(
  "attendance CAS is economically necessary because settlement trusts terminal status",
  () => {
    for (
      const status
      of [
        "double_no_show",
        "no_show_left",
        "no_show_right",
      ]
    ) {
      assert.match(
        settlements,
        new RegExp(
          `status === "${status}"`,
        ),
      );
    }

    assert.match(
      settlements,
      /\{ settlementReadyAt: \{ not: null \} \}/,
    );

    /*
     * The financial planner intentionally consumes persisted
     * terminal truth. Attendance correctness must therefore be
     * guaranteed before settlementReadyAt becomes eligible.
     */
    const doubleStart =
      settlements.indexOf(
        'if (status === "double_no_show")',
      );

    const leftStart =
      settlements.indexOf(
        'if (status === "no_show_left")',
      );

    const rightStart =
      settlements.indexOf(
        'if (status === "no_show_right")',
      );

    assert.ok(
      doubleStart >= 0 &&
      leftStart > doubleStart &&
      rightStart > leftStart,
    );
  },
);
