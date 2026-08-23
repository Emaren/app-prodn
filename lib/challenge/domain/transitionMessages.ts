function formatWolo(
  value: number,
) {
  return new Intl.NumberFormat(
    "en-US",
    {
      maximumFractionDigits:
        0,
    },
  ).format(
    value,
  );
}

function formatScheduledAtForInbox(
  date: Date,
) {
  return new Intl.DateTimeFormat(
    "en-US",
    {
      month:
        "short",

      day:
        "numeric",

      hour:
        "numeric",

      minute:
        "2-digit",
    },
  ).format(
    date,
  );
}

function challengeTimingNoticeLines(
  matchTime: Date | null,
) {
  return matchTime
    ? [
        `Start: ${
          formatScheduledAtForInbox(
            matchTime,
          )
        }`,

        `Start ISO: ${
          matchTime.toISOString()
        }`,
      ]
    : [
        "Play: Anytime after both sides fund",
      ];
}

export function formatChallengeWolo(
  value: number,
) {
  return formatWolo(
    value,
  );
}

export function buildTermsAcceptedMessage(
  input: {
    challengerName:
      string;

    challengedName:
      string;

    matchTime:
      Date | null;

    fundBy:
      Date | null;

    totalFundingWolo:
      number;

    nextStatus:
      string;
  },
) {
  return [
    "Challenge terms accepted",

    `${input.challengerName} vs ${input.challengedName}`,

    ...challengeTimingNoticeLines(
      input.matchTime,
    ),

    `Funding: ${
      formatWolo(
        input.totalFundingWolo,
      )
    } WOLO each`,

    input.fundBy
      ? `Fund by: ${
          formatScheduledAtForInbox(
            input.fundBy,
          )
        }`
      : null,

    input.fundBy
      ? `Fund by ISO: ${
          input.fundBy.toISOString()
        }`
      : null,

    `Status: ${input.nextStatus}`,
  ]
    .filter(
      Boolean,
    )
    .join(
      "\n",
    );
}

export function buildDeclineMessage(
  input: {
    challengerName:
      string;

    challengedName:
      string;

    matchTime:
      Date | null;
  },
) {
  return [
    "Challenge declined",

    `${input.challengerName} vs ${input.challengedName}`,

    ...challengeTimingNoticeLines(
      input.matchTime,
    ),

    "Status: Terms declined",
  ].join(
    "\n",
  );
}

export function buildCancellationMessage(
  input: {
    challengerName:
      string;

    challengedName:
      string;

    matchTime:
      Date | null;

    cancelledByName:
      string;

    refundPending?:
      boolean;
  },
) {
  const lines = [
    "Challenge cancelled",

    `${input.challengerName} vs ${input.challengedName}`,

    ...challengeTimingNoticeLines(
      input.matchTime,
    ),

    `Status: Cancelled by ${input.cancelledByName}`,
  ];

  if (
    input.refundPending
  ) {
    lines.push(
      "Refund: Pending operator review",
    );
  }

  return lines.join(
    "\n",
  );
}
