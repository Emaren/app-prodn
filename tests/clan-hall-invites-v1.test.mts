import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { getClanHallFeatures } from "../lib/clanHallFeatures.ts";
import { formatClanRole } from "../lib/clanRoles.ts";

const root = process.cwd();

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

test("owner storage remains conventional while the Hall says The King", () => {
  assert.equal(formatClanRole("owner"), "The King");
  assert.equal(formatClanRole("admin"), "Admin");
  assert.equal(formatClanRole("member"), "Member");

  const clans = read("lib/clans.ts");
  assert.match(
    clans,
    /MANAGER_ROLES = new Set\(\["owner", "admin"\]\)/,
  );
});

test("AoE2WAR enables the intended flagship powers for the current Hall release", () => {
  const aoe2war = getClanHallFeatures("aoe2war");
  const mystikal = getClanHallFeatures("mystikal");

  assert.equal(aoe2war.realtime, true);
  assert.equal(aoe2war.optimisticMessages, true);
  assert.equal(aoe2war.inviteDoor, true);

  assert.equal(aoe2war.hallScribe, true);
  assert.equal(aoe2war.presence, false);
  assert.equal(aoe2war.typing, false);
  assert.equal(aoe2war.delegatedRecruiting, false);
  assert.equal(aoe2war.replies, false);
  assert.equal(aoe2war.pins, false);
  assert.equal(aoe2war.search, false);
  assert.equal(aoe2war.media, false);
  assert.equal(aoe2war.replayCards, false);

  assert.equal(mystikal.realtime, false);
  assert.equal(mystikal.optimisticMessages, false);
  assert.equal(mystikal.inviteDoor, false);
  assert.equal(mystikal.hallScribe, false);
});

test("on-site invitations reuse Direct Chat and require explicit acceptance", () => {
  const route = read("app/api/clans/[slug]/invites/route.ts");

  assert.match(route, /getOrCreateConversationByUsers/);
  assert.match(route, /publishDirectMessageEvent/);
  assert.match(route, /body\.action === "send"/);

  assert.match(
    route,
    /body\.action !== "accept" && body\.action !== "decline"/,
  );
  assert.match(
    route,
    /body\.action === "accept" \? "accepted" : "declined"/,
  );

  assert.match(route, /clanMember\.upsert/);
  assert.match(route, /role: "member"/);
  assert.match(
    route,
    /if \(body\.action === "accept"\)[\s\S]*publishClanHallEvent\(slug, \{ type: "roster" \}\)/,
  );
});

test("invitation acceptance re-proves recipient and inviter authority", () => {
  const route = read("app/api/clans/[slug]/invites/route.ts");

  assert.match(route, /conversation\.participants\.some/);
  assert.match(route, /senderAuthorized/);
  assert.match(route, /canSendClanInvite/);
  assert.match(route, /looksLikeClanInvite/);
});

test("Invite Door UI searches users, sends DMs and exposes Enter Hall", () => {
  const component = read("components/clans/ClanInviteDoor.tsx");
  const client = read("components/clans/ClanHallClient.tsx");

  assert.match(component, /Find a warrior/);
  assert.match(component, /Invite Door/);
  assert.match(component, /Enter Hall/);
  assert.match(component, /action: "send"/);
  assert.match(component, /action,\s*messageId/);
  assert.match(client, /<ClanInvitePrompt/);
  assert.match(client, /<ClanInviteDoor/);
});

test("this release requires no Prisma migration", () => {
  const schema = read("prisma/schema.prisma");

  assert.doesNotMatch(schema, /model ClanInvite\b/);
  assert.match(
    read("docs/CLAN_HALLS.md"),
    /requires no database migration/,
  );
});
