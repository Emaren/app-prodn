import type { PrismaClient } from "@/lib/generated/prisma";
import {
  getReplayAdjudicationForGameStatsId,
  listReplayAdjudications,
  type ReplayAdjudication,
} from "@/lib/replayAdjudications";
import {
  classifyUnresolvedWatcherResult,
  normalizePublicReplayText,
  publicReplayMapLabel,
  resolveReplayWinnerTruth,
  type ReplayWinnerTruth,
  type UnresolvedWatcherResult,
} from "@/lib/unresolvedWatcherResult";

export type ReplayReviewMoneyState =
  | "no_market"
  | "no_slips"
  | "awaiting_verdict"
  | "settlement_waiting"
  | "refund_recorded"
  | "paid"
  | "settlement_failed"
  | "wallet_link_pending"
  | "funding_issue";

export type ReplayReviewMarketSummary = {
  id: number;
  title: string;
  status: string;
  settlementStatus: string | null;
  winnerSide: string | null;
  slipCount: number;
  stakeIntentCount: number;
  totalStakedWolo: number;
  moneyState: ReplayReviewMoneyState;
  moneyLabel: string;
  moneyDetail: string;
};

export type ReplayReviewPlayer = {
  name: string;
  teamId: string | null;
  winnerFlag: boolean | null;
};

export type ReplayReviewQueueEntry = {
  id: number;
  title: string;
  mapName: string;
  format: string;
  durationSeconds: number | null;
  playedOn: string | null;
  replayFile: string;
  originalFilename: string | null;
  replayHash: string;
  parseSource: string;
  parseReason: string;
  parseIteration: number;
  uploaderName: string | null;
  uploaderUid: string | null;
  players: ReplayReviewPlayer[];
  leftCandidates: string[];
  rightCandidates: string[];
  rawWinner: string | null;
  winnerTruth: ReplayWinnerTruth;
  unresolvedResult: UnresolvedWatcherResult;
  adjudication: ReplayAdjudication | null;
  market: ReplayReviewMarketSummary | null;
  replayProof: {
    parseAttempts: number;
    stableCopies: number;
    latestAttemptStatus: string | null;
    latestAttemptDetail: string | null;
    watcherEventTypes: string[];
    gameEventTypes: string[];
    keyEventSignals: string[];
    finalCandidateAccepted: boolean;
    finalCandidateDeferred: boolean;
    duplicateCandidateIgnored: boolean;
    parsePending: boolean;
    unknownFields: boolean;
  };
  links: {
    theatre: string;
    finalStats: string;
    betRail: string | null;
    lobby: string;
  };
};

export type ReplayReviewQueueData = {
  generatedAt: string;
  storageReady: false;
  storageNotice: string;
  pendingCount: number;
  adjudicatedCount: number;
  entries: ReplayReviewQueueEntry[];
};

type MarketRow = {
  id: number;
  linkedGameStatsId: number | null;
  linkedSessionKey: string | null;
  title: string;
  status: string;
  settlementStatus: string | null;
  settlementFailureCode: string | null;
  settlementDetail: string | null;
  winnerSide: string | null;
  wagers: Array<{
    status: string;
    amountWolo: number;
    payoutWolo: number | null;
    payoutTxHash: string | null;
  }>;
  stakeIntents: Array<{
    status: string;
    amountWolo: number;
    errorDetail: string | null;
  }>;
};

type ClaimRow = {
  sourceMarketId: number | null;
  claimKind: string;
  status: string;
  amountWolo: number;
  payoutTxHash: string | null;
  errorState: string | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }

  return {};
}

function truthBoolean(value: unknown): boolean | null {
  if (value === true || value === "true" || value === 1 || value === "1") {
    return true;
  }
  if (value === false || value === "false" || value === 0 || value === "0") {
    return false;
  }
  return null;
}

function readPlayers(value: unknown): ReplayReviewPlayer[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? (() => {
          try {
            const parsed = JSON.parse(value) as unknown;
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        })()
      : [];

  const seen = new Set<string>();
  const players: ReplayReviewPlayer[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    const name = normalizePublicReplayText(
      record.name ?? record.player ?? record.playerName
    );
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());

    const rawTeam = record.team_id ?? record.teamId ?? record.team;
    const teamId =
      typeof rawTeam === "string" || typeof rawTeam === "number"
        ? String(rawTeam)
        : null;

    players.push({
      name,
      teamId,
      winnerFlag: truthBoolean(record.winner),
    });
  }

  return players;
}

