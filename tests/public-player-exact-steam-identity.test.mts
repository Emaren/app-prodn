import assert from "node:assert/strict";
import test from "node:test";

import {
  buildClaimedPublicPlayerRef,
  buildReplayPublicPlayerRef,
  findUniqueClaimedUserForReplayName,
  normalizePublicPlayerSteamId,
  publicPlayerMatchesReplayParticipant,
} from "../lib/publicPlayers.ts";

const ZODIAC_STEAM = "76561198103810510";
const BRIAN_STEAM = "76561198250132680";

test("exact SteamID64 is sovereign over a matching display name", () => {
  const zodiac = buildClaimedPublicPlayerRef({
    uid: "u_zodiac",
    inGameName: "Zodiac",
    steamPersonaName: "TheZodiac",
    steamId: ZODIAC_STEAM,
    verified: true,
    verificationLevel: 2,
  });

  assert.equal(zodiac.steamId, ZODIAC_STEAM);
  assert.equal(
    publicPlayerMatchesReplayParticipant(zodiac, {
      name: "Zodiac",
      steam_id: ZODIAC_STEAM,
    }),
    true,
  );
  assert.equal(
    publicPlayerMatchesReplayParticipant(zodiac, {
      name: "Zodiac",
      steam_id: BRIAN_STEAM,
    }),
    false,
  );
});

test("exact-Steam target fails closed when replay participant Steam identity is missing", () => {
  const zodiac = buildClaimedPublicPlayerRef({
    uid: "u_zodiac",
    inGameName: "Zodiac",
    steamPersonaName: null,
    steamId: ZODIAC_STEAM,
    verified: true,
    verificationLevel: 2,
  });

  assert.equal(
    publicPlayerMatchesReplayParticipant(zodiac, { name: "Zodiac" }),
    false,
  );
});

test("name-only fallback remains exact-full-name and never splits a composite observation", () => {
  const zodiac = buildReplayPublicPlayerRef("Zodiac");

  assert.equal(
    publicPlayerMatchesReplayParticipant(zodiac, { name: "Zodiac" }),
    true,
  );
  assert.equal(
    publicPlayerMatchesReplayParticipant(zodiac, {
      name: "Zodiac, Brian_de_Bois",
      steam_id: BRIAN_STEAM,
    }),
    false,
  );
});

test("SteamID64 normalizer accepts only exact 17-digit platform keys", () => {
  assert.equal(normalizePublicPlayerSteamId(ZODIAC_STEAM), ZODIAC_STEAM);
  assert.equal(normalizePublicPlayerSteamId("123"), null);
  assert.equal(normalizePublicPlayerSteamId("Zodiac"), null);
  assert.equal(normalizePublicPlayerSteamId(null), null);
});

test("claimed replay-name resolution fails closed when a name belongs to multiple users", async () => {
  const ambiguousPrisma = {
    user: {
      findMany: async () => [
        {
          uid: "u_one",
          inGameName: "Jack",
          steamPersonaName: null,
          steamId: "76561198000000001",
          verified: false,
          verificationLevel: 0,
        },
        {
          uid: "u_two",
          inGameName: "Jack",
          steamPersonaName: null,
          steamId: "76561198000000002",
          verified: false,
          verificationLevel: 0,
        },
      ],
    },
  } as never;

  assert.equal(
    await findUniqueClaimedUserForReplayName(ambiguousPrisma, "Jack"),
    null,
  );

  const uniquePrisma = {
    user: {
      findMany: async () => [
        {
          uid: "u_zodiac",
          inGameName: "Zodiac",
          steamPersonaName: "TheZodiac",
          steamId: ZODIAC_STEAM,
          verified: true,
          verificationLevel: 2,
        },
      ],
    },
  } as never;

  const unique = await findUniqueClaimedUserForReplayName(uniquePrisma, "Zodiac");
  assert.equal(unique?.uid, "u_zodiac");
  assert.equal(unique?.steamId, ZODIAC_STEAM);
});
