import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const source = (path: string) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("restricted production lobby snapshots read the same fixed room as the signed writer", () => {
  const snapshot = source("lib/lobbySnapshot.ts");
  const writer = source("app/api/lobby/chat/route.ts");
  assert.match(snapshot, /const restrictedProductionRoom = usesNonfinancialProductionAuth\(\)/);
  assert.match(snapshot, /getLobbyMessages\(prisma,\s*restrictedProductionRoom \? LOBBY_ROOM_SLUG : tournament\.roomSlug, 24/);
  assert.match(snapshot, /const messages =\s*restrictedProductionRoom\s*\? tournamentMessages/);
  assert.match(snapshot, /tournament: restrictedProductionRoom\s*\? \{ \.\.\.tournament, roomSlug: LOBBY_ROOM_SLUG \}/);
  assert.match(writer, /input\.roomSlug !== LOBBY_ROOM_SLUG/);
  assert.match(writer, /callSocialWriter\("lobby", token/);
});

test("the same projected room governs both client send and chat history pagination", () => {
  const home = source("app/HomePageClient.tsx");
  assert.match(home, /roomSlug: tournament\.roomSlug,\s*beforeId:/);
  assert.match(home, /body: JSON\.stringify\(\{\s*message: trimmed,\s*roomSlug: tournament\.roomSlug,\s*idempotencyKey/);
  assert.match(home, /tournament\.roomSlug !== LOBBY_ROOM_SLUG/);
  assert.match(home, /crypto\.randomUUID\(\)\.replaceAll\("-", ""\)/);
});

test("legacy nonproduction tournament chat remains scoped to its own original room", () => {
  const snapshot = source("lib/lobbySnapshot.ts");
  assert.match(snapshot, /restrictedProductionRoom \? LOBBY_ROOM_SLUG : tournament\.roomSlug/);
  assert.match(snapshot, /: tournamentMessages\.length > 0 \|\| tournament\.roomSlug === LOBBY_ROOM_SLUG/);
  assert.match(snapshot, /: tournament,\s*messages,/);
});

test("the repair does not broaden public POST or database writer permissions", () => {
  const home = source("app/HomePageClient.tsx");
  const snapshot = source("lib/lobbySnapshot.ts");
  for (const entry of [home, snapshot]) {
    assert.doesNotMatch(entry, /(?:GRANT\s+ALL|ALTER\s+ROLE|funding_authorized|root\/shell)/i);
  }
  assert.match(source("app/api/lobby/chat/route.ts"), /validateSocialWriteOrigin\(request\)/);
});
