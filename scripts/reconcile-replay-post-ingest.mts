import "dotenv/config";

import { ensureBetMarkets } from "@/lib/bets";
import { getPrisma } from "@/lib/prisma";
import { ensureReplayIdentityProjections } from "@/lib/replayIdentityProjection";
import { reconcileAutomaticWatcherTerminalResults } from "@/lib/replayResultAdjudications";
import { reconcileTournamentMatchProofs } from "@/lib/tournamentProofReconciler";

const APPLY_CONFIRMATION = "APPLY-REPLAY-POST-INGEST";

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function integerArgument(name: string, fallback: number) {
  const raw = argument(name);
  if (raw === null) return fallback;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
  return parsed;
}

async function main() {
  const prisma = getPrisma();
  const apply = process.argv.includes("--apply");
  const gameId = integerArgument("--game-id", 0);
  const afterId = integerArgument("--after-id", 0);
  const limit = Math.min(
    Math.max(integerArgument("--limit", 100), 1),
    500
  );
  const missingIdentities = process.argv.includes(
    "--missing-identities"
  );

  if (
    apply &&
    argument("--confirm") !== APPLY_CONFIRMATION
  ) {
    throw new Error(
      `Apply mode requires --confirm ${APPLY_CONFIRMATION}.`
    );
  }
  if (!gameId && !missingIdentities) {
    throw new Error(
      "Provide --game-id ID or --missing-identities."
    );
  }

  const games = await prisma.gameStats.findMany({
    where: {
      id: gameId > 0 ? gameId : { gt: afterId },
      is_final: true,
      ...(missingIdentities
        ? {
            replayStatProjections: {
              none: {
                projectionStatus: "accepted",
                affectsPublicAggregates: true,
                supersededBy: null,
              },
            },
          }
        : {}),
    },
    orderBy: { id: "asc" },
    take: gameId > 0 ? 1 : limit,
    select: {
      id: true,
      replayHash: true,
      original_filename: true,
      parse_source: true,
      parse_reason: true,
      is_final: true,
      winner: true,
    },
  });
  const gameStatsIds = games.map((game) => game.id);

  if (!apply) {
    process.stdout.write(
      `${JSON.stringify(
        {
          mode: "plan",
          gameStatsIds,
          selected: games,
          nextAfterId: games.at(-1)?.id ?? afterId,
        },
        null,
        2
      )}\n`
    );
    await prisma.$disconnect();
    return;
  }

  const automaticResults =
    await reconcileAutomaticWatcherTerminalResults(
      prisma,
      gameStatsIds
    );
  const identities = await ensureReplayIdentityProjections(
    prisma,
    gameStatsIds
  );

  let tournamentReconciled = false;
  let marketsReconciled = false;
  if (
    automaticResults.createdCount > 0 ||
    automaticResults.existingCount > 0
  ) {
    await reconcileTournamentMatchProofs(prisma, { force: true });
    tournamentReconciled = true;
    await ensureBetMarkets(prisma);
    marketsReconciled = true;
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        mode: "apply",
        gameStatsIds,
        automaticResults,
        identities,
        tournamentReconciled,
        marketsReconciled,
        nextAfterId: games.at(-1)?.id ?? afterId,
      },
      null,
      2
    )}\n`
  );

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
