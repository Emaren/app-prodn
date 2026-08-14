import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source =
  fs.readFileSync(
    new URL(
      "../scripts/publish-workshop-2026-08-14.mts",
      import.meta.url,
    ),
    "utf8",
  );

test(
  "Workshop Chronicle covers every day from Aug 9 through Aug 14",
  () => {
    for (const day of [
      "2026-08-09",
      "2026-08-10",
      "2026-08-11",
      "2026-08-12",
      "2026-08-13",
      "2026-08-14",
    ]) {
      assert.match(
        source,
        new RegExp(day),
      );
    }
  },
);

test(
  "Workshop leads with human summaries and keeps technical depth underneath",
  () => {
    assert.match(
      source,
      /Replay truth goes realtime — without guessing\./,
    );

    assert.match(
      source,
      /AoE2WAR gets dramatically faster\./,
    );

    assert.match(
      source,
      /The last rough edges get sanded off\./,
    );

    assert.match(
      source,
      /summary:/,
    );

    assert.match(
      source,
      /body:/,
    );

    assert.match(
      source,
      /about 37%/,
    );
  },
);

test(
  "Workshop publication remains explicit and fail-closed",
  () => {
    assert.match(
      source,
      /PUBLISH-WORKSHOP-CHRONICLE-2026-08-14/,
    );

    assert.match(
      source,
      /PLAN ONLY: no Workshop rows changed\./,
    );

    assert.match(
      source,
      /pg_advisory_xact_lock/,
    );
  },
);
