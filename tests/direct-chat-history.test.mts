import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { mergeContactInboxPayload } from "../components/contact/contactInboxPayload.ts";

function textMessage(messageId: number, body = `message ${messageId}`) {
  return {
    id: messageId > 0 ? `message:${messageId}` : `optimistic:${Math.abs(messageId)}`,
    messageId,
    kind: "text" as const,
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, Math.abs(messageId))).toISOString(),
    sender: {
      uid: "player-one",
      displayName: "Player One",
      isAdmin: false,
      badges: [],
    },
    receipt: null,
    body,
    attachment: null,
    reactions: [],
    sharedLobbyMessageId: null,
    replyTo: null,
    isPinned: false,
    editedAt: null,
    transcription: null,
    transcriptionStatus: null,
    translations: [],
    replayCard: null,
  };
}

function inboxPayload(
  messages: ReturnType<typeof textMessage>[],
  messagePage = { hasMore: false, beforeMessageId: null as number | null }
) {
  return {
    viewer: { uid: "viewer", displayName: "Viewer", isAdmin: false },
    totalUnreadCount: 0,
    summaries: [],
    activeTargetUid: "player-one",
    activeCounterpart: null,
    activeChallenge: null,
    messages,
    messagePage,
    draft: null,
    pinnedMessages: [],
    unavailableReason: null,
    conversation: null,
  };
}

test("prepending an older page preserves chronological order and adopts its cursor", () => {
  const latest = inboxPayload(
    [textMessage(3), textMessage(4)],
    { hasMore: true, beforeMessageId: 3 }
  );
  const older = inboxPayload(
    [textMessage(1), textMessage(2)],
    { hasMore: true, beforeMessageId: 1 }
  );

  const merged = mergeContactInboxPayload(latest, older, { mode: "prepend" });

  assert.deepEqual(merged.messages.map((message) => message.messageId), [1, 2, 3, 4]);
  assert.deepEqual(merged.messagePage, older.messagePage);
});

test("a latest-page refresh updates server rows without discarding loaded history", () => {
  const accumulated = inboxPayload(
    [textMessage(1), textMessage(2), textMessage(3), textMessage(4)],
    { hasMore: true, beforeMessageId: 1 }
  );
  const refreshed = inboxPayload(
    [textMessage(3, "edited on server"), textMessage(4), textMessage(5)],
    { hasMore: true, beforeMessageId: 3 }
  );

  const merged = mergeContactInboxPayload(accumulated, refreshed, { mode: "refresh" });

  assert.deepEqual(merged.messages.map((message) => message.messageId), [1, 2, 3, 4, 5]);
  assert.equal(merged.messages.find((message) => message.messageId === 3)?.body, "edited on server");
  assert.deepEqual(merged.messagePage, accumulated.messagePage);
});

test("send reconciliation drops optimistic rows and delete reconciliation removes old pages", () => {
  const withOptimistic = inboxPayload([
    textMessage(1),
    textMessage(2),
    textMessage(-99, "sending"),
  ]);
  const sent = inboxPayload([textMessage(2), textMessage(3, "sent")]);

  const reconciled = mergeContactInboxPayload(withOptimistic, sent, {
    mode: "refresh",
    dropOptimistic: true,
  });
  assert.deepEqual(reconciled.messages.map((message) => message.messageId), [1, 2, 3]);

  const deleted = mergeContactInboxPayload(reconciled, sent, {
    mode: "refresh",
    removeMessageIds: [1],
  });
  assert.deepEqual(deleted.messages.map((message) => message.messageId), [2, 3]);
});

test("challenge-card refresh keeps only the newest card for that match", () => {
  const previous = inboxPayload([
    textMessage(
      10,
      "Challenge issued\nJim vs Zodiac\nChallenge ID: #24\nStatus: Awaiting acceptance"
    ),
  ]);
  const refreshed = inboxPayload([
    textMessage(
      11,
      "Challenge accepted\nJim vs Zodiac\nChallenge ID: #24\nStatus: Terms accepted"
    ),
  ]);

  const merged = mergeContactInboxPayload(previous, refreshed, { mode: "refresh" });
  assert.deepEqual(merged.messages.map((message) => message.messageId), [11]);
  assert.match(
    merged.messages[0]?.kind === "text" ? merged.messages[0].body ?? "" : "",
    /Challenge accepted/
  );
});

test("history anchoring waits for the requested cursor and chat routes reject forged cards", () => {
  const panelSource = readFileSync(
    new URL("../components/contact/ContactInboxPanel.tsx", import.meta.url),
    "utf8"
  );
  const routeSource = readFileSync(
    new URL("../app/api/contact-emaren/route.ts", import.meta.url),
    "utf8"
  );

  assert.match(panelSource, /requestedBeforeMessageId/);
  assert.match(
    panelSource,
    /data\?\.messagePage\.beforeMessageId === anchor\.requestedBeforeMessageId/
  );
  assert.match(routeSource, /isChallengeInboxNoticeBody\(payload\.body\)/);
  assert.match(routeSource, /Challenge record formatting is reserved/);
});

test("reply attachments survive serialization and Nav Chat keeps challenge action compact", () => {
  const panelSource = readFileSync(
    new URL("../components/contact/ContactInboxPanel.tsx", import.meta.url),
    "utf8"
  );
  const inboxSource = readFileSync(
    new URL("../lib/contactInbox.ts", import.meta.url),
    "utf8"
  );
  const typesSource = readFileSync(
    new URL("../components/contact/types.ts", import.meta.url),
    "utf8"
  );
  const headerSource = readFileSync(
    new URL("../components/contact/HeaderInboxControl.tsx", import.meta.url),
    "utf8"
  );
  const workspaceSource = readFileSync(
    new URL("../components/contact/ContactEmarenWorkspace.tsx", import.meta.url),
    "utf8"
  );

  assert.match(
    typesSource,
    /ContactMessageReply[\s\S]*attachment: ContactMessageAttachment \| null/
  );

  assert.match(
    inboxSource,
    /replyTo:[\s\S]*attachmentName: true,[\s\S]*attachmentMimeType: true,[\s\S]*attachmentDurationSeconds: true/
  );

  assert.match(
    inboxSource,
    /attachment:\s*buildMessageAttachment\(message\.replyTo\)/
  );

  assert.match(
    panelSource,
    /message\.replyTo\.attachment\?\.kind === "image"/
  );

  assert.match(
    panelSource,
    /replyingTo\.attachment\?\.kind === "image"/
  );

  assert.match(
    panelSource,
    /if \(mode === "popover"\) \{\s*return null;\s*\}/
  );

  assert.match(
    panelSource,
    /aria-label=\{`Challenge \$\{counterpart\.displayName\}`\}/
  );

  assert.match(
    panelSource,
    /<Swords className="h-3\.5 w-3\.5" \/>/
  );

  assert.match(
    headerSource,
    /attachment: replyingTo\.attachment/
  );

  assert.match(
    workspaceSource,
    /attachment: replyingTo\.attachment/
  );
});

test("opening an already-read direct thread does not rewrite its read timestamp", () => {
  const inboxSource = readFileSync(
    new URL("../lib/contactInbox.ts", import.meta.url),
    "utf8"
  );

  assert.match(
    inboxSource,
    /const hasUnreadActivity = Boolean/
  );

  assert.match(
    inboxSource,
    /if \(!hasUnreadActivity\) \{[\s\S]*?await markDelivered;[\s\S]*?return false;[\s\S]*?\}/
  );

  assert.match(
    inboxSource,
    /lastReadAt: readUpperBound/
  );
});
