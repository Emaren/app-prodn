import assert from "node:assert/strict";

import test from "node:test";


import {
  PUBLIC_REPLAY_ROSTER_V2_POLICY,
  buildPublicReplayRosterV2Projection,
  publicReplayRosterV2DisplayState,
  stableReplayRosterV2Hash,
} from "../lib/publicReplayRosterV2.ts";


function direct(
  id: number,
  fieldPath: string,
  value: unknown,
  steamId: string,
  number: number,
  name: string
) {
  return {
    id,

    fieldPath,

    value,

    confidenceBps:
      10_000,

    provenance: {
      class:
        "direct_header",

      exact:
        true,

      conflict_state:
        "none",

      subject: {
        type:
          "player",

        player_key:
          `steam:${steamId}`,

        player_name:
          name,

        player_number:
          number,
      },
    },

    candidateOnly:
      true,

    affectsPublicAggregates:
      false,
  };
}


function fixture(
  format:
    "2v2" |
    "3v3" |
    "4v4"
) {
  const count =
    format ===
      "2v2"
      ? 4
      : format ===
          "3v3"
        ? 6
        : 8;


  const half =
    count / 2;


  const observations:
    Array<
      Record<
        string,
        unknown
      >
    > =
      [];


  const teams = [
    {
      team_id:
        0,

      players:
        [] as string[],

      player_keys:
        [] as string[],
    },

    {
      team_id:
        1,

      players:
        [] as string[],

      player_keys:
        [] as string[],
    },
  ];


  for (
    let index = 1;
    index <= count;
    index += 1
  ) {
    const steamId =
      `7656119800000000${index}`;


    const name =
      `Player ${index}`;


    const teamId =
      index <=
        half
        ? 0
        : 1;


    teams[
      teamId
    ].players.push(
      name
    );


    teams[
      teamId
    ].player_keys.push(
      `steam:${steamId}`
    );


    observations.push(
      direct(
        index * 10 + 1,
        "player.name",
        name,
        steamId,
        index,
        name
      ),

      direct(
        index * 10 + 2,
        "player.number",
        index,
        steamId,
        index,
        name
      ),

      direct(
        index * 10 + 3,
        "player.steam_id",
        steamId,
        steamId,
        index,
        name
      ),

      direct(
        index * 10 + 4,
        "player.team_id",
        teamId,
        steamId,
        index,
        name
      )
    );
  }


  observations.push({
    id:
      999,

    fieldPath:
      "teams.resolution",

    value: {
      teams,

      format,

      status:
        "resolved",

      confidence:
        "high",

      provenance:
        "explicit_replay_team_ids",

      team_count:
        2,

      player_count:
        count,
    },

    confidenceBps:
      9_000,

    provenance: {
      class:
        "derived_coherent",

      exact:
        true,

      conflict_state:
        "none",

      subject: {
        type:
          "game",
      },
    },

    candidateOnly:
      true,

    affectsPublicAggregates:
      false,
  });


  return observations;
}


for (
  const format of [
    "2v2",
    "3v3",
    "4v4",
  ] as const
) {
  test(
    `builds deterministic ${format} projection`,
    () => {
      const result =
        buildPublicReplayRosterV2Projection({
          currentPlayers:
            [],

          observations:
            fixture(
              format
            ) as never,

          parseRunId:
            123,
        });


      assert.equal(
        result.ok,
        true,
        result.blockers.join(
          ","
        )
      );


      assert.equal(
        result.format,
        format
      );


      assert.equal(
        result
          .projectedPlayers
          .length,

        format ===
          "2v2"
          ? 4
          : format ===
              "3v3"
            ? 6
            : 8
      );


      assert.ok(
        result
          .projectedPlayers
          .every(
            (
              player
            ) =>
              player.winner ===
                null
          )
      );


      assert.ok(
        result
          .projectedPlayers
          .every(
            (
              player
            ) =>
              player
                .roster_source ===
                PUBLIC_REPLAY_ROSTER_V2_POLICY
          )
      );


      assert.equal(
        result
          .projectedPlayersHash,

        stableReplayRosterV2Hash(
          result
            .projectedPlayers
        )
      );
    }
  );
}