function reviewSides(players: ReplayReviewPlayer[]) {
  const grouped = new Map<string, string[]>();
  for (const player of players) {
    if (!player.teamId) continue;
    const bucket = grouped.get(player.teamId) ?? [];
    bucket.push(player.name);
    grouped.set(player.teamId, bucket);
  }

  if (grouped.size === 2) {
    const sides = [...grouped.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([, names]) => names);
    return { leftCandidates: sides[0], rightCandidates: sides[1] };
  }

  if (players.length >= 2 && players.length % 2 === 0) {
    const midpoint = players.length / 2;
    return {
      leftCandidates: players.slice(0, midpoint).map((player) => player.name),
      rightCandidates: players.slice(midpoint).map((player) => player.name),
    };
  }

  return {
    leftCandidates: players.slice(0, 1).map((player) => player.name),
    rightCandidates: players.slice(1).map((player) => player.name),
  };
}

function formatLabel(players: ReplayReviewPlayer[]) {
  if (players.length < 2) return players.length === 1 ? "Replay" : "Roster unresolved";
  if (players.length % 2 === 0) {
    return `${players.length / 2}v${players.length / 2}`;
  }
  return `${players.length}-player`;
}

function titleFor(players: ReplayReviewPlayer[]) {
  const { leftCandidates, rightCandidates } = reviewSides(players);
  if (leftCandidates.length && rightCandidates.length) {
    return `${leftCandidates.join(" + ")} vs ${rightCandidates.join(" + ")}`;
  }
  if (players.length) return `${players.map((player) => player.name).join(" + ")} · roster unresolved`;
  return "Final replay · roster unresolved";
}

function classifyMarketMoneyState(
  market: MarketRow | null,
  claims: ClaimRow[]
): Pick<ReplayReviewMarketSummary, "moneyState" | "moneyLabel" | "moneyDetail"> {
  if (!market) {
    return {
      moneyState: "no_market",
      moneyLabel: "No market attached",
      moneyDetail: "No betting market is linked to this replay.",
    };
  }

  const slipCount = market.wagers.length;
  const settlementStatus = (market.settlementStatus ?? "").toLowerCase();
  const settlementDetail = `${market.settlementFailureCode ?? ""} ${market.settlementDetail ?? ""}`.toLowerCase();
  const claimError = claims.find((claim) => claim.errorState);
  const stakeError = market.stakeIntents.find((intent) => intent.errorDetail);
  const errorText = `${claimError?.errorState ?? ""} ${stakeError?.errorDetail ?? ""} ${settlementDetail}`.toLowerCase();

  const refundClaim = claims.find((claim) => /refund|void/.test(claim.claimKind));
  const refundedWager = market.wagers.find(
    (wager) => wager.status === "void" && (wager.payoutWolo ?? 0) > 0
  );
  if (refundClaim || refundedWager) {
    return {
      moneyState: "refund_recorded",
      moneyLabel: "Refund recorded",
      moneyDetail: "Money state is final; a late public verdict must not reverse the refund.",
    };
  }

  const paidClaim = claims.find(
    (claim) => claim.status === "claimed" && Boolean(claim.payoutTxHash)
  );
  const paidWager = market.wagers.find((wager) => Boolean(wager.payoutTxHash));
  if (paidClaim || paidWager) {
    return {
      moneyState: "paid",
      moneyLabel: "Paid",
      moneyDetail: "A payout is already recorded and must not be changed by replay review.",
    };
  }

  if (
    settlementStatus === "failed" ||
    market.settlementFailureCode ||
    claimError ||
    stakeError
  ) {
    const fundingIssue = /fund|reserve|insufficient|balance/.test(errorText);
    return {
      moneyState: fundingIssue ? "funding_issue" : "settlement_failed",
      moneyLabel: fundingIssue ? "Payout reserve / funding issue" : "Settlement failed / retryable",
      moneyDetail:
        market.settlementDetail ||
        market.settlementFailureCode ||
        claimError?.errorState ||
        stakeError?.errorDetail ||
        "Settlement needs operator review.",
    };
  }

  const pendingWalletClaim = claims.find((claim) =>
    ["pending", "claimable"].includes(claim.status)
  );
  if (pendingWalletClaim) {
    return {
      moneyState: "wallet_link_pending",
      moneyLabel: "Wallet link pending",
      moneyDetail: "A claim exists but payout is waiting for wallet linkage or claim completion.",
    };
  }

  if (slipCount === 0) {
    return {
      moneyState: "no_slips",
      moneyLabel: "Market attached, no slips",
      moneyDetail: "Review can affect public truth without moving bettor funds.",
    };
  }

  if (["settling", "queued", "processing", "retrying"].includes(settlementStatus)) {
    return {
      moneyState: "settlement_waiting",
      moneyLabel: "Settlement waiting",
      moneyDetail: "The existing settlement rail is waiting; replay review must not bypass it.",
    };
  }

  return {
    moneyState: "awaiting_verdict",
    moneyLabel: "Slips attached, awaiting verdict",
    moneyDetail: "A commissioner verdict may only feed the existing settlement path after safe storage exists.",
  };
}

