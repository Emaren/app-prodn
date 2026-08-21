import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

test("Clan Hall preserves five permanent chat renderer identities", () => {
  const preference = read(
    "components/clans/clanChatViewPreference.ts",
  );

  for (const key of ["v1", "v2", "v3", "v4", "v5"]) {
    assert.match(
      preference,
      new RegExp(`key: "${key}"`),
    );
  }

  for (const label of [
    "War Cards",
    "Discord Dense",
    "Steam Tight",
    "AoE2HD Classic",
    "Balloons",
  ]) {
    assert.ok(preference.includes(label));
  }

  assert.match(
    preference,
    /aoe2war:clans:chat-view/,
  );
});

test("layout BAE and chat V1-V5 remain separate control dimensions", () => {
  const rail = read(
    "components/clans/ClanDisplayRail.tsx",
  );
  const picker = read(
    "components/clans/ClanChatViewPicker.tsx",
  );

  assert.match(rail, /<ClanViewToggle/);
  assert.match(rail, /<ClanChatViewPicker/);
  assert.match(picker, /CLAN_CHAT_VIEWS/);
  assert.match(picker, /onMouseEnter/);
  assert.match(picker, /aria-haspopup="menu"/);
});

test("Hall business logic feeds one versioned presentation stream", () => {
  const client = read(
    "components/clans/ClanHallClient.tsx",
  );

  assert.match(
    client,
    /useClanChatViewPreference/,
  );
  assert.match(
    client,
    /clan-chat-stream--\$\{chatViewMode\}/,
  );
  assert.match(
    client,
    /shouldGroupClanMessage/,
  );
  assert.match(
    client,
    /chatViewMode === "v2"/,
  );
});

test("all five Hall renderer families have durable CSS contracts", () => {
  const css = read(
    "app/clans/clans-warhouse.css",
  );

  for (const key of ["v1", "v2", "v3", "v4", "v5"]) {
    assert.match(
      css,
      new RegExp(`clan-chat-stream--${key}`),
    );
  }

  assert.match(
    css,
    /CLAN HALL CHAT V1 — PERMANENT RENDERER FAMILIES/,
  );
});


test("Hall chat picker cycles instantly and is discoverable in both locations", () => {
  const picker = read(
    "components/clans/ClanChatViewPicker.tsx",
  );
  const hall = read(
    "components/clans/ClanHallClient.tsx",
  );
  const rail = read(
    "components/clans/ClanDisplayRail.tsx",
  );

  assert.match(picker, /function cycleChatView/);
  assert.match(
    picker,
    /\(activeIndex \+ 1\) %/,
  );
  assert.match(
    picker,
    /onClick=\{cycleChatView\}/,
  );
  assert.match(
    picker,
    /onMouseEnter/,
  );
  assert.match(
    hall,
    /<ClanChatViewPicker placement="header" \/>/,
  );
  assert.match(
    rail,
    /<ClanChatViewPicker \/>/,
  );
});

test("Hall chat viewport is monitor-responsive instead of fixed 31rem", () => {
  const hall = read(
    "components/clans/ClanHallClient.tsx",
  );
  const css = read(
    "app/clans/clans-warhouse.css",
  );

  assert.doesNotMatch(
    hall,
    /clan-chat-viewport h-\[31rem\]/,
  );
  assert.match(
    css,
    /\.clan-chat-viewport[\s\S]*64dvh/,
  );
  assert.match(
    css,
    /min-width: 1280px/,
  );
  assert.match(
    css,
    /max-width: 767px/,
  );
});


test("version fan keeps a pointer-safe hover corridor while click still cycles", () => {
  const picker = read(
    "components/clans/ClanChatViewPicker.tsx",
  );
  const css = read(
    "app/clans/clans-warhouse.css",
  );

  assert.match(
    picker,
    /scheduleFanClose/,
  );
  assert.match(
    picker,
    /220/,
  );
  assert.match(
    picker,
    /onClick=\{cycleChatView\}/,
  );
  assert.match(
    css,
    /clan-chat-view-fan::before/,
  );
  assert.match(
    css,
    /clan-chat-view-fan::after/,
  );
});

test("Discord and classic Hall renderers remove permanent message-card chrome", () => {
  const css = read(
    "app/clans/clans-warhouse.css",
  );

  assert.match(
    css,
    /V2 — genuinely Discord-like/,
  );
  assert.match(
    css,
    /clan-chat-stream--v2[\s\S]*border: 0 !important/,
  );
  assert.match(
    css,
    /clan-chat-stream--v2[\s\S]*background: transparent !important/,
  );
  assert.match(
    css,
    /V4 — AoE2HD Classic/,
  );
  assert.match(
    css,
    /clan-chat-stream--v4[\s\S]*box-shadow: none !important/,
  );
});

test("Hall chat shell bounds the room while giving spare height to messages", () => {
  const hall = read(
    "components/clans/ClanHallClient.tsx",
  );
  const css = read(
    "app/clans/clans-warhouse.css",
  );

  assert.match(
    hall,
    /clan-hall-chat-shell flex min-h-0/,
  );
  assert.match(
    hall,
    /clan-chat-viewport flex-1/,
  );
  assert.match(
    css,
    /clan-hall-chat-shell[\s\S]*height: auto !important/,
  );
});


