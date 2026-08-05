import assert from "node:assert/strict";
import test from "node:test";

import {
  reconcileAutomaticWatcherTerminalResults,
} from "../lib/replayResultAdjudications.ts";

import {
  evaluateWatcherTeamTerminalResult,
  WATCHER_TEAM_TERMINAL_MAX_WINNER_TAIL_MS,
  WATCHER_TEAM_TERMINAL_MIN_LEAD_MS,
  WATCHER_TEAM_TERMINAL_MIN_LOSER_SILENCE_MS,
  WATCHER_TEAM_TERMINAL_POLICY_VERSION,
  type WatcherTeamTerminalInput,
} from "../lib/watcherTeamTerminalResult.ts";

import {
  buildRosterHash,
  normalizeReplayPlayers,
} from "../lib/teamResolution.ts";

const replayHash =
  "7".repeat(64);

function teamInput21197(): WatcherTeamTerminalInput {
  return {
    id: 21197,
    replayHash,
    parseIteration: 32,
    parseSource:
      "watcher_final",
    parseReason:
      "team_resignation_not_complete",
    isFinal: true,
    winner: "Unknown",

    players: [
      {
        name: "JimmyReb",
        steam_id:
          "76561197978952756",
        number: 1,
        team_id: 0,
        winner: null,
      },
      {
        name: "mbaseball",
        steam_id:
          "76561199036719699",
        number: 2,
        team_id: 0,
        winner: null,
      },
      {
        name: "Jim",
        steam_id:
          "76561198166409520",
        number: 3,
        team_id: 0,
        winner: null,
      },
      {
        name: "nguyenphi311",
        steam_id:
          "76561198683687281",
        number: 4,
        team_id: 0,
        winner: null,
      },
      {
        name: "Wok_Dias",
        steam_id:
          "76561198080966717",
        number: 5,
        team_id: 1,
        winner: null,
      },
      {
        name: "Rick",
        steam_id:
          "76561198216610161",
        number: 6,
        team_id: 1,
        winner: null,
      },
      {
        name: "Mt. Bison",
        steam_id:
          "76561198718527778",
        number: 7,
        team_id: 1,
        winner: null,
      },
      {
        name: "YODA",
        steam_id:
          "76561198059195082",
        number: 8,
        team_id: 1,
        winner: null,
      },
    ],

    keyEvents: {
      rated: false,
      restored: false,
      completed: false,
      platform_id: "hd",

      watcher_upload: {
        file_role:
          "final_recording",
        final_candidate: true,
        checkpoint_final_rejected:
          false,
        server_sha256:
          replayHash,
      },

      team_resolution: {
        format: "4v4",
        status: "resolved",
        confidence: "high",
        provenance:
          "explicit_final_team_ids",

        teams: [
          {
            team_id: 0,
            player_keys: [
              "steam:76561197978952756",
              "steam:76561198166409520",
              "steam:76561198683687281",
              "steam:76561199036719699",
            ],
          },
          {
            team_id: 1,
            player_keys: [
              "steam:76561198059195082",
              "steam:76561198080966717",
              "steam:76561198216610161",
              "steam:76561198718527778",
            ],
          },
        ],
      },

      result_resolution: {
        result_status:
          "review_required",
        result_trusted: false,
        winning_team_id: null,
        winning_player_names: [],
        winning_player_keys: [],

        result_evidence: {
          winner_flags_coherent:
            false,
          resignation_result_conflict:
            false,
          complete_losing_team_resignation:
            false,

          resignation_counts_by_team:
            [
              {
                team_id: 0,
                player_count: 4,
                resigned_player_count:
                  2,
              },
              {
                team_id: 1,
                player_count: 4,
                resigned_player_count:
                  1,
              },
            ],
        },
      },

      resigned_player_numbers:
        [2, 4, 7],

      resigned_player_names: [
        "mbaseball",
        "nguyenphi311",
        "Mt. Bison",
      ],
    },

    eventTypes: [
      "build",
      "move",
      "resign",
    ],

    disconnectDetected: false,

    durationSeconds: 2495,

    uploaderSteamId:
      "76561198166409520",

    uploaderUid:
      "u_jim",

    uploaderUserId: 9,

    hasAdjudicationHistory:
      false,

    currentDesyncOccurred:
      null,

    terminalReceipt: null,

    terminalFailureCount: 0,

    rawActivityByPlayer: [
      {
        player_number: 1,
        player_name:
          "JimmyReb",
        action_packet_count: 900,
        first_action_ms: 1000,
        last_action_ms: 2479000,
      },
      {
        player_number: 2,
        player_name:
          "mbaseball",
        action_packet_count: 700,
        first_action_ms: 1000,
        last_action_ms: 2100000,
      },
      {
        player_number: 3,
        player_name: "Jim",
        action_packet_count: 800,
        first_action_ms: 1000,
        last_action_ms: 2483636,
      },
      {
        player_number: 4,
        player_name:
          "nguyenphi311",
        action_packet_count: 700,
        first_action_ms: 1000,
        last_action_ms: 2200000,
      },
      {
        player_number: 5,
        player_name:
          "Wok_Dias",
        action_packet_count: 950,
        first_action_ms: 1000,
        last_action_ms: 2494818,
      },
      {
        player_number: 6,
        player_name: "Rick",
        action_packet_count: 900,
        first_action_ms: 1000,
        last_action_ms: 2494200,
      },
      {
        player_number: 7,
        player_name:
          "Mt. Bison",
        action_packet_count: 650,
        first_action_ms: 1000,
        last_action_ms: 2300000,
      },
      {
        player_number: 8,
        player_name: "YODA",
        action_packet_count: 900,
        first_action_ms: 1000,
        last_action_ms: 2493000,
      },
    ],

    parseRun: {
      id: 7001,
      passName:
        "hd_deterministic_evidence",
      passVersion: "8",
    },
  };
}

