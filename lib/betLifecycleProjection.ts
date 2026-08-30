export const BET_LIFECYCLE_SCHEMA = "bet-lifecycle-v1" as const;

export type BetLifecycleEventKind =
  | "stake_intent"
  | "stake_recorded"
  | "escrow_funded"
  | "founder_participants"
  | "founder_winner"
  | "result"
  | "payout"
  | "refund"
  | "winner_bounty";

export type BetLifecycleSource =
  | "stake_intent"
  | "wager"
  | "founder_bonus"
  | "market"
  | "claim";

export type BetLifecyclePayoutDestination =
  | "wallet"
  | "awaiting_wallet_link"
  | "settlement_queue"
  | "failed"
  | "rescinded";

export type BetLifecycleSourceEvent = {
  marketId: number;
  marketTitle: string;
  marketHref?: string | null;
  source: BetLifecycleSource;
  sourceId: string | number;
  kind: BetLifecycleEventKind;
  status: string;
  occurredAt: string;
  amountWolo?: number | null;
  actor?: string | null;
  txHash?: string | null;
  payoutDestination?: BetLifecyclePayoutDestination | null;
  /**
   * Identifies one economic action across projections. A verified stake intent
   * and its recorded wager, for example, share this key so the money is counted
   * once while the higher-authority wager representation wins.
   */
  economicKey?: string | null;
  detail?: string | null;
};

export type BetLifecycleEvent = {
  id: string;
  kind: BetLifecycleEventKind;
  status: string;
  occurredAt: string;
  amountWolo: number | null;
  eventCount: number;
  actors: string[];
  txHash: string | null;
  payoutDestination: BetLifecyclePayoutDestination | "mixed" | null;
  payoutDestinationCounts: Partial<Record<BetLifecyclePayoutDestination, number>>;
  sourceIds: string[];
  detail: string | null;
};

export type BetLifecycleGroup = {
  schema: typeof BET_LIFECYCLE_SCHEMA;
  id: string;
  groupKey: string;
  marketId: number;
  marketTitle: string;
  marketHref: string | null;
  occurredAt: string;
  startedAt: string;
  stakeTotalWolo: number;
  payoutTotalWolo: number;
  refundTotalWolo: number;
  founderParticipantsWolo: number;
  founderWinnerWolo: number;
  events: BetLifecycleEvent[];
};

const EVENT_PHASE: Record<BetLifecycleEventKind, number> = {
  stake_intent: 10,
  stake_recorded: 20,
  escrow_funded: 20,
  founder_participants: 30,
  founder_winner: 31,
  result: 40,
  payout: 50,
  refund: 50,
  winner_bounty: 51,
};

const SOURCE_AUTHORITY: Record<BetLifecycleSource, number> = {
  stake_intent: 10,
  wager: 20,
  founder_bonus: 20,
  market: 30,
  claim: 40,
};

