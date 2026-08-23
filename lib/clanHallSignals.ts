export type ClanHallSignalKind = "mention" | "clan";

export type ClanHallSignalRosterEntry = {
  uid: string;
  displayName: string;
};

export type ParsedClanHallSignal = {
  kind: ClanHallSignalKind;
  clanSlug: string;
  clanName: string;
  messageId: number;
  authorName: string;
  preview: string;
};

const SIGNAL_MARKER = "[AOE2WAR_CLAN_HALL_SIGNAL_V1]";

const CLAN_BROADCAST_PATTERN =
  /(^|[^\p{L}\p{N}_])@clan(?=$|[^\p{L}\p{N}_])/iu;

const CLAN_BROADCAST_REPLACE_PATTERN =
  /(^|[^\p{L}\p{N}_])@clan(?=$|[^\p{L}\p{N}_])/giu;

function compactWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function fold(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLocaleLowerCase("en-US");
}

function words(value: string) {
  return fold(value).match(/[\p{L}\p{N}]+/gu) ?? [];
}

function compactName(value: string) {
  return words(value).join("");
}

function editDistanceAtMostOne(left: string, right: string) {
  if (left === right) return 0;

  const leftLength = left.length;
  const rightLength = right.length;

  if (Math.abs(leftLength - rightLength) > 1) return 2;

  if (leftLength === rightLength) {
    let differences = 0;

    for (let index = 0; index < leftLength; index += 1) {
      if (left[index] !== right[index]) {
        differences += 1;
        if (differences > 1) return 2;
      }
    }

    return differences;
  }

  const shorter = leftLength < rightLength ? left : right;
  const longer = leftLength < rightLength ? right : left;

  let shortIndex = 0;
  let longIndex = 0;
  let edits = 0;

  while (shortIndex < shorter.length && longIndex < longer.length) {
    if (shorter[shortIndex] === longer[longIndex]) {
      shortIndex += 1;
      longIndex += 1;
      continue;
    }

    edits += 1;
    if (edits > 1) return 2;

    longIndex += 1;
  }

  if (longIndex < longer.length) edits += 1;

  return edits <= 1 ? 1 : 2;
}

type PreparedRosterEntry = {
  uid: string;
  displayName: string;
  normalized: string;
  tokenCount: number;
};

function prepareRoster(
  roster: ClanHallSignalRosterEntry[],
  authorUid: string,
) {
  const seen = new Set<string>();
  const prepared: PreparedRosterEntry[] = [];

  for (const member of roster) {
    if (!member.uid || member.uid === authorUid) continue;

    const normalized = compactName(member.displayName);
    const tokenCount = words(member.displayName).length;

    if (!normalized || tokenCount < 1) continue;

    const key = `${member.uid}:${normalized}`;
    if (seen.has(key)) continue;
    seen.add(key);

    prepared.push({
      uid: member.uid,
      displayName: member.displayName,
      normalized,
      tokenCount,
    });
  }

  return prepared;
}

export function containsClanBroadcast(body: string) {
  return CLAN_BROADCAST_PATTERN.test(body);
}