test(
  "preserves safe metadata by exact Steam identity while replacing authority fields",
  () => {
    const result =
      buildPublicReplayRosterV2Projection({
        currentPlayers: [
          {
            name:
              "stale",

            steam_id:
              "76561198000000001",

            user_id:
              "76561198000000001",

            number:
              88,

            team_id:
              99,

            teamId:
              99,

            winner:
              true,

            civilization:
              16,

            civilization_name:
              "Mayans",

            eapm:
              17,
          },
        ],

        observations:
          fixture(
            "2v2"
          ) as never,

        parseRunId:
          456,
      });


    assert.equal(
      result.ok,
      true,
      result.blockers.join(
        ","
      )
    );


    const player =
      result
        .projectedPlayers[0];


    assert.equal(
      player.name,
      "Player 1"
    );


    assert.equal(
      player.number,
      1
    );


    assert.equal(
      player.team_id,
      0
    );


    assert.equal(
      player.teamId,
      undefined
    );


    assert.equal(
      player.winner,
      null
    );


    assert.equal(
      player.civilization,
      16
    );


    assert.equal(
      player.eapm,
      17
    );


    assert.equal(
      player
        .roster_parse_run_id,
      456
    );
  }
);


test(
  "1v1 is not a V2 projection format",
  () => {
    const observations =
      fixture(
        "2v2"
      );


    const resolution =
      observations[
        observations.length -
        1
      ];


    const value =
      resolution.value as {
        format: string;

        player_count: number;

        teams:
          Array<{
            players:
              string[];

            player_keys:
              string[];
          }>;
      };


    value.format =
      "1v1";


    value.player_count =
      2;


    value.teams =
      value.teams.map(
        (
          team
        ) => ({
          ...team,

          players:
            team.players.slice(
              0,
              1
            ),

          player_keys:
            team
              .player_keys
              .slice(
                0,
                1
              ),
        })
      );


    const result =
      buildPublicReplayRosterV2Projection({
        currentPlayers:
          [],

        observations:
          observations as never,

        parseRunId:
          1,
      });


    assert.equal(
      result.ok,
      false
    );


    assert.ok(
      result.blockers.some(
        (
          blocker
        ) =>
          blocker.startsWith(
            "unsupported_format:"
          )
      )
    );
  }
);


test(
  "complete 1v1 public participants are already display complete",
  () => {
    const state =
      publicReplayRosterV2DisplayState([
        {
          name:
            "A",

          steam_id:
            "76561198000000001",

          team_id:
            -1,
        },

        {
          name:
            "B",

          steam_id:
            "76561198000000002",

          team_id:
            -1,
        },
      ]);


    assert.equal(
      state.complete,
      true
    );


    assert.equal(
      state.format,
      "1v1"
    );
  }
);


test(
  "rejects low-confidence team resolution",
  () => {
    const observations =
      fixture(
        "2v2"
      );


    observations[
      observations.length -
      1
    ].confidenceBps =
      8_999;


    const result =
      buildPublicReplayRosterV2Projection({
        currentPlayers:
          [],

        observations:
          observations as never,

        parseRunId:
          1,
      });


    assert.equal(
      result.ok,
      false
    );


    assert.ok(
      result.blockers.includes(
        "teams_resolution_low_confidence"
      )
    );
  }
);


test(
  "rejects unsupported provenance",
  () => {
    const observations =
      fixture(
        "2v2"
      );


    const resolution =
      observations[
        observations.length -
        1
      ];


    (
      resolution.value as {
        provenance:
          string;
      }
    ).provenance =
      "inferred_by_order";


    const result =
      buildPublicReplayRosterV2Projection({
        currentPlayers:
          [],

        observations:
          observations as never,

        parseRunId:
          1,
      });


    assert.equal(
      result.ok,
      false
    );


    assert.ok(
      result.blockers.includes(
        "unsupported_provenance:inferred_by_order"
      )
    );
  }
);


test(
  "rejects missing direct identity observation",
  () => {
    const observations =
      fixture(
        "2v2"
      )
        .filter(
          (
            observation
          ) =>
            !(
              observation
                .fieldPath ===
                "player.steam_id" &&
              observation
                .value ===
                "76561198000000001"
            )
        );


    const result =
      buildPublicReplayRosterV2Projection({
        currentPlayers:
          [],

        observations:
          observations as never,

        parseRunId:
          1,
      });


    assert.equal(
      result.ok,
      false
    );


    assert.ok(
      result.blockers.some(
        (
          blocker
        ) =>
          blocker.startsWith(
            "missing_or_conflicting_steam_id:"
          )
      )
    );
  }
);


