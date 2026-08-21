import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  CLAN_HALL_PRESENCE_TTL_MS,
  listClanHallPresence,
  removeClanHallPresence,
  touchClanHallPresence,
} from "../lib/clanHallPresence.ts";

const root = process.cwd();

function read(path: string) {
  return readFileSync(
    join(root, path),
    "utf8",
  );
}

test("Hall presence is ephemeral and TTL bounded", () => {
  const slug =
    "presence-contract-test";
  const now =
    1_800_000_000_000;

  touchClanHallPresence(
    slug,
    {
      uid: "u_presence_test",
      displayName: "Presence Test",
    },
    now,
  );

  assert.deepEqual(
    listClanHallPresence(
      slug,
      now + 1,
    ).map((entry) => entry.uid),
    ["u_presence_test"],
  );

  assert.equal(
    listClanHallPresence(
      slug,
      now +
        CLAN_HALL_PRESENCE_TTL_MS +
        1,
    ).length,
    0,
  );

  touchClanHallPresence(
    slug,
    {
      uid: "u_presence_test",
      displayName: "Presence Test",
    },
    now,
  );
  removeClanHallPresence(
    slug,
    "u_presence_test",
  );
  assert.equal(
    listClanHallPresence(
      slug,
      now,
    ).length,
    0,
  );
});

test("presence route is authenticated, policy-aware and memory-only", () => {
  const route = read(
    "app/api/clans/[slug]/presence/route.ts",
  );

  assert.match(
    route,
    /getSessionUid/,
  );
  assert.match(
    route,
    /normalizeClanAudience/,
  );
  assert.match(
    route,
    /touchClanHallPresence/,
  );
  assert.match(
    route,
    /removeClanHallPresence/,
  );
  assert.doesNotMatch(
    route,
    /\.create\(/,
  );
  assert.doesNotMatch(
    route,
    /\.update\(/,
  );
});

test("Hall distinguishes in-room, site-online and durable membership time", () => {
  const hall = read(
    "components/clans/ClanHallClient.tsx",
  );
  const clans = read(
    "lib/clans.ts",
  );

  assert.match(
    hall,
    /usePublicPresence\(\[\]\)/,
  );
  assert.match(
    hall,
    /presenceEndpoint/,
  );
  assert.match(
    hall,
    /In the Hall/,
  );
  assert.match(
    hall,
    /member\.joinedAt/,
  );

  assert.match(
    clans,
    /joinedAt: string/,
  );
  assert.match(
    clans,
    /joinedAt: true/,
  );
});
