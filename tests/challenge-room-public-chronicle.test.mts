import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const conversation = readFileSync(
  new URL("../components/challenge/ChallengeRoomConversation.tsx", import.meta.url),
  "utf8"
);

const route = readFileSync(
  new URL("../app/api/challenges/[id]/route.ts", import.meta.url),
  "utf8"
);

const page = readFileSync(
  new URL("../app/challenge/[id]/page.tsx", import.meta.url),
  "utf8"
);

test("challenge room no longer embeds private direct messages", () => {
  assert.doesNotMatch(conversation, /ContactEmarenWorkspace/);
  assert.match(conversation, /Public Match Room/);
  assert.match(conversation, /Match .* Chronicle/);
});

test("only duelists and commissioner may write to the public room", () => {
  assert.match(conversation, /viewerIsChallenger/);
  assert.match(conversation, /viewerIsChallenged/);
  assert.match(conversation, /isAdmin/);
  assert.match(conversation, /canPost/);
});

test("room messages are stored inside the exact scheduled match activity stream", () => {
  assert.match(route, /action === "room_message"/);
  assert.match(route, /scheduledMatchId: challengeId/);
  assert.match(route, /eventType: "room_message"/);
  assert.match(route, /publicMatchRoom: true/);
});

test("public match room interleaves messages and protocol activity chronologically", () => {
  assert.match(page, /entries=\{\[\.\.\.match\.activities\]\.reverse\(\)\.map/);
  assert.match(page, /eventType: activity\.eventType/);
  assert.match(page, /message: metadataText\(activity\.metadata, "message"\)/);
});

test("separate protocol ledger excludes player room messages", () => {
  assert.match(page, /Protocol ledger · system audit/);
  assert.match(page, /activity\.eventType !== "room_message"/);
});
