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


export function formatChallengeScheduledAtForInbox(
  date: Date,
) {
  return formatScheduledAtForInbox(
    date,
  );
}


export function buildRescheduleMessage(
  input: {
    challengerName:
      string;

    challengedName:
      string;

    scheduledAt:
      Date;

    challengeNote:
      string | null;

    wagerAmountWolo:
      number;

    guaranteeAmountWolo:
      number;

    fundingPreserved?:
      boolean;

    accepted?:
      boolean;

    confirmed?:
      boolean;
  },
) {
  const totalFunding =
    input.wagerAmountWolo +
    input.guaranteeAmountWolo;

  const lines = [
    input.confirmed
      ? "Challenge time confirmed"
      : "Challenge time proposed",

    `${input.challengerName} vs ${input.challengedName}`,

    `${
      input.confirmed
        ? "Start"
        : "Proposed match time"
    }: ${
      formatScheduledAtForInbox(
        input.scheduledAt,
      )
    }`,

    `Match time ISO: ${
      input.scheduledAt.toISOString()
    }`,

    `Wolo Wager: ${
      formatWolo(
        input.wagerAmountWolo,
      )
    } WOLO`,

    `Match Guarantee: ${
      formatWolo(
        input.guaranteeAmountWolo,
      )
    } WOLO`,

    `Funding: ${
      formatWolo(
        totalFunding,
      )
    } WOLO each`,

    input.confirmed
      ? "Status: Exact time confirmed"
      : input.fundingPreserved
        ? "Status: Funding preserved · waiting for the other player to confirm the time"
        : input.accepted
          ? "Status: Challenge accepted · waiting for the other player to confirm the time"
          : "Status: Awaiting acceptance",
  ];

  if (
    input.challengeNote
  ) {
    lines.push(
      `Note: ${input.challengeNote}`,
    );
  }

  return lines.join(
    "\n",
  );
}


export function buildFundingMessage(
  input: {
    challengerName:
      string;

    challengedName:
      string;

    matchTime:
      Date | null;

    actorName:
      string;

    totalFundingWolo:
      number;

    statusLabel:
      string;
  },
) {
  return [
    "Challenge funding recorded",

    `${input.challengerName} vs ${input.challengedName}`,

    ...challengeTimingNoticeLines(
      input.matchTime,
    ),

    `Funding: ${
      input.actorName
    } locked ${
      formatWolo(
        input.totalFundingWolo,
      )
    } WOLO`,

    `Status: ${input.statusLabel}`,
  ].join(
    "\n",
  );
}


export function buildCheckInMessage(
  input: {
    challengerName:
      string;

    challengedName:
      string;

    scheduledAt:
      Date;

    actorName:
      string;

    statusLabel:
      string;
  },
) {
  return [
    input.statusLabel ===
      "Ready"
      ? "Challenge ready"
      : "Challenge check-in recorded",

    `${input.challengerName} vs ${input.challengedName}`,

    `Start: ${
      formatScheduledAtForInbox(
        input.scheduledAt,
      )
    }`,

    `Start ISO: ${
      input.scheduledAt.toISOString()
    }`,

    `Status: ${input.actorName} checked in`,

    input.statusLabel ===
      "Ready"
      ? "Lock: Both players checked in"
      : "Lock: Waiting on the other side",
  ].join(
    "\n",
  );
}


export function buildNoShowMessage(
  input: {
    challengerName:
      string;

    challengedName:
      string;

    scheduledAt:
      Date;

    resolutionLabel:
      string | null;

    statusDetail:
      string;
  },
) {
  return [
    "Challenge no-show resolved",

    `${input.challengerName} vs ${input.challengedName}`,

    `Start: ${
      formatScheduledAtForInbox(
        input.scheduledAt,
      )
    }`,

    `Start ISO: ${
      input.scheduledAt.toISOString()
    }`,

    `Status: ${
      input.resolutionLabel ||
      "No-show resolved"
    }`,

    input.statusDetail,
  ].join(
    "\n",
  );
}
