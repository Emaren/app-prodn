/**
 * Admin-only reader of existing R25 public_v5 projection, never public.users.
 * The route checks signed admin identity before calling this function.
 */
import { Prisma, type PrismaClient } from "@/lib/generated/prisma";
import {
  ADMIN_DIRECTORY_LIMIT,
  projectAdminDirectory,
  type AdminDirectoryProfileRow,
} from "@/lib/adminNonfinancialDirectoryProjection";

export async function loadAdminNonfinancialDirectory(
  prisma: PrismaClient,
) {
  const rows = await prisma.$queryRaw<AdminDirectoryProfileRow[]>(Prisma.sql`
    SELECT id, uid, in_game_name AS "inGameName",
           steam_persona_name AS "steamPersonaName",
           steam_id AS "steamId", verified,
           verification_level AS "verificationLevel",
           created_at AS "createdAt"
    FROM aoe2war_public_v5.user_profiles
    ORDER BY created_at ASC, id ASC
    LIMIT ${ADMIN_DIRECTORY_LIMIT + 1}
  `);
  return projectAdminDirectory(rows);
}
