import {
  createHash,
} from "node:crypto";


export const PUBLIC_REPLAY_ROSTER_V2_POLICY =
  "public_replay_roster_v2" as const;


export const PUBLIC_REPLAY_ROSTER_V2_ALLOWED_PROVENANCE = [
  "explicit_replay_team_ids",
  "explicit_final_team_ids",
] as const;


export type PublicReplayRosterV2Observation = {
  id: number;

  fieldPath: string;

  value: unknown;

  confidenceBps:
    number | null;

  provenance:
    unknown;

  candidateOnly?:
    boolean;

  affectsPublicAggregates?:
    boolean;
};


export type PublicReplayRosterV2ProjectedPlayer =
  Record<
    string,
    unknown
  >;


export type PublicReplayRosterV2Projection = {
  ok: boolean;

  blockers:
    string[];

  teamObservationId:
    number | null;

  format:
    string | null;

  provenance:
    string | null;

  confidenceBps:
    number | null;

  teamSizes:
    number[];

  projectedPlayers:
    PublicReplayRosterV2ProjectedPlayer[];

  projectedPlayersHash:
    string | null;
};


type Obj =
  Record<
    string,
    unknown
  >;


type PlayerEvidence = {
  key: string;

  steamId: string;

  name:
    string | null;

  number:
    number | null;

  observedTeamId:
    number | null;
};


function objectValue(
  value: unknown
): Obj {
  return (
    value &&
    typeof value ===
      "object" &&
    !Array.isArray(
      value
    )
  )
    ? value as Obj
    : {};
}


function arrayValue(
  value: unknown
): unknown[] {
  return Array.isArray(
    value
  )
    ? value
    : [];
}


function textValue(
  value: unknown
) {
  if (
    typeof value ===
      "string"
  ) {
    return value.trim();
  }

  if (
    typeof value ===
      "number" &&
    Number.isFinite(
      value
    )
  ) {
    return String(
      value
    );
  }

  if (
    typeof value ===
      "bigint"
  ) {
    return value.toString();
  }

  return "";
}


function numberValue(
  value: unknown
) {
  if (
    typeof value ===
      "number" &&
    Number.isFinite(
      value
    )
  ) {
    return value;
  }

  if (
    typeof value ===
      "bigint"
  ) {
    return Number(
      value
    );
  }

  if (
    typeof value ===
      "string" &&
    value.trim() &&
    Number.isFinite(
      Number(
        value
      )
    )
  ) {
    return Number(
      value
    );
  }

  return null;
}


function booleanValue(
  value: unknown
) {
  return (
    value === true ||
    value === "true" ||
    value === 1 ||
    value === "1"
  );
}


export function stableReplayRosterV2Value(
  value: unknown
): unknown {
  if (
    Array.isArray(
      value
    )
  ) {
    return value.map(
      stableReplayRosterV2Value
    );
  }

  if (
    value &&
    typeof value ===
      "object"
  ) {
    return Object.fromEntries(
      Object.entries(
        value as Obj
      )
        .sort(
          (
            left,
            right
          ) =>
            left[0]
              .localeCompare(
                right[0]
              )
        )
        .map(
          (
            [
              key,
              child,
            ]
          ) => [
            key,
            stableReplayRosterV2Value(
              child
            ),
          ]
        )
    );
  }

  if (
    typeof value ===
      "bigint"
  ) {
    return value.toString();
  }

  return value;
}


export function stableReplayRosterV2Hash(
  value: unknown
) {
  return createHash(
    "sha256"
  )
    .update(
      JSON.stringify(
        stableReplayRosterV2Value(
          value
        )
      )
    )
    .digest(
      "hex"
    );
}


export function canonicalReplayRosterV2ManifestBytes(
  value: unknown
) {
  return `${
    JSON.stringify(
      stableReplayRosterV2Value(
        value
      ),
      null,
      2
    )
  }\n`;
}


function steamIdFromPlayer(
  player: Obj
) {
  const raw =
    textValue(
      player.steam_id ??
      player.steamId ??
      player.user_id ??
      player.userId
    );

  return (
    /^\d{10,20}$/
      .test(
        raw
      )
  )
    ? raw
    : null;
}


function teamIdFromPlayer(
  player: Obj
) {
  return numberValue(
    player.team_id ??
    player.teamId ??
    player.team
  );
}


