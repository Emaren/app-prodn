import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../prisma/migrations/20260927010000_allow_asymmetric_replay_roster_promotions/migration.sql",
    import.meta.url,
  ),
  "utf8",
);

const rosterSource = readFileSync(
  new URL(
    "../lib/publicReplayRosterV2.ts",
    import.meta.url,
  ),
  "utf8",
);

test(
  "Replay Roster V3 database format constraint mirrors the bounded asymmetric two-team envelope",
  () => {
    assert.match(
      migration,
      /AOE2WAR-MIGRATION-MODE:\s*PRODUCTION_PROVEN_CHECK_REPLACEMENT/,
    );

    assert.match(
      migration,
      /before_sha256=e1a8a48953aae85038e714f79bd039c0dbdcf6e44ae558fde52d63a780f78bb8/,
    );

    assert.match(
      migration,
      /after_sha256=c9043cbd4f568543c7238b0f3599f233c5715ef3f66cc4b170a219bcd7fb0360/,
    );

    assert.match(
      rosterSource,
      /\^\(\[1-4\]\)v\(\[1-4\]\)\$/,
    );

    assert.match(
      rosterSource,
      /expectedPlayerCount\s*>?=\s*3/,
    );

    assert.match(
      rosterSource,
      /expectedPlayerCount\s*<=\s*8/,
    );

    const expected = new Map<string, number>();

    for (let left = 1; left <= 4; left += 1) {
      for (let right = 1; right <= 4; right += 1) {
        const total = left + right;

        if (total < 3 || total > 8) {
          continue;
        }

        expected.set(
          `${left}v${right}`,
          total,
        );
      }
    }

    assert.equal(
      expected.size,
      15,
    );

    for (const [format, playerCount] of expected) {
      assert.match(
        migration,
        new RegExp(
          `\\('${format}',\\s*${playerCount}\\)`,
        ),
        `missing database format pair ${format}/${playerCount}`,
      );
    }

    assert.doesNotMatch(
      migration,
      /\('1v1',\s*2\)/,
    );

    assert.doesNotMatch(
      migration,
      /\('5v1'/,
    );

    assert.doesNotMatch(
      migration,
      /ck_replay_roster_promotions_(?:no_results|no_bets|no_settlement)/,
    );
  },
);
