export type BountyCarouselPauseState = {
  documentVisible: boolean;
  focused: boolean;
  hovered: boolean;
  manualPauseUntil: number;
  now: number;
  reducedMotion: boolean;
  touching: boolean;
};

export function circularWarriorOffset(
  index: number,
  activeIndex: number,
  length: number,
) {
  if (length <= 0) return 0;

  let offset = index - activeIndex;
  const half = Math.floor(length / 2);

  if (offset > half) offset -= length;
  if (offset < -half) offset += length;

  return offset;
}

export function visibleWarriorIndexes(
  length: number,
  activeIndex: number,
  radius = 2,
) {
  if (length <= 0) return [];

  const safeRadius = Math.max(0, Math.floor(radius));
  const indexes = new Set<number>();

  for (let offset = -safeRadius; offset <= safeRadius; offset += 1) {
    indexes.add((activeIndex + offset + length) % length);
  }

  return [...indexes];
}

export function moveWarriorIndex(
  currentIndex: number,
  direction: -1 | 1,
  length: number,
) {
  if (length <= 0) return 0;
  return (currentIndex + direction + length) % length;
}

export function shouldRotateBountyCarousel(
  state: BountyCarouselPauseState,
) {
  return (
    state.documentVisible &&
    !state.focused &&
    !state.hovered &&
    !state.reducedMotion &&
    !state.touching &&
    state.now >= state.manualPauseUntil
  );
}

export function isVerifiedLegacyWinnerBounty(input: {
  claimKind: string;
  claimedByUserId: number | null;
  payoutTxHash: string | null;
  rescindedAt: Date | string | null;
  status: string;
}) {
  return (
    input.claimKind === "winner_bounty" &&
    input.status === "claimed" &&
    input.claimedByUserId !== null &&
    Boolean(input.payoutTxHash?.trim()) &&
    input.rescindedAt === null
  );
}

export function isVerifiedCanonicalBountyPayout(input: {
  status: string | null | undefined;
  txHash: string | null | undefined;
}) {
  return input.status === "paid" && Boolean(input.txHash?.trim());
}

type LegacyWinnerBountyRecord = {
  amountWolo: number;
  claimGroupKey: string | null;
  claimKind: string;
  claimedByUserId: number | null;
  payoutTxHash: string | null;
  rescindedAt: Date | string | null;
  status: string;
  sourceGameStatsId: number | null;
  sourceMarketId: number | null;
};

function legacyWinnerBountyDedupeKey(
  input: LegacyWinnerBountyRecord,
) {
  const sourceIdentity =
    input.sourceMarketId !== null
      ? `market:${input.sourceMarketId}`
      : input.sourceGameStatsId !== null
        ? `game:${input.sourceGameStatsId}`
        : `group:${
            input.claimGroupKey?.trim().toLowerCase() || "none"
          }`;

  return [
    input.payoutTxHash?.trim().toUpperCase() || "no-tx",
    sourceIdentity,
    `user:${input.claimedByUserId ?? "none"}`,
    `amount:${input.amountWolo}`,
  ].join("|");
}

export function dedupeVerifiedLegacyWinnerBounties<
  T extends LegacyWinnerBountyRecord,
>(claims: readonly T[]) {
  const seen = new Set<string>();
  const verified: T[] = [];

  for (const claim of claims) {
    if (!isVerifiedLegacyWinnerBounty(claim)) continue;

    const key = legacyWinnerBountyDedupeKey(claim);
    if (seen.has(key)) continue;

    seen.add(key);
    verified.push(claim);
  }

  return verified;
}

export function requiresBountyValuationReason(input: {
  existing: boolean;
  nextRewardWolo: number | null;
  previousRewardWolo: number | null;
}) {
  return input.existing
    ? input.previousRewardWolo !== input.nextRewardWolo
    : input.nextRewardWolo !== null;
}

export function isPublicBountyContract(input: {
  bountyKind: string;
}) {
  return input.bountyKind !== "personal";
}

export function parseBountyRewardWolo(value: unknown) {
  if (value === null || value === "") {
    return {
      ok: true as const,
      value: null,
    };
  }

  let parsed: number;

  if (typeof value === "number") {
    parsed = value;
  } else if (typeof value === "string") {
    const normalized = value.trim();

    if (!normalized) {
      return {
        ok: true as const,
        value: null,
      };
    }

    if (!/^\d+$/.test(normalized)) {
      return {
        ok: false as const,
        error:
          "Reward WOLO must be a non-negative whole number without commas.",
      };
    }

    parsed = Number(normalized);
  } else {
    return {
      ok: false as const,
      error:
        "Reward WOLO must be a non-negative whole number without commas.",
    };
  }

  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    return {
      ok: false as const,
      error:
        "Reward WOLO must be a non-negative whole number without commas.",
    };
  }

  return {
    ok: true as const,
    value: parsed,
  };
}