function marketSummary(market: MarketRow | null, claims: ClaimRow[]) {
  if (!market) return null;
  const money = classifyMarketMoneyState(market, claims);
  return {
    id: market.id,
    title: market.title,
    status: market.status,
    settlementStatus: market.settlementStatus,
    winnerSide: market.winnerSide,
    slipCount: market.wagers.length,
    stakeIntentCount: market.stakeIntents.length,
    totalStakedWolo: market.wagers.reduce(
      (sum, wager) => sum + Math.max(0, wager.amountWolo),
      0
    ),
    ...money,
  } satisfies ReplayReviewMarketSummary;
}

async function loadClaimsByMarketId(prisma: PrismaClient, marketIds: number[]) {
  if (!marketIds.length) return new Map<number, ClaimRow[]>();
  const rows = await prisma.pendingWoloClaim.findMany({
    where: { sourceMarketId: { in: marketIds } },
    select: {
      sourceMarketId: true,
      claimKind: true,
      status: true,
      amountWolo: true,
      payoutTxHash: true,
      errorState: true,
    },
  });

  const byMarket = new Map<number, ClaimRow[]>();
  for (const row of rows) {
    if (typeof row.sourceMarketId !== "number") continue;
    const bucket = byMarket.get(row.sourceMarketId) ?? [];
    bucket.push(row);
    byMarket.set(row.sourceMarketId, bucket);
  }
  return byMarket;
}

async function loadMarkets(
  prisma: PrismaClient,
  gameIds: number[],
  sessionKeys: string[]
): Promise<MarketRow[]> {
  if (!gameIds.length && !sessionKeys.length) return [];
  return prisma.betMarket.findMany({
    where: {
      OR: [
        ...(gameIds.length ? [{ linkedGameStatsId: { in: gameIds } }] : []),
        ...(sessionKeys.length ? [{ linkedSessionKey: { in: sessionKeys } }] : []),
      ],
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      linkedGameStatsId: true,
      linkedSessionKey: true,
      title: true,
      status: true,
      settlementStatus: true,
      settlementFailureCode: true,
      settlementDetail: true,
      winnerSide: true,
      wagers: {
        select: {
          status: true,
          amountWolo: true,
          payoutWolo: true,
          payoutTxHash: true,
        },
      },
      stakeIntents: {
        select: {
          status: true,
          amountWolo: true,
          errorDetail: true,
        },
      },
    },
  });
}

export async function loadReplayReviewMarketSummaryMap(
  prisma: PrismaClient,
  sessions: Array<{ id: number; sessionKey: string }>
) {
  const gameIds = sessions
    .map((session) => session.id)
    .filter((id) => Number.isSafeInteger(id) && id > 0);
  const sessionKeys = sessions.map((session) => session.sessionKey).filter(Boolean);
  const markets = await loadMarkets(prisma, gameIds, sessionKeys);
  const claimsByMarket = await loadClaimsByMarketId(
    prisma,
    markets.map((market) => market.id)
  );
  const result = new Map<number, ReplayReviewMarketSummary>();

  for (const session of sessions) {
    const market =
      markets.find((entry) => entry.linkedGameStatsId === session.id) ??
      markets.find((entry) => entry.linkedSessionKey === session.sessionKey) ??
      null;
    const summary = marketSummary(
      market,
      market ? claimsByMarket.get(market.id) ?? [] : []
    );
    if (summary) result.set(session.id, summary);
  }

  return result;
}

