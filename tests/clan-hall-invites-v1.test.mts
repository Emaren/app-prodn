import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { getClanHallFeatures } from "../lib/clanHallFeatures.ts";
import { formatClanRole } from "../lib/clanRoles.ts";
import {
  buildClanInviteBody,
  parseClanInviteBody,
} from "../lib/clanInvites.ts";

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

test("every V1 Hall inherits the Clan Social realtime baseline plus invite + scribe", () => {
  const aoe2war = getClanHallFeatures("aoe2war");
  const mystikal = getClanHallFeatures("mystikal");

  for (const hall of [aoe2war, mystikal]) {
    assert.equal(hall.realtime, true);
    assert.equal(hall.optimisticMessages, true);
    assert.equal(hall.presence, true);
    assert.equal(hall.inviteDoor, true);
    assert.equal(hall.hallScribe, true);
    assert.equal(hall.media, true);

    assert.equal(hall.typing, false);
    assert.equal(hall.delegatedRecruiting, false);
    assert.equal(hall.replies, false);
    assert.equal(hall.pins, false);
    assert.equal(hall.search, false);
    assert.equal(hall.replayCards, false);
  }
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

test("Invite Door UI browses or searches users, sends DMs and exposes Enter Hall", () => {
  const component = read("components/clans/ClanInviteDoor.tsx");
  const client = read("components/clans/ClanHallClient.tsx");

  assert.match(component, /Search or browse warriors/);
  assert.match(component, /Invite Door/);
  assert.match(component, /Enter Hall/);
  assert.match(component, /action: "send"/);
  assert.match(component, /action,\s*messageId/);
  assert.match(client, /<ClanInvitePrompt/);
  assert.match(client, /<ClanInviteDoor/);
});

test("Invite Door remains protocol-backed without a dedicated invite table", () => {
  assert.doesNotMatch(read("prisma/schema.prisma"), /model ClanInvite\b/);
});


test("Invite Door browse returns eligible humans without requiring typed search", () => {
  const route = read(
    "app/api/clans/[slug]/invite-search/route.ts",
  );
  const component = read(
    "components/clans/ClanInviteDoor.tsx",
  );

  assert.match(route, /isInternalSystemUid/);
  assert.doesNotMatch(route, /query\.length < 2/);
  assert.match(route, /take: 100/);
  assert.match(route, /status: "active"/);
  assert.match(route, /filter\(\(candidate\) => !memberIds\.has/);

  assert.match(component, /onMouseEnter/);
  assert.match(component, /onFocusCapture/);
  assert.match(component, /Search or browse warriors/);
  assert.match(component, /available/);
});

test("Clan invite protocol parses into a first-class Direct Chat artifact", () => {
  const body = buildClanInviteBody({
    clanName: "AoE2WAR",
    clanSlug: "aoe2war",
    inviterName: "Emaren",
    messageId: 123,
    origin: "https://aoe2war.com",
    status: "pending",
  });

  assert.deepEqual(
    parseClanInviteBody(body),
    {
      clanName: "AoE2WAR",
      clanSlug: "aoe2war",
      inviterName: "Emaren",
      messageId: 123,
      status: "pending",
    },
  );

  const contact = read(
    "components/contact/ContactInboxPanel.tsx",
  );
  assert.match(contact, /ClanInviteDirectArtifact/);
  assert.match(contact, /Clan Hall Invitation/);
  assert.match(contact, /Enter the Hall/);
});

test("Clan invite send rejects system identities and duplicate pending invitations", () => {
  const route = read(
    "app/api/clans/[slug]/invites/route.ts",
  );

  assert.match(route, /isInternalSystemUid/);
  assert.match(
    route,
    /System identities cannot receive Clan invitations/,
  );
  assert.match(
    route,
    /An invitation to .* is already pending/,
  );
  assert.match(route, /recentInviteMessages/);
});
