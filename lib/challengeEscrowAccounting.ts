export type ChallengeFundingSide =
  | "left"
  | "right";

export type ChallengeFundingBucket =
  | "wager"
  | "guarantee";

export type ChallengeFundingSourceAllocation = {
  side: ChallengeFundingSide;
  bucket: ChallengeFundingBucket;
  amountWolo: number;
};

export type ChallengeSettlementAccountingRow = {
  id: number;
  status: string;
  action: string;
  recipientAddress: string | null;
  amountWolo: number;
  txHash?: string | null;

  /*
   * undefined:
   *   compatibility/test input may infer historical meaning
   *   from the legacy action vocabulary.
   *
   * []:
   *   a persisted V3 settlement was explicitly loaded with
   *   no allocations. That is broken financial history and
   *   must fail closed.
   *
   * populated:
   *   durable V3 economic authority.
   */
  sourceAllocations?:
    readonly ChallengeFundingSourceAllocation[];
};

export type ChallengePlannedAccountingTransfer = {
  label: string;
  recipientAddress: string | null;
  amountWolo: number;

  sourceAllocations:
    readonly ChallengeFundingSourceAllocation[];
};

export type ChallengeTransferSourceAccounting = {
  /*
   * True means older executed ledger rows already consumed
   * all source principal needed by this economic transfer
   * for the same recipient.
   *
   * This allows planner representation to evolve without
   * recovering spending authority.
   */
  satisfiedByHistory: boolean;

  satisfiedBySettlementIds: number[];

  /*
   * Non-null means some source principal has already been
   * consumed incompatibly or partially and the transfer
   * must not execute.
   */
  blocker: string | null;
};

export type ChallengeSettlementSourceAccounting = {
  ok: boolean;
  blockers: string[];

  executedSourceWolo: number;

  /*
   * Executed ledger value whose action cannot be mapped
   * exactly to a funded source bucket.
   *
   * This is intentionally fail-closed.
   */
  unclassifiedExecutedWolo: number;

  /*
   * Rows marked executed without durable tx proof still
   * consume application-ledger principal. They can never
   * silently regain spending authority.
   */
  unprovenExecutedWolo: number;

  sourceConsumptionWolo:
    Record<string, number>;

  transferAccounting:
    ChallengeTransferSourceAccounting[];
};

function normalizeStatus(
  value:
    | string
    | null
    | undefined,
) {
  return (
    value || ""
  )
    .trim()
    .toLowerCase();
}

function normalizeAddress(
  value:
    | string
    | null
    | undefined,
) {
  return (
    value || ""
  )
    .trim()
    .toLowerCase();
}

function positiveWolo(
  value: number,
) {
  return (
    Number.isSafeInteger(value) &&
    value > 0
  );
}

export function challengeFundingSourceKey(
  side: ChallengeFundingSide,
  bucket: ChallengeFundingBucket,
) {
  return `${side}:${bucket}`;
}

function source(
  side: ChallengeFundingSide,
  bucket: ChallengeFundingBucket,
  amountWolo: number,
): ChallengeFundingSourceAllocation[] {
  return positiveWolo(amountWolo)
    ? [
        {
          side,
          bucket,
          amountWolo,
        },
      ]
    : [];
}

function sideFullFunding(
  side: ChallengeFundingSide,
  wagerAmountWolo: number,
  guaranteeAmountWolo: number,
) {
  return [
    ...source(
      side,
      "wager",
      wagerAmountWolo,
    ),

    ...source(
      side,
      "guarantee",
      guaranteeAmountWolo,
    ),
  ];
}

/*
 * This is a constitutional map.
 *
 * Every settlement action that can move Challenge escrow
 * must declare the original funded source bucket(s) that
 * authorize that movement.
 *
 * Unknown future actions deliberately return [] and are
 * blocked by the settlement engine until their economic
 * source semantics are explicitly defined.
 */
