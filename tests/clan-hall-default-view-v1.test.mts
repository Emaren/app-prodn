import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(path: string) {
  return readFileSync(path, "utf8");
}

const schema = read("prisma/schema.prisma");
const migration = read("prisma/migrations/20260822224000_add_clan_default_chat_view/migration.sql");
const preference = read("components/clans/clanChatViewPreference.ts");
const hall = read("components/clans/ClanHallClient.tsx");
const rail = read("components/clans/ClanDisplayRail.tsx");
const profile = read("components/profile/ClanCrestManager.tsx");
const profileApi = read("app/api/user/clan-crests/route.ts");
const hallApi = read("app/api/clans/[slug]/route.ts");

test("Clan persists a bounded V1-V5 Hall default in a ship-safe child table", () => {
  assert.match(schema, /model ClanHallSetting/);
  assert.match(
    schema,
    /defaultChatView\s+String\s+@default\("v1"\)\s+@map\("default_chat_view"\)/,
  );
  assert.match(schema, /hallSetting\s+ClanHallSetting\?/);
  assert.match(migration, /CREATE TABLE "clan_hall_settings"/);
  assert.match(
    migration,
    /CHECK \("default_chat_view" IN \('v1', 'v2', 'v3', 'v4', 'v5'\)\)/,
  );
  assert.doesNotMatch(migration, /ALTER TABLE "clans"/);
});

test("viewer chat view override is per Clan and falls back to the admin default", () => {
  assert.match(preference, /CLAN_CHAT_VIEW_STORAGE_PREFIX = "aoe2war:clans:chat-view:"/);
  assert.match(preference, /clanChatViewStorageKey/);
  assert.match(preference, /defaultMode/);
  assert.match(hall, /clanSlug: snapshot\.clan\.slug/);
  assert.match(hall, /defaultMode: snapshot\.clan\.defaultChatView/);
});

test("Hall managers control the default in profile and the admin-only display rail", () => {
  assert.match(profile, /Hall default/);
  assert.match(profile, /set_default_chat_view/);
  assert.match(profileApi, /set_default_chat_view/);
  assert.match(profileApi, /canUserManageClan/);
  assert.match(rail, /canManage && onDefaultChatViewChange/);
  assert.match(rail, /Crown/);
  assert.match(hallApi, /action === "set_default_chat_view"/);
  assert.match(hallApi, /current\.viewer\.canManage/);
});
