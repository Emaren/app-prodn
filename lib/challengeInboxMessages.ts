export type ChallengeInboxNoticeState =
  | "scheduled"
  | "accepted"
  | "declined"
  | "cancelled"
  | "rescheduled";

export type ChallengeInboxNotice = {
  state: ChallengeInboxNoticeState;
  compactHeadline: string;
  matchup: string | null;
  scheduledLabel: string | null;
  statusLabel: string | null;
  note: string | null;
  compactLine: string;
};

const CHALLENGE_NOTICE_HEADLINES: Record<
  string,
  {
    state: ChallengeInboxNoticeState;
    compactHeadline: string;
  }
> = {
  "Challenge scheduled": {
    state: "scheduled",
    compactHeadline: "Scheduled game",
  },
  "Challenge accepted": {
    state: "accepted",
    compactHeadline: "Game accepted",
  },
  "Challenge declined": {
    state: "declined",
    compactHeadline: "Game declined",
  },
  "Challenge cancelled": {
    state: "cancelled",
    compactHeadline: "Game cancelled",
  },
  "Challenge rescheduled": {
    state: "rescheduled",
    compactHeadline: "Game rescheduled",
  },
};

function readPrefixedLine(lines: string[], prefixes: string[]) {
  for (const line of lines) {
    for (const prefix of prefixes) {
      if (line.startsWith(prefix)) {
        return line.slice(prefix.length).trim() || null;
      }
    }
  }

  return null;
}

export function summarizeChallengeInboxMessage(
  body: string | null | undefined
): ChallengeInboxNotice | null {
  const trimmed = body?.trim();
  if (!trimmed) {
    return null;
  }

  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const headline = lines[0];
  const descriptor = CHALLENGE_NOTICE_HEADLINES[headline];
  if (!descriptor) {
    return null;
  }

  const matchup =
    lines[1] && !lines[1].includes(":")
      ? lines[1]
      : null;
  const scheduledLabel = readPrefixedLine(lines, ["Start:", "New start:"]);
  const statusLabel = readPrefixedLine(lines, ["Status:"]);
  const note = readPrefixedLine(lines, ["Note:"]);

  const compactParts = [
    descriptor.compactHeadline,
    matchup,
    scheduledLabel,
    statusLabel,
    note ? "note attached" : null,
  ];

  return {
    state: descriptor.state,
    compactHeadline: descriptor.compactHeadline,
    matchup,
    scheduledLabel,
    statusLabel,
    note,
    compactLine: compactParts.filter(Boolean).join(" · "),
  };
}
