import type { PrismaClient } from "@/lib/generated/prisma";
import { normalizeManagedMediaTarget } from "@/lib/managedMediaAssets";

export const CLAN_CREST_MEDIA_KIND = "logo";
export const CLAN_CREST_LIBRARY_TARGET = "clan-crest-library";
export const CLAN_MANAGER_ROLES = ["owner", "admin"] as const;

export function clanCrestPoolTarget(slug: string) {
  const target = normalizeManagedMediaTarget(`clan-${slug}-crest-pool`);
  if (!target) throw new Error("Could not build clan crest pool target.");
  return target;
}

export function clanCurrentCrestTarget(slug: string) {
  const target = normalizeManagedMediaTarget(`clan-${slug}-crest`);
  if (!target) throw new Error("Could not build current clan crest target.");
  return target;
}

export async function canUserManageClan(
  prisma: PrismaClient,
  input: {
    clanId: number;
    userId: number;
    isSiteAdmin: boolean;
  }
) {
  if (input.isSiteAdmin) return true;

  const membership = await prisma.clanMember.findUnique({
    where: {
      clanId_userId: {
        clanId: input.clanId,
        userId: input.userId,
      },
    },
    select: { role: true, status: true },
  });

  return Boolean(
    membership?.status === "active" &&
      CLAN_MANAGER_ROLES.includes(
        membership.role as (typeof CLAN_MANAGER_ROLES)[number]
      )
  );
}