test("V1 metadata chips are muted instead of outlined loudly", () => {
  const css = read(
    "app/clans/clans-warhouse.css",
  );

  assert.match(
    css,
    /CLAN HALL V1\.3 — QUIET CHROME/,
  );
  assert.match(
    css,
    /clan-chat-stream--v1[\s\S]*clan-message__role[\s\S]*0\.055/,
  );
  assert.match(
    css,
    /clan-chat-stream--v1[\s\S]*clan-message__audience[\s\S]*0\.065/,
  );
});

test("V2 and V3 use one continuous chat surface without row gradients", () => {
  const css = read(
    "app/clans/clans-warhouse.css",
  );

  assert.match(
    css,
    /clan-chat-stream--v2[\s\S]*background: transparent !important/,
  );
  assert.match(
    css,
    /clan-chat-stream--v2[\s\S]*background-image: none !important/,
  );
  assert.match(
    css,
    /clan-chat-stream--v3[\s\S]*background-image: none !important/,
  );
});

test("Steam V3 groups immediate same-author follow-ups without repeated identity", () => {
  const hall = read(
    "components/clans/ClanHallClient.tsx",
  );
  const css = read(
    "app/clans/clans-warhouse.css",
  );

  assert.match(
    hall,
    /chatViewMode === "v2"[\s\S]*chatViewMode === "v3"[\s\S]*shouldGroupClanMessage/,
  );
  assert.match(
    css,
    /clan-chat-stream--v3[\s\S]*clan-message--grouped[\s\S]*clan-message__meta[\s\S]*display: none/,
  );
  assert.match(
    css,
    /clan-chat-stream--v3[\s\S]*clan-message--grouped[\s\S]*clan-message__avatar[\s\S]*visibility: hidden/,
  );
});

test("AoE2HD V4 reserves a fixed author lane for aligned message text", () => {
  const css = read(
    "app/clans/clans-warhouse.css",
  );

  assert.match(
    css,
    /grid-template-columns:[\s\S]*6\.75rem minmax\(0, 1fr\)/,
  );
  assert.match(
    css,
    /clan-chat-stream--v4[\s\S]*clan-message__author[\s\S]*text-align: right/,
  );
});

test("all Hall chat versions stay inside one bounded scroll tile", () => {
  const hall = read(
    "components/clans/ClanHallClient.tsx",
  );
  const css = read(
    "app/clans/clans-warhouse.css",
  );

  assert.match(
    hall,
    /clan-hall-chat-shell flex min-h-0/,
  );
  assert.match(
    css,
    /clan-hall-chat-shell[\s\S]*height: clamp\(42rem, 78dvh, 66rem\)/,
  );
  assert.match(
    css,
    /clan-chat-viewport[\s\S]*overflow-y: auto !important/,
  );
});


test("V1.4 compact variants stay flat and the Hall tile content-fits", () => {
  const css = read(
    "app/clans/clans-warhouse.css",
  );

  assert.match(
    css,
    /CLAN HALL V1\.4 — FLAT COMPACT SURFACES \+ CONTENT-FIT TILE/,
  );

  assert.match(
    css,
    /clan-hall-chat-shell[\s\S]*height: auto !important/,
  );
  assert.match(
    css,
    /clan-chat-viewport[\s\S]*max-height:[\s\S]*65dvh/,
  );
  assert.match(
    css,
    /clan-chat-viewport[\s\S]*flex: 0 1 auto !important/,
  );

  for (const version of ["v2", "v3", "v4"]) {
    assert.match(
      css,
      new RegExp(
        `clan-chat-stream--${version}[\\s\\S]*background-image: none !important`,
      ),
    );
  }

  assert.match(
    css,
    /clan-chat-stream--v2[\s\S]*clan-message:hover[\s\S]*background: transparent !important/,
  );
  assert.match(
    css,
    /clan-chat-stream--v3[\s\S]*clan-message--grouped[\s\S]*clan-message__meta[\s\S]*display: none !important/,
  );
  assert.match(
    css,
    /grid-template-columns:[\s\S]*7\.25rem minmax\(0, 1fr\)/,
  );
  assert.match(
    css,
    /column-gap: 0\.75rem !important/,
  );
});


test("V1.5 compact chat uses one canvas and stretches through the grid row", () => {
  const hall = read(
    "components/clans/ClanHallClient.tsx",
  );
  const css = read(
    "app/clans/clans-warhouse.css",
  );

  assert.match(
    hall,
    /data-chat-view=\{chatViewMode\}/,
  );
  assert.match(
    hall,
    /grid items-stretch gap-6/,
  );
  assert.match(
    css,
    /CLAN HALL V1\.5 — SINGLE CANVAS \+ GRID STRETCH/,
  );
  assert.match(
    css,
    /clan-hall-chat-shell[\s\S]*align-self: stretch !important/,
  );
  assert.match(
    css,
    /clan-chat-viewport[\s\S]*flex: 1 1 auto !important/,
  );

  for (const version of ["v2", "v3", "v4"]) {
    assert.match(
      css,
      new RegExp(
        `clan-chat-viewport\\[data-chat-view="${version}"\\][\\s\\S]*background-image: none !important`,
      ),
    );
  }

  assert.match(
    css,
    /> \.clan-chat-stream[\s\S]*> \.clan-message:hover[\s\S]*background: none !important/,
  );
  assert.match(
    css,
    /clan-message::before[\s\S]*content: none !important/,
  );
  assert.match(
    css,
    /clan-message__content,[\s\S]*clan-message__body[\s\S]*background-image: none !important/,
  );
});
