import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  getAiPromptContextManifest,
  getAiPromptContextPolicy,
} from "../lib/aiPromptPolicy.ts";
import {
  hallScribeMentioned,
  hallScribeVisibleAudiences,
} from "../lib/clanHallScribePolicy.ts";
import { getClanHallFeatures } from "../lib/clanHallFeatures.ts";
import { formatClanRole } from "../lib/clanRoles.ts";
import {
  AOE2WAR_HALL_SCRIBE_UID,
  isClanHallScribeSystemUid,
  isInternalSystemUid,
  isLeaderboardExcludedSystemUid,
} from "../lib/internalSystemAccounts.ts";

const root = process.cwd();
function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

test("Hall Scribe is a reserved non-human system identity", () => {
  assert.equal(
    AOE2WAR_HALL_SCRIBE_UID,
    "aoe2hd_ai_clan_aoe2war_hall_scribe",
  );
  assert.equal(isInternalSystemUid(AOE2WAR_HALL_SCRIBE_UID), true);
  assert.equal(
    isLeaderboardExcludedSystemUid(AOE2WAR_HALL_SCRIBE_UID),
    true,
  );
  assert.equal(formatClanRole("hall_scribe"), "Hall Scribe");
  assert.equal(
    isClanHallScribeSystemUid("aoe2hd_ai_clan_mystikal_hall_scribe"),
    true,
  );
});

test("Hall Scribe remains baseline while realtime graduates to every V1 Hall", () => {
  for (const slug of ["aoe2war", "mystikal", "jims-clan", "legend-clan"]) {
    assert.equal(getClanHallFeatures(slug).hallScribe, true);
    assert.equal(getClanHallFeatures(slug).realtime, true);
  }
});

test("Hall Scribe accepts @Scribe while preserving the legacy mention", () => {
  assert.equal(hallScribeMentioned("@Scribe what happened?"), true);
  assert.equal(hallScribeMentioned("@Hall Scribe what happened?"), true);
  assert.equal(hallScribeMentioned("hey Hall Scribe, verdict?"), true);
  assert.equal(hallScribeMentioned("scribe this match"), false);
});

test("Hall context never widens a narrower message lane", () => {
  assert.deepEqual(hallScribeVisibleAudiences("public"), ["public"]);
  assert.deepEqual(hallScribeVisibleAudiences("users"), ["public", "users"]);
  assert.deepEqual(hallScribeVisibleAudiences("clan"), ["public", "users", "clan"]);
});

test("clan_hall excludes private viewer context", () => {
  const policy = getAiPromptContextPolicy("clan_hall");
  assert.equal(policy.includeViewerUid, false);
  assert.equal(policy.includePrivateThreadHistory, false);
  assert.equal(policy.allowViewerMoneyContext, false);
  assert.equal(policy.allowViewerStakingContext, false);

  const manifest = new Map(
    getAiPromptContextManifest("clan_hall").map((item) => [item.key, item.mode]),
  );
  assert.equal(manifest.get("viewer_money"), "excluded");
  assert.equal(manifest.get("viewer_staking"), "excluded");
  assert.equal(manifest.get("viewer_uid"), "excluded");
  assert.equal(manifest.get("private_thread"), "excluded");
  assert.equal(manifest.get("clan_hall_history"), "bounded");
});

test("Hall Scribe provider alias preserves saved prompt layering", () => {
  const config = read("lib/aiConciergeConfig.ts");
  assert.match(config, /id: "Agent4\.1HallScribe"/);
  assert.match(config, /AOE2WAR_HALL_SCRIBE_PROMPT_ID/);
  assert.match(
    config,
    /pmpt_69cf27b4471481948af207cc46496d610a8fc123d5176074/,
  );
});

test("human Hall message survives Hall Scribe model failure", () => {
  const route = read("app/api/clans/[slug]/route.ts");
  const created = route.indexOf(
    "const createdMessage = await prisma.clanMessage.create",
  );
  const call = route.indexOf("await maybeCreateClanHallScribeReply");
  const caught = route.indexOf(
    "Hall Scribe reply failed; human Hall message remains posted",
  );
  assert.ok(created >= 0 && call > created && caught > call);
});

