export const BET_BATTLE_HISTORY_SCHEMA = "bet-battle-history-v2" as const;

export type BetBattleHistoryEventKind =
  | "stake_intent"
  | "stake_recorded"
  | "escrow_funded"
  | "founder_participants"
  | "founder_winner"
  | "result"
  | "payout"
  | "refund"
  | "winner_bounty";

export type BetBattleHistorySource =
  | "stake_intent"
  | "wager"
  | "founder_bonus"
  | "market"
  | "claim";

export type BetBattleHistoryPayoutDestination =
  | "wallet"
  | "awaiting_wallet_link"
  | "settlement_queue"
  | "failed"
  | "rescinded";

/**
 * One inspectable fact from the betting data model. The projection deliberately
 * accepts market-grain facts, then correlates them at battle grain. This keeps
 * raw financial facts available without making a winner and Desync proposition
 * look like separate battles.
 */
export type BetBattleHistorySourceEvent = {
  marketId: number;
  marketTitle: string;
  marketHref?: string | null;
  rootMarketId?: number | null;
  parentMarketId?: number | null;
  battleId?: number | null;
  battlePublicNumber?: number | null;
  battleStartedAt?: string | null;
  marketType?: string | null;
  leftLabel?: string | null;
  rightLabel?: string | null;
  source: BetBattleHistorySource;
  sourceId: string | number;
  kind: BetBattleHistoryEventKind;
  status: string;
  occurredAt: string;
  amountWolo?: number | null;
  actor?: string | null;
  userId?: number | null;
  side?: string | null;
  ticketId?: number | null;
  stakeLegId?: number | null;
  txHash?: string | null;
  payoutDestination?: BetBattleHistoryPayoutDestination | null;
  /** Identifies the same economic action when two tables describe it. */
  economicKey?: string | null;
  detail?: string | null;
};

export type BetBattleHistoryTimelineEvent = {
  key: string;
  kind: BetBattleHistoryEventKind;
  label: string;
  detail: string | null;
  status: string;
  occurredAt: string;
  amountWolo: number | null;
  actor: string | null;
  marketId: number;
  marketType: string;
  txHash: string | null;
  payoutDestination: BetBattleHistoryPayoutDestination | null;
};

export type BetBattleHistoryOutcome = {
  marketId: number;
  marketType: string;
  label: string;
  status: string;
  resultLabel: string | null;
  settledAt: string | null;
};

export type BetBattleHistorySlipLeg = {
  key: string;
  marketId: number;
  marketType: string;
  propositionLabel: string;
  side: string;
  amountWolo: number;
  status: string;
};

export type BetBattleHistorySlip = {
  key: string;
  ticketId: number | null;
  bettorName: string;
  acceptedAt: string;
  totalStakeWolo: number;
  fundingStatus: "chain_verified" | "app_recorded" | "awaiting_verification";
  txHash: string | null;
  legs: BetBattleHistorySlipLeg[];
};

export type BetBattleHistoryStatus =
  | "live"
  | "settled"
  | "paid"
  | "refunded"
  | "awaiting_settlement"
  | "needs_attention";

export type BetBattleHistoryGroup = {
  schema: typeof BET_BATTLE_HISTORY_SCHEMA;
  key: string;
  groupKey: string;
  battleId: number | null;
  publicNumber: number | null;
  rootMarketId: number;
  title: string;
  href: string | null;
  leftLabel: string | null;
  rightLabel: string | null;
  /** Stable battle chronology, not the newest payout timestamp. */
  startedAt: string;
  latestActivityAt: string;
  status: BetBattleHistoryStatus;
  coreStakeWolo: number;
  corePayoutWolo: number;
  coreRefundWolo: number;
  rewardWolo: number;
  winnerOutcome: BetBattleHistoryOutcome | null;
  desyncOutcome: BetBattleHistoryOutcome | null;
  slips: BetBattleHistorySlip[];
  timeline: BetBattleHistoryTimelineEvent[];
};

const EVENT_PHASE: Record<BetBattleHistoryEventKind, number> = {
  stake_intent: 10,
  stake_recorded: 20,
  escrow_funded: 20,
  founder_participants: 30,
  founder_winner: 31,
  result: 40,
  payout: 50,
  refund: 50,
  winner_bounty: 60,
};

