import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

test("OpenAI house voices use the Responses API directly", () => {
  const provider = read("lib/openAiResponses.ts");

  assert.match(
    provider,
    /https:\/\/api\.openai\.com\/v1\/responses/,
  );
  assert.match(provider, /OPENAI_API_KEY_FILE/);
  assert.match(provider, /\/etc\/aoe2hdbets\/openai\.key/);
  assert.match(provider, /store: false/);
  assert.match(provider, /instructions: request\.instructions/);
  assert.match(provider, /input: request\.input/);
  assert.match(provider, /body\.prompt = \{/);
  assert.match(provider, /version: request\.promptVersion/);
});

test("saved prompt and app instructions remain separate layers", () => {
  const config = read("lib/aiConciergeConfig.ts");
  const concierge = read("lib/aiConcierge.ts");

  assert.match(
    config,
    /Agent4\.1Scribe[\s\S]*provider: "openai"[\s\S]*model: "gpt-4\.1"[\s\S]*promptId:/,
  );
  assert.match(
    concierge,
    /requestDirectOpenAiResponse\(\{[\s\S]*promptId: modelOption\.promptId[\s\S]*instructions: systemPrompt[\s\S]*input: userPrompt/,
  );
});

test("OpenAI no longer depends on localhost 3350", () => {
  const concierge = read("lib/aiConcierge.ts");

  const directBranchStart = concierge.indexOf(
    'if (modelOption.provider === "openai")',
  );
  const elseStart = concierge.indexOf(
    "} else {",
    directBranchStart,
  );
  const directBranch = concierge.slice(
    directBranchStart,
    elseStart,
  );

  assert.match(directBranch, /requestDirectOpenAiResponse/);
  assert.doesNotMatch(
    directBranch,
    /LLAMA_CHAT_GATEWAY_URL/,
  );
});

test("local Llama remains an explicit optional adapter", () => {
  const config = read("lib/aiConciergeConfig.ts");
  const concierge = read("lib/aiConcierge.ts");

  assert.match(
    config,
    /LlamaAgent42[\s\S]*provider: "ollama"/,
  );
  assert.match(
    concierge,
    /else \{[\s\S]*fetch\(LLAMA_CHAT_GATEWAY_URL/,
  );
});

test("provider prompt metadata now belongs to AoE2WAR", () => {
  const config = read("lib/aiConciergeConfig.ts");

  assert.match(
    config,
    /source: "AoE2WAR provider registry"/,
  );
  assert.doesNotMatch(
    config,
    /source: "llama-chat gateway registry"/,
  );
});
