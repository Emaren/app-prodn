import { createHash } from "node:crypto";

import type { PrismaClient } from "@/lib/generated/prisma";

const PUBLIC_REPLAY_GENERATION_CACHE_MS = 1_000;
const PUBLIC_USER_IDENTITY_CACHE_MS = 5_000;

type GenerationCacheEntry = {
  expiresAt: number;
  value: string;
};

let generationCache: GenerationCacheEntry | null = null;
let generationPromise: Promise<string> | null = null;
let userIdentityCache: GenerationCacheEntry | null = null;
let userIdentityPromise: Promise<string> | null = null;

async function loadPublicUserIdentityFingerprint(
  prisma: PrismaClient,
): Promise<string> {
  const now = Date.now();
  if (userIdentityCache && userIdentityCache.expiresAt > now) {
    return userIdentityCache.value;
  }
  if (userIdentityPromise) {
    return userIdentityPromise;
  }

  const run = prisma.$queryRaw<Array<{ fingerprint: string }>>`
    SELECT md5(
      COALESCE(
        jsonb_agg(
          jsonb_build_array(
            users.id,
            users.uid,
            users.in_game_name,
            users.steam_id,
            users.steam_persona_name,
            users.twitch_stream_url,
            users.verified,
            users.lock_name,
            users.verification_level,
            users.verification_method,
            users.verified_at,
            users.represented_country,
            users.represented_country_updated_at,
            users.gender_division,
            users.gender_division_updated_at
          ) ORDER BY users.id
        )::text,
        '[]'
      )
    ) AS fingerprint
    FROM public.users
  `
    .then((rows) => rows[0]?.fingerprint ?? "")
    .then((value) => {
      userIdentityCache = {
        expiresAt: Date.now() + PUBLIC_USER_IDENTITY_CACHE_MS,
        value,
      };
      return value;
    })
    .finally(() => {
      if (userIdentityPromise === run) {
        userIdentityPromise = null;
      }
    });

  userIdentityPromise = run;
  return run;
}

/**
 * Lightweight public replay/projection watermark.
 *
 * Open clients poll this token instead of rebuilding player projections every
 * five seconds. Game, projection, player-snapshot, adjudication, and claimed
 * identity lanes are all represented. The user identity fingerprint deliberately
 * excludes last_seen because presence has its own realtime snapshot; name, Steam,
 * verification, stream, and public profile changes still advance this token even
 * when an existing user row is updated in place. The newest mutable GameStats row
 * also contributes its public result fields so a final in-place iteration is
 * observable before the next append-only projection lands.
 */
export async function loadPublicReplayGeneration(
  prisma: PrismaClient,
): Promise<string> {
  const now = Date.now();

  if (generationCache && generationCache.expiresAt > now) {
    return generationCache.value;
  }

  if (generationPromise) {
    return generationPromise;
  }

  const run = Promise.all([
    prisma.gameStats.findFirst({
      orderBy: { id: "desc" },
      select: {
        id: true,
        is_final: true,
        parse_iteration: true,
        parse_reason: true,
        parse_source: true,
        winner: true,
      },
    }),
    prisma.replayStatProjection.findFirst({
      orderBy: { id: "desc" },
      select: { id: true, createdAt: true },
    }),
    prisma.replayPlayerSnapshot.findFirst({
      orderBy: { id: "desc" },
      select: { id: true, createdAt: true, resultStatus: true },
    }),
    prisma.replayResultAdjudication.findFirst({
      orderBy: { id: "desc" },
      select: { id: true, createdAt: true },
    }),
    loadPublicUserIdentityFingerprint(prisma),
  ])
    .then(([game, projection, playerSnapshot, adjudication, userIdentity]) =>
      createHash("sha256")
        .update(
          JSON.stringify({
            adjudication,
            game,
            playerSnapshot,
            projection,
            userIdentity: userIdentity || null,
          }),
        )
        .digest("hex")
        .slice(0, 24),
    )
    .then((value) => {
      generationCache = {
        expiresAt: Date.now() + PUBLIC_REPLAY_GENERATION_CACHE_MS,
        value,
      };
      return value;
    })
    .finally(() => {
      if (generationPromise === run) {
        generationPromise = null;
      }
    });

  generationPromise = run;
  return run;
}
