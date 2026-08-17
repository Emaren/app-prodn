import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const client = readFileSync(
  "components/clans/ClanHallClient.tsx",
  "utf8",
);

test("Clan Hall composer sends on plain Enter", () => {
  assert.match(client, /event\.key !== "Enter"/);
  assert.match(client, /event\.preventDefault\(\)/);
  assert.match(
    client,
    /event\.currentTarget\.form\?\.requestSubmit\(\)/,
  );
});

test("Shift+Enter remains a textarea newline", () => {
  assert.match(client, /event\.shiftKey/);

  const keydownStart = client.indexOf("onKeyDown={(event) => {");
  const preventDefault = client.indexOf(
    "event.preventDefault();",
    keydownStart,
  );

  assert.ok(keydownStart >= 0);
  assert.ok(preventDefault > keydownStart);

  const guard = client.slice(keydownStart, preventDefault);
  assert.match(guard, /event\.shiftKey/);
  assert.match(guard, /return;/);
});

test("composer does not submit during IME composition", () => {
  assert.match(client, /event\.nativeEvent\.isComposing/);
});

test("empty or busy composer is not keyboard-submitted", () => {
  assert.match(client, /if \(posting \|\| !message\.trim\(\)\)/);
});