const SOURCE_AUTHORITY: Record<BetBattleHistorySource, number> = {
  stake_intent: 10,
  wager: 20,
  founder_bonus: 20,
  market: 30,
  claim: 40,
};

const EVENT_LABELS: Record<BetBattleHistoryEventKind, string> = {
  stake_intent: "Stake awaiting verification",
  stake_recorded: "App-side stake recorded",
  escrow_funded: "Verified chain stake",
  founder_participants: "Founder participant reward",
  founder_winner: "Founder winner reward",
  result: "Result confirmed",
  payout: "Payout",
  refund: "Refund",
  winner_bounty: "Winner bounty",
};

function cleanText(value: string | null | undefined) {
  const clean = String(value || "").trim();
  return clean || null;
}

function positiveInteger(value: number | null | undefined) {
  return Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : null;
}

function cleanAmount(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function safeTimestamp(value: string | null | undefined) {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function validIso(value: string | null | undefined) {
  return safeTimestamp(value) > 0 ? String(value) : null;
}

function sourceIdentity(event: BetBattleHistorySourceEvent) {
  return `${event.source}:${String(event.sourceId)}`;
}

function economicIdentity(event: BetBattleHistorySourceEvent) {
  return cleanText(event.economicKey) || `${event.kind}:${sourceIdentity(event)}`;
}

function rootMarketId(
  event: BetBattleHistorySourceEvent,
): number {
  return (
    positiveInteger(
      event.rootMarketId,
    ) ??
    positiveInteger(
      event.parentMarketId,
    ) ??
    event.marketId
  );
}

function groupIdentity(event: BetBattleHistorySourceEvent) {
  const battleId = positiveInteger(event.battleId);
  return battleId ? `battle:${battleId}` : `market:${rootMarketId(event)}`;
}

function marketType(event: BetBattleHistorySourceEvent) {
  const normalized = cleanText(event.marketType)?.toLowerCase();
  return normalized || (positiveInteger(event.parentMarketId) ? "proposition" : "winner");
}

function compareSourceAuthority(
  left: BetBattleHistorySourceEvent,
  right: BetBattleHistorySourceEvent,
) {
  const authority = SOURCE_AUTHORITY[right.source] - SOURCE_AUTHORITY[left.source];
  if (authority !== 0) return authority;
  const timestamp = safeTimestamp(right.occurredAt) - safeTimestamp(left.occurredAt);
  if (timestamp !== 0) return timestamp;
  return sourceIdentity(left).localeCompare(sourceIdentity(right));
}

function dedupeEconomicFacts(events: BetBattleHistorySourceEvent[]) {
  const canonical = new Map<string, BetBattleHistorySourceEvent>();
  for (const event of [...events].sort(compareSourceAuthority)) {
    const key = economicIdentity(event);
    if (!canonical.has(key)) canonical.set(key, event);
  }
  return [...canonical.values()];
}

function compareTimelineFacts(
  left: BetBattleHistorySourceEvent,
  right: BetBattleHistorySourceEvent,
) {
  const timestamp = safeTimestamp(left.occurredAt) - safeTimestamp(right.occurredAt);
  if (timestamp !== 0) return timestamp;
  const phase = EVENT_PHASE[left.kind] - EVENT_PHASE[right.kind];
  if (phase !== 0) return phase;
  return sourceIdentity(left).localeCompare(sourceIdentity(right));
}

function isStakeFact(event: BetBattleHistorySourceEvent) {
  return (
    event.kind === "stake_intent" ||
    event.kind === "stake_recorded" ||
    event.kind === "escrow_funded"
  );
}

function sumKinds(
  events: BetBattleHistorySourceEvent[],
  kinds: BetBattleHistoryEventKind[],
) {
  const accepted = new Set(kinds);
  return events.reduce(
    (total, event) => total + (accepted.has(event.kind) ? cleanAmount(event.amountWolo) || 0 : 0),
    0,
  );
}

function buildSlips(events: BetBattleHistorySourceEvent[]): BetBattleHistorySlip[] {
  const bySlip = new Map<string, BetBattleHistorySourceEvent[]>();

  for (const event of events.filter(isStakeFact)) {
    const ticketId = positiveInteger(event.ticketId);
    const key = ticketId ? `ticket:${ticketId}` : `stake:${economicIdentity(event)}`;
    const bucket = bySlip.get(key) || [];
    bucket.push(event);
    bySlip.set(key, bucket);
  }

  return [...bySlip.entries()]
    .map(([key, facts]) => {
      const ordered = [...facts].sort(compareTimelineFacts);
      const ticketId = positiveInteger(ordered.find((event) => positiveInteger(event.ticketId))?.ticketId);
      const actors = [...new Set(ordered.map((event) => cleanText(event.actor)).filter((value): value is string => Boolean(value)))];
      const hashes = [...new Set(ordered.map((event) => cleanText(event.txHash)).filter((value): value is string => Boolean(value)))];
      const legs = ordered.map((event) => ({
        key: `${key}:market:${event.marketId}:${positiveInteger(event.stakeLegId) || economicIdentity(event)}`,
        marketId: event.marketId,
        marketType: marketType(event),
        propositionLabel: cleanText(event.marketTitle) || `Market #${event.marketId}`,
        side: cleanText(event.side) || "selection recorded",
        amountWolo: cleanAmount(event.amountWolo) || 0,
        status: cleanText(event.status) || "unknown",
      }));
      const fundingStatus: BetBattleHistorySlip["fundingStatus"] = ordered.some(
        (event) => event.kind === "escrow_funded",
      )
        ? "chain_verified"
        : ordered.some((event) => event.kind === "stake_recorded")
          ? "app_recorded"
          : "awaiting_verification";

      return {
        key,
        ticketId,
        bettorName: actors.join(", ") || "Verified player",
        acceptedAt: ordered[0]?.occurredAt || new Date(0).toISOString(),
        totalStakeWolo: legs.reduce((total, leg) => total + leg.amountWolo, 0),
        fundingStatus,
        txHash: hashes.length === 1 ? hashes[0] : null,
        legs,
      } satisfies BetBattleHistorySlip;
    })
    .sort((left, right) => {
      const timestamp = safeTimestamp(left.acceptedAt) - safeTimestamp(right.acceptedAt);
      return timestamp || left.key.localeCompare(right.key);
    });
}

function outcomeFor(
  events: BetBattleHistorySourceEvent[],
  predicate: (event: BetBattleHistorySourceEvent) => boolean,
): BetBattleHistoryOutcome | null {
  const candidates = events.filter(predicate);
  if (candidates.length === 0) return null;
  const representative = [...candidates].sort((left, right) => {
    const rootPreference = Number(right.marketId === rootMarketId(right)) - Number(left.marketId === rootMarketId(left));
    if (rootPreference !== 0) return rootPreference;
    return compareSourceAuthority(left, right);
  })[0];
  const result = [...candidates]
    .filter((event) => event.kind === "result")
    .sort(compareTimelineFacts)
    .at(-1);

  return {
    marketId: representative.marketId,
    marketType: marketType(representative),
    label: cleanText(representative.marketTitle) || `Market #${representative.marketId}`,
    status: cleanText(result?.status || representative.status) || "unknown",
    resultLabel: cleanText(result?.detail),
    settledAt: result ? validIso(result.occurredAt) : null,
  };
}

function deriveStatus(events: BetBattleHistorySourceEvent[]): BetBattleHistoryStatus {
  if (events.some((event) => event.payoutDestination === "failed")) return "needs_attention";
  if (
    events.some(
      (event) =>
        event.payoutDestination === "awaiting_wallet_link" ||
        event.payoutDestination === "settlement_queue",
    )
  ) {
    return "awaiting_settlement";
  }
  if (sumKinds(events, ["refund"]) > 0) return "refunded";
  if (sumKinds(events, ["payout"]) > 0) return "paid";
  if (events.some((event) => event.kind === "result")) return "settled";
  return "live";
}

function representativeFact(events: BetBattleHistorySourceEvent[]) {
  const root = events.filter((event) => event.marketId === rootMarketId(event));
  const winner = events.filter((event) => marketType(event) !== "desync");
  return [...(root.length > 0 ? root : winner.length > 0 ? winner : events)].sort(compareSourceAuthority)[0];
}

export function projectBetBattleHistory(
  sourceEvents: BetBattleHistorySourceEvent[],
): BetBattleHistoryGroup[] {
  const byBattle = new Map<string, BetBattleHistorySourceEvent[]>();

  for (const event of sourceEvents) {
    if (!positiveInteger(event.marketId) || !validIso(event.occurredAt)) continue;
    const key = groupIdentity(event);
    const bucket = byBattle.get(key) || [];
    bucket.push(event);
    byBattle.set(key, bucket);
  }

  return [...byBattle.entries()]
    .map(([groupKey, rawFacts]) => {
      const canonicalFacts = dedupeEconomicFacts(rawFacts).sort(compareTimelineFacts);
      if (canonicalFacts.length === 0) return null;
      const representative = representativeFact(rawFacts);
      const rootId = rootMarketId(representative);
      const battleId = positiveInteger(representative.battleId);
      const publicNumber = positiveInteger(representative.battlePublicNumber);
      const eventStart = canonicalFacts[0].occurredAt;
      const battleStart = rawFacts
        .map((event) => validIso(event.battleStartedAt))
        .filter((value): value is string => Boolean(value))
        .sort((left, right) => safeTimestamp(left) - safeTimestamp(right))[0];
      const startedAt = battleStart || eventStart;
      const latestActivityAt = canonicalFacts[canonicalFacts.length - 1].occurredAt;
      const timeline = canonicalFacts.map((event) => ({
        key: `${groupKey}:${event.kind}:${sourceIdentity(event)}`,
        kind: event.kind,
        label: EVENT_LABELS[event.kind],
        detail: cleanText(event.detail),
        status: cleanText(event.status) || "unknown",
        occurredAt: event.occurredAt,
        amountWolo: cleanAmount(event.amountWolo),
        actor: cleanText(event.actor),
        marketId: event.marketId,
        marketType: marketType(event),
        txHash: cleanText(event.txHash),
        payoutDestination: event.payoutDestination || null,
      } satisfies BetBattleHistoryTimelineEvent));
      const winnerOutcome = outcomeFor(
        rawFacts,
        (event) => marketType(event) !== "desync" && event.marketId === rootId,
      ) || outcomeFor(rawFacts, (event) => marketType(event) !== "desync");
      const desyncOutcome = outcomeFor(rawFacts, (event) => marketType(event) === "desync");

      return {
        schema: BET_BATTLE_HISTORY_SCHEMA,
        key: `bet-battle-history-${battleId ? `battle-${battleId}` : `market-${rootId}`}`,
        groupKey,
        battleId,
        publicNumber,
        rootMarketId: rootId,
        title: cleanText(representative.marketTitle) || `Market #${rootId}`,
        href: cleanText(representative.marketHref),
        leftLabel: cleanText(representative.leftLabel),
        rightLabel: cleanText(representative.rightLabel),
        startedAt,
        latestActivityAt,
        status: deriveStatus(canonicalFacts),
        coreStakeWolo: sumKinds(canonicalFacts, ["stake_recorded", "escrow_funded"]),
        corePayoutWolo: sumKinds(canonicalFacts, ["payout"]),
        coreRefundWolo: sumKinds(canonicalFacts, ["refund"]),
        rewardWolo: sumKinds(canonicalFacts, [
          "founder_participants",
          "founder_winner",
          "winner_bounty",
        ]),
        winnerOutcome,
        desyncOutcome,
        slips: buildSlips(canonicalFacts),
        timeline,
      } satisfies BetBattleHistoryGroup;
    })
    .filter((group): group is BetBattleHistoryGroup => group !== null)
    .sort((left, right) => {
      const publicNumber = (right.publicNumber ?? -1) - (left.publicNumber ?? -1);
      if (publicNumber !== 0) return publicNumber;
      const startedAt = safeTimestamp(right.startedAt) - safeTimestamp(left.startedAt);
      if (startedAt !== 0) return startedAt;
      return right.rootMarketId - left.rootMarketId;
    });
}
