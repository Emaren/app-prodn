import {
  displayPlayerName,
  parsePlayers,
} from "@/lib/gameStatsView";

import {
  normalizePublicReplayText,
} from "@/lib/unresolvedWatcherResult";

export type ReplayTeamDisplayInput = {
  players?: unknown;
  key_events?: unknown;
  keyEvents?: unknown;
};

export type ReplayTeamPresentation = {
  status: "resolved" | "unresolved";
  format: string | null;
  matchupLabel: string;
  teams: Array<{
    teamKey: string;
    names: string[];
  }>;
};

type UnknownRecord =
  Record<string, unknown>;

function readRecord(
  value: unknown
): UnknownRecord {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    return value as UnknownRecord;
  }

  if (
    typeof value === "string" &&
    value.trim()
  ) {
    try {
      const parsed =
        JSON.parse(value) as unknown;

      if (
        parsed &&
        typeof parsed === "object" &&
        !Array.isArray(parsed)
      ) {
        return parsed as UnknownRecord;
      }
    } catch {
      return {};
    }
  }

  return {};
}

function normalizedName(
  value: unknown
) {
  return normalizePublicReplayText(
    value
  );
}

function teamEntryName(
  value: unknown
) {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    return normalizedName(
      (
        value as UnknownRecord
      ).name
    );
  }

  return normalizedName(
    value
  );
}

function sameNameMultiset(
  left: string[],
  right: string[]
) {
  const normalize =
    (values: string[]) =>
      values
        .map(
          (value) =>
            value
              .trim()
              .toLowerCase()
        )
        .filter(Boolean)
        .sort();

  const normalizedLeft =
    normalize(left);

  const normalizedRight =
    normalize(right);

  return (
    normalizedLeft.length ===
      normalizedRight.length &&
    normalizedLeft.every(
      (value, index) =>
        value ===
        normalizedRight[index]
    )
  );
}

function parsedRoster(
  value: unknown
) {
  return parsePlayers(
    value
  ) as Array<
    Record<string, unknown>
  >;
}

function rosterNames(
  players: Array<
    Record<string, unknown>
  >
) {
  return players
    .map(
      (player) =>
        normalizedName(
          displayPlayerName(
            player
          )
        )
    )
    .filter(
      (
        name
      ): name is string =>
        Boolean(name)
    );
}

function fallbackRosterLabel(
  names: string[],
  unavailableLabel: string
) {
  if (
    names.length >=
    2
  ) {
    return names.join(
      " · "
    );
  }

  if (
    names.length ===
    1
  ) {
    return names[0];
  }

  return unavailableLabel;
}

function matchupLabel(
  teams: Array<{
    names: string[];
  }>
) {
  return teams
    .map(
      (team) =>
        team.names.join(
          " / "
        )
    )
    .join(
      " vs "
    );
}

function resolvedPresentation(
  teams: Array<{
    teamKey: string;
    names: string[];
  }>,
  format: string | null
): ReplayTeamPresentation {
  return {
    status: "resolved",
    format,
    matchupLabel:
      matchupLabel(teams),
    teams,
  };
}

