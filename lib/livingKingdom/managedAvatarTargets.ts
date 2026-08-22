import type { PrismaClient } from "@/lib/generated/prisma";
import { normalizeManagedMediaTarget } from "@/lib/managedMediaAssets";

export function livingKingdomManagedAvatarTargetsForUid(uid: string) {
  return [
    normalizeManagedMediaTarget(`user-${uid}`),
    normalizeManagedMediaTarget(`user-${uid}-featured`),
    normalizeManagedMediaTarget(`user-${uid}-pool`),
  ].filter((target): target is string => Boolean(target));
}

export async function livingKingdomUidForManagedAvatarTarget(
  prisma: PrismaClient,
  target: string | null | undefined,
) {
  const normalizedTarget = normalizeManagedMediaTarget(target);

  if (!normalizedTarget?.startsWith("user-")) {
    return null;
  }

  // Managed-media targets slugify UIDs, so verify a small set of reversible
  // candidates against the user table and then re-normalize before accepting.
  // Current session UIDs use `u_...`, which becomes `u-...` in media targets.
  const withoutUserPrefix = normalizedTarget.slice("user-".length);
  const normalizedUid = withoutUserPrefix.replace(/-(?:pool|featured)$/, "");
  const uidCandidates = Array.from(
    new Set([
      normalizedUid,
      normalizedUid.replace(/^u-/, "u_"),
      normalizedUid.replace(/-/g, "_"),
    ]),
  ).filter(Boolean);
  const users = await prisma.user.findMany({
    where: {
      uid: { in: uidCandidates },
    },
    select: { uid: true },
  });

  return (
    users.find((user) =>
      livingKingdomManagedAvatarTargetsForUid(user.uid).includes(normalizedTarget),
    )?.uid ?? null
  );
}
