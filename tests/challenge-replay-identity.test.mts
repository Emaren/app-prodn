import assert from "node:assert/strict";

import {
  readFileSync,
} from "node:fs";

import test from "node:test";


const schema =
  readFileSync(
    "prisma/schema.prisma",
    "utf8",
  );

const migration =
  readFileSync(
    "prisma/migrations/20260823224000_challenge_replay_claim_v3/migration.sql",
    "utf8",
  );

const challenges =
  readFileSync(
    "lib/challenges.ts",
    "utf8",
  );

const settlements =
  readFileSync(
    "lib/scheduledMatchSettlements.ts",
    "utf8",
  );

const desync =
  readFileSync(
    "lib/desyncChallenge.ts",
    "utf8",
  );


test(
  "one replay is globally exclusive while one Challenge may retain attempt history",
  () => {
    assert.match(
      schema,
      /gameStatsId\s+Int\s+@unique\(map: "uq_sched_match_replay_claim_game"\)/,
    );

    assert.match(
      schema,
      /replayClaims\s+ScheduledMatchReplayClaim\[\]/,
    );

    assert.doesNotMatch(
      schema,
      /scheduledMatchId\s+Int\s+@unique/,
    );

    assert.doesNotMatch(
      migration,
      /UNIQUE \("scheduled_match_id"\)/,
    );

    assert.match(
      migration,
      /UNIQUE \("game_stats_id"\)/,
    );
  },
);


test(
  "current competitive replay is explicit and unique",
  () => {
    assert.match(
      schema,
      /currentReplayClaimId\s+Int\?\s+@unique/,
    );

    assert.match(
      schema,
      /currentReplayClaim\s+ScheduledMatchReplayClaim\?/,
    );

    assert.match(
      migration,
      /ADD COLUMN "current_replay_claim_id"/,
    );

    assert.match(
      migration,
      /uq_sched_match_current_replay_claim/,
    );
  },
);


test(
  "database prevents current pointer from crossing Challenge ownership",
  () => {
    assert.match(
      migration,
      /enforce_scheduled_match_current_replay_claim_owner/,
    );

    assert.match(
      migration,
      /claim\."scheduled_match_id"\s*=\s*NEW\."id"/,
    );
  },
);


test(
  "replay attempt history remains immutable",
  () => {
    assert.match(
      migration,
      /BEFORE UPDATE OR DELETE/,
    );

    assert.match(
      migration,
      /BEFORE TRUNCATE/,
    );

    assert.match(
      migration,
      /scheduled_match_replay_claims are immutable/,
    );
  },
);


test(
  "historical linked Challenge backfill resolves final canonical GameStats identity",
  () => {
    for (
      const required
      of [
        '"linked_session_key"',
        "'platform:'",
        "'{platform_match_id}'",
        '"original_filename"',
        '"replay_file"',
        '"is_final" = TRUE',
        "'watcher_final_unparsed'",
        'gs."timestamp" DESC',
        'gs."created_at" DESC',
        'gs."id" DESC',
        "'legacy_linked_session_backfill'",
      ]
    ) {
      assert.ok(
        migration.includes(
          required,
        ),
        `migration missing ${required}`,
      );
    }
  },
);


test(
  "historical linked replay becomes explicit current authority",
  () => {
    assert.match(
      migration,
      /UPDATE "scheduled_matches" sm/,
    );

    assert.match(
      migration,
      /"current_replay_claim_id"\s*=\s*claim\."id"/,
    );

    assert.match(
      migration,
      /current_claims <> linked_matches/,
    );
  },
);


test(
  "commissioner rematch clears current replay without deleting history",
  () => {
    const start =
      desync.indexOf(
        'if (input.action === "rematch")',
      );

    const end =
      desync.indexOf(
        '\n  return {',
        start,
      );

    const block =
      desync.slice(
        start,
        end,
      );

    assert.match(
      block,
      /currentReplayClaimId:\s*null/,
    );

    assert.match(
      block,
      /linkedSessionKey:\s*null/,
    );

    assert.doesNotMatch(
      block,
      /scheduledMatchReplayClaim/,
    );

    assert.doesNotMatch(
      block,
      /\.delete/,
    );
  },
);


test(
  "current replay pins ordinary correlation",
  () => {
    const start =
      challenges.indexOf(
        "function findLinkedSession(",
      );

    const end =
      challenges.indexOf(
        "\nfunction ",
        start + 1,
      );

    const block =
      challenges.slice(
        start,
        end,
      );

    assert.match(
      block,
      /if \(row\.currentReplayClaim\)/,
    );

    assert.match(
      block,
      /session\.id ===[\s\S]*row\.currentReplayClaim\?\.gameStatsId/,
    );

    assert.match(
      block,
      /return canonical \?\? null/,
    );
  },
);


test(
  "rematch correlation excludes every previously consumed replay",
  () => {
    const start =
      challenges.indexOf(
        "function findLinkedSession(",
      );

    const end =
      challenges.indexOf(
        "\nfunction ",
        start + 1,
      );

    const block =
      challenges.slice(
        start,
        end,
      );

    assert.match(
      block,
      /historicalReplayIds/,
    );

    assert.match(
      block,
      /row\.replayClaims\.map/,
    );

    assert.match(
      block,
      /!historicalReplayIds\.has\(session\.id\)/,
    );
  },
);


