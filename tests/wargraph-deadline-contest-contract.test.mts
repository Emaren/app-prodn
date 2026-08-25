import assert from "node:assert/strict";
import {
  readFile,
} from "node:fs/promises";
import test from "node:test";

const SOURCE =
  "lib/wargraph/prismaDeadlineWorker.ts";

const MIGRATION =
  "prisma/migrations/20260824050000_add_wargraph_foundation/migration.sql";

test(
  "deadline contests use canonical WarGraph kind and provenance values",
  async () => {
    const [
      source,
      migration,
    ] =
      await Promise.all([
        readFile(
          SOURCE,
          "utf8",
        ),
        readFile(
          MIGRATION,
          "utf8",
        ),
      ]);

    assert.doesNotMatch(
      source,
      /kind:\s*"administrative"/,
    );

    assert.doesNotMatch(
      source,
      /provenance:\s*"server_deadline"/,
    );

    assert.match(
      source,
      /type DeadlineContestKind\s*=\s*\|\s*"DEFENSE_DEFAULT"\s*\|\s*WarGraphPairingDeadlineKind;/,
    );

    assert.match(
      source,
      /kind:\s*DeadlineContestKind;/,
    );

    assert.match(
      source,
      /provenance:\s*DeadlineContestProvenance;/,
    );

    assert.match(
      source,
      /existing\.kind !== seed\.kind/,
    );

    assert.match(
      source,
      /existing\.provenance !== seed\.provenance/,
    );

    assert.match(
      source,
      /kind:\s*seed\.kind,\s*provenance:\s*seed\.provenance,/,
    );

    assert.match(
      source,
      /kind:\s*"DEFENSE_DEFAULT",\s*provenance:\s*"ADMINISTRATIVE",/,
    );

    assert.match(
      source,
      /kind:\s*resolutionKind,\s*provenance:\s*deadlineContestProvenance\(\s*resolutionKind,\s*\),/,
    );

    assert.match(
      source,
      /case "SYSTEM_VOID":\s*case "TECHNICAL_VOID":\s*return "SYSTEM";/,
    );

    assert.match(
      source,
      /default:\s*return "ADMINISTRATIVE";/,
    );

    assert.doesNotMatch(
      source,
      /settlementKey:\s*null,\s*eventType:\s*"WARGRAPH_DEFENSE_DEFAULT_RESOLVED"/,
    );

    assert.doesNotMatch(
      source,
      /settlementKey:\s*null,\s*eventType:\s*systemVoid\s*\?\s*"WARGRAPH_CONTEST_SYSTEM_VOIDED"/,
    );

    assert.match(
      source,
      /settlementKey:\s*`wargraph:settlement:advance-default:\$\{advance\.publicId\}`/,
    );

    assert.match(
      source,
      /settlementKey:\s*terminalStatus === "settled"\s*\?\s*`wargraph:settlement:pairing-deadline:\$\{pairing\.publicId\}`\s*:\s*null/,
    );

    assert.match(
      migration,
      /"status" <> 'settled' OR \("settled_at" IS NOT NULL AND "settlement_key" IS NOT NULL\)/,
    );

    assert.match(
      source,
      /createdAt:\s*Date;/,
    );

    assert.match(
      source,
      /createdAt:\s*seed\.createdAt,/,
    );

    assert.equal(
      source.match(/createdAt:\s*now,/g)?.length,
      2,
    );

    assert.match(
      migration,
      /"settled_at" IS NULL OR "settled_at" >= COALESCE\("commenced_at", "created_at"\)/,
    );

    for (
      const kind of [
        "VERIFIED_BATTLE",
        "DEFENSE_DEFAULT",
        "DEFENDER_NO_START_DEFAULT",
        "CHALLENGER_ABANDONMENT",
        "TECHNICAL_VOID",
        "SYSTEM_VOID",
        "MUTUAL_NO_START",
      ]
    ) {
      assert.match(
        migration,
        new RegExp(
          `'${kind}'`,
        ),
      );
    }

    for (
      const provenance of [
        "LIVE_DOUBLE_WATCHER",
        "ADMINISTRATIVE",
        "SYSTEM",
      ]
    ) {
      assert.match(
        migration,
        new RegExp(
          `'${provenance}'`,
        ),
      );
    }
  },
);
