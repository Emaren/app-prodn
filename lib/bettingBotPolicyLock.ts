import type { Prisma } from "@/lib/generated/prisma";

export const BETTING_BOT_POLICY_LOCK_NAMESPACE = 29417;

/**
 * Serialize one counter-bettor's mutable policy snapshot with every
 * deterministic decision derived from that policy.
 *
 * This is an authority lock only. It does not reserve WOLO or grant execution
 * rights.
 */
export async function lockBettingBotPolicy(
  tx: Prisma.TransactionClient,
  botConfigId: number
) {
  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(
      ${BETTING_BOT_POLICY_LOCK_NAMESPACE},
      ${botConfigId}
    )
  `;
}
