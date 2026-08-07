import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const betsSource =
  readFileSync(
    new URL("../lib/bets.ts", import.meta.url),
    "utf8",
  );

const wageringSource =
  readFileSync(
    new URL("../lib/betWagering.ts", import.meta.url),
    "utf8",
  );

test(
  "live watcher snapshot gaps use a bounded visible continuity rail",
  () => {
    assert.match(
      betsSource,
      /WATCHER_LIVE_SNAPSHOT_GRACE_SECONDS/,
    );

    assert.match(
      betsSource,
      /WATCHER_LIVE_SNAPSHOT_GRACE_SECONDS \|\| "120"/,
    );

    assert.match(
      betsSource,
      /status:\s*"closing"[\s\S]*live_snapshot_revalidating/,
    );

    assert.match(
      betsSource,
      /Revalidating live watcher/,
    );

    assert.match(
      betsSource,
      /market\.closeAt \?\?\s*market\.updatedAt/,
    );
  },
);

test(
  "the continuity market is financially locked",
  () => {
    assert.match(
      wageringSource,
      /\["closing", "awaiting_final_proof"\]/,
    );

    assert.match(
      wageringSource,
      /This live book is locked while the final replay is being verified/,
    );
  },
);

test(
  "existing wagers are preserved during the snapshot grace",
  () => {
    const transition =
      betsSource.match(
        /if \(market\.status === "live"\)[\s\S]*?return;/,
      )?.[0] ?? "";

    assert.match(
      transition,
      /status:\s*"closing"/,
    );

    assert.doesNotMatch(
      transition,
      /betWager\.(delete|updateMany)/,
    );

    assert.doesNotMatch(
      transition,
      /refundStatus:\s*"queued"/,
    );

    assert.doesNotMatch(
      transition,
      /status:\s*"voided"/,
    );
  },
);
