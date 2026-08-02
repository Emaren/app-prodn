import assert from "node:assert/strict";
import test from "node:test";

import { orderFeaturedBattleOptions } from "../lib/featuredBattleOptions.ts";

type Option = {
  key: string;
  href: string;
  sessionKey: string | null;
  detailAt: string | null;
  statusLabel: string;
};

function option(
  key: string,
  detailAt: string,
  href = `/game-stats/${key}`,
  statusLabel = "Replay"
): Option {
  return {
    key,
    href,
    sessionKey: key,
    detailAt,
    statusLabel,
  };
}

test("newest finalized replay remains first after the live session disappears", () => {
  const ordered = orderFeaturedBattleOptions({
    active: [],
    completed: [option("zenao", "2026-08-01T22:41:18Z")],
    replay: option("feegaro", "2026-08-02T00:22:58Z"),
  });

  assert.deepEqual(
    ordered.map((entry) => entry.key),
    ["feegaro", "zenao"]
  );
});

test("active battles stay ahead of finalized replay history", () => {
  const active = option(
    "live-now",
    "2026-08-02T00:30:00Z",
    "/watch/live-now",
    "Live"
  );
  const ordered = orderFeaturedBattleOptions({
    active: [active],
    completed: [],
    replay: option("feegaro", "2026-08-02T00:22:58Z"),
  });

  assert.deepEqual(
    ordered.map((entry) => entry.key),
    ["live-now", "feegaro"]
  );
});

test("the same finalized game is not shown twice", () => {
  const completed = option(
    "completed-feegaro",
    "2026-08-02T00:22:58Z",
    "/game-stats/20432"
  );
  const replay = option(
    "replay-feegaro",
    "2026-08-02T00:22:58Z",
    "/game-stats/20432"
  );

  const ordered = orderFeaturedBattleOptions({
    active: [],
    completed: [completed],
    replay,
  });

  assert.equal(ordered.length, 1);
});
