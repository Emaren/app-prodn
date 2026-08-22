import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(path: string) {
  return readFileSync(path, "utf8");
}

const floating = read("components/chat/FloatingChatPanel.tsx");
const picker = read("components/chat/UniversalReactionPicker.tsx");
const hall = read("components/clans/ClanHallClient.tsx");
const direct = read("components/contact/ContactInboxPanel.tsx");
const directApi = read("app/api/contact-emaren/route.ts");

test("message reaction surfaces portal to the viewport and never join chat layout", () => {
  assert.match(floating, /createPortal/);
  assert.match(floating, /position: "fixed"/);
  assert.match(floating, /window\.addEventListener\("scroll", place, true\)/);
  assert.match(floating, /Escape/);
  assert.match(hall, /<FloatingChatPanel/);
  assert.match(hall, /clan-message-tools__menu--floating/);
  assert.match(direct, /<FloatingChatPanel/);
  assert.doesNotMatch(direct, /trayPlacement/);
});

test("Nav Chat gets compact universal reactions while Full Chat gets full reactions", () => {
  assert.match(picker, /variant\?: "full" \| "compact"/);
  assert.match(direct, /variant=\{mode === "popover" \? "compact" : "full"\}/);
  assert.match(direct, /mode === "popover"[\s\S]*DIRECT_MESSAGE_QUICK_REACTIONS\.slice\(0, 4\)/);
  assert.match(hall, /variant="full"/);
});

test("Direct Chat accepts arbitrary Unicode reactions while preserving legacy GG", () => {
  assert.match(directApi, /normalizeReactionEmoji/);
  assert.match(directApi, /payload\.emoji === "GG"/);
  assert.doesNotMatch(directApi, /DIRECT_MESSAGE_REACTIONS\.includes/);
});
