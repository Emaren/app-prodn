import { createHash } from "node:crypto";

import { Prisma, type PrismaClient } from "@/lib/generated/prisma";
import { loadPublicReplayGeneration } from "@/lib/publicReplayGeneration";

const DIRECTORY_GENERATION_CACHE_MS = 1_000;

type DirectorySupplementFingerprint = {
  users: string | null;
  badges: string | null;
  gifts: string | null;
  managedAvatars: string | null;
  pendingClaims: string | null;
};

type GenerationCacheEntry = {
  expiresAt: number;
  value: string;
};

let generationCache: GenerationCacheEntry | null = null;
let generationPromise: Promise<string> | null = null;

async function loadDirectorySupplementFingerprint(
  prisma: PrismaClient,
): Promise<DirectorySupplementFingerprint> {
  const rows = await prisma.$queryRaw<DirectorySupplementFingerprint[]>(Prisma.sql`
    SELECT
      (
        SELECT md5(
          COALESCE(
            jsonb_agg(
              jsonb_build_array(
                id,
                uid,
                in_game_name,
                steam_persona_name,
                steam_id,
                represented_country,
                verified,
                verification_level,
                verified_at,
                created_at
              )
              ORDER BY id
            )::text,
            '[]'
          )
        )
        FROM users
      ) AS users,
      (
        SELECT md5(
          COALESCE(
            jsonb_agg(
              jsonb_build_array(
                id,
                user_id,
                label,
                note,
                status,
                display_on_profile,
                accepted_at,
                created_at
              )
              ORDER BY id
            )::text,
            '[]'
          )
        )
        FROM user_badges
      ) AS badges,
      (
        SELECT md5(
          COALESCE(
            jsonb_agg(
              jsonb_build_array(
                id,
                user_id,
                kind,
                amount,
                note,
                status,
                display_on_profile,
                accepted_at,
                created_at
              )
              ORDER BY id
            )::text,
            '[]'
          )
        )
        FROM user_gifts
      ) AS gifts,
      (
        SELECT md5(
          COALESCE(
            jsonb_agg(
              jsonb_build_array(
                id,
                target,
                active,
                updated_at
              )
              ORDER BY id
            )::text,
            '[]'
          )
        )
        FROM managed_media_assets
        WHERE kind = 'avatar'
      ) AS "managedAvatars",
      (
        SELECT md5(
          jsonb_build_array(
            COUNT(*),
            MAX(id),
            MAX(updated_at)
          )::text
        )
        FROM pending_wolo_claims
      ) AS "pendingClaims"
  `);

  return rows[0] ?? {
    users: null,
    badges: null,
    gifts: null,
    managedAvatars: null,
    pendingClaims: null,
  };
}

/**
 * Authoritative generation for the expensive public player-directory projection.
 *
 * Replay/public identity truth owns the historical core. Community honors,
 * gifts, avatar metadata, and pending WOLO-claim presentation are separate
 * mutable inputs, so they participate in this directory-specific generation
 * instead of forcing the broader replay generation to churn.
 *
 * Presence is deliberately excluded. Online/offline truth is overlaid after
 * the generation-cached directory build and must never invalidate historical
 * replay projections.
 */
export async function loadPublicPlayerDirectoryGeneration(
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
    loadPublicReplayGeneration(prisma),
    loadDirectorySupplementFingerprint(prisma),
  ])
    .then(([replayGeneration, supplement]) =>
      createHash("sha256")
        .update(
          JSON.stringify({
            replayGeneration,
            supplement,
          }),
        )
        .digest("hex")
        .slice(0, 24),
    )
    .then((value) => {
      generationCache = {
        expiresAt:
          Date.now() +
          DIRECTORY_GENERATION_CACHE_MS,
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
