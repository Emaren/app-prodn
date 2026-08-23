import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const panel = readFileSync(
  "components/contact/ContactInboxPanel.tsx",
  "utf8",
);
const header = readFileSync(
  "components/contact/HeaderInboxControl.tsx",
  "utf8",
);
const floating = readFileSync(
  "components/chat/FloatingChatPanel.tsx",
  "utf8",
);
const payload = readFileSync(
  "components/contact/contactInboxPayload.ts",
  "utf8",
);
const clan = readFileSync(
  "components/clans/ClanHallClient.tsx",
  "utf8",
);

test("Nav Chat reactions update optimistically and reconcile authoritatively", () => {
  assert.match(
    payload,
    /optimisticallyToggleContactReaction/,
  );
  assert.match(
    header,
    /optimisticallyToggleContactReaction/,
  );
  assert.match(
    header,
    /targetUidAtAction/,
  );
  assert.match(
    header,
    /refreshPanel\([\s\S]*silent: true/,
  );
});

test("Nav Chat floating reaction deck stays inside the Nav window", () => {
  assert.match(
    header,
    /data-floating-chat-boundary="true"/,
  );
  assert.match(
    floating,
    /data-floating-chat-boundary/,
  );
  assert.match(
    floating,
    /boundaryRect\.right/,
  );
  assert.match(
    floating,
    /boundaryRect\.bottom/,
  );
});

test("Clan message tools hover generously and click pins the command deck", () => {
  assert.match(
    clan,
    /const \[toolsPinned, setToolsPinned\]/,
  );
  assert.match(
    clan,
    /function toggleToolsPinned\(\)/,
  );
  assert.match(
    clan,
    /650/,
  );
  assert.match(
    clan,
    /onClick=\{\s*toggleToolsPinned\s*\}/,
  );
  assert.doesNotMatch(
    clan,
    /title="Message tools"/,
  );
});

test("Clan invitation reveals kingdom personality on hover without hiding the action", () => {
  assert.match(panel, />\s*Accept\s*</);
  assert.match(panel, /Take Your Seat/);
  assert.match(panel, /👀/);
  assert.match(
    panel,
    /group-hover:opacity-\[0\.13\]/,
  );
});

test("Marketplace charter CTA stays clear and reveals the royal joke plus WOLO on hover", () => {
  assert.match(panel, /Open My Business/);
  assert.match(panel, /Thank You, Your Grace/);
  assert.match(
    panel,
    /footer-wolo/,
  );
  assert.doesNotMatch(
    panel,
    />\s*Start My Business\s*</,
  );
});
