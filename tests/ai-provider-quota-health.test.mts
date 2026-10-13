import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { classifyOpenAiFailure } from "../lib/aiProviderHealth.ts";

const source = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");

test("explicit provider quota 429 is classified without exposing upstream billing text", () => {
  const upstream = {
    error: {
      code: "insufficient_quota",
      message: "Your secret account details, billing URL, and credits are exhausted: https://example.invalid/secret",
    },
  };
  const result = classifyOpenAiFailure(429, upstream);
  assert.equal(result.code, "openai_quota_exhausted");
  assert.equal(result.retryable, false);
  assert.match(result.message, /API quota/);
  assert.doesNotMatch(result.message, /billing URL|example.invalid|secret account/);
});

test("temporary 429 and quota exhaustion are not treated as the same outage", () => {
  const result = classifyOpenAiFailure(429, { error: { code: "rate_limit_exceeded" } });
  assert.equal(result.code, "openai_rate_limited");
  assert.equal(result.retryable, true);
  assert.equal(classifyOpenAiFailure(503, { error: { message: "hidden" } }).code, "openai_upstream_unavailable");
  assert.equal(classifyOpenAiFailure(401, { error: { message: "key: secret" } }).code, "openai_access_unavailable");
});

test("malformed provider payloads fail to generic safe error", () => {
  const result = classifyOpenAiFailure(400, { error: "token and private conversation" });
  assert.equal(result.code, "openai_400");
  assert.doesNotMatch(result.message, /token|private conversation/);
  assert.equal(classifyOpenAiFailure(-1, null).code, "openai_unknown");
});

test("direct provider uses safe classification and existing admin redacted telemetry", () => {
  const provider = source("../lib/openAiResponses.ts");
  const concierge = source("../lib/aiConcierge.ts");
  const command = source("../components/admin/ai/AiCommandCenter.tsx");
  assert.match(provider, /classifyOpenAiFailure\(response\.status, payload\)/);
  assert.doesNotMatch(provider, /providerErrorMessage/);
  assert.match(concierge, /error instanceof DirectOpenAiError/);
  assert.match(command, /openai_quota_exhausted/);
  assert.match(command, /openai_rate_limited/);
});