export function resolveReplayTeamPresentation(
  game: ReplayTeamDisplayInput,
  unavailableLabel =
    "Roster unresolved"
): ReplayTeamPresentation {
  const players =
    parsedRoster(
      game.players
    );

  const visibleNames =
    rosterNames(
      players
    );

  const fallback = (): ReplayTeamPresentation => ({
    status: "unresolved",
    format: null,
    matchupLabel:
      fallbackRosterLabel(
        visibleNames,
        unavailableLabel
      ),
    teams: [],
  });

  const keyEvents =
    readRecord(
      game.key_events ??
      game.keyEvents
    );

  const teamResolution =
    readRecord(
      keyEvents
        .team_resolution
    );

  const rawTeams =
    Array.isArray(
      teamResolution.teams
    )
      ? teamResolution.teams
      : [];

  const resolvedTeams =
    rawTeams
      .map(
        (value, index) => {
          const team =
            readRecord(
              value
            );

          const names =
            Array.isArray(
              team.players
            )
              ? team.players
                  .map(
                    teamEntryName
                  )
                  .filter(
                    (
                      name
                    ): name is string =>
                      Boolean(name)
                  )
              : [];

          return {
            teamKey:
              String(
                team.team_key ??
                team.teamKey ??
                team.team_id ??
                team.teamId ??
                index
              ),

            names,
          };
        }
      )
      .filter(
        (team) =>
          team.names.length >
          0
      );

  /*
   * The canonical parser contract wins only when it provides
   * exactly two complete teams covering the visible roster.
   */
  if (
    resolvedTeams.length ===
    2
  ) {
    const resolvedNames =
      resolvedTeams.flatMap(
        (team) =>
          team.names
      );

    if (
      sameNameMultiset(
        resolvedNames,
        visibleNames
      )
    ) {
      const format =
        normalizedName(
          teamResolution.format
        ) ??
        (
          resolvedTeams[0].names.length ===
          resolvedTeams[1].names.length
            ? `${resolvedTeams[0].names.length}v${resolvedTeams[1].names.length}`
            : null
        );

      return resolvedPresentation(
        resolvedTeams,
        format
      );
    }
  }

  /*
   * A complete two-player roster is inherently a 1v1. No array-order
   * side inference is needed because each player is a singleton side.
   */
  if (visibleNames.length === 2) {
    return resolvedPresentation(
      [
        {
          teamKey: "1v1:0",
          names: [visibleNames[0]],
        },
        {
          teamKey: "1v1:1",
          names: [visibleNames[1]],
        },
      ],
      "1v1"
    );
  }

  /*
   * Older rows may lack team_resolution while every player
   * still carries a complete explicit team ID.
   */
  const explicitGroups =
    new Map<
      string,
      string[]
    >();

  let completeTeamIds =
    visibleNames.length >
    0;

  for (
    const player
    of players
  ) {
    const name =
      normalizedName(
        displayPlayerName(
          player
        )
      );

    const rawTeamId =
      player.team_id ??
      player.teamId;

    if (
      !name ||
      rawTeamId === null ||
      rawTeamId === undefined ||
      String(
        rawTeamId
      ).trim() === ""
    ) {
      completeTeamIds =
        false;

      break;
    }

    const teamId =
      String(
        rawTeamId
      );

    const names =
      explicitGroups.get(
        teamId
      ) ??
      [];

    names.push(
      name
    );

    explicitGroups.set(
      teamId,
      names
    );
  }

  if (
    completeTeamIds &&
    explicitGroups.size ===
      2
  ) {
    const groupedTeams =
      [...explicitGroups.entries()]
        .sort(
          (
            [leftId],
            [rightId]
          ) => {
            const leftNumber =
              Number(leftId);

            const rightNumber =
              Number(rightId);

            if (
              Number.isFinite(
                leftNumber
              ) &&
              Number.isFinite(
                rightNumber
              )
            ) {
              return (
                leftNumber -
                rightNumber
              );
            }

            return leftId.localeCompare(
              rightId
            );
          }
        )
        .map(
          ([teamKey, names]) => ({
            teamKey,
            names,
          })
        );

    if (
      sameNameMultiset(
        groupedTeams.flatMap(
          (team) => team.names
        ),
        visibleNames
      )
    ) {
      const format =
        groupedTeams[0].names.length ===
        groupedTeams[1].names.length
          ? `${groupedTeams[0].names.length}v${groupedTeams[1].names.length}`
          : null;

      return resolvedPresentation(
        groupedTeams,
        format
      );
    }
  }

  return fallback();
}

export function formatReplayTeamMatchup(
  game: ReplayTeamDisplayInput,
  unavailableLabel =
    "Roster unresolved"
) {
  return resolveReplayTeamPresentation(
    game,
    unavailableLabel
  ).matchupLabel;
}
