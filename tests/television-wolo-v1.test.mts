import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pagePath = new URL("../app/television-wolo/page.tsx", import.meta.url);
const clientPath = new URL(
  "../components/television/TelevisionWoloExperience.tsx",
  import.meta.url,
);
const menuPath = new URL("../components/HeaderMenu.tsx", import.meta.url);

test("Television WOLO composes canonical battle and Chaos truth", async () => {
  const page = await readFile(pagePath, "utf8");
  assert.match(page, /loadPublicLiveGamesSnapshot\(prisma\)/);
  assert.match(page, /loadChaosium\(prisma\)/);
  assert.match(page, /snapshot\.activeSessions/);
  assert.match(page, /snapshot\.recentlyCompletedSessions/);
  assert.match(page, /snapshot\.recentMatches/);
  assert.match(page, /route="\/television-wolo"/);
});

test("Television WOLO keeps playback user-triggered", async () => {
  const client = await readFile(clientPath, "utf8");
  assert.match(client, /async function playBattle\(\)/);
  assert.match(client, /onClick=\{\(\) => void playBattle\(\)\}/);
  assert.match(
    client,
    /\/api\/watch-streams\?sessionKey=/,
  );
  assert.doesNotMatch(client, /autoPlay\s*=\s*\{?true\}?/);
  assert.match(client, /Video stays asleep until you press play/);
});

test("Chaos Vote Lab cannot claim title authority", async () => {
  const client = await readFile(clientPath, "utf8");
  assert.match(client, /Chaos Vote Lab/);
  assert.match(client, /Non-binding sandbox/);
  assert.match(client, /nothing is written, no ballot is counted/);
  assert.doesNotMatch(client, /fetch\([^\n]*chaos/i);
});

test("account dropdown exposes Television WOLO", async () => {
  const menu = await readFile(menuPath, "utf8");
  assert.match(
    menu,
    /href: "\/television-wolo", label: "Television WOLO"/,
  );
});
