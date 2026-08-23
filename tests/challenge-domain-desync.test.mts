import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";


const [
  route,
  commands,
  protocol,
  policy,
] =
  await Promise.all([
    readFile(
      new URL(
        "../app/api/challenges/[id]/route.ts",
        import.meta.url,
      ),
      "utf8",
    ),

    readFile(
      new URL(
        "../lib/challenge/domain/commands.ts",
        import.meta.url,
      ),
      "utf8",
    ),

    readFile(
      new URL(
        "../lib/desyncChallengeProtocol.ts",
        import.meta.url,
      ),
      "utf8",
    ),

    readFile(
      new URL(
        "../lib/challenge/domain/transitionPolicy.ts",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);


function commandBlock() {
  const start =
    commands.indexOf(
      "export async function resolveChallengeDesync(",
    );

  assert.ok(
    start >= 0,
  );

  return commands.slice(
    start,
  );
}


function parserBlock() {
  const start =
    commands.indexOf(
      "function parseChallengeDesyncRematchAt(",
    );

  const end =
    commands.indexOf(
      "export async function resolveChallengeDesync(",
      start,
    );

  assert.ok(
    start >= 0 &&
    end > start,
  );

  return commands.slice(
    start,
    end,
  );
}


test(
  "HTTP requests desync transition without owning commissioner policy",
  () => {
    const start =
      route.indexOf(
        'action === "desync_rematch"',
      );

    const end =
      route.indexOf(
        "const lifecycleTransitionContext",
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
      /resolveChallengeDesync\(/,
    );

    assert.doesNotMatch(
      block,
      /if \(!viewer\.isAdmin\)/,
    );

    assert.doesNotMatch(
      block,
      /Number\(payload\.desyncIncidentId\)/,
    );

    assert.doesNotMatch(
      route,
      /resolveChallengeDesyncDisposition/,
    );

    assert.doesNotMatch(
      route,
      /validateScheduledAtWindow/,
    );

    assert.doesNotMatch(
      route,
      /parseScheduledMatchDate/,
    );
  },
);


test(
  "Challenge desync command owns authorization and normalization",
  () => {
    const block =
      commandBlock();

    assert.match(
      block,
      /!input\.actor\.isAdmin/,
    );

    assert.match(
      block,
      /Number\([\s\S]*desyncIncidentId/,
    );

    assert.match(
      block,
      /Number\.isSafeInteger/,
    );

    assert.match(
      block,
      /idempotencyKey[\s\S]*trim/,
    );

    assert.match(
      block,
      /idempotencyKey\.length[\s\S]*128/,
    );

    assert.match(
      block,
      /note[\s\S]*trim[\s\S]*slice[\s\S]*1_000/,
    );
  },
);


test(
  "desync rematch date parsing preserves the legacy string-only contract",
  () => {
    const block =
      parserBlock();

    assert.match(
      block,
      /typeof value !==[\s\S]*"string"/,
    );

    assert.match(
      block,
      /!value\.trim\(\)/,
    );

    assert.match(
      block,
      /new Date\([\s\S]*value/,
    );

    assert.match(
      block,
      /Number\.isNaN\([\s\S]*parsed\.getTime/,
    );

    assert.doesNotMatch(
      block,
      /instanceof Date/,
    );
  },
);


test(
  "rematch scheduling reuses canonical Challenge timing law",
  () => {
    const block =
      commandBlock();

    assert.match(
      block,
      /validateChallengeScheduledAtWindow\([\s\S]*rematchAt[\s\S]*now/,
    );

    assert.match(
      policy,
      /export function validateChallengeScheduledAtWindow\(/,
    );

    assert.doesNotMatch(
      route,
      /SCHEDULE_WINDOW_MIN_MS/,
    );

    assert.doesNotMatch(
      route,
      /SCHEDULE_WINDOW_MAX_MS/,
    );
  },
);


test(
  "domain wrapper leaves mutation idempotency locking and settlement to existing protocol",
  () => {
    const block =
      commandBlock();

    assert.match(
      block,
      /return resolveChallengeDesyncDisposition\(/,
    );

    for (
      const forbidden
      of [
        "$transaction",
        "scheduledMatch.update",
        "scheduledMatch.updateMany",
        "replayDesyncIncident.create",
        "executeScheduledMatchSettlement",
      ]
    ) {
      assert.equal(
        block.includes(
          forbidden,
        ),
        false,
        `wrapper duplicated lower-level mutation: ${forbidden}`,
      );
    }

    assert.match(
      protocol,
      /export async function resolveChallengeDesyncDisposition\(/,
    );

    assert.match(
      protocol,
      /planDesyncCommissionerAction/,
    );
  },
);


test(
  "lower-level desync errors remain on the existing HTTP error rail",
  () => {
    assert.match(
      route,
      /error instanceof ChallengeDesyncError/,
    );

    assert.match(
      route,
      /\{ detail: error\.message, code: error\.code \}/,
    );

    assert.match(
      route,
      /\{ status: error\.status \}/,
    );
  },
);