export function publicReplayRosterV2DisplayState(
  playersValue: unknown
) {
  const players =
    arrayValue(
      playersValue
    )
      .map(
        objectValue
      )
      .filter(
        (
          player
        ) =>
          Boolean(
            textValue(
              player.name
            )
          ) &&
          Boolean(
            steamIdFromPlayer(
              player
            )
          )
      );


  /*
   * A complete 1v1 already has a complete public roster.
   *
   * Historical team_id=-1 does not make a 1v1 roster
   * promotion-worthy.
   */
  if (
    players.length ===
      2
  ) {
    const ids =
      new Set(
        players
          .map(
            steamIdFromPlayer
          )
          .filter(
            Boolean
          )
      );

    if (
      ids.size === 2
    ) {
      return {
        complete:
          true,

        format:
          "1v1",

        playerCount:
          2,

        reason:
          "two_exact_participants",
      } as const;
    }
  }


  if (
    ![
      4,
      6,
      8,
    ].includes(
      players.length
    )
  ) {
    return {
      complete:
        false,

      format:
        "unknown",

      playerCount:
        players.length,

      reason:
        "participant_count_incomplete",
    } as const;
  }


  const teamCounts =
    new Map<
      number,
      number
    >();


  for (
    const player of
    players
  ) {
    const teamId =
      teamIdFromPlayer(
        player
      );

    if (
      teamId === null ||
      teamId < 0
    ) {
      return {
        complete:
          false,

        format:
          `${players.length / 2}v${players.length / 2}`,

        playerCount:
          players.length,

        reason:
          "team_id_missing",
      } as const;
    }

    teamCounts.set(
      teamId,
      (
        teamCounts.get(
          teamId
        ) ??
        0
      ) +
        1
    );
  }


  const sizes =
    [
      ...teamCounts
        .values(),
    ]
      .sort(
        (
          left,
          right
        ) =>
          left -
          right
      );


  if (
    teamCounts.size !==
      2
  ) {
    return {
      complete:
        false,

      format:
        `${players.length / 2}v${players.length / 2}`,

      playerCount:
        players.length,

      reason:
        `team_count_${teamCounts.size}`,
    } as const;
  }


  if (
    sizes[0] !==
      sizes[1]
  ) {
    return {
      complete:
        false,

      format:
        `${players.length / 2}v${players.length / 2}`,

      playerCount:
        players.length,

      reason:
        `unbalanced_${sizes.join("v")}`,
    } as const;
  }


  return {
    complete:
      true,

    format:
      `${sizes[0]}v${sizes[1]}`,

    playerCount:
      players.length,

    reason:
      "balanced_explicit_teams",
  } as const;
}


function observationSubject(
  observation:
    PublicReplayRosterV2Observation
) {
  const provenance =
    objectValue(
      observation.provenance
    );

  return objectValue(
    provenance.subject
  );
}


function observationPlayerKey(
  observation:
    PublicReplayRosterV2Observation
) {
  const subject =
    observationSubject(
      observation
    );

  return textValue(
    subject.player_key
  )
    .toLowerCase();
}


function directObservationValid(
  observation:
    PublicReplayRosterV2Observation
) {
  const provenance =
    objectValue(
      observation.provenance
    );

  return (
    observation.candidateOnly ===
      true &&
    observation.affectsPublicAggregates ===
      false &&
    (
      observation
        .confidenceBps ??
      0
    ) >=
      10_000 &&
    textValue(
      provenance.class
    ) ===
      "direct_header" &&
    booleanValue(
      provenance.exact
    ) &&
    textValue(
      provenance
        .conflict_state
    ) ===
      "none"
  );
}


function teamObservationValid(
  observation:
    PublicReplayRosterV2Observation
) {
  const provenance =
    objectValue(
      observation.provenance
    );

  return (
    (
      observation
        .confidenceBps ??
      0
    ) >=
      9_000 &&
    booleanValue(
      provenance.exact
    ) &&
    textValue(
      provenance
        .conflict_state
    ) ===
      "none"
  );
}


function strongestTeamObservation(
  observations:
    PublicReplayRosterV2Observation[]
) {
  return observations
    .filter(
      (
        observation
      ) =>
        observation
          .fieldPath ===
          "teams.resolution"
    )
    .slice()
    .sort(
      (
        left,
        right
      ) =>
        (
          right
            .confidenceBps ??
          -1
        ) -
          (
            left
              .confidenceBps ??
            -1
          ) ||
        right.id -
          left.id
    )[0] ??
    null;
}


