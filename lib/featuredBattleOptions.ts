export type FeaturedBattleOption = {
  key: string;
  href: string;
  sessionKey: string | null;
  detailAt: string | null;
  statusLabel: string;
};

function timestamp(value: string | null | undefined) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function optionIdentity(option: FeaturedBattleOption) {
  if (option.href.startsWith("/game-stats/")) {
    return `game:${option.href}`;
  }

  if (option.sessionKey) {
    return `session:${option.sessionKey}`;
  }

  return `key:${option.key}`;
}

export function orderFeaturedBattleOptions<T extends FeaturedBattleOption>(input: {
  active: readonly T[];
  completed: readonly T[];
  replay: T | null;
  maxActive?: number;
  maxRecent?: number;
}) {
  const maxActive = Math.max(0, input.maxActive ?? 4);
  const maxRecent = Math.max(0, input.maxRecent ?? 3);
  const active = [...input.active].slice(0, maxActive);
  const recent = [
    ...input.completed,
    ...(input.replay ? [input.replay] : []),
  ].sort((left, right) => {
    const timeDelta = timestamp(right.detailAt) - timestamp(left.detailAt);
    if (timeDelta !== 0) return timeDelta;
    return right.key.localeCompare(left.key);
  });

  const seen = new Set(active.map(optionIdentity));
  const orderedRecent: T[] = [];

  for (const option of recent) {
    const identity = optionIdentity(option);
    if (seen.has(identity)) continue;
    seen.add(identity);
    orderedRecent.push(option);
    if (orderedRecent.length >= maxRecent) break;
  }

  return [...active, ...orderedRecent];
}