test("Hall Scribe keeps triggering audience and does not join roster", () => {
  const scribe = read("lib/clanHallScribe.ts");
  const clans = read("lib/clans.ts");
  assert.match(scribe, /audience: args\.audience/);
  assert.doesNotMatch(scribe, /clanMember\.(create|upsert)/);
  assert.match(clans, /isClanHallScribeSystemUid/);
  assert.match(
    clans,
    /isClanMember:[\s\S]*isClanHallScribeSystemUid\(message\.author\.uid\)[\s\S]*\? false/,
  );
});

test("Hall Scribe admin edits keep DB truth without public edited scar", () => {
  assert.match(
    read("lib/clans.ts"),
    /edited:[\s\S]*isClanHallScribeSystemUid\(message\.author\.uid\)[\s\S]*\? false/,
  );
});

test("Admin UI stages Hall Scribe and previews clan_hall", () => {
  const admin = read("components/admin/ai/AiCommandCenter.tsx");
  assert.match(admin, /Stage Hall Scribe/);
  assert.match(admin, /aoe2war-hall-scribe/);
  assert.match(admin, /Agent4\.1HallScribe/);
  assert.match(admin, /clan_hall: "Clan Hall"/);
});

test("Hall UI exposes explicit @Scribe and one-shot Scribe toggle", () => {
  const client = read("components/clans/ClanHallClient.tsx");
  const route = read("app/api/clans/[slug]/route.ts");
  const scribe = read("lib/clanHallScribe.ts");

  assert.match(client, /Type \$\{hallScribeMention\} or light the S button/);
  assert.match(client, /scribeReplyEnabled/);
  assert.match(
    client,
    /aria-label=[\s\S]*\$\{hallScribeMention\} reply armed/,
  );
  assert.match(client, /scribe: requestScribe/);
  assert.match(route, /body\.scribe === true/);
  assert.match(route, /forceReply: requestScribeReply/);
  assert.match(scribe, /forceReply\?: boolean/);
  assert.match(scribe, /clanHallScribeMentionAliases\(profile\)/);
  assert.match(
    scribe,
    /!args\.forceReply[\s\S]*!hallScribeMentioned\([\s\S]*args\.message/,
  );
  assert.doesNotMatch(client, /ambientHallScribe/i);
});

test("Hall Scribe V1 requires no Prisma migration", () => {
  assert.doesNotMatch(read("prisma/schema.prisma"), /model ClanHallScribe\b/);
  assert.match(
    read("docs/HALL_SCRIBE_PROMPT.md"),
    /No Hall Scribe response may widen narrower Hall information/,
  );
});


test("Hall positive pair evidence vetoes provider false-absence claims", () => {
  const source =
    readFileSync(
      "lib/aiConcierge.ts",
      "utf8",
    );

  assert.match(source, /buildPositivePairEvidenceGuard/);
  assert.match(source, /Canonical positive pair verdict:/);
  assert.match(source, /providerReplyContradictsPositivePairEvidence/);
  assert.match(source, /factualProviderText/);
});


test("@Scribe and the lit S control converge on the same Hall Scribe responder", () => {
  const client = read("components/clans/ClanHallClient.tsx");
  const route = read("app/api/clans/[slug]/route.ts");
  const scribe = read("lib/clanHallScribe.ts");
  const policy = read("lib/clanHallScribePolicy.ts");

  assert.match(policy, /@scribe\b/i);
  assert.match(client, /scribe: requestScribe/);
  assert.match(route, /body\.scribe === true/);
  assert.match(route, /forceReply: requestScribeReply/);
  assert.match(route, /maybeCreateClanHallScribeReply/);
  assert.match(
    scribe,
    /maybeCreateAoE2WarHallScribeReply[\s\S]*maybeCreateClanHallScribeReply/,
  );
  assert.match(scribe, /clanHallScribeMentionAliases\(profile\)/);
});
