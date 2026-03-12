import type {
  AdminReplayCandidate,
  LobbyReplayPlayer,
  LobbyTournamentEntrant,
  LobbyTournamentMatchProof,
} from "@/lib/lobby";

type ReplayProofSource = {
  id: number;
  replayHash: string;
  winner: string | null;
  players: unknown;
  played_on: Date | string | null;
  timestamp: Date | string | null;
  map: unknown;
  original_filename: string | null;
};

function toIsoString(value: Date | string | null | undefined) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function normalizeNameVariant(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

function compactNameVariant(value: string) {
  return normalizeNameVariant(value).replace(/[^\p{L}\p{N}]+/gu, "");
}

function buildNameVariants(value: string | null | undefined) {
  if (!value) return [];

  const base = normalizeNameVariant(value);
  if (!base) return [];

  const variants = new Set<string>([base]);
  const compact = compactNameVariant(value);
  if (compact) {
    variants.add(compact);
  }

  return [...variants];
}

function entrantIdentityVariants(entrant: LobbyTournamentEntrant | null | undefined) {
  if (!entrant) return [];

  return [
    ...buildNameVariants(entrant.inGameName),
    ...buildNameVariants(entrant.steamPersonaName),
  ];
}

function replayPlayerVariants(player: LobbyReplayPlayer) {
  return buildNameVariants(player.name);
}

function extractMapName(mapValue: unknown) {
  if (typeof mapValue === "string") return mapValue;
  if (mapValue && typeof mapValue === "object" && "name" in mapValue) {
    const name = (mapValue as { name?: unknown }).name;
    return typeof name === "string" ? name : null;
  }
  return null;
}

export function parseReplayPlayers(value: unknown): LobbyReplayPlayer[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((player) => {
      if (!player || typeof player !== "object") return null;
      const data = player as { name?: unknown; winner?: unknown };
      const name = typeof data.name === "string" ? data.name.trim() : "";
      if (!name) return null;

      return {
        name,
        winner:
          typeof data.winner === "boolean"
            ? data.winner
            : data.winner == null
              ? null
              : Boolean(data.winner),
      } satisfies LobbyReplayPlayer;
    })
    .filter((player): player is LobbyReplayPlayer => Boolean(player));
}

export function summarizeReplayProof(
  replay: ReplayProofSource | null | undefined
): LobbyTournamentMatchProof | null {
  if (!replay) return null;

  return {
    gameStatsId: replay.id,
    replayHash: replay.replayHash,
    winner: replay.winner,
    playedOn: toIsoString(replay.played_on) || toIsoString(replay.timestamp),
    mapName: extractMapName(replay.map),
    originalFilename: replay.original_filename,
    players: parseReplayPlayers(replay.players),
  };
}

export function replayMatchesEntrant(
  replay: LobbyTournamentMatchProof,
  entrant: LobbyTournamentEntrant | null | undefined
) {
  if (!entrant?.entryId) return false;

  const entrantVariants = new Set(entrantIdentityVariants(entrant));
  if (entrantVariants.size === 0) return false;

  return replay.players.some((player) =>
    replayPlayerVariants(player).some((variant) => entrantVariants.has(variant))
  );
}

export function getReplayMatchedEntryIds(
  replay: LobbyTournamentMatchProof,
  entrants: LobbyTournamentEntrant[]
) {
  return entrants
    .filter((entrant) => replayMatchesEntrant(replay, entrant))
    .map((entrant) => entrant.entryId)
    .filter((entryId): entryId is number => typeof entryId === "number");
}

export function inferReplayWinnerEntryId(
  replay: LobbyTournamentMatchProof,
  playerOne: LobbyTournamentEntrant | null | undefined,
  playerTwo: LobbyTournamentEntrant | null | undefined
) {
  const contenders = [playerOne, playerTwo].filter(
    (entrant): entrant is LobbyTournamentEntrant =>
      Boolean(entrant && typeof entrant.entryId === "number")
  );
  if (contenders.length === 0) return null;

  const winnerCandidates = new Set<string>(buildNameVariants(replay.winner));
  if (winnerCandidates.size === 0) {
    for (const player of replay.players) {
      if (player.winner) {
        for (const variant of replayPlayerVariants(player)) {
          winnerCandidates.add(variant);
        }
      }
    }
  }

  if (winnerCandidates.size === 0) return null;

  const matches = contenders.filter((entrant) =>
    entrantIdentityVariants(entrant).some((variant) => winnerCandidates.has(variant))
  );

  if (matches.length !== 1) return null;
  return matches[0].entryId;
}

export function replayMatchesAssignedPlayers(
  replay: LobbyTournamentMatchProof,
  playerOne: LobbyTournamentEntrant | null | undefined,
  playerTwo: LobbyTournamentEntrant | null | undefined
) {
  if (!playerOne?.entryId || !playerTwo?.entryId) return false;
  return replayMatchesEntrant(replay, playerOne) && replayMatchesEntrant(replay, playerTwo);
}

export function toReplayCandidate(
  replay: ReplayProofSource,
  entrants: LobbyTournamentEntrant[]
): AdminReplayCandidate {
  const proof = summarizeReplayProof(replay);
  if (!proof) {
    return {
      gameStatsId: replay.id,
      replayHash: replay.replayHash,
      winner: replay.winner,
      playedOn: toIsoString(replay.played_on) || toIsoString(replay.timestamp),
      mapName: extractMapName(replay.map),
      originalFilename: replay.original_filename,
      players: [],
      matchedEntryIds: [],
      matchedEntrantNames: [],
    };
  }

  const matchedEntryIds = getReplayMatchedEntryIds(proof, entrants);
  const matchedEntrantNames = entrants
    .filter((entrant) => matchedEntryIds.includes(entrant.entryId ?? -1))
    .map((entrant) => entrant.inGameName || entrant.steamPersonaName || entrant.uid);

  return {
    ...proof,
    matchedEntryIds,
    matchedEntrantNames,
  };
}