function teamInput21211() {
  const input =
    teamInput21197();

  input.id = 21211;
  input.parseIteration = 13;
  input.durationSeconds = 1125;

  input.players = [
    {
      name: "JimmyReb",
      steam_id:
        "76561197978952756",
      number: 1,
      team_id: 0,
      winner: null,
    },
    {
      name: "Advan",
      steam_id:
        "76561198310848904",
      number: 2,
      team_id: 0,
      winner: null,
    },
    {
      name: "Raymond",
      steam_id:
        "76561198952490687",
      number: 3,
      team_id: 0,
      winner: null,
    },
    {
      name: "KnightRyder",
      steam_id:
        "76561199037003349",
      number: 4,
      team_id: 1,
      winner: null,
    },
    {
      name: "agempire",
      steam_id:
        "76561198864967786",
      number: 5,
      team_id: 0,
      winner: null,
    },
    {
      name: "thumb",
      steam_id:
        "76561198000675308",
      number: 6,
      team_id: 1,
      winner: null,
    },
    {
      name: "Jim",
      steam_id:
        "76561198166409520",
      number: 7,
      team_id: 1,
      winner: null,
    },
    {
      name: "MASTRA",
      steam_id:
        "76561199048154410",
      number: 8,
      team_id: 1,
      winner: null,
    },
  ];

  input.keyEvents = {
    ...(input.keyEvents as Record<
      string,
      unknown
    >),

    team_resolution: {
      format: "4v4",
      status: "resolved",
      confidence: "high",
      provenance:
        "explicit_final_team_ids",

      teams: [
        {
          team_id: 0,
          player_keys: [
            "steam:76561197978952756",
            "steam:76561198310848904",
            "steam:76561198864967786",
            "steam:76561198952490687",
          ],
        },
        {
          team_id: 1,
          player_keys: [
            "steam:76561198000675308",
            "steam:76561198166409520",
            "steam:76561199037003349",
            "steam:76561199048154410",
          ],
        },
      ],
    },

    result_resolution: {
      result_status:
        "review_required",
      result_trusted: false,
      winning_team_id: null,
      winning_player_names: [],
      winning_player_keys: [],

      result_evidence: {
        winner_flags_coherent:
          false,
        resignation_result_conflict:
          false,
        complete_losing_team_resignation:
          false,

        resignation_counts_by_team:
          [
            {
              team_id: 0,
              player_count: 4,
              resigned_player_count:
                2,
            },
            {
              team_id: 1,
              player_count: 4,
              resigned_player_count:
                3,
            },
          ],
      },
    },

    resigned_player_numbers:
      [1, 2, 4, 6, 8],

    resigned_player_names: [
      "JimmyReb",
      "Advan",
      "KnightRyder",
      "thumb",
      "MASTRA",
    ],
  };

  input.rawActivityByPlayer = [
    {
      player_number: 1,
      player_name:
        "JimmyReb",
      action_packet_count: 400,
      first_action_ms: 1000,
      last_action_ms: 1000000,
    },
    {
      player_number: 2,
      player_name: "Advan",
      action_packet_count: 420,
      first_action_ms: 1000,
      last_action_ms: 1010000,
    },
    {
      player_number: 3,
      player_name:
        "Raymond",
      action_packet_count: 600,
      first_action_ms: 1000,
      last_action_ms: 1121320,
    },
    {
      player_number: 4,
      player_name:
        "KnightRyder",
      action_packet_count: 450,
      first_action_ms: 1000,
      last_action_ms: 1030000,
    },
    {
      player_number: 5,
      player_name:
        "agempire",
      action_packet_count: 590,
      first_action_ms: 1000,
      last_action_ms: 1120500,
    },
    {
      player_number: 6,
      player_name: "thumb",
      action_packet_count: 450,
      first_action_ms: 1000,
      last_action_ms: 1040000,
    },
    {
      player_number: 7,
      player_name: "Jim",
      action_packet_count: 560,
      first_action_ms: 1000,
      last_action_ms: 1107640,
    },
    {
      player_number: 8,
      player_name: "MASTRA",
      action_packet_count: 440,
      first_action_ms: 1000,
      last_action_ms: 1050000,
    },
  ];

  return input;
}

