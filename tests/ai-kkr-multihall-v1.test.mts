import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

test("public Lobby Scribe and Grimer reach KKR through lobby_public", () => {
  const lobby = read("app/api/lobby/chat/route.ts");
  const concierge = read("lib/aiConcierge.ts");

  assert.match(lobby, /personaIds\.push\("scribe"\)/);
  assert.match(lobby, /personaIds\.push\("grimer"\)/);
  assert.match(lobby, /source: "lobby_public"/);
  assert.match(lobby, /requestAiConciergeReply/);
  assert.match(concierge, /loadKingdomKnowledgeContext/);
});

test("V1 baseline keeps Invite Door and Hall Scribe while graduating realtime", () => {
  const features = read("lib/clanHallFeatures.ts");

  assert.match(
    features,
    /BASELINE_CLAN_HALL_FEATURES[\s\S]*inviteDoor: true/,
  );
  assert.match(
    features,
    /BASELINE_CLAN_HALL_FEATURES[\s\S]*hallScribe: true/,
  );
  assert.match(
    features,
    /BASELINE_CLAN_HALL_FEATURES[\s\S]*realtime: true/,
  );
  assert.match(
    features,
    /BASELINE_CLAN_HALL_FEATURES[\s\S]*optimisticMessages: true/,
  );
});

test("Hall profiles preserve distinct V1 summon names", () => {
  const profiles = read("lib/clanHallScribeProfiles.ts");

  for (const mention of [
    "@Scribe",
    "@Mscribe",
    "@Jscribe",
    "@Lscribe",
    "@JAscribe",
  ]) {
    assert.match(profiles, new RegExp(mention.replace("@", "\\@")));
  }
});

test("Hall Scribe runtime is generic and Hall-scoped", () => {
  const scribe = read("lib/clanHallScribe.ts");
  const route = read("app/api/clans/[slug]/route.ts");

  assert.doesNotMatch(
    scribe,
    /args\.clanSlug !== "aoe2war"/,
  );
  assert.match(scribe, /resolveClanHallScribeProfile/);
  assert.match(scribe, /source: "clan_hall"/);
  assert.match(scribe, /clanId: args\.clanId/);
  assert.match(scribe, /audience: \{ in: visibleAudiences \}/);
  assert.match(route, /maybeCreateClanHallScribeReply/);
});


test("all Hall Scribes receive the same Hall message presentation semantics", () => {
  const clans = read("lib/clans.ts");

  assert.match(
    clans,
    /import \{ isClanHallScribeSystemUid \} from "@\/lib\/internalSystemAccounts"/,
  );
  assert.match(
    clans,
    /const role =[\s\S]*isClanHallScribeSystemUid\(message\.author\.uid\)[\s\S]*\? "hall_scribe"/,
  );
  assert.match(
    clans,
    /edited:[\s\S]*isClanHallScribeSystemUid\(message\.author\.uid\)[\s\S]*\? false/,
  );
  assert.match(
    clans,
    /isClanMember:[\s\S]*isClanHallScribeSystemUid\(message\.author\.uid\)[\s\S]*\? false/,
  );
});

test("all Hall Scribe system UIDs remain excluded from human surfaces", () => {
  const accounts = read("lib/internalSystemAccounts.ts");

  assert.match(accounts, /CLAN_HALL_SCRIBE_UID_PATTERN/);
  assert.match(accounts, /isClanHallScribeSystemUid/);
  assert.match(
    accounts,
    /isLeaderboardExcludedSystemUid[\s\S]*isClanHallScribeSystemUid/,
  );
});

test("Hall UI keeps the shared chat picker and uses dynamic Scribe copy", () => {
  const client = read("components/clans/ClanHallClient.tsx");

  assert.match(client, /ClanChatViewPicker[\s\S]*placement="header"[\s\S]*clanSlug=\{snapshot\.clan\.slug\}/);
  assert.match(client, /resolveClanHallScribeProfile/);
  assert.match(client, /hallScribeMention/);
  assert.match(client, /ClanInviteDoor/);
});

test("Direct Chat Clan invitations retain shared background and per-Clan crest", () => {
  const inbox = read("components/contact/ContactInboxPanel.tsx");

  assert.match(inbox, /clanInviteBackgroundUrl\(\)/);
  assert.match(
    inbox,
    /clanInviteCrestUrl\(invite\.clanSlug\)/,
  );
});

test("admin AI surface exposes KKR topology and the live inspector", () => {
  const commandCenter = read("components/admin/ai/AiCommandCenter.tsx");
  const panel = read("components/admin/ai/KingdomKnowledgeRouterPanel.tsx");
  const topology = read("app/api/admin/ai-knowledge/topology/route.ts");

  assert.match(commandCenter, /KingdomKnowledgeRouterPanel/);
  assert.match(panel, /\/api\/admin\/ai-knowledge\/topology/);
  assert.match(panel, /\/api\/admin\/ai-knowledge\?/);
  assert.match(topology, /KINGDOM_KNOWLEDGE_REPOSITORIES/);
  assert.match(topology, /PUBLIC_KINGDOM_PAGES/);
  assert.match(topology, /getAiPromptContextManifest\("lobby_public"\)/);
  assert.match(topology, /getAiPromptContextManifest\("clan_hall"\)/);
});
