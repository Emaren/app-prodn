import "server-only";

import type { PrismaClient } from "@/lib/generated/prisma";

export type ReplayParserTrailCategoryKey =
  | "team"
  | "winner"
  | "score"
  | "military"
  | "economy"
  | "technology"
  | "society"
  | "timeline";

export type ReplayParserTrailCategory = {
  key: ReplayParserTrailCategoryKey;
  label: string;
  confidencePct: number | null;
  signals: number;
  state: string;
};

const CATEGORY_LABELS: Record<
  ReplayParserTrailCategoryKey,
  string
> = {
  team: "Team Composition",
  winner: "Winner / Loser",
  score: "Score",
  military: "Military",
  economy: "Economy",
  technology: "Technology",
  society: "Society",
  timeline: "Timeline",
};

const CATEGORY_KEYS = Object.keys(
  CATEGORY_LABELS
) as ReplayParserTrailCategoryKey[];

function asRecord(value: unknown) {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asRecords(value: unknown) {
  return Array.isArray(value)
    ? value
        .map(asRecord)
        .filter(
          (
            entry
          ): entry is Record<string, unknown> =>
            Boolean(entry)
        )
    : [];
}

function cleanText(value: unknown) {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function isKnownWinner(value: unknown) {
  const text = cleanText(value);
  return Boolean(
    text &&
      !/^(unknown|unavailable|unresolved|n\/a|na)$/i.test(
        text
      )
  );
}

function jsonHasKeyTerm(
  value: unknown,
  terms: string[]
): boolean {
  if (Array.isArray(value)) {
    return value.some((entry) =>
      jsonHasKeyTerm(entry, terms)
    );
  }

  const record = asRecord(value);
  if (!record) return false;

  return Object.entries(record).some(
    ([key, child]) =>
      terms.some((term) =>
        key.toLowerCase().includes(term)
      ) || jsonHasKeyTerm(child, terms)
  );
}

function baselineCategory(
  key: ReplayParserTrailCategoryKey,
  captured: boolean,
  capturedLabel = "captured"
): ReplayParserTrailCategory {
  return {
    key,
    label: CATEGORY_LABELS[key],
    confidencePct: null,
    signals: captured ? 1 : 0,
    state: captured
      ? capturedLabel
      : key === "team"
        ? "incomplete"
        : key === "winner"
          ? "unresolved"
          : "not cataloged",
  };
}

function observationMatchesCategory(
  fieldPath: string,
  key: ReplayParserTrailCategoryKey
) {
  const field = fieldPath.toLowerCase();

  switch (key) {
    case "team":
      return (
        field.includes("team") ||
        field.includes("diplomacy")
      );
    case "winner":
      return (
        field.startsWith("result.") ||
        field.includes("winner") ||
        field.includes("winning") ||
        field.includes("resign") ||
        field.includes("concession")
      );
    case "score":
      return field.includes("score");
    case "military":
      return (
        field.includes("military") ||
        field.includes("units_killed") ||
        field.includes("units_lost")
      );
    case "economy":
      return (
        field.includes("economy") ||
        field.includes("resource") ||
        field.includes("food") ||
        field.includes("wood") ||
        field.includes("gold") ||
        field.includes("stone")
      );
    case "technology":
      return (
        field.includes("technology") ||
        field.includes(".tech") ||
        field.startsWith("tech")
      );
    case "society":
      return field.includes("society");
    case "timeline":
      return (
        field.includes("timeline") ||
        field.includes("duration") ||
        field.includes("action") ||
        field.includes("event") ||
        field.includes("chat")
      );
  }
}

function summarizeCategory(
  observations: Array<{
    fieldPath: string;
    confidenceBps: number | null;
  }>,
  key: ReplayParserTrailCategoryKey
): ReplayParserTrailCategory {
  const matches = observations.filter((entry) =>
    observationMatchesCategory(
      entry.fieldPath,
      key
    )
  );

  const confidences = matches
    .map((entry) => entry.confidenceBps)
    .filter(
      (value): value is number =>
        typeof value === "number" &&
        Number.isFinite(value)
    );

  const confidencePct =
    confidences.length > 0
      ? Math.round(
          (confidences.reduce(
            (sum, value) => sum + value,
            0
          ) /
            confidences.length /
            100) *
            10
        ) / 10
      : null;

  return {
    key,
    label: CATEGORY_LABELS[key],
    confidencePct,
    signals: matches.length,
    state:
      matches.length > 0
        ? "observed"
        : "no material observation",
  };
}

function readStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter(
        (entry): entry is string =>
          typeof entry === "string"
      )
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  const record = asRecord(value);
  if (!record) return [];

  for (const key of [
    "winning_player_keys",
    "player_keys",
    "keys",
  ]) {
    const values = readStringArray(record[key]);
    if (values.length > 0) return values;
  }

  return [];
}

function normalizedSet(values: string[]) {
  return [
    ...new Set(
      values.map((value) =>
        value.trim().toLowerCase()
      )
    ),
  ]
    .filter(Boolean)
    .sort();
}

function sameStringSet(
  left: string[],
  right: string[]
) {
  const a = normalizedSet(left);
  const b = normalizedSet(right);

  return (
    a.length > 0 &&
    b.length > 0 &&
    a.length === b.length &&
    a.every((value, index) => value === b[index])
  );
}

function parserWinningKeys(
  observations: Array<{
    fieldPath: string;
    value: unknown;
  }>
) {
  const candidate = observations.find((entry) =>
    entry.fieldPath
      .toLowerCase()
      .includes("winning_player_keys")
  );

  return candidate
    ? readStringArray(candidate.value)
    : [];
}

export async function loadReplayParserTrail(
  prisma: PrismaClient,
  gameStatsId: number
) {
  const [game, runs, latestHumanVerdict] =
    await Promise.all([
      prisma.gameStats.findUnique({
        where: { id: gameStatsId },
      }),
      prisma.replayParseRun.findMany({
        where: { gameStatsId },
        orderBy: [
          { createdAt: "asc" },
          { id: "asc" },
        ],
        include: {
          observations: {
            orderBy: { id: "asc" },
          },
        },
      }),
      prisma.replayResultAdjudication.findFirst({
        where: {
          gameStatsId,
          decisionStatus: "accepted",
        },
        orderBy: [
          { createdAt: "desc" },
          { id: "desc" },
        ],
      }),
    ]);

  if (!game) {
    throw new Error("Replay game not found.");
  }

  // This is deliberately the raw GameStats parser state.
  // No human adjudication overlay is applied here.
  const players = asRecords(game.players);
  const keyEvents = game.key_events;

  const teamCaptured =
    players.length >= 2 &&
    players.every((player) => {
      const team =
        player.team_id ?? player.teamId;
      return (
        team !== null &&
        team !== undefined &&
        String(team).trim().length > 0
      );
    });

  const winnerFlagNames = players
    .filter((player) => player.winner === true)
    .map((player) => cleanText(player.name))
    .filter(Boolean);

  const originalWinner = isKnownWinner(game.winner)
    ? cleanText(game.winner)
    : winnerFlagNames.length > 0
      ? winnerFlagNames.join(" | ")
      : null;

  const scoreCaptured =
    players.some(
      (player) =>
        typeof player.score === "number" &&
        Number.isFinite(player.score)
    ) ||
    jsonHasKeyTerm(keyEvents, ["score"]);

  const duration =
    game.game_duration ?? game.duration;

  const timelineCaptured =
    (typeof duration === "number" &&
      duration > 0) ||
    (Array.isArray(game.event_types) &&
      game.event_types.length > 0);

  const baselineCategories = [
    baselineCategory(
      "team",
      teamCaptured
    ),
    baselineCategory(
      "winner",
      Boolean(originalWinner)
    ),
    baselineCategory(
      "score",
      scoreCaptured
    ),
    baselineCategory(
      "military",
      jsonHasKeyTerm(keyEvents, ["military"])
    ),
    baselineCategory(
      "economy",
      jsonHasKeyTerm(keyEvents, ["economy"])
    ),
    baselineCategory(
      "technology",
      jsonHasKeyTerm(keyEvents, [
        "technology",
        "tech",
      ])
    ),
    baselineCategory(
      "society",
      jsonHasKeyTerm(keyEvents, ["society"])
    ),
    baselineCategory(
      "timeline",
      timelineCaptured
    ),
  ];

  const humanWinningKeys = latestHumanVerdict
    ? readStringArray(
        latestHumanVerdict.winningPlayerKeys
      )
    : [];

  return {
    baseline: {
      label: "Original Parser State",
      parseIteration: game.parse_iteration,
      parseSource: game.parse_source,
      parseReason: game.parse_reason,
      winner: originalWinner,
      rosterCount: players.length,
      capturedAt:
        (
          game.timestamp ??
          game.createdAt
        ).toISOString(),
      categories: baselineCategories,
    },

    runs: runs.map((run) => {
      const observations = run.observations.map(
        (observation) => ({
          fieldPath: observation.fieldPath,
          confidenceBps:
            observation.confidenceBps,
          value: observation.value as unknown,
        })
      );

      const winningKeys =
        parserWinningKeys(observations);

      let winnerAgreement:
        | "match"
        | "conflict"
        | "not_comparable" =
        "not_comparable";

      if (
        winningKeys.length > 0 &&
        humanWinningKeys.length > 0
      ) {
        winnerAgreement = sameStringSet(
          winningKeys,
          humanWinningKeys
        )
          ? "match"
          : "conflict";
      }

      return {
        id: run.id,
        runIdentityHash: run.runIdentityHash,
        parserName: run.parserName,
        parserVersion: run.parserVersion,
        parserBuild: run.parserBuild,
        passName: run.passName,
        passVersion: run.passVersion,
        schemaVersion: run.schemaVersion,
        status: run.status,
        failureSignature: run.failureSignature,
        observationCount: run.observationCount,
        candidateOnly: run.candidateOnly,
        affectsPublicAggregates:
          run.affectsPublicAggregates,
        startedAt: run.startedAt.toISOString(),
        completedAt:
          run.completedAt.toISOString(),
        createdAt: run.createdAt.toISOString(),
        categories: CATEGORY_KEYS.map((key) =>
          summarizeCategory(
            observations,
            key
          )
        ),
        benchmark: {
          humanVerdictId:
            latestHumanVerdict?.id ?? null,
          winnerAgreement,
        },
      };
    }),
  };
}
