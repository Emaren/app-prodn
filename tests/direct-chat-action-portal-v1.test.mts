import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const inbox = readFileSync(
  "components/contact/ContactInboxPanel.tsx",
  "utf8",
);

const floating = readFileSync(
  "components/chat/FloatingChatPanel.tsx",
  "utf8",
);

test("Direct Chat has one outside-click authority for the portalled action tray", () => {
  assert.doesNotMatch(
    inbox,
    /if\s*\(\s*!bubbleRef\.current\?\.contains\(event\.target as Node\)\s*\)\s*\{\s*setTrayPinnedOpen\(false\)/,
  );

  assert.match(
    inbox,
    /<FloatingChatPanel[\s\S]*?onRequestClose=\{\(\) => \{[\s\S]*?setTrayPinnedOpen\(false\)/,
  );

  assert.match(
    floating,
    /panelRef\.current\?\.contains\(target\)/,
  );

  assert.match(
    floating,
    /anchorRef\.current\?\.contains\(target\)/,
  );

  assert.match(
    floating,
    /document\.addEventListener\("pointerdown", handlePointerDown, true\)/,
  );
});

test("Direct Chat action tray retains reactions, reply, edit and delete", () => {
  assert.match(inbox, /onToggleReaction/);
  assert.match(inbox, /> Reply\s*</);
  assert.match(inbox, />\s*Edit\s*</);
  assert.match(inbox, />\s*Delete\s*</);
});
