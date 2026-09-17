let betsClientWarmPromise: Promise<unknown> | null = null;

export function warmBetsClient(): Promise<unknown> {
  betsClientWarmPromise ??= import("@/app/bets/page")
    .then((module) => module.default)
    .catch((error) => {
      betsClientWarmPromise = null;
      throw error;
    });

  return betsClientWarmPromise;
}