test(
  "team policy uses strict stats-only terminal thresholds",
  () => {
    assert.equal(
      WATCHER_TEAM_TERMINAL_POLICY_VERSION,
      "replay-team-terminal-action-tail-v2"
    );

    assert.equal(
      WATCHER_TEAM_TERMINAL_MIN_LEAD_MS,
      10_000
    );

    assert.equal(
      WATCHER_TEAM_TERMINAL_MIN_LOSER_SILENCE_MS,
      10_000
    );

    assert.equal(
      WATCHER_TEAM_TERMINAL_MAX_WINNER_TAIL_MS,
      5_000
    );
  }
);

test(
  "21197-shaped terminal evidence awards YODA, Wok_Dias, Rick, and Mt. Bison",
  () => {
    const evaluation =
      evaluateWatcherTeamTerminalResult(
        teamInput21197()
      );

    assert.equal(
      evaluation.eligible,
      true
    );

    if (!evaluation.eligible) {
      return;
    }

    assert.equal(
      evaluation.winningTeamKey,
      "team:1"
    );

    assert.deepEqual(
      evaluation.winningTeam.players
        .map(
          (player) =>
            player.name
        )
        .sort(),
      [
        "Mt. Bison",
        "Rick",
        "Wok_Dias",
        "YODA",
      ].sort()
    );

    assert.deepEqual(
      evaluation.losingTeam.players
        .map(
          (player) =>
            player.name
        )
        .sort(),
      [
        "Jim",
        "JimmyReb",
        "mbaseball",
        "nguyenphi311",
      ].sort()
    );

    const evidence =
      evaluation.evidence as {
        financialAuthority?: unknown;
        actionTail?: {
          winnerLeadMs?: unknown;
          loserSilenceMs?: unknown;
          winnerTailMs?: unknown;
        };
      };

    assert.equal(
      evidence.financialAuthority,
      false
    );

    assert.equal(
      evidence.actionTail
        ?.winnerLeadMs,
      11182
    );

    assert.equal(
      evidence.actionTail
        ?.loserSilenceMs,
      11364
    );

    assert.equal(
      evidence.actionTail
        ?.winnerTailMs,
      182
    );
  }
);