function collectFieldValues(
  observations:
    PublicReplayRosterV2Observation[],

  fieldPath:
    string
) {
  const values =
    new Map<
      string,
      unknown[]
    >();


  for (
    const observation of
    observations
  ) {
    if (
      observation
        .fieldPath !==
        fieldPath ||
      !directObservationValid(
        observation
      )
    ) {
      continue;
    }

    const key =
      observationPlayerKey(
        observation
      );

    if (
      !key.startsWith(
        "steam:"
      )
    ) {
      continue;
    }

    const bucket =
      values.get(
        key
      ) ??
      [];

    bucket.push(
      observation.value
    );

    values.set(
      key,
      bucket
    );
  }


  return values;
}


function uniqueText(
  values:
    unknown[]
) {
  const normalized =
    [
      ...new Set(
        values
          .map(
            textValue
          )
          .filter(
            Boolean
          )
      ),
    ];

  return (
    normalized.length ===
      1
  )
    ? normalized[0]
    : null;
}


function uniqueNumber(
  values:
    unknown[]
) {
  const normalized =
    [
      ...new Set(
        values
          .map(
            numberValue
          )
          .filter(
            (
              value
            ): value is number =>
              value !== null
          )
      ),
    ];

  return (
    normalized.length ===
      1
  )
    ? normalized[0]
    : null;
}


function playerDefaults() {
  return {
    mvp:
      null,

    eapm:
      null,

    human:
      true,

    score:
      null,

    winner:
      null,

    cheater:
      false,

    color_id:
      null,

    position:
      null,

    header_only:
      true,

    achievements:
      null,

    civilization:
      null,

    prefer_random:
      null,

    rate_snapshot:
      null,

    steam_dm_rating:
      null,

    steam_rm_rating:
      null,

    civilization_name:
      "Unknown",
  } satisfies Obj;
}


function cleanExistingPlayer(
  existing:
    Obj | null
) {
  const base:
    Obj =
      existing
        ? {
            ...existing,
          }
        : playerDefaults();


  /*
   * These are authority-bearing roster fields.
   * Replay evidence replaces them; legacy values do not survive.
   */
  delete base.team;
  delete base.teamId;
  delete base.team_id;

  delete base.winner;

  delete base.name;
  delete base.number;

  delete base.steamId;
  delete base.steam_id;

  delete base.userId;
  delete base.user_id;

  delete base.roster_source;
  delete base.team_id_source;
  delete base.roster_recovered;
  delete base.roster_parse_run_id;


  return base;
}


