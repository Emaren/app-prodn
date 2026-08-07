const CLAN_LEADER_APPOINTED_PHRASE =
  "You have been selected leader of the clan.";
const CLAN_LEADER_REMOVED_PHRASE =
  "Your watch as leader of the clan has ended.";

export type ClanProtocolMessage = {
  body: string;
  kind: "leader-appointed" | "leader-removed";
};

function compactProtocolBody(body: string) {
  return body.replace(/\s+/g, " ").trim();
}

export function buildClanLeaderProtocolMessage({
  clanCallsign,
  playerName,
  granting,
}: {
  clanCallsign: string;
  playerName: string;
  granting: boolean;
}) {
  const callsign = clanCallsign.trim();
  const player = playerName.trim();
  const possessiveRoot = callsign
    .replace(/[’']s$/i, "")
    .trim()
    .toLowerCase();
  const playerFirstToken =
    player.split(/\s+/).filter(Boolean)[0]?.toLowerCase() ??
    "";

  const identity =
    callsign &&
    player &&
    possessiveRoot &&
    (possessiveRoot === player.toLowerCase() ||
      possessiveRoot === playerFirstToken)
      ? `${callsign} Clan`
      : [callsign, player].filter(Boolean).join(" ");

  return granting
    ? `🏰 ${CLAN_LEADER_APPOINTED_PHRASE} ⚔️ • ${identity} 🛡️`
    : `🏰 ${CLAN_LEADER_REMOVED_PHRASE} ⚔️ • ${identity} 🛡️`;
}

export function parseClanProtocolMessage(
  body: string | null | undefined
): ClanProtocolMessage | null {
  if (!body) return null;

  const compactBody = compactProtocolBody(body);
  if (compactBody.includes(CLAN_LEADER_APPOINTED_PHRASE)) {
    return {
      body: compactBody,
      kind: "leader-appointed",
    };
  }

  if (compactBody.includes(CLAN_LEADER_REMOVED_PHRASE)) {
    return {
      body: compactBody,
      kind: "leader-removed",
    };
  }

  return null;
}