test(
  "21211-shaped terminal evidence awards JimmyReb, Advan, agempire, and Raymond",
  () => {
    const evaluation =
      evaluateWatcherTeamTerminalResult(
        teamInput21211()
      );

    assert.equal(
      evaluation.eligible,
      true
    );

    if (!evaluation.eligible) {
      return;
    }

    assert.equal(
      evaluation.winningTeamKey,
      "team:0"
    );

    assert.deepEqual(
      evaluation.winningTeam.players
        .map(
          (player) =>
            player.name
        )
        .sort(),
      [
        "Advan",
        "JimmyReb",
        "Raymond",
        "agempire",
      ].sort()
    );
  }
);

test(
  "equal resignation counts remain unresolved",
  () => {
    const input =
      teamInput21197();

    const keyEvents =
      input.keyEvents as Record<
        string,
        unknown
      >;

    keyEvents.resigned_player_numbers =
      [2, 4, 7, 8];

    keyEvents.resigned_player_names =
      [
        "mbaseball",
        "nguyenphi311",
        "Mt. Bison",
        "YODA",
      ];

    const result =
      keyEvents.result_resolution as Record<
        string,
        unknown
      >;

    const evidence =
      result.result_evidence as Record<
        string,
        unknown
      >;

    evidence
      .resignation_counts_by_team =
      [
        {
          team_id: 0,
          player_count: 4,
          resigned_player_count:
            2,
        },
        {
          team_id: 1,
          player_count: 4,
          resigned_player_count:
            2,
        },
      ];

    assert.deepEqual(
      evaluateWatcherTeamTerminalResult(
        input
      ),
      {
        eligible: false,
        reason:
          "resignation_advantage_missing",
      }
    );
  }
);

test(
  "short team activity gap remains unresolved",
  () => {
    const input =
      teamInput21197();

    const rows =
      input.rawActivityByPlayer as Array<
        Record<string, unknown>
      >;

    for (const row of rows) {
      if (
        [5, 6, 8].includes(
          Number(
            row.player_number
          )
        )
      ) {
        row.last_action_ms =
          2493000;
      }
    }

    assert.deepEqual(
      evaluateWatcherTeamTerminalResult(
        input
      ),
      {
        eligible: false,
        reason:
          "team_terminal_activity_gap_too_short",
      }
    );
  }
);

test(
  "winning team must act within five seconds of replay end",
  () => {
    const input =
      teamInput21197();

    const rows =
      input.rawActivityByPlayer as Array<
        Record<string, unknown>
      >;

    for (const row of rows) {
      const playerNumber =
        Number(
          row.player_number
        );

      if (
        [1, 3].includes(
          playerNumber
        )
      ) {
        row.last_action_ms =
          2470000;
      }

      if (
        [5, 6, 8].includes(
          playerNumber
        )
      ) {
        row.last_action_ms =
          2489000;
      }
    }

    assert.deepEqual(
      evaluateWatcherTeamTerminalResult(
        input
      ),
      {
        eligible: false,
        reason:
          "winning_team_not_active_at_terminal_tail",
      }
    );
  }
);

test(
  "confirmed desync and conflicting structured truth fail closed",
  () => {
    const desync =
      teamInput21197();

    desync.currentDesyncOccurred =
      true;

    assert.deepEqual(
      evaluateWatcherTeamTerminalResult(
        desync
      ),
      {
        eligible: false,
        reason:
          "confirmed_desync",
      }
    );

    const conflict =
      teamInput21197();

    const result =
      (
        conflict.keyEvents as Record<
          string,
          unknown
        >
      ).result_resolution as Record<
        string,
        unknown
      >;

    result.result_trusted =
      true;

    assert.deepEqual(
      evaluateWatcherTeamTerminalResult(
        conflict
      ),
      {
        eligible: false,
        reason:
          "conflicting_serialized_team_result",
      }
    );
  }
);

