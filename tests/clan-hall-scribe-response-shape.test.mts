import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const promptPolicy = readFileSync("lib/aiPromptPolicy.ts", "utf8");
const concierge = readFileSync("lib/aiConcierge.ts", "utf8");

test("Hall Scribe targets one or two short sentences", () => {
  assert.match(
    promptPolicy,
    /Default to one or two short natural sentences\. One sentence is often enough\./,
  );
});

test("Hall Scribe has a hard three-sentence maximum", () => {
  assert.match(
    promptPolicy,
    /AI_CLAN_HALL_REPLY_MAX_SENTENCES = 3/,
  );
  assert.match(
    promptPolicy,
    /Absolute maximum: \$\{AI_CLAN_HALL_REPLY_MAX_SENTENCES\} sentences/,
  );
});

test("Hall Scribe uses a compact 360-character hard ceiling", () => {
  assert.match(
    promptPolicy,
    /AI_CLAN_HALL_REPLY_MAX_CHARS = 360/,
  );
});

test("runtime enforces Hall sentence and character limits", () => {
  assert.match(concierge, /function clampHallReply/);
  assert.match(
    concierge,
    /\.slice\(0, AI_CLAN_HALL_REPLY_MAX_SENTENCES\)/,
  );
  assert.match(
    concierge,
    /AI_CLAN_HALL_REPLY_MAX_CHARS/,
  );
  assert.match(
    concierge,
    /if \(source === "clan_hall"\) \{\s*return clampHallReply\(collapsed\);/,
  );
});
