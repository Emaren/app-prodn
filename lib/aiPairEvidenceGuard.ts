export type PositivePairEvidenceGuard = {
  queryPlayers: [string, string];
  displayPlayers: [string, string];
  meetingsFound: number;
  oneVOneOpponents: number;
  teamOpponents: number;
  teammates: number;
  firstPlayerWins: number;
  secondPlayerWins: number;
  winsTogether: number;
  lossesTogether: number;
  unknownResults: number;
  summary: string;
};

function readCount(source: string, key: string) {
  const match = source.match(
    new RegExp(`"${key}"\\s*:\\s*(\\d+)`),
  );
  if (!match) return null;

  const value = Number.parseInt(match[1], 10);
  return Number.isSafeInteger(value) ? value : null;
}

function displayQueryPlayer(message: string, normalizedPlayer: string) {
  const index = message.toLowerCase().indexOf(normalizedPlayer.toLowerCase());
  if (index >= 0) {
    return message
      .slice(index, index + normalizedPlayer.length)
      .trim()
      .slice(0, 80);
  }
  return normalizedPlayer.trim().slice(0, 80);
}

function plural(value: number, singular: string, pluralValue = `${singular}s`) {
  return value === 1 ? singular : pluralValue;
}

export function buildPositivePairEvidenceGuard(args: {
  kingdomKnowledgeContext: string;
  userMessage: string;
}): PositivePairEvidenceGuard | null {
  const markerIndex = args.kingdomKnowledgeContext.indexOf(
    '"pairArchiveEvidence"',
  );
  if (markerIndex < 0) return null;

  // Aggregate pair truth is emitted before the meetings array. Parse only the
  // bounded header so repository serialization can remain independently capped.
  const evidenceHeader = args.kingdomKnowledgeContext.slice(
    markerIndex,
    markerIndex + 2_500,
  );

  const players = evidenceHeader.match(
    /"queryPlayers"\s*:\s*\[\s*"([^"]+)"\s*,\s*"([^"]+)"/,
  );
  if (!players) return null;

  const meetingsFound = readCount(evidenceHeader, "meetingsFound");
  const oneVOneOpponents = readCount(evidenceHeader, "oneVOneOpponents");
  const teamOpponents = readCount(evidenceHeader, "teamOpponents");
  const teammates = readCount(evidenceHeader, "teammates");
  const firstPlayerWins = readCount(evidenceHeader, "firstPlayerWins");
  const secondPlayerWins = readCount(evidenceHeader, "secondPlayerWins");
  const winsTogether = readCount(evidenceHeader, "winsTogether");
  const lossesTogether = readCount(evidenceHeader, "lossesTogether");
  const unknownResults = readCount(evidenceHeader, "unknownResults");

  if (
    meetingsFound === null ||
    oneVOneOpponents === null ||
    teamOpponents === null ||
    teammates === null ||
    firstPlayerWins === null ||
    secondPlayerWins === null ||
    winsTogether === null ||
    lossesTogether === null ||
    unknownResults === null ||
    meetingsFound <= 0
  ) {
    return null;
  }

  const queryPlayers: [string, string] = [players[1], players[2]];
  const displayPlayers: [string, string] = [
    displayQueryPlayer(args.userMessage, queryPlayers[0]),
    displayQueryPlayer(args.userMessage, queryPlayers[1]),
  ];

  const [firstPlayer, secondPlayer] = displayPlayers;

  const summary = [
    `${firstPlayer} and ${secondPlayer} have ${meetingsFound} public ${plural(meetingsFound, "meeting")}: ${oneVOneOpponents} ${oneVOneOpponents === 1 ? "1v1" : "1v1s"}, ${teamOpponents} team ${plural(teamOpponents, "game")} as opponents, and ${teammates} as teammates.`,
    `${firstPlayer} won ${firstPlayerWins} opponent ${plural(firstPlayerWins, "meeting")}, ${secondPlayer} won ${secondPlayerWins}; together they went ${winsTogether}-${lossesTogether}${unknownResults > 0 ? ` with ${unknownResults} unresolved` : ""}.`,
  ].join(" ");

  return {
    queryPlayers,
    displayPlayers,
    meetingsFound,
    oneVOneOpponents: oneVOneOpponents!,
    teamOpponents: teamOpponents!,
    teammates: teammates!,
    firstPlayerWins: firstPlayerWins!,
    secondPlayerWins: secondPlayerWins!,
    winsTogether: winsTogether!,
    lossesTogether: lossesTogether!,
    unknownResults: unknownResults!,
    summary,
  };
}

export function providerReplyContradictsPositivePairEvidence(value: string) {
  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact) return false;

  return [
    /\bno public record\b/i,
    /\bno record\b.{0,100}\b(?:match|matches|meeting|meetings|played|teammate|teammates|opponent|opponents)\b/i,
    /\bno (?:public )?(?:match|matches|meeting|meetings)\b/i,
    /\b(?:have|has) not played\b/i,
    /\bhaven['’]?t played\b/i,
    /\bnever played\b/i,
    /\bno evidence\b.{0,100}\b(?:match|meeting|played|teammate|opponent)\b/i,
  ].some((pattern) => pattern.test(compact));
}
