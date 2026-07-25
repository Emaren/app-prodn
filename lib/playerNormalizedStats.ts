import type { PrismaClient } from "@/lib/generated/prisma";

const MAX_PLAYER_SNAPSHOTS = 5_000;

export type PlayerNormalizedMetricSummary = {
  metricKey: string;
  metricGroup: string;
  unit: string;
  aggregationMethod: string;
  metricGameCount: number;
  coverageBps: number;
  numericSum: number;
  numericAverage: number;
  numericMinimum: number;
  numericMaximum: number;
  bestGameStatsId: number | null;
};

export type PlayerNormalizedStats = {
  visibleGames: number;
  metricCount: number;
  schemaVersion: string | null;
  metricDictionaryVersion: string | null;
  truncated: boolean;
  metrics: PlayerNormalizedMetricSummary[];
};

function normalizedName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

function emptyPlayerNormalizedStats(): PlayerNormalizedStats {
  return {
    visibleGames: 0,
    metricCount: 0,
    schemaVersion: null,
    metricDictionaryVersion: null,
    truncated: false,
    metrics: [],
  };
}

function bestDirection(metricKey: string) {
  return metricKey.endsWith("_time") ||
    metricKey.includes("first_recorded_command") ||
    metricKey.includes("largest_recorded_command_gap")
    ? "minimum"
    : "maximum";
}

/**
 * Read only explicitly accepted, current, exact normalized facts. Result
 * eligibility is intentionally not part of this query: a replay can have
 * trustworthy economy/action statistics while its competitive result remains
 * unresolved.
 */
export async function loadPlayerNormalizedStats(
  prisma: PrismaClient,
  input: {
    userId?: number | null;
    aliases: string[];
  }
): Promise<PlayerNormalizedStats> {
  const aliases = [
    ...new Set(input.aliases.map(normalizedName).filter(Boolean)),
  ];
  if (!input.userId && aliases.length === 0) {
    return emptyPlayerNormalizedStats();
  }

  try {
    const identityFilters = [
      ...(input.userId ? [{ userId: input.userId }] : []),
      ...(aliases.length > 0
        ? [
            input.userId
              ? {
                  userId: null,
                  normalizedName: { in: aliases },
                }
              : { normalizedName: { in: aliases } },
          ]
        : []),
    ];
    const snapshots = await prisma.replayPlayerSnapshot.findMany({
      where: {
        statEligible: true,
        OR: identityFilters,
        projection: {
          projectionStatus: "accepted",
          affectsPublicAggregates: true,
          supersededBy: null,
        },
      },
      orderBy: [
        { gameStats: { played_on: "desc" } },
        { gameStatsId: "desc" },
        { id: "desc" },
      ],
      take: MAX_PLAYER_SNAPSHOTS + 1,
      select: {
        id: true,
        gameStatsId: true,
        userId: true,
        playerKey: true,
        projection: {
          select: {
            schemaVersion: true,
            metricDictionaryVersion: true,
          },
        },
        metrics: {
          where: {
            statEligible: true,
            exact: true,
            numericValue: { not: null },
          },
          orderBy: { metricKey: "asc" },
          select: {
            metricKey: true,
            metricGroup: true,
            unit: true,
            aggregationMethod: true,
            numericValue: true,
          },
        },
      },
    });
    const truncated = snapshots.length > MAX_PLAYER_SNAPSHOTS;
    const bounded = snapshots.slice(0, MAX_PLAYER_SNAPSHOTS);
    const candidatesByGame = new Map<
      number,
      (typeof bounded)[number][]
    >();
    for (const snapshot of bounded) {
      const candidates =
        candidatesByGame.get(snapshot.gameStatsId) ?? [];
      candidates.push(snapshot);
      candidatesByGame.set(snapshot.gameStatsId, candidates);
    }
    const uniqueSnapshots = new Map<
      number,
      (typeof bounded)[number]
    >();
    for (const [gameStatsId, candidates] of candidatesByGame) {
      const directlyLinked = input.userId
        ? candidates.filter(
            (snapshot) => snapshot.userId === input.userId
          )
        : [];
      const eligibleCandidates =
        directlyLinked.length > 0
          ? directlyLinked
          : candidates.filter((snapshot) => snapshot.userId === null);
      // Ambiguous same-game aliases are excluded instead of double-counted.
      // A direct immutable user link always wins over an unlinked name match.
      if (eligibleCandidates.length === 1) {
        uniqueSnapshots.set(gameStatsId, eligibleCandidates[0]);
      }
    }
    const visibleGames = uniqueSnapshots.size;
    if (visibleGames === 0) return emptyPlayerNormalizedStats();

    const byMetric = new Map<
      string,
      {
        metricGroup: string;
        unit: string;
        aggregationMethod: string;
        values: Array<{ gameStatsId: number; value: number }>;
      }
    >();
    for (const snapshot of uniqueSnapshots.values()) {
      for (const metric of snapshot.metrics) {
        const value = Number(metric.numericValue);
        if (!Number.isFinite(value)) continue;
        const accumulator = byMetric.get(metric.metricKey) ?? {
          metricGroup: metric.metricGroup,
          unit: metric.unit,
          aggregationMethod: metric.aggregationMethod,
          values: [],
        };
        accumulator.values.push({
          gameStatsId: snapshot.gameStatsId,
          value,
        });
        byMetric.set(metric.metricKey, accumulator);
      }
    }

    const metrics = [...byMetric.entries()]
      .map(([metricKey, metric]) => {
        const values = metric.values.map((entry) => entry.value);
        const numericSum = values.reduce((sum, value) => sum + value, 0);
        const numericMinimum = Math.min(...values);
        const numericMaximum = Math.max(...values);
        const bestValue =
          bestDirection(metricKey) === "minimum"
            ? numericMinimum
            : numericMaximum;
        const metricGameCount = new Set(
          metric.values.map((entry) => entry.gameStatsId)
        ).size;
        return {
          metricKey,
          metricGroup: metric.metricGroup,
          unit: metric.unit,
          aggregationMethod: metric.aggregationMethod,
          metricGameCount,
          coverageBps: Math.round(
            (metricGameCount / visibleGames) * 10_000
          ),
          numericSum,
          numericAverage: numericSum / values.length,
          numericMinimum,
          numericMaximum,
          bestGameStatsId:
            metric.values.find((entry) => entry.value === bestValue)
              ?.gameStatsId ?? null,
        };
      })
      .sort(
        (left, right) =>
          left.metricGroup.localeCompare(right.metricGroup) ||
          right.metricGameCount - left.metricGameCount ||
          left.metricKey.localeCompare(right.metricKey)
      );
    const latest = [...uniqueSnapshots.values()][0];

    return {
      visibleGames,
      metricCount: metrics.length,
      schemaVersion: latest?.projection.schemaVersion ?? null,
      metricDictionaryVersion:
        latest?.projection.metricDictionaryVersion ?? null,
      truncated,
      metrics,
    };
  } catch (error) {
    // A rolling deploy can briefly serve new code before its migration. Player
    // pages retain their legacy/raw rails instead of white-screening.
    const code =
      error && typeof error === "object" && "code" in error
        ? String(error.code)
        : "";
    if (["P2021", "P2022"].includes(code)) {
      return emptyPlayerNormalizedStats();
    }
    throw error;
  }
}