test(
  "rejects unbalanced teams",
  () => {
    const observations =
      fixture(
        "2v2"
      );


    const resolution =
      observations[
        observations.length -
        1
      ];


    const teams =
      (
        resolution.value as {
          teams:
            Array<{
              player_keys:
                string[];
            }>;
        }
      ).teams;


    const moved =
      teams[1]
        .player_keys
        .pop();


    if (moved) {
      teams[0]
        .player_keys
        .push(
          moved
        );
    }


    const result =
      buildPublicReplayRosterV2Projection({
        currentPlayers:
          [],

        observations:
          observations as never,

        parseRunId:
          1,
      });


    assert.equal(
      result.ok,
      false
    );


    assert.ok(
      result.blockers.some(
        (
          blocker
        ) =>
          blocker.startsWith(
            "invalid_team_sizes:"
          )
      )
    );
  }
);


test(
  "rejects team membership conflict with direct team observation",
  () => {
    const observations =
      fixture(
        "2v2"
      );


    const observation =
      observations.find(
        (
          candidate
        ) =>
          candidate
            .fieldPath ===
            "player.team_id" &&
          candidate
            .value ===
            0
      );


    if (!observation) {
      throw new Error(
        "fixture team observation missing"
      );
    }


    observation.value =
      1;


    const result =
      buildPublicReplayRosterV2Projection({
        currentPlayers:
          [],

        observations:
          observations as never,

        parseRunId:
          1,
      });


    assert.equal(
      result.ok,
      false
    );


    assert.ok(
      result.blockers.some(
        (
          blocker
        ) =>
          blocker.startsWith(
            "team_observation_mismatch:"
          )
      )
    );
  }
);


test(
  "rejects public-authority contamination on team observation",
  () => {
    const observations =
      fixture(
        "2v2"
      );


    observations[
      observations.length -
      1
    ].affectsPublicAggregates =
      true;


    const result =
      buildPublicReplayRosterV2Projection({
        currentPlayers:
          [],

        observations:
          observations as never,

        parseRunId:
          1,
      });


    assert.equal(
      result.ok,
      false
    );


    assert.ok(
      result.blockers.includes(
        "team_observation_affects_public_aggregates"
      )
    );
  }
);


test(
  "projection is deterministic across repeated construction",
  () => {
    const observations =
      fixture(
        "4v4"
      );


    const first =
      buildPublicReplayRosterV2Projection({
        currentPlayers:
          [],

        observations:
          observations as never,

        parseRunId:
          77,
      });


    const second =
      buildPublicReplayRosterV2Projection({
        currentPlayers:
          [],

        observations:
          observations as never,

        parseRunId:
          77,
      });


    assert.equal(
      first.ok,
      true
    );


    assert.equal(
      second.ok,
      true
    );


    assert.deepEqual(
      first.projectedPlayers,
      second.projectedPlayers
    );


    assert.equal(
      first.projectedPlayersHash,
      second.projectedPlayersHash
    );
  }
);


test(
  "rejects public-authority contamination on direct player evidence",
  () => {
    const observations =
      fixture(
        "2v2"
      );


    const identityObservation =
      observations.find(
        (
          observation
        ) =>
          observation
            .fieldPath ===
            "player.name"
      );


    if (
      !identityObservation
    ) {
      throw new Error(
        "fixture identity observation missing"
      );
    }


    identityObservation
      .affectsPublicAggregates =
      true;


    const result =
      buildPublicReplayRosterV2Projection({
        currentPlayers:
          [],

        observations:
          observations as never,

        parseRunId:
          1,
      });


    assert.equal(
      result.ok,
      false
    );


    assert.ok(
      result.blockers.some(
        (
          blocker
        ) =>
          blocker.startsWith(
            "missing_or_conflicting_player_name:"
          )
      )
    );
  }
);


test(
  "rejects non-candidate direct player evidence",
  () => {
    const observations =
      fixture(
        "2v2"
      );


    const identityObservation =
      observations.find(
        (
          observation
        ) =>
          observation
            .fieldPath ===
            "player.steam_id"
      );


    if (
      !identityObservation
    ) {
      throw new Error(
        "fixture identity observation missing"
      );
    }


    identityObservation
      .candidateOnly =
      false;


    const result =
      buildPublicReplayRosterV2Projection({
        currentPlayers:
          [],

        observations:
          observations as never,

        parseRunId:
          1,
      });


    assert.equal(
      result.ok,
      false
    );


    assert.ok(
      result.blockers.some(
        (
          blocker
        ) =>
          blocker.startsWith(
            "missing_or_conflicting_steam_id:"
          )
      )
    );
  }
);