export function resolveClanHallSignalRecipients(input: {
  body: string;
  authorUid: string;
  roster: ClanHallSignalRosterEntry[];
  allowClanBroadcast: boolean;
}) {
  const recipients = new Map<string, ClanHallSignalKind>();

  const roster = prepareRoster(input.roster, input.authorUid);

  if (input.allowClanBroadcast && containsClanBroadcast(input.body)) {
    for (const member of roster) {
      recipients.set(member.uid, "clan");
    }
  }

  if (roster.length === 0) return recipients;

  const searchableBody = input.body.replace(
    CLAN_BROADCAST_REPLACE_PATTERN,
    "$1 ",
  );

  const messageWords = words(searchableBody);
  if (messageWords.length === 0) return recipients;

  const maxNameTokens = Math.min(
    6,
    Math.max(...roster.map((member) => member.tokenCount)),
  );

  const explicitRecipients = new Set<string>();

  for (let start = 0; start < messageWords.length; start += 1) {
    for (
      let width = 1;
      width <= maxNameTokens && start + width <= messageWords.length;
      width += 1
    ) {
      const candidate = messageWords.slice(start, start + width).join("");
      if (!candidate) continue;

      let bestDistance = 2;
      let bestUids: string[] = [];

      for (const member of roster) {
        if (member.tokenCount !== width) continue;
        if (Math.abs(member.normalized.length - candidate.length) > 1) {
          continue;
        }

        let distance = 2;

        if (candidate === member.normalized) {
          distance = 0;
        } else if (
          member.normalized.length >= 6 &&
          candidate.length >= 6 &&
          member.normalized.slice(0, 2) === candidate.slice(0, 2)
        ) {
          distance = editDistanceAtMostOne(
            candidate,
            member.normalized,
          );
        }

        if (distance > 1) continue;

        if (distance < bestDistance) {
          bestDistance = distance;
          bestUids = [member.uid];
        } else if (
          distance === bestDistance &&
          !bestUids.includes(member.uid)
        ) {
          bestUids.push(member.uid);
        }
      }

      // Ambiguous fuzzy/exact matches intentionally notify nobody.
      if (bestDistance <= 1 && bestUids.length === 1) {
        explicitRecipients.add(bestUids[0]);
      }
    }
  }

  // An explicit name call is stronger than the broad @Clan call.
  for (const uid of explicitRecipients) {
    recipients.set(uid, "mention");
  }

  return recipients;
}

function encodeField(value: string) {
  return encodeURIComponent(value);
}

function decodeField(value: string | undefined) {
  if (typeof value !== "string") return null;

  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

export function buildClanHallSignalBody(input: {
  kind: ClanHallSignalKind;
  clanSlug: string;
  clanName: string;
  messageId: number;
  authorName: string;
  preview: string;
}) {
  const preview = compactWhitespace(input.preview).slice(0, 900);

  const headline =
    input.kind === "mention"
      ? `🏰 ${input.clanName} · ${input.authorName} mentioned you in the Hall`
      : `🏰 ${input.clanName} · ${input.authorName} called @Clan`;

  return [
    headline,
    SIGNAL_MARKER,
    `kind=${input.kind}`,
    `clanSlug=${encodeField(input.clanSlug)}`,
    `clanName=${encodeField(input.clanName)}`,
    `messageId=${input.messageId}`,
    `authorName=${encodeField(input.authorName)}`,
    `preview=${encodeField(preview)}`,
  ].join("\n");
}

export function parseClanHallSignalBody(
  body: string | null | undefined,
): ParsedClanHallSignal | null {
  if (!body?.includes(SIGNAL_MARKER)) return null;

  const lines = body.split(/\r?\n/);
  const markerIndex = lines.indexOf(SIGNAL_MARKER);
  if (markerIndex < 0) return null;

  const fields = new Map<string, string>();

  for (const line of lines.slice(markerIndex + 1)) {
    const separator = line.indexOf("=");
    if (separator <= 0) continue;

    fields.set(
      line.slice(0, separator),
      line.slice(separator + 1),
    );
  }

  const kind = fields.get("kind");
  if (kind !== "mention" && kind !== "clan") return null;

  const clanSlug = decodeField(fields.get("clanSlug"));
  const clanName = decodeField(fields.get("clanName"));
  const authorName = decodeField(fields.get("authorName"));
  const preview = decodeField(fields.get("preview"));

  const messageId = Number.parseInt(
    fields.get("messageId") ?? "",
    10,
  );

  if (
    !clanSlug ||
    !/^[a-z0-9][a-z0-9_-]{0,79}$/i.test(clanSlug) ||
    !clanName ||
    !authorName ||
    !Number.isSafeInteger(messageId) ||
    messageId < 1
  ) {
    return null;
  }

  return {
    kind,
    clanSlug,
    clanName: clanName.slice(0, 160),
    messageId,
    authorName: authorName.slice(0, 160),
    preview: (preview ?? "").slice(0, 900),
  };
}
