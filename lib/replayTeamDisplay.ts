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
      " vs "
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

export function formatReplayTeamMatchup(
  game: ReplayTeamDisplayInput,
  unavailableLabel =
    "Roster unresolved"
) {
  const players =
    parsedRoster(
      game.players
    );

  const visibleNames =
    rosterNames(
      players
    );

  const fallback = () =>
    fallbackRosterLabel(
      visibleNames,
      unavailableLabel
    );

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
        (value) => {
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
            teamId:
              team.team_id,

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
      return resolvedTeams
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
          ([, names]) =>
            names
        );

    if (
      sameNameMultiset(
        groupedTeams.flat(),
        visibleNames
      )
    ) {
      return groupedTeams
        .map(
          (names) =>
            names.join(
              " / "
            )
        )
        .join(
          " vs "
        );
    }
  }

  return fallback();
}
