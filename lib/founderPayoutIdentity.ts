export type FounderPayoutIdentity = {
  requestId: string;
  memo: string;
  lockKey: string;
};

function normalizeFounderPayoutTarget(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "target";
}

/**
 * Stable economic identity for one independently stackable Founder reward.
 *
 * Bonus id keeps equal-value bonuses on the same game distinct. The target
 * group keeps every participant/winner retry on one settlement-service key
 * and one chain memo, including retries after an ambiguous broadcast result.
 */
export function buildFounderPayoutIdentity(input: {
  founderBonusId: number;
  claimGroupKey: string;
  claimKind: string;
}): FounderPayoutIdentity {
  const founderBonusId = Math.max(1, Math.trunc(input.founderBonusId));
  const target = normalizeFounderPayoutTarget(input.claimGroupKey);
  const claimKind = normalizeFounderPayoutTarget(input.claimKind).slice(0, 32);
  const requestId = `aoe2-founder-${founderBonusId}-${target}`.slice(0, 128);

  return {
    requestId,
    memo: `AoE2 Founder payout · bonus ${founderBonusId} · ${claimKind} · ${target}`.slice(
      0,
      180
    ),
    lockKey: `aoe2hdbets:founder-payout:${requestId}`,
  };
}
