import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL(
    "../prisma/migrations/20260824050000_add_wargraph_foundation/migration.sql",
    import.meta.url,
  ),
  "utf8",
);

const settlement = await readFile(
  new URL(
    "../lib/wargraph/prismaSettlementWorker.ts",
    import.meta.url,
  ),
  "utf8",
);

test(
  "administrative advance settlement does not fabricate acceptance",
  () => {
    assert.match(
      migration,
      /"status" NOT IN \('accepted', 'bound'\) OR "accepted_at" IS NOT NULL/,
    );

    assert.doesNotMatch(
      migration,
      /"status" NOT IN \('accepted', 'bound', 'settled'\) OR "accepted_at" IS NOT NULL/,
    );

    const startMarker =
      'const targetAdvanceStatus = input.terminal.advanceStatus ?? "system_void";';

    const endMarker =
      "await tx.warGraphDefenseObligation.updateMany";

    const start = settlement.indexOf(startMarker);
    const end = settlement.indexOf(
      endMarker,
      start,
    );

    assert.notEqual(
      start,
      -1,
      "terminal advance update start missing",
    );

    assert.notEqual(
      end,
      -1,
      "terminal advance update end missing",
    );

    const region = settlement.slice(
      start,
      end,
    );

    assert.match(
      region,
      /status:\s*targetAdvanceStatus,/,
    );

    assert.match(
      region,
      /resolvedAt:\s*input\.occurredAt,/,
    );

    assert.match(
      region,
      /resolutionCode:\s*input\.terminal\.resolutionCode,/,
    );

    assert.doesNotMatch(
      region,
      /acceptedAt:/,
      "terminal resolution must not invent acceptance",
    );
  },
);