export function challengeSettlementSourceAllocationsForAction(
  input: {
    action: string;
    amountWolo: number;

    wagerAmountWolo: number;
    guaranteeAmountWolo: number;

    leftFunded: boolean;
    rightFunded: boolean;
  },
): ChallengeFundingSourceAllocation[] {
  const action =
    normalizeStatus(
      input.action,
    );

  const wager =
    Math.max(
      0,
      input.wagerAmountWolo,
    );

  const guarantee =
    Math.max(
      0,
      input.guaranteeAmountWolo,
    );

  switch (action) {
    /*
     * Legacy creator timeout and modern full refund consume
     * the same left-side combined principal.
     */
    case "creator_timeout_refund":
    case "left_full_refund":
      return sideFullFunding(
        "left",
        wager,
        guarantee,
      );

    case "right_full_refund":
      return sideFullFunding(
        "right",
        wager,
        guarantee,
      );

    /*
     * Legacy combined refund actions.
     *
     * These are important because modern planners may split
     * these into separate wager + guarantee transfers.
     */
    case "left_wager_guarantee_refund":
      return sideFullFunding(
        "left",
        wager,
        guarantee,
      );

    case "right_wager_guarantee_refund":
      return sideFullFunding(
        "right",
        wager,
        guarantee,
      );

    case "left_wager_refund":
      return source(
        "left",
        "wager",
        wager,
      );

    case "right_wager_refund":
      return source(
        "right",
        "wager",
        wager,
      );

    /*
     * Left guarantee disposition.
     *
     * Whether refunded, forfeited, or awarded elsewhere,
     * these actions all consume the exact same funded
     * left-guarantee source lot.
     */
    case "left_guarantee_to_treasury":
    case "left_guarantee_return":
    case "left_own_guarantee_return":
    case "left_guarantee_awarded_to_right":
      return source(
        "left",
        "guarantee",
        guarantee,
      );

    /*
     * Right guarantee disposition.
     */
    case "right_guarantee_to_treasury":
    case "right_guarantee_return":
    case "right_own_guarantee_return":
    case "right_guarantee_awarded_to_left":
      return source(
        "right",
        "guarantee",
        guarantee,
      );

    /*
     * Double no-show combines every funded guarantee
     * into one treasury transfer.
     */
    case "guarantees_to_treasury":
      return [
        ...(
          input.leftFunded
            ? source(
                "left",
                "guarantee",
                guarantee,
              )
            : []
        ),

        ...(
          input.rightFunded
            ? source(
                "right",
                "guarantee",
                guarantee,
              )
            : []
        ),
      ];

    /*
     * Winner payout consumes BOTH funded wager lots.
     *
     * The winner identity affects the destination, not the
     * economic source of the award.
     */
    case "left_winner_wager_award":
    case "right_winner_wager_award":
      return [
        ...(
          input.leftFunded
            ? source(
                "left",
                "wager",
                wager,
              )
            : []
        ),

        ...(
          input.rightFunded
            ? source(
                "right",
                "wager",
                wager,
              )
            : []
        ),
      ];

    default:
      return [];
  }
}

export function sumChallengeSourceAllocations(
  allocations:
    readonly ChallengeFundingSourceAllocation[],
) {
  return allocations.reduce(
    (
      sum,
      allocation,
    ) =>
      sum +
      allocation.amountWolo,
    0,
  );
}


function canonicalChallengeAllocationMap(
  allocations:
    readonly ChallengeFundingSourceAllocation[],
) {
  const result =
    new Map<string, number>();

  for (
    const allocation
    of allocations
  ) {
    const key =
      challengeFundingSourceKey(
        allocation.side,
        allocation.bucket,
      );

    result.set(
      key,
      (
        result.get(key) ??
        0
      ) +
      allocation.amountWolo,
    );
  }

  return result;
}

export function challengeSourceAllocationsEqual(
  left:
    readonly ChallengeFundingSourceAllocation[],
  right:
    readonly ChallengeFundingSourceAllocation[],
) {
  const leftMap =
    canonicalChallengeAllocationMap(
      left,
    );

  const rightMap =
    canonicalChallengeAllocationMap(
      right,
    );

  if (
    leftMap.size !==
    rightMap.size
  ) {
    return false;
  }

  for (
    const [
      key,
      amount,
    ]
    of leftMap
  ) {
    if (
      rightMap.get(key) !==
      amount
    ) {
      return false;
    }
  }

  return true;
}

type SourceClaim = {
  settlementId: number;
  amountWolo: number;
  recipientAddress: string;
};

