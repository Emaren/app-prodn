import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("public Challenge activity never renders raw scheduled settlement exceptions", () => {
  const workspace = readFileSync(
    new URL("../components/challenge/ChallengeWorkspace.tsx", import.meta.url),
    "utf8",
  );
  const room = readFileSync(
    new URL("../app/challenge/[id]/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    workspace,
    /case "scheduled_settlement_failed":\s*return `Settlement retry recorded/,
  );
  assert.doesNotMatch(
    workspace,
    /case "scheduled_settlement_failed":\s*return activity\.detail/,
  );

  assert.match(
    room,
    /eventType === "scheduled_settlement_failed"[\s\S]*Settlement retry recorded/,
  );
  assert.match(
    room,
    /detail: publicActivityDetail\(activity\.eventType, activity\.detail\)/,
  );
});

test("Challenge notice delivery does not load the Next-only AI concierge at module import time", () => {
  const inbox = readFileSync(
    new URL("../lib/contactInbox.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(
    inbox,
    /^import \{ ensureAiConciergeUser \} from "@\/lib\/aiConcierge";$/m,
  );
  assert.match(
    inbox,
    /const \{ ensureAiConciergeUser \} = await import\("@\/lib\/aiConcierge"\)/,
  );
});
