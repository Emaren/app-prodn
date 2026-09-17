const BETS_BOARD_WARM_MAX_AGE_MS = 4_500;

type WarmBoardRecord = {
  authKey: string | null;
  promise: Promise<unknown | null>;
  resolvedAt: number | null;
};

let warmBoardRecord: WarmBoardRecord | null = null;

export function warmBetsBoard(authKey: string | null): Promise<unknown | null> {
  if (typeof window === "undefined") {
    return Promise.resolve(null);
  }

  if (
    warmBoardRecord &&
    warmBoardRecord.authKey === authKey &&
    (warmBoardRecord.resolvedAt === null ||
      Date.now() - warmBoardRecord.resolvedAt <= BETS_BOARD_WARM_MAX_AGE_MS)
  ) {
    return warmBoardRecord.promise;
  }

  const record: WarmBoardRecord = {
    authKey,
    promise: Promise.resolve(null),
    resolvedAt: null,
  };

  record.promise = fetch("/api/bets", {
    cache: "no-store",
    credentials: "same-origin",
  })
    .then(async (response) => {
      if (!response.ok) return null;
      const payload = (await response.json()) as unknown;
      record.resolvedAt = Date.now();
      return payload;
    })
    .catch(() => null)
    .then((payload) => {
      if (payload === null && warmBoardRecord === record) {
        warmBoardRecord = null;
      }
      return payload;
    });

  warmBoardRecord = record;
  return record.promise;
}

export async function consumeWarmBetsBoard(authKey: string | null): Promise<unknown | null> {
  const record = warmBoardRecord;
  warmBoardRecord = null;
  if (!record || record.authKey !== authKey) return null;

  const payload = await record.promise;
  if (payload === null) return null;
  if (
    record.resolvedAt !== null &&
    Date.now() - record.resolvedAt > BETS_BOARD_WARM_MAX_AGE_MS
  ) {
    return null;
  }

  return payload;
}
