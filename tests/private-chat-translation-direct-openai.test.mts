import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const route = readFileSync(
  join(
    root,
    "app/api/contact-emaren/messages/[messageId]/translate/route.ts",
  ),
  "utf8",
);

test("private chat translation uses direct OpenAI instead of the retired localhost gateway", () => {
  assert.match(route, /requestDirectOpenAiResponse/);
  assert.match(route, /model: "gpt-4\.1"/);
  assert.match(route, /DirectOpenAiError/);
  assert.doesNotMatch(route, /LLAMA_CHAT_GATEWAY_URL/);
  assert.doesNotMatch(route, /to: "Agent4\.1M"/);
});

test("translation provider failures stay JSON and fail soft", () => {
  assert.match(route, /Private chat translation provider failed/);
  assert.match(route, /error instanceof DirectOpenAiError/);
  assert.match(route, /\{ status: 503 \}/);
  assert.match(route, /Translation is temporarily unavailable/);
});
