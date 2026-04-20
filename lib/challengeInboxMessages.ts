export type ChallengeInboxNoticeState =
  | "scheduled"
  | "accepted"
  | "terms_accepted"
  | "funding"
  | "checkin"
  | "ready"
  | "no_show"
  | "result_ready"
  | "declined"
  | "cancelled"
  | "rescheduled";

export type ChallengeInboxNotice = {
  state: ChallengeInboxNoticeState;
  challengeId: number | null;
  compactHeadline: string;
  matchup: string | null;
  scheduledLabel: string | null;
  statusLabel: string | null;
  note: string | null;
  compactLine: string;
};

export const CHALLENGE_NOTICE_HEADLINES: Record<
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
  "Challenge terms accepted": {
    state: "terms_accepted",
    compactHeadline: "Terms accepted",
  },
  "Challenge accepted": {
    state: "accepted",
    compactHeadline: "Game accepted",
  },
  "Challenge funding recorded": {
    state: "funding",
    compactHeadline: "Funding recorded",
  },
  "Challenge check-in recorded": {
    state: "checkin",
    compactHeadline: "Check-in",
  },
  "Challenge ready": {
    state: "ready",
    compactHeadline: "Match ready",
  },
  "Challenge no-show resolved": {
    state: "no_show",
    compactHeadline: "No-show resolved",
  },
  "Challenge result ready": {
    state: "result_ready",
    compactHeadline: "Result ready",
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

function parseChallengeId(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value.replace(/^#/, "").trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
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
  const fundingLabel = readPrefixedLine(lines, ["Funding:"]);
  const statusLabel = readPrefixedLine(lines, ["Status:"]);
  const note = readPrefixedLine(lines, ["Note:"]);
  const challengeId = parseChallengeId(readPrefixedLine(lines, ["Challenge ID:", "Match ID:"]));

  const compactParts = [
    descriptor.compactHeadline,
    matchup,
    scheduledLabel,
    fundingLabel,
    statusLabel,
    note ? "note attached" : null,
  ];

  return {
    state: descriptor.state,
    challengeId,
    compactHeadline: descriptor.compactHeadline,
    matchup,
    scheduledLabel,
    statusLabel,
    note,
    compactLine: compactParts.filter(Boolean).join(" · "),
  };
}

export function isChallengeInboxNoticeBody(body: string | null | undefined) {
  const summary = summarizeChallengeInboxMessage(body);
  return Boolean(
    summary &&
      (summary.challengeId ||
        summary.matchup ||
        summary.scheduledLabel ||
        summary.statusLabel ||
        summary.note)
  );
}

export function addChallengeIdToInboxNotice(body: string, challengeId: number | null | undefined) {
  if (!challengeId || !Number.isFinite(challengeId)) {
    return body;
  }

  const lines = body.split(/\r?\n/);
  if (lines.some((line) => line.trim().startsWith("Challenge ID:"))) {
    return body;
  }

  const insertAt = lines[1] && !lines[1].includes(":") ? 2 : 1;
  return [
    ...lines.slice(0, insertAt),
    `Challenge ID: #${challengeId}`,
    ...lines.slice(insertAt),
  ].join("\n");
}
