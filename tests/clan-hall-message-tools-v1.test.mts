import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function read(path: string) {
  return readFileSync(
    join(root, path),
    "utf8",
  );
}

test("Hall normal actions collapse into one muted message-tools launcher", () => {
  const hall = read(
    "components/clans/ClanHallClient.tsx",
  );

  assert.match(
    hall,
    /aria-label="Message tools"/,
  );
  assert.match(
    hall,
    /<MoreHorizontal/,
  );
  assert.match(
    hall,
    /Translate ·/,
  );
  assert.match(
    hall,
    /<SmilePlus/,
  );
  assert.match(
    hall,
    /Edit message/,
  );
  assert.match(
    hall,
    /Delete message/,
  );

  assert.doesNotMatch(
    hall,
    /reactionDockOpen/,
  );
  assert.doesNotMatch(
    hall,
    /onToggleReactionDock/,
  );
});

test("Clan Hall translation follows the Universal Translator and browser fallback", () => {
  const hall = read(
    "components/clans/ClanHallClient.tsx",
  );

  assert.match(
    hall,
    /useUniversalLanguage/,
  );
  assert.match(
    hall,
    /resolveClanTranslationLanguage/,
  );
  assert.match(
    hall,
    /navigator\.languages/,
  );
  assert.match(
    hall,
    /translationLanguage=\{translationLanguage\}/,
  );
  assert.match(
    hall,
    /\/messages\/\$\{message\.id\}\/translate/,
  );
});

test("Hall translation endpoint re-proves visibility and never mutates the DB", () => {
  const route = read(
    "app/api/clans/[slug]/messages/[messageId]/translate/route.ts",
  );

  assert.match(
    route,
    /loadClanHallSnapshot/,
  );
  assert.match(
    route,
    /snapshot\?\.messages\.find/,
  );
  assert.match(
    route,
    /requestDirectOpenAiResponse/,
  );
  assert.match(
    route,
    /SACRED_AOE2WAR_TERMS/,
  );
  assert.match(
    route,
    /getClanMessageTranslation/,
  );
  assert.match(
    route,
    /setClanMessageTranslation/,
  );

  assert.doesNotMatch(
    route,
    /\.create\(/,
  );
  assert.doesNotMatch(
    route,
    /\.update\(/,
  );
  assert.doesNotMatch(
    route,
    /\.upsert\(/,
  );
});

test("Hall translation cache invalidates by message revision and is bounded", () => {
  const cache = read(
    "lib/clanMessageTranslationCache.ts",
  );

  assert.match(
    cache,
    /messageId.*updatedAt.*language/s,
  );
  assert.match(
    cache,
    /CACHE_MAX_ENTRIES = 500/,
  );
  assert.match(
    cache,
    /CACHE_TTL_MS/,
  );
});


test("composer Scribe control is quiet when dormant and lit when armed", () => {
  const hall = read(
    "components/clans/ClanHallClient.tsx",
  );
  const css = read(
    "app/clans/clans-warhouse.css",
  );

  assert.match(
    hall,
    /clan-scribe-toggle/,
  );
  assert.match(
    hall,
    /clan-scribe-toggle--active/,
  );
  assert.match(
    hall,
    />\s*S\s*</,
  );
  assert.match(
    css,
    /clan-scribe-toggle--active[\s\S]*box-shadow/,
  );
});
