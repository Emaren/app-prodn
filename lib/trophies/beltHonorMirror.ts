import type { Prisma } from "@/lib/generated/prisma";
import { buildHonorLabel } from "@/lib/communityHonors";

export const CHAMPIONSHIP_BELT_MIRROR_NOTE =
  "Current AoE2WAR championship custody.";
export const LEGACY_CHAMPIONSHIP_BELT_MIRROR_NOTE =
  "Current championship custody · synchronized from Trophy Command.";
export const CHAMPIONSHIP_BELT_MIRROR_NOTES = [
  CHAMPIONSHIP_BELT_MIRROR_NOTE,
  LEGACY_CHAMPIONSHIP_BELT_MIRROR_NOTE,
] as const;

/**
 * User-list belt chips are a projection of championship custody, never a
 * second custody ledger. Every authoritative title transition repairs this
 * mirror inside the same database transaction.
 */
export async function syncChampionshipBeltHonorMirror(
  tx: Prisma.TransactionClient,
  input: {
    displayName: string;
    holderUserIds: number[];
    actorUserId?: number | null;
    now?: Date;
  },
) {
  const now = input.now ?? new Date();
  const holderUserIds = Array.from(
    new Set(
      input.holderUserIds.filter(
        (userId) => Number.isSafeInteger(userId) && userId > 0,
      ),
    ),
  );
  const label = buildHonorLabel("belt", input.displayName);

  if (holderUserIds.length > 0) {
    await tx.userBadge.deleteMany({
      where: {
        label,
        userId: { notIn: holderUserIds },
      },
    });
  } else {
    await tx.userBadge.deleteMany({ where: { label } });
  }

  for (const userId of holderUserIds) {
    await tx.userBadge.upsert({
      where: {
        userId_label: {
          userId,
          label,
        },
      },
      update: {
        note: CHAMPIONSHIP_BELT_MIRROR_NOTE,
        status: "accepted",
        displayOnProfile: true,
        acceptedAt: now,
        // Custody mirrors are system projections, not human-issued chat honors.
        createdByUserId: null,
      },
      create: {
        userId,
        label,
        note: CHAMPIONSHIP_BELT_MIRROR_NOTE,
        status: "accepted",
        displayOnProfile: true,
        acceptedAt: now,
        // Custody mirrors are system projections, not human-issued chat honors.
        createdByUserId: null,
      },
    });
  }

  return { label, holderUserIds };
}
