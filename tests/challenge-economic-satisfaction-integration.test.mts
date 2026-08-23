import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";
import test from "node:test";

const source =
  readFileSync(
    "lib/scheduledMatchSettlements.ts",
    "utf8",
  );

test(
  "settlement plan state uses economic satisfaction rather than only syntactic settlement identity",
  () => {
    assert.match(
      source,
      /const executedTransfers\s*=\s*input\.transfers\.filter\(\s*isTransferExecuted,\s*\)/,
    );

    /*
     * This prevents an economically completed legacy
     * combined payout from being projected as READY merely
     * because today's planner uses split action names.
     */
    assert.doesNotMatch(
      source,
      /const executedTransfers = input\.transfers\.filter\(\s*\(transfer\) => transfer\.existingSettlement\?\.status === "executed"/,
    );
  },
);

test(
  "execution marking never creates a new row for a transfer already satisfied by source history",
  () => {
    const markStart =
      source.indexOf(
        "async function markSettlementExecutionStarted",
      );

    assert.notEqual(
      markStart,
      -1,
    );

    const markEnd =
      source.indexOf(
        "function compactError",
        markStart,
      );

    assert.notEqual(
      markEnd,
      -1,
    );

    const block =
      source.slice(
        markStart,
        markEnd,
      );

    assert.match(
      block,
      /for \(const transfer of plan\.transfers\)[\s\S]*?isTransferExecuted\(\s*transfer,\s*\)[\s\S]*?continue;/,
    );

    assert.match(
      block,
      /scheduledMatchSettlement\.upsert/,
    );

    assert.ok(
      block.indexOf(
        "isTransferExecuted",
      ) <
      block.indexOf(
        "scheduledMatchSettlement.upsert",
      ),
      "economic satisfaction must be checked before any execution-row upsert",
    );
  },
);

test(
  "obsolete executing rows cannot override completed economic history",
  () => {
    const start =
      source.indexOf(
        "function isRecentExecuting",
      );

    assert.notEqual(
      start,
      -1,
    );

    const end =
      source.indexOf(
        "async function assertLockedWinnerSettlementAllowed",
        start,
      );

    assert.notEqual(
      end,
      -1,
    );

    const block =
      source.slice(
        start,
        end,
      );

    assert.match(
      block,
      /isTransferExecuted\(\s*transfer,\s*\)/,
    );

    assert.match(
      block,
      /return false/,
    );

    assert.ok(
      block.indexOf(
        "isTransferExecuted",
      ) <
      block.indexOf(
        '"executing"',
      ),
      "economic completion must win before executing-row freshness is considered",
    );
  },
);

test(
  "grouped Wolo execution retains the same economic predicate",
  () => {
    assert.match(
      source,
      /plan\.transfers\.filter\(\(transfer\) => !isTransferExecuted\(transfer\)\)/,
    );
  },
);

test(
  "one predicate now governs projection, execution marking, stale execution detection and payout construction",
  () => {
    const uses =
      source.match(
        /isTransferExecuted\(/g,
      ) ?? [];

    assert.ok(
      uses.length >= 5,
      `expected broad economic predicate reuse; found ${uses.length}`,
    );
  },
);
