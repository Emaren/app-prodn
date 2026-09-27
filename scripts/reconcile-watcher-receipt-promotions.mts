#!/usr/bin/env node
/** Serial operator entry point. A dry run only reads DB state and writes private
 * immutable candidate receipts. --apply is explicit; no HTTP or timer enables it.
 * Example: node --experimental-strip-types --experimental-loader
 * ./scripts/aoe2-alias-loader.mjs scripts/reconcile-watcher-receipt-promotions.mts
 * --api-root /path/to/api --python /path/to/venv/bin/python
 * --archive-dir /path/to/archive --receipt-dir /private/receipts 44862
 */
import { getPrisma } from "../lib/prisma.ts";
import { reconcileWatcherReceiptPromotion } from "../lib/watcherReceiptPromotion.ts";

const args = process.argv.slice(2);
const paths = new Map<string, string>();
const ids: number[] = [];
let apply = false;
for (let index = 0; index < args.length; index += 1) {
  const value = args[index];
  if (value === "--apply") { apply = true; continue; }
  if (["--api-root", "--python", "--archive-dir", "--receipt-dir"].includes(value)) {
    const path = args[++index];
    if (!path || path.startsWith("--") || paths.has(value)) throw new Error(`Invalid ${value}`);
    paths.set(value, path);
    continue;
  }
  if (!/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new Error(`Unknown argument: ${value}`);
  }
  ids.push(Number(value));
}
for (const name of ["--api-root", "--python", "--archive-dir", "--receipt-dir"]) {
  if (!paths.has(name)) throw new Error(`Required runtime path: ${name}`);
}
const gameStatsIds = [...new Set(ids)];
if (gameStatsIds.length === 0 || gameStatsIds.length > 10) {
  throw new Error("Provide 1–10 exact GameStats IDs; canaries run serially.");
}
const prisma = getPrisma();
try {
  for (const gameStatsId of gameStatsIds) {
    try {
      const report = await reconcileWatcherReceiptPromotion(prisma, {
        gameStatsId, apply,
        apiRoot: paths.get("--api-root")!, pythonExecutable: paths.get("--python")!,
        archiveDirectory: paths.get("--archive-dir")!, receiptDirectory: paths.get("--receipt-dir")!,
      });
      let projection: unknown = null;
      if (report.outcome === "created" || report.outcome === "existing") {
        // Projection is append-safe and retryable after the adjudication commits.
        // It uses the shared stats-only public resolver; no financial writer runs.
        const { ensureReplayIdentityProjections } = await import("../lib/replayIdentityProjection.ts");
        projection = await ensureReplayIdentityProjections(prisma, [gameStatsId]);
        if ((projection as { skippedCount: number }).skippedCount > 0) process.exitCode = 2;
      }
      console.log(JSON.stringify({ ...report, projection }));
    } catch (error) {
      console.log(JSON.stringify({ gameStatsId, outcome: "failed_closed",
        reason: error instanceof Error ? error.message : "unknown_error",
        affectsBets: false, settlementAuthorized: false, woloAuthority: false }));
      process.exitCode = 2;
    }
  }
} finally {
  await prisma.$disconnect();
}
