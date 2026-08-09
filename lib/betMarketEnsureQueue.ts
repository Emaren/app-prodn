import type { PrismaClient } from "@/lib/generated/prisma";

import { ensureBetMarkets } from "@/lib/bets";

let lastBackgroundEnsureAt = 0;
let backgroundEnsurePromise: Promise<void> | null = null;
let backgroundEnsureTimer: ReturnType<typeof setTimeout> | null = null;
export const BET_MARKET_ENSURE_MIN_INTERVAL_MS = 5_000;

export function queueBetMarketEnsure(prisma: PrismaClient, delayMs = 1_000) {
  const now = Date.now();

  if (
    backgroundEnsurePromise ||
    backgroundEnsureTimer ||
    now - lastBackgroundEnsureAt < BET_MARKET_ENSURE_MIN_INTERVAL_MS
  ) {
    return;
  }

  lastBackgroundEnsureAt = now;
  backgroundEnsureTimer = setTimeout(() => {
    backgroundEnsureTimer = null;

    if (backgroundEnsurePromise) return;

    backgroundEnsurePromise = ensureBetMarkets(prisma)
      .catch((error) => {
        console.warn("Background bet-market ensure failed:", error);
      })
      .finally(() => {
        backgroundEnsurePromise = null;
      });
  }, Math.max(0, delayMs));
}
