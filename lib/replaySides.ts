import {
  displayPlayerName,
  parsePlayers,
} from "@/lib/gameStatsView";

export type ReplaySideFormat =
  | "1v1"
  | "2v2"
  | "3v3"
  | "4v4";

export type ReplaySideMember = {
  name: string;
  player: Record<string, unknown>;
};

export type ParsedReplaySides = {
  format: ReplaySideFormat;
  teamSize: number;
  confidence: "duel" | "explicit_balanced";
  left: ReplaySideMember[];
  right: ReplaySideMember[];
};

const TEAM_KEYS = [
  "team",
  "teamNumber",
  "team_number",
  "teamId",
  "team_id",
] as const;

function normalizeName(value: unknown) {
  const name = String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 64);

  if (
    !name ||
    name.toLowerCase() === "unknown" ||
    name.toLowerCase() === "unknown player"
  ) {
    return "";
  }

  return name;
}

function readTeamValue(
  player: Record<string, unknown>
) {
  let rawTeam: unknown = null;

  for (const key of TEAM_KEYS) {
    if (player[key] !== undefined && player[key] !== null) {
      rawTeam = player[key];
      break;
    }
  }

  if (typeof rawTeam === "number") {
    // HD replay team IDs may be zero-based. Team 0 is a
    // legitimate side when the replay still resolves into
    // exactly two balanced teams.
    if (!Number.isFinite(rawTeam) || rawTeam < 0) {
      return null;
    }

    return String(Math.trunc(rawTeam));
  }

  const team = String(rawTeam ?? "")
    .trim()
    .replace(/\s+/g, " ");

  if (
    !team ||
    team === "-1" ||
    ["none", "null", "unknown", "ffa"].includes(
      team.toLowerCase()
    )
  ) {
    return null;
  }

  return team;
}

function teamSortKey(team: string) {
  const numeric = Number(team);

  return Number.isFinite(numeric)
    ? numeric
    : Number.MAX_SAFE_INTEGER;
}

function readDistinctMembers(players: unknown) {
  const members: ReplaySideMember[] = [];
  const seen = new Set<string>();

  for (const player of parsePlayers(players)) {
    const name = normalizeName(
      displayPlayerName(player)
    );

    if (!name) continue;

    const key = name.toLowerCase();

    if (seen.has(key)) continue;

    seen.add(key);
    members.push({
      name,
      player,
    });
  }

  return members;
}

export function parseReplaySides(
  players: unknown
): ParsedReplaySides | null {
  const members = readDistinctMembers(players);

  if (members.length === 2) {
    return {
      format: "1v1",
      teamSize: 1,
      confidence: "duel",
      left: [members[0]],
      right: [members[1]],
    };
  }

  if (![4, 6, 8].includes(members.length)) {
    return null;
  }

  const expectedTeamSize = members.length / 2;
  const teams = new Map<string, ReplaySideMember[]>();

  for (const member of members) {
    const team = readTeamValue(member.player);

    if (!team) {
      return null;
    }

    const current = teams.get(team) || [];
    current.push(member);
    teams.set(team, current);
  }

  const teamEntries = [...teams.entries()]
    .filter(([, teamMembers]) => teamMembers.length > 0)
    .sort(
      (left, right) =>
        teamSortKey(left[0]) - teamSortKey(right[0]) ||
        left[0].localeCompare(right[0])
    );

  if (
    teamEntries.length !== 2 ||
    teamEntries.some(
      ([, teamMembers]) =>
        teamMembers.length !== expectedTeamSize
    )
  ) {
    return null;
  }

  return {
    format: `${expectedTeamSize}v${expectedTeamSize}` as
      | "2v2"
      | "3v3"
      | "4v4",
    teamSize: expectedTeamSize,
    confidence: "explicit_balanced",
    left: teamEntries[0][1],
    right: teamEntries[1][1],
  };
}

export function teamRivalryFormatLabel(
  format: ReplaySideFormat
) {
  switch (format) {
    case "1v1":
      return "Duel";
    case "2v2":
      return "Tag Team";
    case "3v3":
      return "Tri-Team";
    case "4v4":
      return "War Team";
  }
}