test(
  "automatic completion globally checks replay ownership under lock",
  () => {
    const start =
      challenges.indexOf(
        "let completionOutcome:",
      );

    const end =
      challenges.indexOf(
        "const transitionedToCompleted",
        start,
      );

    const block =
      challenges.slice(
        start,
        end,
      );

    const lock =
      block.indexOf(
        "loadLockedScheduledMatchDesyncIncidents",
      );

    const claimRead =
      block.indexOf(
        ".scheduledMatchReplayClaim",
      );

    const cas =
      block.indexOf(
        ".scheduledMatch\n"
        + "                    .updateMany",
      );

    const claimCreate =
      block.indexOf(
        ".scheduledMatchReplayClaim\n"
        + "                    .create",
      );

    const pointer =
      block.indexOf(
        "currentReplayClaimId:",
        claimCreate,
      );

    assert.ok(
      lock >= 0,
    );

    assert.ok(
      claimRead > lock,
    );

    assert.ok(
      cas > claimRead,
    );

    assert.ok(
      claimCreate > cas,
    );

    assert.ok(
      pointer > claimCreate,
    );
  },
);


test(
  "a Challenge with current replay cannot silently replace it",
  () => {
    assert.match(
      challenges,
      /row\.currentReplayClaim[\s\S]*gameStatsId !==[\s\S]*completedSession\.id/,
    );

    assert.match(
      challenges,
      /commissioner rematch must clear it/,
    );
  },
);


test(
  "same Challenge can append later replay after current authority was cleared",
  () => {
    assert.doesNotMatch(
      migration,
      /UNIQUE \("scheduled_match_id"\)/,
    );

    assert.match(
      desync,
      /currentReplayClaimId:\s*null/,
    );

    assert.match(
      challenges,
      /scheduledMatchId:\s*row\.id/,
    );

    assert.match(
      challenges,
      /gameStatsId:\s*completedSession\.id/,
    );
  },
);


test(
  "same replay can never back two Challenges",
  () => {
    assert.match(
      challenges,
      /replayClaim[\s\S]*scheduledMatchId !==[\s\S]*row\.id/,
    );

    assert.match(
      challenges,
      /already canonically claimed by scheduled match/,
    );

    assert.match(
      challenges,
      /error\.code ===[\s\S]*"P2002"/,
    );
  },
);


test(
  "settlement consumes only explicit current replay authority",
  () => {
    assert.doesNotMatch(
      settlements,
      /resolveFinalGameStatsIdForSessionKey/,
    );

    assert.match(
      settlements,
      /currentReplayClaim:/,
    );

    assert.match(
      settlements,
      /match\.currentReplayClaim[\s\S]*\.gameStatsId/,
    );

    assert.doesNotMatch(
      settlements,
      /match\.linkedSessionKey/,
    );
  },
);


test(
  "manual commissioner result cannot create or select verified replay authority",
  () => {
    const commandSource =
      readFileSync(
        "lib/challenge/domain/commands.ts",
        "utf8",
      );

    const start =
      commandSource.indexOf(
        "export async function completeChallengeManually",
      );

    const end =
      commandSource.indexOf(
        "export async function checkInChallenge",
        start,
      );

    const manual =
      commandSource.slice(
        start,
        end,
      );

    assert.doesNotMatch(
      manual,
      /scheduledMatchReplayClaim/,
    );

    assert.doesNotMatch(
      manual,
      /currentReplayClaimId/,
    );

    assert.match(
      manual,
      /replayProvenanceVerified:\s*false/,
    );
  },
);


test(
  "verified replay provenance cannot overwrite completed result authority",
  () => {
    const start =
      challenges.indexOf(
        "const preserveCompletedResultAuthority",
      );

    const end =
      challenges.indexOf(
        "let completionOutcome:",
        start,
      );

    assert.ok(
      start >= 0 &&
      end > start,
    );

    const block =
      challenges.slice(
        start,
        end,
      );

    assert.match(
      block,
      /preserveCompletedResultAuthority[\s\S]*row\.status === "completed"/,
    );

    assert.match(
      block,
      /persistedResultAt[\s\S]*row\.resultAt \?\? completedAt/,
    );

    assert.match(
      block,
      /persistedSettlementReadyAt[\s\S]*row\.settlementReadyAt \?\?[\s\S]*persistedResultAt/,
    );

    assert.match(
      block,
      /persistedWinner[\s\S]*preserveCompletedResultAuthority[\s\S]*row\.linkedWinner[\s\S]*completedSession\.winner/,
    );

    assert.match(
      block,
      /resultAt:\s*persistedResultAt/,
    );

    assert.match(
      block,
      /settlementReadyAt:\s*persistedSettlementReadyAt/,
    );

    assert.match(
      block,
      /linkedWinner:\s*persistedWinner/,
    );

    assert.doesNotMatch(
      block,
      /linkedWinner:\s*completedSession\.winner/,
    );
  },
);


test(
  "completed Challenge cannot be downgraded by an active watcher observation",
  () => {
    const start =
      challenges.indexOf(
        "async function persistScheduledMatchResults",
      );

    assert.ok(
      start >= 0,
    );

    const block =
      challenges.slice(
        start,
      );

    assert.match(
      block,
      /updatedRows\.push\(completedNextRow\);[\s\S]*?continue;[\s\S]*?if \(row\.status === "completed"\) \{[\s\S]*?updatedRows\.push\(row\);[\s\S]*?continue;[\s\S]*?const activeSession = findLinkedSession/,
    );
  },
);


test(
  "completed public winner remains persisted competitive result authority",
  () => {
    assert.match(
      challenges,
      /linkedWinner:\s*[\s\S]*?desyncReviewActive[\s\S]*?row\.status === "completed"[\s\S]*?row\.linkedWinner \?\? null[\s\S]*?linkedSession\?\.winner/,
    );
  },
);


test(
  "later replay attachment to an already completed Challenge cannot auto-settle it again",
  () => {
    assert.match(
      challenges,
      /if \(transitionedToCompleted\) \{[\s\S]*?await attemptAutomaticScheduledMatchSettlement\(prisma, row\.id\)/,
    );
  },
);
