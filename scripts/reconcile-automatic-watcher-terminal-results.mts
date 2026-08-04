import { getPrisma } from "../lib/prisma.ts";
import { reconcileAutomaticWatcherTerminalResults } from "../lib/replayResultAdjudications.ts";

const gameStatsIds = process.argv
  .slice(2)
  .map((value) => Number(value))
  .filter((value) => Number.isSafeInteger(value) && value > 0);

if (gameStatsIds.length === 0) {
  throw new Error(
    "Provide at least one positive GameStats ID, for example: npm run replay:terminal:reconcile -- 20874"
  );
}

const prisma = getPrisma();

try {
  const report = await reconcileAutomaticWatcherTerminalResults(
    prisma,
    gameStatsIds
  );
  console.log(JSON.stringify(report, null, 2));

  if (report.createdCount + report.existingCount === 0) {
    process.exitCode = 2;
  }
} finally {
  await prisma.$disconnect();
}
