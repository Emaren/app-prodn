import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPlayerPairRivalryContext,
  loadRecentFinalMatchupRows,
  PUBLIC_MATCHUP_SCAN_LIMIT,
  type MatchupGameRow,
} from "../lib/publicMatchups.ts";
import {
  buildReplayPublicPlayerRef,
} from "../lib/publicPlayers.ts";

function replayRow(
  input: {
    id: number;
    playedOn: string;
    leftName: string;
    rightName: string;
    winner: string | null;
    leftWon?: boolean | null;
    rightWon?: boolean | null;
    parseReason: string;
    keyEvents?: Record<string, unknown>;
    disconnectDetected?: boolean;
  }
): MatchupGameRow {
  return {
    id: input.id,
    is_final: true,
    replayHash: String(input.id).padStart(64, "0"),
    winner: input.winner,
    players: [
      {
        name: input.leftName,
        winner: input.leftWon ?? null,
      },
      {
        name: input.rightName,
        winner: input.rightWon ?? null,
      },
    ],
    played_on: input.playedOn,
    timestamp: input.playedOn,
    createdAt: input.playedOn,
    original_filename: `fixture-${input.id}.aoe2record`,
    replay_file: `fixture-${input.id}.aoe2record`,
    parse_reason: input.parseReason,
    parse_source: "watcher_final",
    disconnect_detected:
      input.disconnectDetected ?? false,
    map: {
      name: "Yucatan",
    },
    event_types: [],
    key_events: input.keyEvents ?? {},
  };
}

function provenEmarenWin(
  id: number,
  playedOn: string
) {
  return replayRow({
    id,
    playedOn,
    leftName: "Emaren",
    rightName: "Sechma",
    winner: "Emaren",
    leftWon: true,
    rightWon: false,
    parseReason: "recorded_resignation_final",
    keyEvents: {
      completed: true,
      completion_source: "resignation",
      resigned_player_names: ["Sechma"],
    },
  });
}

function rejectedSechmaInference(
  id: number,
  playedOn: string
) {
  return replayRow({
    id,
    playedOn,
    leftName: "Emaren",
    rightName: "Sechma",
    winner: "Sechma",
    leftWon: false,
    rightWon: true,
    parseReason:
      "watcher_inferred_opponent_win_on_incomplete_1v1",
    disconnectDetected: true,
    keyEvents: {
      winner_inference: {
        type: "uploader_incomplete_1v1_opponent",
        uploader_player: "Emaren",
        inferred_winner: "Sechma",
      },
    },
  });
}

function unresolvedMeeting(
  id: number,
  playedOn: string,
  parseReason: string
) {
  return replayRow({
    id,
    playedOn,
    leftName: "Emaren",
    rightName: "Sechma",
    winner: "Unknown",
    parseReason,
    disconnectDetected: true,
  });
}