export function buildPublicReplayRosterV2Projection(
  input: {
    currentPlayers:
      unknown;

    observations:
      PublicReplayRosterV2Observation[];

    parseRunId:
      number;
  }
): PublicReplayRosterV2Projection {
  const blockers:
    string[] =
      [];


  const resolution =
    strongestTeamObservation(
      input.observations
    );


  if (!resolution) {
    return {
      ok:
        false,

      blockers: [
        "teams_resolution_missing",
      ],

      teamObservationId:
        null,

      format:
        null,

      provenance:
        null,

      confidenceBps:
        null,

      teamSizes:
        [],

      projectedPlayers:
        [],

      projectedPlayersHash:
        null,
    };
  }


  if (
    resolution
      .candidateOnly !==
        true
  ) {
    blockers.push(
      "team_observation_not_candidate_only"
    );
  }


  if (
    resolution
      .affectsPublicAggregates !==
        false
  ) {
    blockers.push(
      "team_observation_affects_public_aggregates"
    );
  }


  if (
    !teamObservationValid(
      resolution
    )
  ) {
    blockers.push(
      "team_observation_contract_invalid"
    );
  }


  const value =
    objectValue(
      resolution.value
    );


  const format =
    textValue(
      value.format
    );


  const status =
    textValue(
      value.status
    )
      .toLowerCase();


  const provenance =
    textValue(
      value.provenance
    );


  const teams =
    arrayValue(
      value.teams
    )
      .map(
        objectValue
      );


  const declaredPlayerCount =
    numberValue(
      value.player_count
    );


  if (
    status !==
      "resolved"
  ) {
    blockers.push(
      `teams_resolution_status:${status || "missing"}`
    );
  }


  if (
    (
      resolution
        .confidenceBps ??
      0
    ) <
      9_000
  ) {
    blockers.push(
      "teams_resolution_low_confidence"
    );
  }


  if (
    ![
      "2v2",
      "3v3",
      "4v4",
    ].includes(
      format
    )
  ) {
    blockers.push(
      `unsupported_format:${format || "missing"}`
    );
  }


  if (
    !PUBLIC_REPLAY_ROSTER_V2_ALLOWED_PROVENANCE
      .includes(
        provenance as (
          typeof PUBLIC_REPLAY_ROSTER_V2_ALLOWED_PROVENANCE
        )[number]
      )
  ) {
    blockers.push(
      `unsupported_provenance:${provenance || "missing"}`
    );
  }


  if (
    teams.length !==
      2
  ) {
    blockers.push(
      `team_count:${teams.length}`
    );
  }


  const expectedPlayerCount =
    format ===
      "2v2"
      ? 4
      : format ===
          "3v3"
        ? 6
        : format ===
            "4v4"
          ? 8
          : null;


  if (
    expectedPlayerCount !==
      null &&
    declaredPlayerCount !==
      expectedPlayerCount
  ) {
    blockers.push(
      `declared_player_count:${declaredPlayerCount ?? "missing"}`
    );
  }


  const teamIds:
    number[] =
      [];


  const teamSizes:
    number[] =
      [];


  const teamByPlayerKey =
    new Map<
      string,
      number
    >();


  for (
    const team of
    teams
  ) {
    const teamId =
      numberValue(
        team.team_id
      );


    const playerKeys =
      arrayValue(
        team.player_keys
      )
        .map(
          textValue
        )
        .map(
          (
            key
          ) =>
            key.toLowerCase()
        )
        .filter(
          Boolean
        );


    if (
      teamId === null ||
      teamId < 0
    ) {
      blockers.push(
        `invalid_team_id:${textValue(team.team_id) || "missing"}`
      );

      continue;
    }


    teamIds.push(
      teamId
    );


    teamSizes.push(
      playerKeys.length
    );


    if (
      new Set(
        playerKeys
      ).size !==
        playerKeys.length
    ) {
      blockers.push(
        `duplicate_team_player_key:${teamId}`
      );
    }


    for (
      const key of
      playerKeys
    ) {
      if (
        !key.startsWith(
          "steam:"
        )
      ) {
        blockers.push(
          `non_steam_player_key:${key || "missing"}`
        );
      }


      if (
        teamByPlayerKey
          .has(
            key
          )
      ) {
        blockers.push(
          `player_in_multiple_teams:${key}`
        );
      }


      teamByPlayerKey.set(
        key,
        teamId
      );
    }
  }


  teamSizes.sort(
    (
      left,
      right
    ) =>
      left -
      right
  );


  if (
    new Set(
      teamIds
    ).size !==
      teamIds.length
  ) {
    blockers.push(
      "duplicate_team_ids"
    );
  }


  if (
    teamSizes.length !==
      2 ||
    teamSizes[0] ===
      0 ||
    teamSizes[0] !==
      teamSizes[1] ||
    (
      expectedPlayerCount !==
        null &&
      teamSizes[0] +
        teamSizes[1] !==
        expectedPlayerCount
    )
  ) {
    blockers.push(
      `invalid_team_sizes:${teamSizes.join("v")}`
    );
  }


  const names =
    collectFieldValues(
      input.observations,
      "player.name"
    );


  const numbers =
    collectFieldValues(
      input.observations,
      "player.number"
    );


  const steamIds =
    collectFieldValues(
      input.observations,
      "player.steam_id"
    );


  const observedTeamIds =
    collectFieldValues(
      input.observations,
      "player.team_id"
    );


  const evidencePlayers:
    PlayerEvidence[] =
      [];


  for (
    const [
      key,
      teamId,
    ] of
      [
        ...teamByPlayerKey
          .entries(),
      ]
        .sort(
          (
            left,
            right
          ) =>
            left[0]
              .localeCompare(
                right[0]
              )
        )
  ) {
    const keySteamId =
      key.slice(
        "steam:".length
      );


    const nameValues =
      names.get(
        key
      ) ??
      [];


    const numberValues =
      numbers.get(
        key
      ) ??
      [];


    const steamValues =
      steamIds.get(
        key
      ) ??
      [];


    const teamValues =
      observedTeamIds.get(
        key
      ) ??
      [];


    const name =
      uniqueText(
        nameValues
      );


    const number =
      uniqueNumber(
        numberValues
      );


    const observedSteamId =
      uniqueText(
        steamValues
      );


    const observedTeamId =
      teamValues.length >
        0
        ? uniqueNumber(
            teamValues
          )
        : null;


    if (!name) {
      blockers.push(
        `missing_or_conflicting_player_name:${key}`
      );
    }


    if (
      number === null
    ) {
      blockers.push(
        `missing_or_conflicting_player_number:${key}`
      );
    }


    if (
      !observedSteamId
    ) {
      blockers.push(
        `missing_or_conflicting_steam_id:${key}`
      );
    }


    if (
      observedSteamId &&
      observedSteamId !==
        keySteamId
    ) {
      blockers.push(
        `steam_subject_mismatch:${key}:${observedSteamId}`
      );
    }


    if (
      teamValues.length >
        0 &&
      observedTeamId ===
        null
    ) {
      blockers.push(
        `conflicting_player_team_id:${key}`
      );
    }


    if (
      observedTeamId !==
        null &&
      observedTeamId !==
        teamId
    ) {
      blockers.push(
        `team_observation_mismatch:${key}:${observedTeamId}:${teamId}`
      );
    }


    evidencePlayers.push({
      key,

      steamId:
        keySteamId,

      name,

      number,

      observedTeamId,
    });
  }


  const observedSteamSet =
    new Set(
      evidencePlayers.map(
        (
          player
        ) =>
          player.steamId
      )
    );


  if (
    observedSteamSet.size !==
      evidencePlayers.length
  ) {
    blockers.push(
      "duplicate_steam_ids"
    );
  }


  const observedNumbers =
    evidencePlayers
      .map(
        (
          player
        ) =>
          player.number
      )
      .filter(
        (
          value
        ): value is number =>
          value !== null
      )
      .sort(
        (
          left,
          right
        ) =>
          left -
          right
      );


  const expectedNumbers =
    Array.from(
      {
        length:
          expectedPlayerCount ??
          0,
      },
      (
        _value,
        index
      ) =>
        index + 1
    );


  if (
    JSON.stringify(
      observedNumbers
    ) !==
    JSON.stringify(
      expectedNumbers
    )
  ) {
    blockers.push(
      `player_number_sequence:${observedNumbers.join(",")}`
    );
  }


  const currentBySteamId =
    new Map<
      string,
      Obj
    >();


  for (
    const player of
    arrayValue(
      input.currentPlayers
    )
      .map(
        objectValue
      )
  ) {
    const steamId =
      steamIdFromPlayer(
        player
      );


    if (!steamId) {
      continue;
    }


    if (
      currentBySteamId
        .has(
          steamId
        )
    ) {
      blockers.push(
        `duplicate_current_steam_id:${steamId}`
      );
    }


    currentBySteamId.set(
      steamId,
      player
    );
  }


  const projectedPlayers =
    evidencePlayers
      .filter(
        (
          player
        ): player is PlayerEvidence & {
          name: string;

          number: number;
        } =>
          Boolean(
            player.name
          ) &&
          player.number !==
            null
      )
      .sort(
        (
          left,
          right
        ) =>
          left.number -
          right.number
      )
      .map(
        (
          player
        ) => {
          const teamId =
            teamByPlayerKey.get(
              player.key
            );


          const existing =
            currentBySteamId.get(
              player.steamId
            ) ??
            null;


          const base =
            cleanExistingPlayer(
              existing
            );


          return {
            ...base,

            name:
              player.name,

            number:
              player.number,

            winner:
              null,

            team_id:
              teamId,

            user_id:
              player.steamId,

            steam_id:
              player.steamId,

            human:
              existing
                ?.human ??
              true,

            header_only:
              existing
                ?.header_only ??
              true,

            civilization_name:
              textValue(
                existing
                  ?.civilization_name
              ) ||
              textValue(
                existing
                  ?.civilization
              ) ||
              "Unknown",

            roster_source:
              PUBLIC_REPLAY_ROSTER_V2_POLICY,

            team_id_source:
              PUBLIC_REPLAY_ROSTER_V2_POLICY,

            roster_recovered:
              true,

            roster_parse_run_id:
              input.parseRunId,
          } satisfies PublicReplayRosterV2ProjectedPlayer;
        }
      );


  if (
    expectedPlayerCount !==
      null &&
    projectedPlayers.length !==
      expectedPlayerCount
  ) {
    blockers.push(
      `projected_player_count:${projectedPlayers.length}`
    );
  }


  if (
    projectedPlayers.some(
      (
        player
      ) =>
        player.winner !==
          null
    )
  ) {
    blockers.push(
      "winner_flag_not_null"
    );
  }


  const deduplicatedBlockers =
    [
      ...new Set(
        blockers
      ),
    ];


  return {
    ok:
      deduplicatedBlockers
        .length === 0,

    blockers:
      deduplicatedBlockers,

    teamObservationId:
      resolution.id,

    format:
      format ||
      null,

    provenance:
      provenance ||
      null,

    confidenceBps:
      resolution
        .confidenceBps ??
      null,

    teamSizes,

    projectedPlayers:
      deduplicatedBlockers
        .length === 0
        ? projectedPlayers
        : [],

    projectedPlayersHash:
      deduplicatedBlockers
        .length === 0
        ? stableReplayRosterV2Hash(
            projectedPlayers
          )
        : null,
  };
}
