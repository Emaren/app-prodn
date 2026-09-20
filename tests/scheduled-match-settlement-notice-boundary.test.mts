import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../lib/scheduledMatchSettlements.ts", import.meta.url),
  "utf8",
);

test(
  "confirmed financial settlement cannot be reclassified as failed by Challenge Protocol notification errors",
  () => {
    const start = source.indexOf(
      "export async function executeScheduledMatchSettlement",
    );
    const end = source.indexOf(
      "export ",
      start + 1,
    );
    const fn = source.slice(
      start,
      end > start ? end : undefined,
    );

    const recordResult = fn.indexOf("recordExecutionResult");
    const executedGuard = fn.indexOf('if (plan.state === "executed")');
    const nestedTry = fn.indexOf("try {", executedGuard);
    const noticeImport = fn.indexOf(
      'await import("@/lib/contactInbox")',
      executedGuard,
    );
    const noticeCatch = fn.indexOf("catch (noticeError)", noticeImport);
    const returnResult = fn.indexOf("return {", noticeCatch);
    const financialCatch = fn.indexOf("catch (error)", returnResult);

    assert.ok(recordResult >= 0);
    assert.ok(executedGuard > recordResult);
    assert.ok(nestedTry > executedGuard);
    assert.ok(noticeImport > nestedTry);
    assert.ok(noticeCatch > noticeImport);
    assert.ok(returnResult > noticeCatch);
    assert.ok(financialCatch > returnResult);

    assert.match(
      fn.slice(nestedTry, noticeCatch),
      /postChallengeProtocolNoticeToParticipants/,
    );
    assert.match(
      fn.slice(noticeCatch, returnResult),
      /Failed to deliver Challenge Protocol settlement notice/,
    );
  },
);
