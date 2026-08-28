import type { PrismaClient } from "@/lib/generated/prisma";

export type BattleIdentityCandidate = {
  sessionKey: string;
  state: "live" | "awaiting_final_proof" | "completed" | "under_review";
  startedAt?: Date | null;
  completedAt?: Date | null;
  allowCreate: boolean;
};

export type PublicBattleIdentity = {
  id: number;
  identityKey: string;
  publicNumber: number;
};

export function canonicalBattleIdentityKey(sessionKey: string) {
  const normalized = sessionKey.trim().toLowerCase();
  if (!normalized) return null;
  return normalized.startsWith("platform:")
    ? normalized.slice(0, 255)
    : `session:${normalized}`.slice(0, 255);
}

export function platformMatchIdFromBattleSession(sessionKey: string) {
  const normalized = sessionKey.trim();
  if (!normalized.toLowerCase().startsWith("platform:")) return null;
  const value = normalized.slice("platform:".length).trim();
  return value ? value.slice(0, 120) : null;
}

function publicBattleState(candidate: BattleIdentityCandidate) {
  if (candidate.state === "completed") return "completed";
  if (candidate.state === "under_review") return "under_review";
  if (candidate.state === "awaiting_final_proof") return "awaiting_final_proof";
  return "live";
}

function mergeCandidate(
  current: BattleIdentityCandidate | undefined,
  candidate: BattleIdentityCandidate
) {
  if (!current) return candidate;
  const priority = {
    live: 0,
    awaiting_final_proof: 1,
    under_review: 2,
    completed: 3,
  } as const;
  return {
    ...current,
    state: priority[candidate.state] > priority[current.state] ? candidate.state : current.state,
    startedAt:
      current.startedAt && candidate.startedAt
        ? new Date(Math.min(current.startedAt.getTime(), candidate.startedAt.getTime()))
        : current.startedAt ?? candidate.startedAt ?? null,
    completedAt:
      current.completedAt && candidate.completedAt
        ? new Date(Math.max(current.completedAt.getTime(), candidate.completedAt.getTime()))
        : current.completedAt ?? candidate.completedAt ?? null,
    allowCreate: current.allowCreate || candidate.allowCreate,
  } satisfies BattleIdentityCandidate;
}

/**
 * Allocate one immutable public number per exact watcher/session identity.
 *
 * The transaction-scoped advisory lock matters: PostgreSQL sequences advance
 * before an INSERT conflict is known. Locking by identity lets a duplicate
 * concurrent request observe the winner's row instead of burning a number.
 * Different games use different locks and can still arrive concurrently.
 */
export async function ensurePublicBattleIdentities(
  prisma: PrismaClient,
  candidates: BattleIdentityCandidate[]
) {
  const byKey = new Map<string, BattleIdentityCandidate>();
  for (const candidate of candidates) {
    const identityKey = canonicalBattleIdentityKey(candidate.sessionKey);
    if (!identityKey) continue;
    byKey.set(identityKey, mergeCandidate(byKey.get(identityKey), candidate));
  }

  const resolved = await Promise.all(
    [...byKey.entries()].map(async ([identityKey, candidate]) =>
      prisma.$transaction(async (tx) => {
        await tx.$executeRaw`
          SELECT pg_advisory_xact_lock(hashtextextended(${identityKey}, 0))
        `;

        const requestedPlatformMatchId = platformMatchIdFromBattleSession(
          candidate.sessionKey
        );
        /*
         * A fallback identity may already own the immutable public number when
         * exact platform truth arrives. Promotion records that platform ID on
         * the original row instead of burning another public number, so exact
         * platform lookup must take precedence over the newer identity key.
         */
        const existingByPlatform = requestedPlatformMatchId
          ? await tx.battleIdentity.findUnique({
              where: { platformMatchId: requestedPlatformMatchId },
              select: {
                id: true,
                identityKey: true,
                publicNumber: true,
                state: true,
                platformMatchId: true,
                startedAt: true,
                completedAt: true,
              },
            })
          : null;
        const existing = existingByPlatform ?? await tx.battleIdentity.findUnique({
          where: { identityKey },
          select: {
            id: true,
            identityKey: true,
            publicNumber: true,
            state: true,
            platformMatchId: true,
            startedAt: true,
            completedAt: true,
          },
        });

        if (!existing && !candidate.allowCreate) return null;

        const nextState =
          existing?.state === "completed" ? "completed" : publicBattleState(candidate);
        const row = existing
          ? await tx.battleIdentity.update({
              where: { id: existing.id },
              data: {
                state: nextState,
                platformMatchId:
                  requestedPlatformMatchId ?? existing.platformMatchId,
                startedAt: existing.startedAt ?? candidate.startedAt ?? null,
                completedAt:
                  existing.completedAt ??
                  (candidate.state === "completed" ? candidate.completedAt ?? new Date() : null),
                lastSeenAt: new Date(),
              },
              select: { id: true, identityKey: true, publicNumber: true },
            })
          : await tx.battleIdentity.create({
              data: {
                identityKey,
                platformMatchId: requestedPlatformMatchId,
                state: nextState,
                startedAt: candidate.startedAt ?? null,
                completedAt:
                  candidate.state === "completed" ? candidate.completedAt ?? new Date() : null,
                lastSeenAt: new Date(),
              },
              select: { id: true, identityKey: true, publicNumber: true },
            });

        return {
          requestedIdentityKey: identityKey,
          row: row satisfies PublicBattleIdentity,
        };
      })
    )
  );

  return new Map(
    resolved
      .filter(
        (
          result
        ): result is {
          requestedIdentityKey: string;
          row: PublicBattleIdentity;
        } => Boolean(result)
      )
      .map((result) => [result.requestedIdentityKey, result.row] as const)
  );
}
