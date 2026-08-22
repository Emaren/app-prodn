import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(path: string) {
  return readFileSync(path, "utf8");
}

const client = read("components/clans/ClanHallClient.tsx");
const clans = read("lib/clans.ts");
const route = read("app/api/clans/[slug]/route.ts");
const css = read("app/clans/clans-warhouse.css");
const direct = read("components/contact/ContactInboxPanel.tsx");

test("Clan Hall history prefetches well before the transcript reaches the top", () => {
  assert.match(client, /CLAN_HISTORY_PREFETCH_PX = 900/);
  assert.match(client, /IntersectionObserver/);
  assert.match(client, /rootMargin: `\$\{CLAN_HISTORY_PREFETCH_PX\}px 0px 0px`/);
  assert.match(client, /beforeMessageId/);
  assert.match(client, /historyPrependAnchorRef/);
  assert.match(client, /heightDelta/);
  assert.match(clans, /messageLimit \+ 1/);
  assert.match(clans, /kind: focusMessageId \? "focus" : beforeMessageId \? "older" : "latest"/);
  assert.match(route, /focusMessageId/);
});

test("nested Hall scroll chains back to the page at transcript boundaries", () => {
  assert.match(css, /overscroll-behavior-y: auto/);
  assert.doesNotMatch(css, /clan-hall-chat-shell[\s\S]{0,600}overscroll-behavior: contain/);
});

test("Full Chat prefetches farther ahead and permits page scroll chaining", () => {
  assert.match(direct, /rootMargin: "900px 0px 0px"/);
  assert.match(direct, /mode === "page" \? "overscroll-auto" : "overscroll-contain"/);
});