test(
  "automatic reconciliation writes a canonical stats-only team verdict",
  async () => {
    const input =
      teamInput21197();

    let createdData:
      | Record<string, unknown>
      | null = null;

    const game = {
      id: input.id,
      userUid:
        input.uploaderUid,
      replay_file:
        "MP Replay.aoe2record",
      replayHash:
        input.replayHash,
      createdAt:
        new Date(
          "2026-08-05T03:34:13.762Z"
        ),
      game_version: "HD",
      map: {
        name: "Team Islands",
      },
      game_type:
        "Team Game",
      duration:
        input.durationSeconds,
      game_duration:
        input.durationSeconds,
      winner:
        input.winner,
      players:
        input.players,
      event_types:
        input.eventTypes,
      key_events:
        input.keyEvents,
      timestamp:
        new Date(
          "2026-08-05T03:35:37.940Z"
        ),
      played_on:
        new Date(
          "2026-08-05T03:35:35.646Z"
        ),
      parse_iteration:
        input.parseIteration,
      is_final:
        input.isFinal,
      disconnect_detected:
        input.disconnectDetected,
      parse_source:
        input.parseSource,
      parse_reason:
        input.parseReason,
      original_filename:
        "MP Replay.aoe2record",

      user: {
        id:
          input.uploaderUserId,
        uid:
          input.uploaderUid,
        steamId:
          input.uploaderSteamId,
        inGameName: "Jim",
        steamPersonaName:
          "Jim",
      },
    };

    const tx = {
      $queryRaw:
        async () => [
          {
            lock_acquired: 1,
          },
        ],

      gameStats: {
        findUnique:
          async () =>
            game,
      },

      replayResultAdjudication:
        {
          findUnique:
            async () =>
              null,

          findFirst:
            async () =>
              null,

          create:
            async (
              args: {
                data: Record<
                  string,
                  unknown
                >;
              }
            ) => {
              createdData =
                args.data;

              return {
                id: 9100,
              };
            },
        },

      replayDesyncIncident: {
        findFirst:
          async () =>
            null,
      },

      watcherClientEvent: {
        findFirst:
          async () =>
            null,

        count:
          async () =>
            0,
      },

      replayParseRun: {
        findFirst:
          async () => ({
            id: 7100,
            parserName: "mgz",
            parserVersion: "8",
            parserBuild: "test",
            passName:
              "hd_deterministic_evidence",
            passVersion: "8",
            schemaVersion: "1",
            status: "completed",
            candidateOnly: true,
            affectsPublicAggregates:
              false,
            completedAt:
              new Date(
                "2026-08-05T03:35:37.940Z"
              ),
            observations: [
              {
                id: 7200,
                value:
                  input.rawActivityByPlayer,
                provenance: {
                  source: "test",
                },
              },
            ],
          }),
      },

      betMarket: {
        findMany:
          async () =>
            [],
      },

      pendingWoloClaim: {
        findMany:
          async () =>
            [],
      },
    };

    const prisma = {
      $transaction:
        async (
          callback: (
            transaction:
              typeof tx
          ) => Promise<unknown>
        ) =>
          callback(tx),
    };

    const report =
      await reconcileAutomaticWatcherTerminalResults(
        prisma as never,
        [input.id]
      );

    const expectedRosterHash =
      buildRosterHash(
        normalizeReplayPlayers(
          input.players
        )
      );

    assert.equal(
      report.createdCount,
      1
    );

    assert.equal(
      report.skippedCount,
      0
    );

    assert.equal(
      report.outcomes[0]
        ?.detail,
      "decisive_team_terminal_action_tail"
    );

    assert.equal(
      createdData
        ?.sourceRosterHash,
      expectedRosterHash
    );

    assert.equal(
      createdData
        ?.affectsStats,
      true
    );

    assert.equal(
      createdData
        ?.affectsBets,
      false
    );

    assert.equal(
      createdData
        ?.winningTeamKey,
      "team:1"
    );

    assert.deepEqual(
      createdData
        ?.winningPlayerKeys,
      [
        "steam:76561198059195082",
        "steam:76561198080966717",
        "steam:76561198216610161",
        "steam:76561198718527778",
      ]
    );

    assert.match(
      String(
        createdData?.reason
      ),
      /YODA.*Wok_Dias.*Rick.*Mt\. Bison/
    );
  }
);

