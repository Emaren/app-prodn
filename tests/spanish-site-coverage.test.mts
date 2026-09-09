import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

function catalog() {
  return JSON.parse(source("../messages/site/es.json")) as {
    version: number;
    locale: string;
    generatedAt: string;
    translations: Record<string, string>;
  };
}

test("Spanish full-site layer is committed static copy with no runtime AI", () => {
  const layer = source("../components/i18n/SiteTranslationLayer.tsx");
  assert.match(layer, /messages\/site\/es\.json/);
  assert.match(layer, /MutationObserver/);
  assert.match(layer, /data-i18n-skip/);
  assert.match(layer, /textStates/);
  assert.match(layer, /attributeStates/);
  assert.doesNotMatch(layer, /fetch\(/);
  assert.doesNotMatch(layer, /OpenAI|requestDirectOpenAiResponse/);
});

test("global provider mounts Spanish site coverage without changing other locales", () => {
  const provider = source("../components/i18n/AoE2WarIntlProvider.tsx");
  assert.match(provider, /SiteTranslationLayer/);
  assert.match(provider, /locale=\{activeBundle\.locale\}/);
});

test("Spanish site catalog has substantial committed coverage", () => {
  const value = catalog();
  assert.equal(value.version, 1);
  assert.equal(value.locale, "es");
  assert.ok(value.generatedAt && value.generatedAt !== "PENDING");
  assert.ok(Object.keys(value.translations).length >= 1000);
  assert.equal(value.translations.AoE2WAR, undefined);
  assert.equal(value.translations.WOLO, undefined);
  assert.equal(value.translations.WoloChain, undefined);
  assert.equal(value.translations.Emaren, undefined);
});
