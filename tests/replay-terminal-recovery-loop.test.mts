import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";
import test from "node:test";

const recovery =
  readFileSync(
    new URL(
      "../app/api/admin/replay-auto-recovery/route.ts",
      import.meta.url,
    ),
    "utf8",
  );

const publicTruth =
  readFileSync(
    new URL(
      "../lib/publicReplayTruth.ts",
      import.meta.url,
    ),
    "utf8",
  );

const lobby =
  readFileSync(
    new URL(
      "../components/lobby/RecentMatchesPanel.tsx",
      import.meta.url,
    ),
    "utf8",
  );

test(
  "exact-game recovery can target one final replay",
  () => {
    assert.match(
      recovery,
      /gameStatsId/,
    );

    assert.match(
      recovery,
      /targetGameStatsId/,
    );

    assert.match(
      recovery,
      /game\.id\s*=\s*\$\{targetGameStatsId\}/,
    );
  },
);

test(
  "Engine Room recovery immediately retries automatic terminal result evidence",
  () => {
    assert.match(
      recovery,
      /reconcileAutomaticWatcherTerminalResults/,
    );

    const parserIndex =
      recovery.indexOf(
        "runLatestReplayParserForGame",
        recovery.indexOf(
          "for (",
        ),
      );

    const resultIndex =
      recovery.indexOf(
        "reconcileAutomaticWatcherTerminalResults",
        parserIndex,
      );

    assert.ok(
      parserIndex >= 0,
      "parser execution missing",
    );

    assert.ok(
      resultIndex > parserIndex,
      "terminal reconciliation must occur after parser recovery",
    );

    assert.match(
      recovery,
      /automaticTerminalResult/,
    );
  },
);

test(
  "machine disconnect cannot call itself a human-confirmed desync",
  () => {
    const start =
      publicTruth.indexOf(
        "const disconnectNoResult",
      );

    const end =
      publicTruth.indexOf(
        "const noCapturedWinnerReason",
        start,
      );

    assert.ok(
      start >= 0 && end > start,
      "disconnect public-truth block missing",
    );

    const block =
      publicTruth.slice(
        start,
        end,
      );

    assert.match(
      block,
      /disconnect_result_unproven/,
    );

    assert.match(
      block,
      /Result unproven/,
    );

    assert.match(
      block,
      /not a human-confirmed desync/,
    );

    assert.doesNotMatch(
      block,
      /label:\s*"Desynced"/,
    );
  },
);

test(
  "lobby DESYNCED label remains gated on the human incident marker",
  () => {
    assert.match(
      lobby,
      /readLobbyHumanConfirmedDesync/,
    );

    assert.match(
      lobby,
      /headline:\s*h\("DESYNCED"\)/,
    );
  },
);
