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
  const identity = [clanCallsign.trim(), playerName.trim()]
    .filter(Boolean)
    .join(" ");

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
