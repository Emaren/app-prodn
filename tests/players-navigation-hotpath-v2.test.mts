import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");

test("players document keeps volatile presence off the request-critical RSC path", () => {
  const page = source("app/players/page.tsx");
  const provider = source("components/presence/PublicPresenceProvider.tsx");
  const presence = source("components/players/PlayerDirectoryPresence.tsx");
  const onlineNow = source("components/players/PlayerDirectoryOnlineNow.tsx");

  assert.doesNotMatch(page, /loadPublicPresenceSnapshot/);
  assert.match(page, /<PublicPresenceProvider initialOnlineUsers=\{null\}>/);
  assert.match(provider, /initialOnlineUsers: LobbyOnlineUser\[\] \| null/);
  assert.match(provider, /const \[ready, setReady\] = useState\(initialOnlineUsers !== null\)/);
  assert.match(provider, /setReady\(true\)/);
  assert.match(presence, /return ready \? directoryPresenceCount/);
  assert.match(onlineNow, /Checking who is live right now/);
});

test("global navigation prefetches the Player Registry without broadening every link", () => {
  const shell = source("app/AppShell.tsx");
  const menu = source("components/HeaderMenu.tsx");

  assert.match(shell, /prefetch=\{href === "\/players"\}/);
  assert.match(shell, /onMouseEnter=\{\(\) => \{\s*router\.prefetch\(href\);/);
  assert.match(menu, /prefetch=\{entry\.href === "\/players"\}/);
});

test("players stays outside shared edge cache after certified body churn", () => {
  const policy = JSON.parse(source("config/speed-edge-dynamic-policy.json"));
  const player = policy.routes.find((row: { route?: string }) => row.route === "/players");
  assert.equal(player, undefined);

  const helper = source("scripts/aoe2_speed_cloudflare_remote.py");
  const allowlist = helper.match(/DYNAMIC_ALLOWED_ROUTES = \(([^\n]+)\)/)?.[1] ?? "";
  assert.doesNotMatch(allowlist, /"\/players"/);
  assert.match(allowlist, /"\/players\/by-name\/Emaren"/);
});