function safeTimestamp(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function cleanText(value: string | null | undefined) {
  const clean = String(value || "").trim();
  return clean || null;
}

function cleanAmount(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function sourceIdentity(event: BetLifecycleSourceEvent) {
  return `${event.source}:${String(event.sourceId)}`;
}

function canonicalEconomicKey(event: BetLifecycleSourceEvent) {
  const explicit = cleanText(event.economicKey);
  return explicit || `${event.kind}:${sourceIdentity(event)}`;
}

function compareSourceEvents(
  left: BetLifecycleSourceEvent,
  right: BetLifecycleSourceEvent,
) {
  const authority = SOURCE_AUTHORITY[right.source] - SOURCE_AUTHORITY[left.source];
  if (authority !== 0) return authority;

  const timestamp = safeTimestamp(right.occurredAt) - safeTimestamp(left.occurredAt);
  if (timestamp !== 0) return timestamp;

  return sourceIdentity(left).localeCompare(sourceIdentity(right));
}

function dedupeEconomicEvents(events: BetLifecycleSourceEvent[]) {
  const byEconomicKey = new Map<string, BetLifecycleSourceEvent>();

  for (const event of [...events].sort(compareSourceEvents)) {
    const key = canonicalEconomicKey(event);
    if (!byEconomicKey.has(key)) byEconomicKey.set(key, event);
  }

  return [...byEconomicKey.values()];
}

function aggregateKind(
  marketId: number,
  kind: BetLifecycleEventKind,
  events: BetLifecycleSourceEvent[],
): BetLifecycleEvent {
  const ordered = [...events].sort((left, right) => {
    const timestamp = safeTimestamp(left.occurredAt) - safeTimestamp(right.occurredAt);
    if (timestamp !== 0) return timestamp;
    return sourceIdentity(left).localeCompare(sourceIdentity(right));
  });
  const newest = ordered[ordered.length - 1];
  const statuses = [...new Set(ordered.map((event) => cleanText(event.status) || "unknown"))].sort();
  const actors = [...new Set(ordered.map((event) => cleanText(event.actor)).filter((value): value is string => Boolean(value)))].sort(
    (left, right) => left.localeCompare(right),
  );
  const txHashes = [...new Set(ordered.map((event) => cleanText(event.txHash)).filter((value): value is string => Boolean(value)))].sort(
    (left, right) => left.localeCompare(right),
  );
  const payoutDestinationCounts: Partial<Record<BetLifecyclePayoutDestination, number>> = {};

  for (const event of ordered) {
    if (!event.payoutDestination) continue;
    payoutDestinationCounts[event.payoutDestination] =
      (payoutDestinationCounts[event.payoutDestination] || 0) + 1;
  }

  const destinations = Object.keys(payoutDestinationCounts) as BetLifecyclePayoutDestination[];
  const amountValues = ordered
    .map((event) => cleanAmount(event.amountWolo))
    .filter((value): value is number => value !== null);
  const details = [...new Set(ordered.map((event) => cleanText(event.detail)).filter((value): value is string => Boolean(value)))];

  return {
    id: `market:${marketId}:${kind}`,
    kind,
    status: statuses.length === 1 ? statuses[0] : "mixed",
    occurredAt: newest?.occurredAt || new Date(0).toISOString(),
    amountWolo: amountValues.length > 0 ? amountValues.reduce((total, value) => total + value, 0) : null,
    eventCount: ordered.length,
    actors,
    txHash: txHashes.length === 1 ? txHashes[0] : null,
    payoutDestination:
      destinations.length === 0 ? null : destinations.length === 1 ? destinations[0] : "mixed",
    payoutDestinationCounts,
    sourceIds: ordered.map(sourceIdentity).sort((left, right) => left.localeCompare(right)),
    detail: details.length === 1 ? details[0] : details.length > 1 ? details.join(" · ") : null,
  };
}

function compareProjectedEvents(left: BetLifecycleEvent, right: BetLifecycleEvent) {
  const timestamp = safeTimestamp(left.occurredAt) - safeTimestamp(right.occurredAt);
  if (timestamp !== 0) return timestamp;

  const phase = EVENT_PHASE[left.kind] - EVENT_PHASE[right.kind];
  if (phase !== 0) return phase;

  return left.id.localeCompare(right.id);
}

function amountForKinds(events: BetLifecycleEvent[], kinds: BetLifecycleEventKind[]) {
  const accepted = new Set(kinds);
  return events.reduce(
    (total, event) => total + (accepted.has(event.kind) ? event.amountWolo || 0 : 0),
    0,
  );
}

export function projectBetLifecycleGroups(
  sourceEvents: BetLifecycleSourceEvent[],
): BetLifecycleGroup[] {
  const byMarket = new Map<number, BetLifecycleSourceEvent[]>();

  for (const event of sourceEvents) {
    if (!Number.isInteger(event.marketId) || event.marketId <= 0) continue;
    const bucket = byMarket.get(event.marketId) || [];
    bucket.push(event);
    byMarket.set(event.marketId, bucket);
  }

  return [...byMarket.entries()]
    .map(([marketId, rawEvents]) => {
      const canonicalEvents = dedupeEconomicEvents(rawEvents);
      const byKind = new Map<BetLifecycleEventKind, BetLifecycleSourceEvent[]>();

      for (const event of canonicalEvents) {
        const bucket = byKind.get(event.kind) || [];
        bucket.push(event);
        byKind.set(event.kind, bucket);
      }

      const events = [...byKind.entries()]
        .map(([kind, rows]) => aggregateKind(marketId, kind, rows))
        .sort(compareProjectedEvents);
      if (events.length === 0) return null;

      const marketSource = [...rawEvents].sort(compareSourceEvents)[0];
      const startedAt = events[0].occurredAt;
      const occurredAt = events[events.length - 1].occurredAt;

      return {
        schema: BET_LIFECYCLE_SCHEMA,
        id: `bet-lifecycle-market-${marketId}`,
        groupKey: `market:${marketId}`,
        marketId,
        marketTitle: cleanText(marketSource?.marketTitle) || `Market #${marketId}`,
        marketHref: cleanText(marketSource?.marketHref),
        occurredAt,
        startedAt,
        stakeTotalWolo: amountForKinds(events, ["stake_recorded", "escrow_funded"]),
        payoutTotalWolo: amountForKinds(events, ["payout", "winner_bounty"]),
        refundTotalWolo: amountForKinds(events, ["refund"]),
        founderParticipantsWolo: amountForKinds(events, ["founder_participants"]),
        founderWinnerWolo: amountForKinds(events, ["founder_winner"]),
        events,
      } satisfies BetLifecycleGroup;
    })
    .filter((group): group is BetLifecycleGroup => group !== null)
    .sort((left, right) => {
      const timestamp = safeTimestamp(right.occurredAt) - safeTimestamp(left.occurredAt);
      return timestamp || left.marketId - right.marketId;
    });
}