test(
  "watcher 1.5.7 completion receipt may omit finalStored and system player zero is ignored",
  () => {
    const input =
      teamInput21197();

    input.terminalReceipt = {
      eventId: "3662128",
      eventType:
        "final_settle_observation_complete",
      createdAt:
        "2026-08-05T03:38:39.969Z",
      userId:
        input.uploaderUserId,
      userUid:
        input.uploaderUid,
      sessionId:
        "session_b769b8ea2ecd4bada99b64429f3e75b0",
      replayHash:
        input.replayHash,
      replayFile:
        "MP Replay v5.8 @2026.08.04 231024 (3).aoe2record",
      metadata: {
        runtimeEventType:
          "final-settle-observation-complete",
        watcherVersion:
          "1.5.7",
      },
    };

    input.rawActivityByPlayer = [
      {
        player_number: 0,
        player_name: null,
        action_packet_count: 1,
        first_action_ms: 2494818,
        last_action_ms: 2494818,
        action_type_counts: {
          game: 1,
        },
      },
      ...(
        input.rawActivityByPlayer as Array<
          Record<string, unknown>
        >
      ),
    ];

    const evaluation =
      evaluateWatcherTeamTerminalResult(
        input
      );

    assert.equal(
      evaluation.eligible,
      true
    );

    if (!evaluation.eligible) {
      return;
    }

    assert.equal(
      evaluation.winningTeamKey,
      "team:1"
    );

    const evidence =
      evaluation.evidence as {
        policyVersion?: unknown;
        terminalReceiptMode?: unknown;
      };

    assert.equal(
      evidence.policyVersion,
      WATCHER_TEAM_TERMINAL_POLICY_VERSION
    );

    assert.equal(
      evidence.terminalReceiptMode,
      "exact_watcher_receipt"
    );
  }
);

test(
  "explicitly false finalStored or mismatched receipt identity still fails closed",
  () => {
    const explicitFalseReceipt =
      teamInput21197();

    explicitFalseReceipt.terminalReceipt = {
      eventType:
        "final_settle_observation_complete",
      userId:
        explicitFalseReceipt
          .uploaderUserId,
      userUid:
        explicitFalseReceipt
          .uploaderUid,
      sessionId:
        "session_exact",
      replayHash:
        explicitFalseReceipt
          .replayHash,
      replayFile:
        "MP Replay.aoe2record",
      metadata: {
        finalStored: false,
      },
    };

    assert.deepEqual(
      evaluateWatcherTeamTerminalResult(
        explicitFalseReceipt
      ),
      {
        eligible: false,
        reason:
          "terminal_receipt_conflicts",
      }
    );

    const mismatchedHash =
      teamInput21197();

    mismatchedHash.terminalReceipt = {
      eventType:
        "final_settle_observation_complete",
      userId:
        mismatchedHash
          .uploaderUserId,
      userUid:
        mismatchedHash
          .uploaderUid,
      sessionId:
        "session_exact",
      replayHash:
        "9".repeat(64),
      replayFile:
        "MP Replay.aoe2record",
      metadata: {},
    };

    assert.deepEqual(
      evaluateWatcherTeamTerminalResult(
        mismatchedHash
      ),
      {
        eligible: false,
        reason:
          "terminal_receipt_conflicts",
      }
    );
  }
);
