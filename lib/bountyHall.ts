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

export const OFFICIAL_NUMBERED_BOUNTY_ISSUER_ADDRESSES = [
  "wolo1dmj5dnm7g9hmj005yzy5e5xcygudyt7wxzpxjq",
  "wolo1r8kvt7me33rsv9ldaczj03xjrld4yumx0c0jkg",
] as const;

const OFFICIAL_NUMBERED_BOUNTY_ISSUER_SET =
  new Set<string>(
    OFFICIAL_NUMBERED_BOUNTY_ISSUER_ADDRESSES,
  );

const NUMBERED_BOUNTY_MEMO_PATTERN =
  /\bbounty\s*#\s*(\d+)\b/i;

export type NumberedBountyTransferRecord = {
  id: number;
  txHash: string;
  transferIndex: number;
  timestamp: Date | string;
  senderAddress: string;
  recipientAddress: string;
  amountWoloDisplay: unknown;
  memo: string | null;
};

function numberedBountyTimestamp(
  value: Date | string,
) {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed)
    ? parsed
    : 0;
}

export function parseWrittenBountyNumber(
  memo: string | null | undefined,
) {
  const match =
    memo?.match(
      NUMBERED_BOUNTY_MEMO_PATTERN,
    );

  if (!match?.[1]) return null;

  const parsed = Number.parseInt(
    match[1],
    10,
  );

  return Number.isSafeInteger(parsed) &&
    parsed > 0
    ? parsed
    : null;
}

export function canonicalBountyMemo(
  memo: string,
  canonicalNumber: number,
) {
  if (
    !Number.isSafeInteger(
      canonicalNumber,
    ) ||
    canonicalNumber < 1
  ) {
    return memo;
  }

  return memo.replace(
    NUMBERED_BOUNTY_MEMO_PATTERN,
    `Bounty #${canonicalNumber}`,
  );
}

export function canonicalizeNumberedBountyTransfers<
  T extends NumberedBountyTransferRecord,
>(
  transfers: readonly T[],
) {
  const seen = new Set<string>();

  const admitted: Array<{
    row: T;
    normalizedTxHash: string;
    writtenNumber: number;
  }> = [];

  for (const row of transfers) {
    if (
      !OFFICIAL_NUMBERED_BOUNTY_ISSUER_SET.has(
        row.senderAddress,
      )
    ) {
      continue;
    }

    const writtenNumber =
      parseWrittenBountyNumber(
        row.memo,
      );

    const normalizedTxHash =
      row.txHash
        .trim()
        .toUpperCase();

    const amountWolo = Number(
      String(
        row.amountWoloDisplay ??
          "",
      ),
    );

    if (
      writtenNumber === null ||
      !normalizedTxHash ||
      !Number.isFinite(amountWolo) ||
      amountWolo <= 0
    ) {
      continue;
    }

    const transferIdentity =
      `${normalizedTxHash}:${row.transferIndex}`;

    if (
      seen.has(
        transferIdentity,
      )
    ) {
      continue;
    }

    seen.add(
      transferIdentity,
    );

    admitted.push({
      row,
      normalizedTxHash,
      writtenNumber,
    });
  }

  admitted.sort(
    (left, right) => {
      const timestampDifference =
        numberedBountyTimestamp(
          left.row.timestamp,
        ) -
        numberedBountyTimestamp(
          right.row.timestamp,
        );

      if (timestampDifference) {
        return timestampDifference;
      }

      const idDifference =
        left.row.id -
        right.row.id;

      if (idDifference) {
        return idDifference;
      }

      return (
        left.row.transferIndex -
        right.row.transferIndex
      );
    },
  );

  const legacy =
    admitted.filter(
      (entry) =>
        entry.writtenNumber <= 50,
    );

  const explicit =
    admitted.filter(
      (entry) =>
        entry.writtenNumber >= 51,
    );

  const canonicalized = [
    ...legacy.map(
      (
        {
          row,
          normalizedTxHash,
          writtenNumber,
        },
        index,
      ) => {
        const canonicalNumber =
          index + 1;

        return {
          ...row,
          txHash:
            normalizedTxHash,
          writtenNumber,
          canonicalNumber,
          canonicalMemo:
            canonicalBountyMemo(
              row.memo || "",
              canonicalNumber,
            ),
        };
      },
    ),
    ...explicit.map(
      ({
        row,
        normalizedTxHash,
        writtenNumber,
      }) => ({
        ...row,
        txHash:
          normalizedTxHash,
        writtenNumber,
        canonicalNumber:
          writtenNumber,
        canonicalMemo:
          canonicalBountyMemo(
            row.memo || "",
            writtenNumber,
          ),
      }),
    ),
  ];

  return canonicalized.sort(
    (left, right) =>
      left.canonicalNumber -
        right.canonicalNumber ||
      numberedBountyTimestamp(
        left.timestamp,
      ) -
        numberedBountyTimestamp(
          right.timestamp,
        ) ||
      left.id - right.id ||
      left.transferIndex -
        right.transferIndex,
  );
}

export function isVerifiedCanonicalBountyPayout(input: {
  status: string | null | undefined;
  txHash: string | null | undefined;
}) {
  return (
    input.status === "paid" &&
    Boolean(input.txHash?.trim())
  );
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
