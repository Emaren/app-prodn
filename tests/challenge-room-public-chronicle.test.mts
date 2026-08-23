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

const commands = readFileSync(
  new URL("../lib/challenge/domain/commands.ts", import.meta.url),
  "utf8"
);

const policy = readFileSync(
  new URL("../lib/challenge/domain/transitionPolicy.ts", import.meta.url),
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

test("room messages are planned as public Chronicle activity and persisted through the domain command", () => {
  assert.match(route, /action === "room_message"/);
  assert.match(route, /postChallengeRoomMessage\(/);
  assert.doesNotMatch(route, /recordChallengeActivity\(/);

  assert.match(policy, /export function planChallengeRoomMessage\(/);
  assert.match(policy, /eventType:\s*"room_message"/);
  assert.match(policy, /publicMatchRoom:\s*true/);

  assert.match(commands, /export async function postChallengeRoomMessage\(/);
  assert.match(commands, /planChallengeRoomMessage\(/);
  assert.match(commands, /recordChallengeActivity\(/);
  assert.match(commands, /scheduledMatchId:[\s\S]*input\.challengeId/);
  assert.match(commands, /eventType:[\s\S]*plan\.eventType/);
  assert.match(commands, /metadata:[\s\S]*plan\.metadata/);
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
