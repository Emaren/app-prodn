import type { Prisma } from "@/lib/generated/prisma";

// Stable PostgreSQL advisory-lock domains; transaction-scoped (never session
// scoped) so a crashed/aborted request cannot strand a livestream lock.
const VIDEO_ACCOUNT_LOCK_DOMAIN = 734100;
const VIDEO_SESSION_LOCK_DOMAIN = 734101;

/**
 * Serialize overlapping start and late-replay promotion requests for one
 * broadcaster across every Next.js worker. Acquire ACCOUNT before SESSION
 * consistently to avoid lock-order inversions.
 */
export async function lockVideoBroadcaster(
  tx: Prisma.TransactionClient,
  userId: number,
) {
  if (!Number.isSafeInteger(userId) || userId <= 0 || userId > 2_147_483_647) {
    throw new Error("Invalid broadcaster lock identity.");
  }
  // SELECT of a scalar Postgres function in FROM returns exactly one row;
  // project an int, not the unsupported PostgreSQL void return type.
  const rows = await tx.$queryRaw<Array<{ locked: number }>>`
    SELECT 1::integer AS locked
    FROM pg_advisory_xact_lock(${VIDEO_ACCOUNT_LOCK_DOMAIN}, ${userId})
  `;
  if (rows.length !== 1) throw new Error("Broadcaster lock unavailable.");
}

/** Serialize primary-camera selection for the same battle across owners. */
export async function lockVideoSessionPrimary(
  tx: Prisma.TransactionClient,
  sessionKey: string,
) {
  if (!sessionKey || sessionKey.length > 255) {
    throw new Error("Invalid video session lock identity.");
  }
  const rows = await tx.$queryRaw<Array<{ locked: number }>>`
    SELECT 1::integer AS locked
    FROM pg_advisory_xact_lock(${VIDEO_SESSION_LOCK_DOMAIN}, hashtext(${sessionKey}))
  `;
  if (rows.length !== 1) throw new Error("Video session lock unavailable.");
}
