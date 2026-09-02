import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";
import test from "node:test";

import {
  RADIO_WOLO_LISTENER_ACTIVE_WINDOW_MS,
  RADIO_WOLO_LISTENER_HEARTBEAT_MS,
  radioWoloListenerIdIsValid,
  radioWoloListenerIsEffectivelyOn,
  radioWoloRaterKey,
  radioWoloRatingIsValid,
} from "../lib/radioWoloFeedbackPolicy.ts";

function read(
  filePath: string,
) {
  return readFileSync(
    new URL(
      `../${filePath}`,
      import.meta.url,
    ),
    "utf8",
  );
}

test(
  "Radio WOLO ratings are exactly 1 through 10",
  () => {
    assert.equal(
      radioWoloRatingIsValid(
        1,
      ),
      true,
    );

    assert.equal(
      radioWoloRatingIsValid(
        10,
      ),
      true,
    );

    for (
      const value of [
        0,
        11,
        1.5,
        "10",
        null,
      ]
    ) {
      assert.equal(
        radioWoloRatingIsValid(
          value,
        ),
        false,
      );
    }
  },
);

test(
  "Radio WOLO listener identity is a random UUID-shaped browser identity",
  () => {
    assert.equal(
      radioWoloListenerIdIsValid(
        "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      ),
      true,
    );

    assert.equal(
      radioWoloListenerIdIsValid(
        "fingerprint-me",
      ),
      false,
    );
  },
);

test(
  "signed users rate canonically by account while anonymous ratings remain browser scoped",
  () => {
    const listenerId =
      "f47ac10b-58cc-4372-a567-0e02b2c3d479";

    assert.equal(
      radioWoloRaterKey(
        42,
        listenerId,
      ),
      "user:42",
    );

    assert.equal(
      radioWoloRaterKey(
        null,
        listenerId,
      ),
      `anonymous:${listenerId}`,
    );
  },
);

test(
  "listener ON truth expires when the heartbeat goes stale",
  () => {
    assert.ok(
      RADIO_WOLO_LISTENER_ACTIVE_WINDOW_MS >
        RADIO_WOLO_LISTENER_HEARTBEAT_MS,
    );

    const now =
      new Date(
        "2026-09-02T00:10:00Z",
      );

    assert.equal(
      radioWoloListenerIsEffectivelyOn(
        {
          listening: true,
          lastSeenAt:
            new Date(
              now.getTime() -
                RADIO_WOLO_LISTENER_HEARTBEAT_MS,
            ),
        },
        now,
      ),
      true,
    );

    assert.equal(
      radioWoloListenerIsEffectivelyOn(
        {
          listening: true,
          lastSeenAt:
            new Date(
              now.getTime() -
                RADIO_WOLO_LISTENER_ACTIVE_WINDOW_MS -
                1,
            ),
        },
        now,
      ),
      false,
    );
  },
);

test(
  "Radio WOLO feedback has durable listener state and one mutable rating per asset identity",
  () => {
    const schema =
      read(
        "prisma/schema.prisma",
      );

    const migration =
      read(
        "prisma/migrations/20260902010000_add_radio_wolo_listener_feedback/migration.sql",
      );

    assert.match(
      schema,
      /model RadioListenerState \{/,
    );

    assert.match(
      schema,
      /model RadioTrackRating \{/,
    );

    assert.match(
      schema,
      /@@unique\(\[assetId, raterKey\]/,
    );

    assert.match(
      migration,
      /"rating" >= 1/,
    );

    assert.match(
      migration,
      /"rating" <= 10/,
    );

    assert.match(
      migration,
      /"uq_radio_track_ratings_asset_rater"/,
    );
  },
);

test(
  "rating endpoint resolves the current asset server-side",
  () => {
    const route =
      read(
        "app/api/radio/feedback/route.ts",
      );

    assert.match(
      route,
      /resolveCurrentRadioAsset/,
    );

    assert.match(
      route,
      /payload\.event === "rate"/,
    );

    assert.match(
      route,
      /radioTrackRating\.upsert/,
    );

    assert.match(
      route,
      /isLiveProductionReadOnlyPreview/,
    );
  },
);

test(
  "Radio WOLO client reports sound state without changing desktop playback lifecycle",
  () => {
    const hook =
      read(
        "hooks/useRadioWoloFeedback.ts",
      );

    const listener =
      read(
        "hooks/useRadioWoloListener.ts",
      );

    assert.match(
      hook,
      /RADIO_WOLO_LISTENER_HEARTBEAT_MS/,
    );

    assert.match(
      hook,
      /event:\s*"off"/,
    );

    assert.match(
      hook,
      /pagehide/,
    );

    assert.doesNotMatch(
      hook,
      /visibilitychange/,
    );

    assert.match(
      listener,
      /radioWoloRequiresForegroundTeardown/,
    );
  },
);

test(
  "Radio WOLO exposes ten immediate stars and icon emoji presentation choices",
  () => {
    const player =
      read(
        "components/radio/RadioWoloGlobalPlayer.tsx",
      );

    assert.match(
      player,
      /data-radio-wolo-rating/,
    );

    assert.match(
      player,
      /length:\s*10/,
    );

    assert.match(
      player,
      /saveRating/,
    );

    assert.match(
      player,
      /\["icons", "emoji"\]/,
    );

    assert.match(
      player,
      /⭐/,
    );

    assert.doesNotMatch(
      player,
      /Submit rating/,
    );
  },
);

test(
  "Command Tower owns dedicated Radio WOLO listener intelligence",
  () => {
    const page =
      read(
        "components/admin/command-tower/AdminCommandTowerPage.tsx",
      );

    const rail =
      read(
        "components/admin/RadioWoloListenerSignals.tsx",
      );

    const route =
      read(
        "app/api/admin/radio/listeners/route.ts",
      );

    assert.match(
      page,
      /<RadioWoloListenerSignals \/>/,
    );

    assert.doesNotMatch(
      page,
      /\{data \? \(\s*<RadioWoloListenerSignals \/>/,
    );

    assert.match(
      rail,
      /Radio WOLO Listener Signals/,
    );

    assert.match(
      rail,
      /Who is listening, who turned it off, and what they rate/,
    );

    assert.match(
      route,
      /requireAdmin/,
    );
  },
);

test(
  "Radio documentation preserves persistent desktop audio and iOS safety",
  () => {
    const docs =
      read(
        "docs/RADIO_WOLO.md",
      );

    assert.match(
      docs,
      /Desktop Radio WOLO playback is intentionally persistent/,
    );

    assert.match(
      docs,
      /iPhone\/iPad WebKit retains the aggressive foreground teardown/,
    );

    assert.match(
      docs,
      /client never supplies the RadioAsset being rated as authority/,
    );
  },
);

test(
  "fresh listeners default to emoji ratings and every observed listener reaches Admin",
  () => {
    const hook =
      read(
        "hooks/useRadioWoloFeedback.ts",
      );

    const route =
      read(
        "app/api/radio/feedback/route.ts",
      );

    const migration =
      read(
        "prisma/migrations/20260902010000_add_radio_wolo_listener_feedback/migration.sql",
      );

    assert.match(
      hook,
      /return "emoji";/,
    );

    assert.match(
      hook,
      /useState<RadioWoloRatingStyle>\(\s*"emoji"/,
    );

    assert.match(
      hook,
      /input\.soundEnabled\s*\?\s*"on"\s*:\s*"off"/,
    );

    assert.match(
      route,
      /prisma\.radioListenerState\.upsert/,
    );

    assert.match(
      route,
      /lastEvent:\s*"rate"/,
    );

    assert.match(
      migration,
      /'rate'/,
    );
  },
);