test("the shared matchup scan preserves the full Emaren-Sechma series beyond the legacy detail window", async () => {
  const currentMeeting =
    provenEmarenWin(
      20_000,
      "2026-07-28T18:30:26.000Z"
    );

  const unrelatedRecentRows =
    Array.from(
      {
        length: 800,
      },
      (_, index) =>
        replayRow({
          id: 10_000 + index,
          playedOn:
            "2026-07-27T18:30:26.000Z",
          leftName: "Jim",
          rightName:
            `Unrelated ${index}`,
          winner: "Jim",
          leftWon: true,
          rightWon: false,
          parseReason:
            "recorded_resignation_final",
        })
    );

  const olderMeetings = [
    ...Array.from(
      {
        length: 8,
      },
      (_, index) =>
        provenEmarenWin(
          2_000 + index,
          `2026-0${Math.max(
            1,
            6 - index
          )}-01T12:00:00.000Z`
        )
    ),
    rejectedSechmaInference(
      1_100,
      "2026-04-08T13:45:59.000Z"
    ),
    rejectedSechmaInference(
      1_101,
      "2026-03-28T19:31:22.000Z"
    ),
    unresolvedMeeting(
      1_102,
      "2026-03-23T15:01:11.000Z",
      "watcher_final_submission"
    ),
    unresolvedMeeting(
      1_103,
      "2026-03-22T15:01:11.000Z",
      "hd_early_exit_under_60s"
    ),
  ];

  const corpus = [
    currentMeeting,
    ...unrelatedRecentRows,
    ...olderMeetings,
  ];

  let queryTake: number | undefined;
  let matchupQueryCount = 0;
  let generationRevision = 1;
  const prisma = {
    gameStats: {
      findFirst: async () => ({
        id: generationRevision,
        is_final: true,
        parse_iteration: generationRevision,
        parse_reason: "recorded_resignation_final",
        parse_source: "watcher_final",
        winner: "Emaren",
      }),
      findMany: async (
        options: {
          take?: number;
        }
      ) => {
        matchupQueryCount += 1;
        queryTake = options.take;
        return corpus;
      },
    },
    replayStatProjection: {
      findFirst: async () => null,
    },
    replayPlayerSnapshot: {
      findFirst: async () => null,
    },
    replayResultAdjudication: {
      findFirst: async () => null,
    },
    $queryRaw: async () => [
      {
        fingerprint: `identity-${generationRevision}`,
      },
    ],
  } as unknown as Parameters<
    typeof loadRecentFinalMatchupRows
  >[0];

  const emaren =
    buildReplayPublicPlayerRef(
      "Emaren"
    );
  const sechma =
    buildReplayPublicPlayerRef(
      "Sechma"
    );

  const legacyRows =
    await loadRecentFinalMatchupRows(
      prisma,
      800
    );
  const legacySummary =
    buildPlayerPairRivalryContext(
      legacyRows,
      emaren,
      sechma
    );

  assert.equal(
    legacySummary.totalMatches,
    1
  );

  const canonicalRows =
    await loadRecentFinalMatchupRows(
      prisma,
      PUBLIC_MATCHUP_SCAN_LIMIT
    );
  const canonicalSummary =
    buildPlayerPairRivalryContext(
      canonicalRows,
      emaren,
      sechma
    );

  assert.equal(
    PUBLIC_MATCHUP_SCAN_LIMIT,
    null
  );
  assert.equal(
    queryTake,
    undefined
  );
  assert.equal(
    matchupQueryCount,
    1,
    "numeric and canonical views should share one complete-corpus projection"
  );
  assert.deepEqual(
    {
      meetings:
        canonicalSummary.totalMatches,
      duels:
        canonicalSummary.duelCount,
      emarenWins:
        canonicalSummary.leftWins,
      sechmaWins:
        canonicalSummary.rightWins,
      unresolved:
        canonicalSummary.unknowns,
    },
    {
      meetings: 13,
      duels: 13,
      emarenWins: 9,
      sechmaWins: 0,
      unresolved: 4,
    }
  );
  assert.equal(
    canonicalSummary.leftWins +
      canonicalSummary.rightWins +
      canonicalSummary.unknowns,
    canonicalSummary.totalMatches
  );

  corpus.unshift(
    provenEmarenWin(
      21_000,
      "2026-07-29T18:30:26.000Z"
    )
  );
  generationRevision += 1;

  await new Promise((resolve) => setTimeout(resolve, 1_050));

  const [refreshedRows, concurrentRows] =
    await Promise.all([
      loadRecentFinalMatchupRows(
        prisma,
        PUBLIC_MATCHUP_SCAN_LIMIT
      ),
      loadRecentFinalMatchupRows(
        prisma,
        PUBLIC_MATCHUP_SCAN_LIMIT
      ),
    ]);
  assert.equal(
    concurrentRows.length,
    refreshedRows.length,
    "same-generation concurrent readers should share the in-flight projection"
  );
  const refreshedSummary =
    buildPlayerPairRivalryContext(
      refreshedRows,
      emaren,
      sechma
    );

  assert.equal(
    matchupQueryCount,
    2,
    "a new public replay generation must invalidate the shared projection"
  );
  assert.equal(
    refreshedSummary.totalMatches,
    14
  );
  assert.equal(
    refreshedSummary.leftWins,
    10
  );
});
