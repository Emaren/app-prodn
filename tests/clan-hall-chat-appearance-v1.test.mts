import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(path: string) {
  return readFileSync(path, "utf8");
}

test("font size and line spacing are local viewer preferences", () => {
  const preference = read("components/clans/clanChatAppearancePreference.ts");

  assert.match(preference, /aoe2war:clans:chat-font-size/);
  assert.match(preference, /aoe2war:clans:chat-line-spacing/);
  for (const size of ["85%", "100%", "115%", "130%"] ) {
    assert.ok(preference.includes(size));
  }
  for (const spacing of ["Tight", "Normal", "Wide"] ) {
    assert.ok(preference.includes(spacing));
  }
  assert.doesNotMatch(preference, /fetch\(/);
});

test("appearance controls stay compact and exist in header and display rail", () => {
  const controls = read("components/clans/ClanChatAppearanceControls.tsx");
  const client = read("components/clans/ClanHallClient.tsx");
  const rail = read("components/clans/ClanDisplayRail.tsx");

  assert.match(controls, /<Type/);
  assert.match(controls, /<AlignJustify/);
  assert.match(controls, /title=/);
  assert.match(client, /<ClanChatAppearanceControls placement="header" \/>/);
  assert.match(rail, /<ClanChatAppearanceControls \/>/);
});

test("all V1-V5 renderers inherit viewer font and line density without changing renderer identity", () => {
  const client = read("components/clans/ClanHallClient.tsx");
  const css = read("app/clans/clans-warhouse.css");

  assert.match(client, /data-chat-font-size=\{chatFontSize\}/);
  assert.match(client, /data-chat-line-spacing=\{chatLineSpacing\}/);
  assert.match(css, /--clan-chat-font-size/);
  assert.match(css, /--clan-chat-line-height/);
  assert.match(css, /\.clan-hall-chat-shell \.clan-message__body/);
});
