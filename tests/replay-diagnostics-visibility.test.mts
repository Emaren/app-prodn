import assert from "node:assert/strict";
import test from "node:test";

import { canShowReplayParserDiagnostics } from "../lib/replayDiagnosticsVisibility.ts";

test("raw replay diagnostics require an authenticated admin in Extreme view", () => {
  assert.equal(canShowReplayParserDiagnostics("extreme", true), true);
  assert.equal(canShowReplayParserDiagnostics("extreme", false), false);
  assert.equal(canShowReplayParserDiagnostics("advanced", true), false);
  assert.equal(canShowReplayParserDiagnostics("basic", true), false);
});
