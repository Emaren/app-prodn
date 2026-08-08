import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page =
  readFileSync(
    new URL(
      "../app/workshop/page.tsx",
      import.meta.url,
    ),
    "utf8",
  );

const experience =
  readFileSync(
    new URL(
      "../components/workshop/WorkshopExperience.tsx",
      import.meta.url,
    ),
    "utf8",
  );

const publisher =
  readFileSync(
    new URL(
      "../scripts/publish-workshop-2026-08-08.mts",
      import.meta.url,
    ),
    "utf8",
  );

test(
  "Workshop presents Truth in Production as the current campaign",
  () => {
    assert.match(
      experience,
      /AOE2WAR_WORKSHOP_TRUTH_IN_PRODUCTION_20260808/,
    );

    assert.match(
      experience,
      /Truth in Production\./,
    );

    assert.match(
      experience,
      /authenticated Watcher exits/,
    );

    assert.match(
      experience,
      /completed-day/,
    );

    assert.match(
      experience,
      /Watcher-grounded statistics/,
    );
  },
);

test(
  "old Evidence in Motion campaign is no longer current",
  () => {
    assert.doesNotMatch(
      experience,
      /Evidence in Motion\./,
    );
  },
);

test(
  "Workshop metadata describes the production-truth observatory",
  () => {
    assert.match(
      page,
      /production truth/,
    );

    assert.match(
      page,
      /Watcher activity/,
    );

    assert.match(
      page,
      /adjudication/,
    );

    assert.match(
      page,
      /settlement boundaries/,
    );
  },
);

test(
  "August 8 publication records the exact release chain",
  () => {
    for (
      const release of [
        "e55e943d038c1c62e6d6e40e507b4e0b115b604e",
        "07a0c8c87d19d77ba45ea68a3050ddcff884a8ea",
        "97db284b69a0f973e9a6a6408a5dcb52703362c4",
        "875ba6448b5763be02a4da8b548bff3a556cb821",
        "b44176ef680441ff7ef40d8dc587b0d091d838bf",
        "1396062b50d6a7b0a3418d42f0e0f6aa612d1b06",
      ]
    ) {
      assert.match(
        publisher,
        new RegExp(
          release,
        ),
      );
    }
  },
);

test(
  "publication records the four new Workshop milestones",
  () => {
    assert.match(
      publisher,
      /Visible victory becomes admissible evidence\./,
    );

    assert.match(
      publisher,
      /Fast exits gain a narrow stats-only recovery rail\./,
    );

    assert.match(
      publisher,
      /Traffic stops graphing unfinished days\./,
    );

    assert.match(
      publisher,
      /Statistics is rewired to Watcher truth\./,
    );
  },
);

test(
  "replay recovery publication preserves authority boundaries",
  () => {
    assert.match(
      publisher,
      /replayPacketLeaveProof remains false/,
    );

    assert.match(
      publisher,
      /provisionalStatsInference remains true/,
    );

    assert.match(
      publisher,
      /affectsStats is true/,
    );

    assert.match(
      publisher,
      /affectsBets is false/,
    );

    assert.match(
      publisher,
      /financialAuthority remains false/,
    );

    assert.match(
      publisher,
      /action-tail authority remains disabled/,
    );
  },
);

test(
  "Statistics publication preserves Watcher versus video semantics",
  () => {
    assert.match(
      publisher,
      /watcher_live/,
    );

    assert.match(
      publisher,
      /watcher_final/,
    );

    assert.match(
      publisher,
      /separate video-stream subsystem/,
    );

    assert.match(
      publisher,
      /Batch Upload remains visible/,
    );

    assert.match(
      publisher,
      /13 Games Streamed, 48 Players Streamed, and 13 Watcher Games/,
    );

    assert.match(
      publisher,
      /812 and 1,172 distinct Watcher Games/,
    );
  },
);
