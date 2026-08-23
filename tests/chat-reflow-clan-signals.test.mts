import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildClanHallSignalBody,
  containsClanBroadcast,
  parseClanHallSignalBody,
  resolveClanHallSignalRecipients,
} from "../lib/clanHallSignals.ts";

const roster = [
  { uid: "emaren", displayName: "Emaren" },
  { uid: "zodiac", displayName: "Zodiac" },
  { uid: "jim", displayName: "Jim" },
  { uid: "julio", displayName: "Julio Alvarez" },
];

test("@Clan is case-insensitive and excludes the author", () => {
  assert.equal(containsClanBroadcast("@CLAN war tonight"), true);

  const recipients = resolveClanHallSignalRecipients({
    body: "@cLaN war tonight",
    authorUid: "emaren",
    roster,
    allowClanBroadcast: true,
  });

  assert.deepEqual(
    Array.from(recipients.entries()).sort(),
    [
      ["jim", "clan"],
      ["julio", "clan"],
      ["zodiac", "clan"],
    ],
  );
});

test("@Clan broadcast is unavailable to unauthorized posters", () => {
  const recipients = resolveClanHallSignalRecipients({
    body: "@Clan war tonight",
    authorUid: "emaren",
    roster,
    allowClanBroadcast: false,
  });

  assert.equal(recipients.size, 0);
});

test("explicit names require no @ and are case-insensitive", () => {
  const recipients = resolveClanHallSignalRecipients({
    body: "ZODIAC get in here. julio alvarez you too.",
    authorUid: "emaren",
    roster,
    allowClanBroadcast: true,
  });

  assert.equal(recipients.get("zodiac"), "mention");
  assert.equal(recipients.get("julio"), "mention");
  assert.equal(recipients.has("jim"), false);
});

test("long names tolerate one-character typo latitude", () => {
  const recipients = resolveClanHallSignalRecipients({
    body: "Zodiacc you are going to love WarGraphs.",
    authorUid: "emaren",
    roster,
    allowClanBroadcast: true,
  });

  assert.equal(recipients.get("zodiac"), "mention");
});

test("short names do not fuzzy-match", () => {
  const typo = resolveClanHallSignalRecipients({
    body: "Jimm get in here",
    authorUid: "emaren",
    roster,
    allowClanBroadcast: true,
  });

  assert.equal(typo.has("jim"), false);

  const exact = resolveClanHallSignalRecipients({
    body: "JIM get in here",
    authorUid: "emaren",
    roster,
    allowClanBroadcast: true,
  });

  assert.equal(exact.get("jim"), "mention");
});

test("ambiguous fuzzy matches notify nobody", () => {
  const recipients = resolveClanHallSignalRecipients({
    body: "Foobaq get in here",
    authorUid: "emaren",
    roster: [
      { uid: "one", displayName: "Foobar" },
      { uid: "two", displayName: "Foobaz" },
    ],
    allowClanBroadcast: true,
  });

  assert.equal(recipients.size, 0);
});

test("explicit mention wins over broad @Clan", () => {
  const recipients = resolveClanHallSignalRecipients({
    body: "@Clan — Zodiac lead the charge.",
    authorUid: "emaren",
    roster,
    allowClanBroadcast: true,
  });

  assert.equal(recipients.get("zodiac"), "mention");
  assert.equal(recipients.get("jim"), "clan");
  assert.equal(recipients.get("julio"), "clan");
});

test("signal body round-trips", () => {
  const body = buildClanHallSignalBody({
    kind: "mention",
    clanSlug: "mystikal",
    clanName: "Mystikal Clan",
    messageId: 4242,
    authorName: "Emaren",
    preview:
      "Zodiac, you are going to absolutely love WarGraphs friend.",
  });

  assert.deepEqual(parseClanHallSignalBody(body), {
    kind: "mention",
    clanSlug: "mystikal",
    clanName: "Mystikal Clan",
    messageId: 4242,
    authorName: "Emaren",
    preview:
      "Zodiac, you are going to absolutely love WarGraphs friend.",
  });
});

test("full Contact page uses CSS viewport reflow", () => {
  const shell = readFileSync("app/AppShell.tsx", "utf8");
  const page = readFileSync(
    "app/contact-emaren/page.tsx",
    "utf8",
  );

  assert.doesNotMatch(shell, /contactViewportHeight/);
  assert.doesNotMatch(shell, /setContactViewportHeight/);

  assert.match(
    shell,
    /h-\[100dvh\] min-h-0 max-h-\[100dvh\] overflow-hidden/,
  );

  assert.match(
    page,
    /\[@media\(max-height:50rem\)\]:!hidden/,
  );
});

test("Clan Signal delivery uses durable DM and fresh conversation ordering", () => {
  const route = readFileSync(
    "app/api/clans/[slug]/route.ts",
    "utf8",
  );

  assert.match(route, /resolveClanHallSignalRecipients/);
  assert.match(route, /getOrCreateConversationByUsers/);
  assert.match(route, /prisma\.directMessage\.create/);
  assert.match(route, /prisma\.directConversation\.update/);
  assert.match(route, /publishDirectMessageEvent/);
  assert.match(route, /FANOUT_BATCH_SIZE = 8/);
  assert.match(route, /slice\(offset, offset \+ FANOUT_BATCH_SIZE\)/);
});

test("focused Hall navigation survives realtime latest-page refresh", () => {
  const page = readFileSync(
    "app/clans/[slug]/page.tsx",
    "utf8",
  );

  const client = readFileSync(
    "components/clans/ClanHallClient.tsx",
    "utf8",
  );

  assert.match(page, /focusMessageId/);
  assert.match(page, /\{ focusMessageId \}/);

  assert.match(
    client,
    /id=\{`clan-message-\$\{message\.id\}`\}/,
  );

  assert.match(
    client,
    /current\.messagePage\.kind === "focus"/,
  );

  assert.match(
    client,
    /incoming\.messagePage\.kind === "latest"/,
  );

  assert.match(
    client,
    /window\.location\.hash/,
  );

  assert.match(
    client,
    /scrollIntoView/,
  );
});

test("Contact inbox renders Clan Signal cards with exact Hall deep link", () => {
  const inbox = readFileSync(
    "components/contact/ContactInboxPanel.tsx",
    "utf8",
  );

  assert.match(inbox, /parseClanHallSignalBody/);
  assert.match(inbox, /ClanHallSignalCard/);

  assert.match(
    inbox,
    /focusMessageId=\$\{signal\.messageId\}/,
  );

  assert.match(
    inbox,
    /#clan-message-\$\{signal\.messageId\}/,
  );

  assert.match(inbox, /Respond/);
  assert.match(inbox, /Enter Hall/);
  assert.match(inbox, /Hall Signal Sent/);
  assert.match(inbox, /isViewer=\{isViewer\}/);
});
