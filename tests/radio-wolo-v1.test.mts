import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";
import test from "node:test";

import {
  isRadioWoloOperatorUid,
  radioWoloOperatorUids,
} from "../lib/radioWoloOperatorPolicy.ts";

function read(path: string) {
  return readFileSync(
    new URL(`../${path}`, import.meta.url),
    "utf8",
  );
}

test(
  "Radio WOLO station domain is separate from creator submissions",
  () => {
    const schema =
      read("prisma/schema.prisma");

    assert.match(
      schema,
      /model RadioSubmission \{/,
    );

    assert.match(
      schema,
      /model RadioAsset \{/,
    );

    assert.match(
      schema,
      /model RadioProgram \{/,
    );

    assert.match(
      schema,
      /model RadioProgramItem \{/,
    );

    assert.match(
      schema,
      /model RadioStationState \{/,
    );

    assert.match(
      schema,
      /kind\s+String/,
    );

    assert.match(
      schema,
      /tags\s+String\[\]/,
    );
  },
);

test(
  "Radio WOLO station state is a singleton",
  () => {
    const migration =
      read(
        "prisma/migrations/20260830030000_add_radio_wolo_station_foundation/migration.sql",
      );

    assert.match(
      migration,
      /CHECK \("id" = 1\)/,
    );

    assert.match(
      migration,
      /INSERT INTO "radio_station_state"/,
    );

    assert.match(
      migration,
      /'off_air'/,
    );
  },
);

test(
  "Radio WOLO programming preserves deterministic ordering",
  () => {
    const migration =
      read(
        "prisma/migrations/20260830030000_add_radio_wolo_station_foundation/migration.sql",
      );

    assert.match(
      migration,
      /"position" INTEGER NOT NULL/,
    );

    assert.match(
      migration,
      /"uq_radio_program_items_program_position"/,
    );

    assert.match(
      migration,
      /CHECK \("position" >= 0\)/,
    );
  },
);

test(
  "Radio WOLO operator allowlist is explicit and closed",
  () => {
    const previous =
      process.env.RADIO_WOLO_OPERATOR_UIDS;

    try {
      process.env.RADIO_WOLO_OPERATOR_UIDS =
        "operator-a, operator-b";

      assert.deepEqual(
        [...radioWoloOperatorUids()],
        [
          "operator-a",
          "operator-b",
        ],
      );

      assert.equal(
        isRadioWoloOperatorUid(
          "operator-a",
        ),
        true,
      );

      assert.equal(
        isRadioWoloOperatorUid(
          "someone-else",
        ),
        false,
      );

      assert.equal(
        isRadioWoloOperatorUid(null),
        false,
      );
    } finally {
      if (previous === undefined) {
        delete process.env
          .RADIO_WOLO_OPERATOR_UIDS;
      } else {
        process.env
          .RADIO_WOLO_OPERATOR_UIDS =
          previous;
      }
    }
  },
);

test(
  "Radio WOLO media remains private application storage",
  () => {
    const radio =
      read("lib/radioWolo.ts");

    assert.match(
      radio,
      /aoe2-radio-wolo/,
    );

    assert.match(
      radio,
      /Invalid Radio WOLO storage key/,
    );
  },
);
