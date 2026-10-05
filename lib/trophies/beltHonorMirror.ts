import type { Prisma, PrismaClient } from "@/lib/generated/prisma";
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
type BeltHonorMirrorClient = Pick<Prisma.TransactionClient, "userBadge">;

export async function syncChampionshipBeltHonorMirror(
  tx: BeltHonorMirrorClient,
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


/**
 * Rebuild every system-owned Belt mirror from live Trophy/championship custody.
 *
 * This is a repair/projection boundary, not a second authority. It exists so
 * older pre-unification rows cannot leave User Command claiming a different
 * champion than Trophy Command. Explicit championship reign seats win for team
 * titles; otherwise the live solo Trophy holder is projected. Guardians and
 * vacant/disputed titles never receive current-champion Belt mirrors.
 */
export async function reconcileChampionshipBeltHonorMirrors(
  prisma: PrismaClient,
) {
  const [trophies, activeReigns] = await Promise.all([
    prisma.trophy.findMany({
      where: { kind: "belt" },
      select: {
        id: true,
        displayName: true,
        status: true,
        currentHolderUserId: true,
      },
      orderBy: [{ id: "asc" }],
    }),
    prisma.championshipCustodyReign.findMany({
      where: { endedAt: null },
      select: {
        trophyId: true,
        seats: {
          select: { userId: true },
          orderBy: [{ seat: "asc" }],
        },
      },
      orderBy: [{ id: "asc" }],
    }),
  ]);

  const explicitHolderIdsByTrophyId = new Map<number, number[]>();
  for (const reign of activeReigns) {
    explicitHolderIdsByTrophyId.set(
      reign.trophyId,
      reign.seats.map((seat) => seat.userId),
    );
  }

  await prisma.$transaction(async (tx) => {
    for (const trophy of trophies) {
      const held = trophy.status === "held" || trophy.status === "active";
      const explicitHolderIds =
        explicitHolderIdsByTrophyId.get(trophy.id) ?? [];
      const holderUserIds = !held
        ? []
        : explicitHolderIds.length > 0
          ? explicitHolderIds
          : trophy.currentHolderUserId
            ? [trophy.currentHolderUserId]
            : [];

      await syncChampionshipBeltHonorMirror(tx, {
        displayName: trophy.displayName,
        holderUserIds,
      });
    }
  });

  return {
    trophies: trophies.length,
    activeReigns: activeReigns.length,
  };
}