function eventTypeValues(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).filter(Boolean);
  }
  const record = asRecord(value);
  return Object.keys(record).filter((key) => Boolean(record[key]));
}

function keyEventSignals(value: unknown) {
  const record = asRecord(value);
  const interesting = [
    "completed",
    "completion_source",
    "postgame_available",
    "has_scores",
    "has_achievements",
    "player_score_count",
    "achievement_player_count",
    "resigned_player_names",
    "resigned_player_numbers",
    "winner_inference",
    "platform_match_id",
  ];

  return interesting.filter((key) => {
    const entry = record[key];
    return Array.isArray(entry) ? entry.length > 0 : Boolean(entry);
  });
}

function stableAttemptCount(
  attempts: Array<{ status: string; detail: string | null }>
) {
  return attempts.filter((attempt) =>
    /stable|accepted|succeeded|parsed|trusted_final/i.test(
      `${attempt.status} ${attempt.detail ?? ""}`
    )
  ).length;
}

export async function loadReplayReviewQueue(
  prisma: PrismaClient
): Promise<ReplayReviewQueueData> {
  const adjudicatedGameIds = listReplayAdjudications().map(
    (adjudication) => adjudication.gameStatsId
  );
  const rows = await prisma.gameStats.findMany({
    where: {
      is_final: true,
      OR: [
        { winner: null },
        { winner: { in: ["", "Unknown", "UNKNOWN", "unknown", "N/A", "na"] } },
        { parse_reason: { startsWith: "watcher_inferred_" } },
        { parse_reason: { in: ["watcher_final_unparsed", "hd_final_parse_match_fallback"] } },
        ...(adjudicatedGameIds.length ? [{ id: { in: adjudicatedGameIds } }] : []),
      ],
    },
    orderBy: [{ played_on: "desc" }, { timestamp: "desc" }, { id: "desc" }],
    take: 1000,
    select: {
      id: true,
      replay_file: true,
      replayHash: true,
      original_filename: true,
      map: true,
      duration: true,
      game_duration: true,
      winner: true,
      players: true,
      event_types: true,
      key_events: true,
      timestamp: true,
      played_on: true,
      parse_iteration: true,
      parse_source: true,
      parse_reason: true,
      userUid: true,
      user: {
        select: {
          uid: true,
          inGameName: true,
          steamPersonaName: true,
        },
      },
      replayParseAttempts: {
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 12,
        select: {
          status: true,
          detail: true,
          fileSizeBytes: true,
          createdAt: true,
        },
      },
    },
  });

  const unresolvedRows = rows.flatMap((row) => {
    const players = readPlayers(row.players);
    const winnerTruth = resolveReplayWinnerTruth({
      winner: row.winner,
      players,
      parseReason: row.parse_reason,
      parseSource: row.parse_source,
      keyEvents: row.key_events,
      eventTypes: row.event_types,
    });
    if (winnerTruth.statsEligible) return [];
    return [{ row, players, winnerTruth }];
  });

  const gameIds = unresolvedRows.map(({ row }) => row.id);
  const sessionKeys = unresolvedRows.map(({ row }) => row.original_filename || row.replay_file);
  const markets = await loadMarkets(prisma, gameIds, sessionKeys);
  const claimsByMarket = await loadClaimsByMarketId(
    prisma,
    markets.map((market) => market.id)
  );
  const replayHashes = unresolvedRows.map(({ row }) => row.replayHash).filter(Boolean);
  const replayFiles = unresolvedRows
    .flatMap(({ row }) => [row.original_filename, row.replay_file])
    .filter((value): value is string => Boolean(value));
  const watcherEvents =
    replayHashes.length || replayFiles.length
      ? await prisma.watcherClientEvent.findMany({
          where: {
            OR: [
              ...(replayHashes.length ? [{ replayHash: { in: replayHashes } }] : []),
              ...(replayFiles.length ? [{ replayFile: { in: replayFiles } }] : []),
            ],
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          distinct: ["replayHash", "replayFile", "eventType"],
          take: 8000,
          select: {
            eventType: true,
            replayHash: true,
            replayFile: true,
            metadata: true,
            createdAt: true,
          },
        })
      : [];

  const entries = unresolvedRows.map(({ row, players, winnerTruth }) => {
    const sessionKey = row.original_filename || row.replay_file;
    const matchingEvents = watcherEvents.filter(
      (event) =>
        (event.replayHash && event.replayHash === row.replayHash) ||
        (event.replayFile &&
          [row.original_filename, row.replay_file].includes(event.replayFile))
    );
    const watcherEventTypes = [...new Set(matchingEvents.map((event) => event.eventType))];
    const eventText = watcherEventTypes.join(" ");
    const market =
      markets.find((entry) => entry.linkedGameStatsId === row.id) ??
      markets.find((entry) => entry.linkedSessionKey === sessionKey) ??
      null;
    const claims = market ? claimsByMarket.get(market.id) ?? [] : [];
    const sides = reviewSides(players);
    const unresolvedResult =
      classifyUnresolvedWatcherResult({
        winner: row.winner,
        players,
        mapName: publicReplayMapLabel(row.map, "Map unresolved"),
        state: "completed",
        parseReason: row.parse_reason,
        parseSource: row.parse_source,
        keyEvents: row.key_events,
        finalAccepted: true,
        watcherCount: 1,
      }) ?? {
        code: "impossible_from_available_replay_data",
        label: "Result review",
        explanation: winnerTruth.diagnosticSummary,
        reviewNeeded: true,
      };
    const adjudication = getReplayAdjudicationForGameStatsId(row.id);
    const latestAttempt = row.replayParseAttempts[0] ?? null;
    const uploaderName =
      normalizePublicReplayText(row.user?.inGameName) ??
      normalizePublicReplayText(row.user?.steamPersonaName);

    return {
      id: row.id,
      title: titleFor(players),
      mapName: publicReplayMapLabel(row.map, "Map unresolved"),
      format: formatLabel(players),
      durationSeconds: row.game_duration ?? row.duration,
      playedOn: (row.played_on ?? row.timestamp)?.toISOString() ?? null,
      replayFile: row.replay_file,
      originalFilename: row.original_filename,
      replayHash: row.replayHash,
      parseSource: row.parse_source,
      parseReason: row.parse_reason,
      parseIteration: row.parse_iteration,
      uploaderName,
      uploaderUid: row.user?.uid ?? row.userUid,
      players,
      ...sides,
      rawWinner: normalizePublicReplayText(row.winner),
      winnerTruth,
      unresolvedResult,
      adjudication,
      market: marketSummary(market, claims),
      replayProof: {
        parseAttempts: row.replayParseAttempts.length,
        stableCopies: stableAttemptCount(row.replayParseAttempts),
        latestAttemptStatus: latestAttempt?.status ?? null,
        latestAttemptDetail: latestAttempt?.detail ?? null,
        watcherEventTypes,
        gameEventTypes: eventTypeValues(row.event_types),
        keyEventSignals: keyEventSignals(row.key_events),
        finalCandidateAccepted: /final_candidate_accepted/.test(eventText),
        finalCandidateDeferred: /final_candidate_deferred/.test(eventText),
        duplicateCandidateIgnored: /replay_detected_ignored/.test(eventText),
        parsePending: /parse_pending/.test(eventText),
        unknownFields: /parse_result_unknown_fields/.test(eventText),
      },
      links: {
        theatre: `/watch/${encodeURIComponent(sessionKey)}`,
        finalStats: `/game-stats/${row.id}`,
        betRail: market ? `/bets/${market.id}` : null,
        lobby: "/lobby",
      },
    } satisfies ReplayReviewQueueEntry;
  }).sort((left, right) => {
    const leftMs = left.playedOn ? new Date(left.playedOn).getTime() : 0;
    const rightMs = right.playedOn ? new Date(right.playedOn).getTime() : 0;
    if (rightMs !== leftMs) return rightMs - leftMs;
    return right.id - left.id;
  });

  return {
    generatedAt: new Date().toISOString(),
    storageReady: false,
    storageNotice:
      "Commissioner verdict storage is not present in the current schema. Review actions are disabled; raw parser rows and betting money state remain untouched.",
    pendingCount: entries.filter((entry) => !entry.adjudication).length,
    adjudicatedCount: entries.filter((entry) => Boolean(entry.adjudication)).length,
    entries,
  };
}
