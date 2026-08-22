import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { isReactionEmoji, normalizeReactionEmoji } from "../lib/reactionEmoji.ts";

const picker = fs.readFileSync("components/chat/UniversalReactionPicker.tsx", "utf8");
const preference = fs.readFileSync("components/chat/reactionPreference.ts", "utf8");
const clans = fs.readFileSync("lib/clans.ts", "utf8");
const hall = fs.readFileSync("components/clans/ClanHallClient.tsx", "utf8");

test("reaction validation accepts one Unicode emoji grapheme and rejects text or emoji trains", () => {
  for (const emoji of ["😂", "❤️‍🔥", "🏴‍☠️", "👨‍🚀", "🇨🇦", "1️⃣"]) {
    assert.equal(normalizeReactionEmoji(emoji), emoji);
    assert.equal(isReactionEmoji(emoji), true);
  }
  for (const invalid of ["GG", "hello", "😂🔥", "", "  "]) {
    assert.equal(normalizeReactionEmoji(invalid), null);
  }
});

test("universal picker exposes search, categories, recent reactions and a custom-reaction affordance", () => {
  assert.match(picker, /Search or paste emoji/);
  assert.match(picker, /CATEGORY_TABS/);
  assert.match(picker, /variant\?: "full" \| "compact"/);
  assert.match(picker, /recent\.slice\(0, compact \? 6 : 8\)/);
  assert.match(picker, /Add custom reaction/);
  assert.match(picker, /Custom reactions · soon/);
  assert.match(picker, /normalizeReactionEmoji\(query\)/);
});

test("reaction MRU is a reusable site-wide local preference", () => {
  assert.match(preference, /aoe2war:chat:reaction-mru/);
  assert.match(preference, /REACTION_MRU_LIMIT = 12/);
  assert.match(preference, /rememberReactionEmoji/);
  assert.match(preference, /localStorage/);
});

test("Clan Hall accepts arbitrary valid emoji and renders every persisted reaction", () => {
  assert.doesNotMatch(clans, /CLAN_REACTIONS/);
  assert.match(clans, /return isReactionEmoji\(value\)/);
  assert.match(clans, /Array\.from\(groupedReactions\.values\(\)\)/);
  assert.match(hall, /UniversalReactionPicker/);
  assert.match(hall, /onReaction\(emoji\)/);
});