export function reconcileChallengeSettlementSourceAccounting(
  input: {
    wagerAmountWolo: number;
    guaranteeAmountWolo: number;

    leftFunded: boolean;
    rightFunded: boolean;

    settlements:
      readonly ChallengeSettlementAccountingRow[];

    transfers:
      readonly ChallengePlannedAccountingTransfer[];
  },
): ChallengeSettlementSourceAccounting {
  const blockers: string[] = [];

  const claims =
    new Map<
      string,
      SourceClaim[]
    >();

  let executedSourceWolo = 0;
  let unclassifiedExecutedWolo = 0;
  let unprovenExecutedWolo = 0;

  /*
   * Original custody capacity.
   *
   * This is the maximum amount that each economic source
   * bucket can EVER authorize across every future planner.
   */
  const capacity =
    new Map<string, number>([
      [
        challengeFundingSourceKey(
          "left",
          "wager",
        ),

        input.leftFunded
          ? Math.max(
              0,
              input.wagerAmountWolo,
            )
          : 0,
      ],

      [
        challengeFundingSourceKey(
          "left",
          "guarantee",
        ),

        input.leftFunded
          ? Math.max(
              0,
              input.guaranteeAmountWolo,
            )
          : 0,
      ],

      [
        challengeFundingSourceKey(
          "right",
          "wager",
        ),

        input.rightFunded
          ? Math.max(
              0,
              input.wagerAmountWolo,
            )
          : 0,
      ],

      [
        challengeFundingSourceKey(
          "right",
          "guarantee",
        ),

        input.rightFunded
          ? Math.max(
              0,
              input.guaranteeAmountWolo,
            )
          : 0,
      ],
    ]);

  /*
   * Reconstruct historical consumption.
   *
   * Only executed rows consume custody principal.
   * Superseded/planned/failed/executing rows do not.
   */
  for (
    const settlement
    of input.settlements
  ) {
    if (
      normalizeStatus(
        settlement.status,
      ) !== "executed"
    ) {
      continue;
    }

    if (
      !settlement
        .txHash
        ?.trim()
    ) {
      unprovenExecutedWolo +=
        Math.max(
          0,
          settlement.amountWolo,
        );

      blockers.push(
        `Executed settlement #${settlement.id} ` +
        `has no transaction hash; its principal remains ` +
        `consumed but cannot be reused.`,
      );
    }

    const allocations =
      settlement.sourceAllocations ===
      undefined
        ? challengeSettlementSourceAllocationsForAction(
            {
              action:
                settlement.action,

              amountWolo:
                settlement.amountWolo,

              wagerAmountWolo:
                input.wagerAmountWolo,

              guaranteeAmountWolo:
                input.guaranteeAmountWolo,

              leftFunded:
                input.leftFunded,

              rightFunded:
                input.rightFunded,
            },
          )
        : [
            ...settlement
              .sourceAllocations,
          ];

    /*
     * A historical executed transfer is safe to classify
     * only when its mapped source lots account for the
     * exact executed amount.
     */
    if (
      allocations.length === 0 ||
      sumChallengeSourceAllocations(
        allocations,
      ) !==
        settlement.amountWolo
    ) {
      unclassifiedExecutedWolo +=
        Math.max(
          0,
          settlement.amountWolo,
        );

      blockers.push(
        `Executed settlement #${settlement.id} ` +
        `(${settlement.action}) cannot be mapped exactly ` +
        `to funded Challenge source buckets.`,
      );

      continue;
    }

    executedSourceWolo +=
      settlement.amountWolo;

    for (
      const allocation
      of allocations
    ) {
      const key =
        challengeFundingSourceKey(
          allocation.side,
          allocation.bucket,
        );

      const rows =
        claims.get(key) ??
        [];

      rows.push({
        settlementId:
          settlement.id,

        amountWolo:
          allocation.amountWolo,

        recipientAddress:
          normalizeAddress(
            settlement
              .recipientAddress,
          ),
      });

      claims.set(
        key,
        rows,
      );
    }
  }

  const sourceConsumptionWolo:
    Record<string, number> = {};

  /*
   * Per-source conservation.
   *
   * This is stronger than global conservation because a
   * different source bucket may never be used to disguise
   * overspending from another bucket.
   */
  for (
    const [
      key,
      rows,
    ]
    of claims
  ) {
    const consumed =
      rows.reduce(
        (
          sum,
          row,
        ) =>
          sum +
          row.amountWolo,
        0,
      );

    sourceConsumptionWolo[
      key
    ] = consumed;

    const funded =
      capacity.get(key) ??
      0;

    if (
      consumed >
      funded
    ) {
      blockers.push(
        `ESCROW SOURCE BREACH: ${key} records ` +
        `${consumed.toLocaleString()} WOLO consumed ` +
        `against ${funded.toLocaleString()} WOLO funded.`,
      );
    }
  }

  /*
   * Reconcile today's planner against historical custody
   * consumption.
   *
   * This is where planner representation can safely evolve:
   *
   * old:
   *   right wager+guarantee refund 1,010
   *
   * new:
   *   right wager refund 1,000
   *   right guarantee return 10
   *
   * Both new transfers are economically satisfied by the
   * old row if each exact source lot was already consumed
   * for the same recipient.
   */
  const transferAccounting =
    input.transfers.map(
      (
        transfer,
      ) => {
        const recipient =
          normalizeAddress(
            transfer
              .recipientAddress,
          );

        const settlementIds =
          new Set<number>();

        let availableCount = 0;
        let satisfiedCount = 0;

        let conflict:
          | string
          | null = null;

        if (
          transfer
            .sourceAllocations
            .length === 0 ||
          sumChallengeSourceAllocations(
            transfer
              .sourceAllocations,
          ) !==
            transfer
              .amountWolo
        ) {
          return {
            satisfiedByHistory:
              false,

            satisfiedBySettlementIds:
              [],

            blocker:
              `${transfer.label} does not declare an exact ` +
              `funded-source allocation for its ` +
              `${transfer.amountWolo.toLocaleString()} WOLO transfer.`,
          } satisfies ChallengeTransferSourceAccounting;
        }

        for (
          const allocation
          of transfer
            .sourceAllocations
        ) {
          const key =
            challengeFundingSourceKey(
              allocation.side,
              allocation.bucket,
            );

          const rows =
            claims.get(key) ??
            [];

          const totalConsumed =
            rows.reduce(
              (
                sum,
                row,
              ) =>
                sum +
                row.amountWolo,
              0,
            );

          const sameRecipientRows =
            rows.filter(
              (
                row,
              ) =>
                row
                  .recipientAddress ===
                recipient,
            );

          const sameRecipientConsumed =
            sameRecipientRows
              .reduce(
                (
                  sum,
                  row,
                ) =>
                  sum +
                  row.amountWolo,
                0,
              );

          if (
            totalConsumed === 0
          ) {
            availableCount += 1;
            continue;
          }

          if (
            sameRecipientConsumed >=
            allocation.amountWolo
          ) {
            satisfiedCount += 1;

            for (
              const row
              of sameRecipientRows
            ) {
              settlementIds.add(
                row.settlementId,
              );
            }

            continue;
          }

          const ids =
            rows
              .map(
                (
                  row,
                ) =>
                  `#${row.settlementId}`,
              )
              .join(", ");

          conflict =
            `ESCROW SOURCE CONFLICT: ${key} needed by ` +
            `${transfer.label} was already consumed by ` +
            `settlement ${ids || "history"} for a different ` +
            `or partial disposition.`;

          break;
        }

        /*
         * A combined transfer may not mix consumed and
         * unconsumed source lots. Sending the whole transfer
         * would replay the already-consumed component.
         */
        if (
          !conflict &&
          availableCount > 0 &&
          satisfiedCount > 0
        ) {
          conflict =
            `ESCROW SOURCE PARTIAL: ${transfer.label} mixes ` +
            `already-consumed and still-available source buckets; ` +
            `the combined transfer cannot execute safely.`;
        }

        return {
          satisfiedByHistory:
            !conflict &&
            satisfiedCount ===
              transfer
                .sourceAllocations
                .length &&
            transfer
              .sourceAllocations
              .length > 0,

          satisfiedBySettlementIds:
            [
              ...settlementIds,
            ].sort(
              (
                left,
                right,
              ) =>
                left -
                right,
            ),

          blocker:
            conflict,
        } satisfies ChallengeTransferSourceAccounting;
      },
    );

  for (
    const accounting
    of transferAccounting
  ) {
    if (
      accounting.blocker
    ) {
      blockers.push(
        accounting.blocker,
      );
    }
  }

  return {
    ok:
      blockers.length ===
      0,

    blockers:
      Array.from(
        new Set(
          blockers,
        ),
      ),

    executedSourceWolo,

    unclassifiedExecutedWolo,

    unprovenExecutedWolo,

    sourceConsumptionWolo,

    transferAccounting,
  };
}
