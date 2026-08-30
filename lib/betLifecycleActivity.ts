import { Prisma, type PrismaClient } from "@/lib/generated/prisma";
import { recordedBetWagerFundingTxHash } from "@/lib/betStakeFunding";
import {
  projectBetLifecycleGroups,
  type BetLifecycleGroup,
  type BetLifecyclePayoutDestination,
  type BetLifecycleSourceEvent,
} from "@/lib/betLifecycleProjection";

const MAX_PROJECTED_MARKETS = 800;
const MAX_LIFECYCLE_ROWS_PER_SOURCE = 5_000;

export type BetLifecycleActivityPage = {
  groups: BetLifecycleGroup[];
  hasMore: boolean;
  nextBefore: string | null;
};

type Candidate = {
  marketId: number;
  occurredAt: Date;
};

function validDate(value: Date | string | null | undefined) {
  const parsed = value instanceof Date ? value : value ? new Date(value) : null;
  return parsed && Number.isFinite(parsed.getTime()) ? parsed : null;
}

function cleanHash(value: string | null | undefined) {
  const clean = String(value || "").trim();
  return clean || null;
}

function stakeEconomicKey(input: {
  stakeIntentId?: number | null;
  stakeLegId?: number | null;
  id: number;
}) {
  if (input.stakeIntentId) return `stake:intent:${input.stakeIntentId}`;
  if (input.stakeLegId) return `stake:leg:${input.stakeLegId}`;
  return `stake:wager:${input.id}`;
}

function claimDestination(claim: {
  status: string;
  payoutTxHash: string | null;
  errorState: string | null;
  claimedByUserId: number | null;
}): BetLifecyclePayoutDestination {
  if (claim.status === "rescinded") return "rescinded";
  if (
    claim.status === "claimed" &&
    cleanHash(claim.payoutTxHash) &&
    !claim.errorState
  ) {
    return "wallet";
  }
  if (/awaiting verified wallet|wallet-linked|target unresolved|no verified wallet/i.test(claim.errorState || "")) {
    return "awaiting_wallet_link";
  }
  if (claim.errorState) return "failed";
  if (!claim.claimedByUserId) return "awaiting_wallet_link";
  return "settlement_queue";
}

function claimKind(
  value: string,
): "payout" | "refund" | "winner_bounty" | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === "winner_bounty") return "winner_bounty";
  if (normalized.includes("refund")) return "refund";
  if (
    normalized === "bet_payout" ||
    normalized === "founders_bonus" ||
    normalized === "founders_win"
  ) {
    return "payout";
  }
  return null;
}

function displayMarketTitle(market: {
  title: string;
  leftLabel: string;
  rightLabel: string;
}) {
  const title = market.title.trim();
  return title || `${market.leftLabel} vs ${market.rightLabel}`;
}

function marketHref(market: { id: number; slug: string }) {
  const slug = market.slug.trim();
  return slug ? `/bets/${slug}` : `/bets/${market.id}`;
}

function boundedRows<T>(rows: T[], source: string) {
  if (rows.length > MAX_LIFECYCLE_ROWS_PER_SOURCE) {
    throw new Error(
      `Bet lifecycle projection exceeded the ${MAX_LIFECYCLE_ROWS_PER_SOURCE}-row ${source} safety bound.`,
    );
  }
  return rows;
}

function actorName(user: {
  uid: string;
  inGameName: string | null;
  steamPersonaName: string | null;
}) {
  return user.inGameName?.trim() || user.steamPersonaName?.trim() || "Verified player";
}

function publicFounderDetail(bonusType: string, status: string) {
  const allocation = bonusType === "winner" ? "Founder winner" : "Founder participant";
  return `${allocation} allocation · ${status}`;
}

function publicClaimDetail(
  kind: "payout" | "refund" | "winner_bounty",
  destination: BetLifecyclePayoutDestination,
) {
  const label =
    kind === "refund" ? "Refund" : kind === "winner_bounty" ? "Winner bounty" : "Payout";
  if (destination === "wallet") return `${label} transaction verified`;
  if (destination === "awaiting_wallet_link") return `${label} awaiting a verified wallet`;
  if (destination === "settlement_queue") return `${label} queued for settlement`;
  if (destination === "rescinded") return `${label} rescinded`;
  return `${label} needs operator reconciliation`;
}

export async function loadBetLifecycleActivityPage(
  prisma: PrismaClient,
  options: {
    before?: Date | string | null;
    limit?: number | null;
    minimumAt?: Date | string | null;
    userId?: number | null;
    normalizedPlayerNames?: string[];
    requireBounty?: boolean;
  } = {},
): Promise<BetLifecycleActivityPage> {
  const limit = Math.max(1, Math.min(options.limit ?? 16, 40));
  const before = validDate(options.before);
  const minimumAt = validDate(options.minimumAt);
  const normalizedPlayerNames = [...new Set(
    (options.normalizedPlayerNames || [])
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  )];
  const userScoped = Boolean(options.userId || normalizedPlayerNames.length > 0);
  const claimIdentityWhere: Prisma.PendingWoloClaimWhereInput = userScoped
    ? {
        OR: [
          ...(options.userId ? [{ claimedByUserId: options.userId }] : []),
          ...(normalizedPlayerNames.length > 0
            ? [{
                claimedByUserId: null,
                normalizedPlayerName: { in: normalizedPlayerNames },
              }]
            : []),
        ],
      }
    : {};

  const linkedClaimIdentity = options.userId
    ? Prisma.sql`pwc.claimed_by_user_id = ${options.userId}`
    : Prisma.sql`FALSE`;
  const unlinkedNameIdentity = normalizedPlayerNames.length > 0
    ? Prisma.sql`(
        pwc.claimed_by_user_id IS NULL
        AND pwc.normalized_player_name IN (${Prisma.join(normalizedPlayerNames)})
      )`
    : Prisma.sql`FALSE`;
  const claimIdentitySql = userScoped
    ? Prisma.sql`AND (${linkedClaimIdentity} OR ${unlinkedNameIdentity})`
    : Prisma.empty;

  const eligibleMarketSources: Prisma.Sql[] = [];
  if (!userScoped) {
    eligibleMarketSources.push(Prisma.sql`SELECT id AS market_id FROM bet_markets`);
  } else {
    if (options.userId) {
      eligibleMarketSources.push(
        Prisma.sql`SELECT market_id FROM bet_wagers WHERE user_id = ${options.userId}`,
        Prisma.sql`SELECT market_id FROM bet_stake_intents WHERE user_id = ${options.userId}`,
      );
    }
    eligibleMarketSources.push(Prisma.sql`
      SELECT pwc.source_market_id AS market_id
      FROM pending_wolo_claims pwc
      WHERE pwc.source_market_id IS NOT NULL
        ${claimIdentitySql}
    `);
  }

  const candidateLimit = options.requireBounty
    ? MAX_PROJECTED_MARKETS + 1
    : Math.min(MAX_PROJECTED_MARKETS + 1, limit + 1);
  const candidateRows = await prisma.$queryRaw<Candidate[]>(Prisma.sql`
    WITH eligible_markets AS (
      ${Prisma.join(eligibleMarketSources, " UNION ")}
    ),
    lifecycle_events AS (
      SELECT
        bm.id AS market_id,
        COALESCE(bm.settled_at, bm.voided_at, bm.updated_at) AS occurred_at,
        FALSE AS is_bounty
      FROM bet_markets bm
      INNER JOIN eligible_markets em ON em.market_id = bm.id
      WHERE bm.settled_at IS NOT NULL
         OR bm.voided_at IS NOT NULL
         OR bm.winner_side IS NOT NULL
         OR LOWER(bm.status) IN ('settled', 'void', 'voided', 'refunded')

      UNION ALL

      SELECT
        bw.market_id,
        CASE
          WHEN bw.payout_wolo > 0 AND bw.payout_tx_hash IS NOT NULL
            THEN GREATEST(
              COALESCE(bw.settled_at, bw.updated_at),
              COALESCE(bw.stake_locked_at, bw.created_at)
            )
          ELSE COALESCE(bw.stake_locked_at, bw.created_at)
        END AS occurred_at,
        FALSE AS is_bounty
      FROM bet_wagers bw
      INNER JOIN eligible_markets em ON em.market_id = bw.market_id

      UNION ALL

      SELECT
        bsi.market_id,
        COALESCE(bsi.recorded_at, bsi.verified_at, bsi.created_at) AS occurred_at,
        FALSE AS is_bounty
      FROM bet_stake_intents bsi
      INNER JOIN eligible_markets em ON em.market_id = bsi.market_id

      UNION ALL

      SELECT
        bmfb.market_id,
        COALESCE(bmfb.settled_at, bmfb.rescinded_at, bmfb.created_at) AS occurred_at,
        TRUE AS is_bounty
      FROM bet_market_founder_bonuses bmfb
      INNER JOIN eligible_markets em ON em.market_id = bmfb.market_id

      UNION ALL

      SELECT
        pwc.source_market_id AS market_id,
        COALESCE(pwc.claimed_at, pwc.rescinded_at, pwc.updated_at, pwc.created_at) AS occurred_at,
        pwc.claim_kind = 'winner_bounty' AS is_bounty
      FROM pending_wolo_claims pwc
      INNER JOIN eligible_markets em ON em.market_id = pwc.source_market_id
      WHERE pwc.source_market_id IS NOT NULL
        AND (
          pwc.claim_kind IN ('winner_bounty', 'bet_payout', 'founders_bonus', 'founders_win')
          OR LOWER(pwc.claim_kind) LIKE '%refund%'
        )
        ${claimIdentitySql}
    )
    SELECT
      market_id AS "marketId",
      MAX(occurred_at) AS "occurredAt"
    FROM lifecycle_events
    GROUP BY market_id
    HAVING TRUE
      ${before ? Prisma.sql`AND MAX(occurred_at) < ${before}` : Prisma.empty}
      ${minimumAt ? Prisma.sql`AND MAX(occurred_at) >= ${minimumAt}` : Prisma.empty}
      ${options.requireBounty ? Prisma.sql`AND BOOL_OR(is_bounty)` : Prisma.empty}
    ORDER BY MAX(occurred_at) DESC, market_id DESC
    LIMIT ${candidateLimit}
  `);
  const candidateIds = candidateRows
    .slice(0, MAX_PROJECTED_MARKETS)
    .map((row) => row.marketId);

  if (candidateIds.length === 0) {
    return { groups: [], hasMore: false, nextBefore: null };
  }

  const childWagerWhere: Prisma.BetWagerWhereInput = options.userId
    ? { userId: options.userId }
    : userScoped
      ? { id: -1 }
      : {};
  const childIntentWhere: Prisma.BetStakeIntentWhereInput = options.userId
    ? { userId: options.userId }
    : userScoped
      ? { id: -1 }
      : {};
  const sourceTake = MAX_LIFECYCLE_ROWS_PER_SOURCE + 1;
  const [markets, wagersRaw, intentsRaw, bonusesRaw, claimsRaw] = await Promise.all([
    prisma.betMarket.findMany({
      where: { id: { in: candidateIds } },
      select: {
        id: true,
        slug: true,
        title: true,
        leftLabel: true,
        rightLabel: true,
        status: true,
        winnerSide: true,
        resolutionReason: true,
        settledAt: true,
        voidedAt: true,
        updatedAt: true,
      },
    }),
    prisma.betWager.findMany({
      where: { marketId: { in: candidateIds }, ...childWagerWhere },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: sourceTake,
      select: {
        id: true,
        marketId: true,
        userId: true,
        stakeIntentId: true,
        stakeLegId: true,
        side: true,
        amountWolo: true,
        payoutWolo: true,
        status: true,
        executionMode: true,
        stakeTxHash: true,
        stakeLockedAt: true,
        payoutTxHash: true,
        createdAt: true,
        updatedAt: true,
        settledAt: true,
        user: { select: { uid: true, inGameName: true, steamPersonaName: true } },
        stakeIntent: { select: { status: true } },
        stakeLeg: {
          select: {
            id: true,
            ticket: {
              select: {
                id: true,
                status: true,
                stakeTxHash: true,
                recordedAt: true,
                chainTimestamp: true,
              },
            },
          },
        },
      },
    }),
    prisma.betStakeIntent.findMany({
      where: { marketId: { in: candidateIds }, ...childIntentWhere },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: sourceTake,
      select: {
        id: true,
        marketId: true,
        userId: true,
        side: true,
        amountWolo: true,
        status: true,
        stakeTxHash: true,
        verifiedAt: true,
        recordedAt: true,
        createdAt: true,
        updatedAt: true,
        user: { select: { uid: true, inGameName: true, steamPersonaName: true } },
      },
    }),
    prisma.betMarketFounderBonus.findMany({
      where: { marketId: { in: candidateIds } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: sourceTake,
      select: {
        id: true,
        marketId: true,
        bonusType: true,
        totalAmountWolo: true,
        note: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        settledAt: true,
        rescindedAt: true,
      },
    }),
    prisma.pendingWoloClaim.findMany({
      where: {
        sourceMarketId: { in: candidateIds },
        ...claimIdentityWhere,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: sourceTake,
      select: {
        id: true,
        sourceMarketId: true,
        displayPlayerName: true,
        amountWolo: true,
        claimKind: true,
        status: true,
        claimedByUserId: true,
        payoutTxHash: true,
        errorState: true,
        createdAt: true,
        updatedAt: true,
        claimedAt: true,
        rescindedAt: true,
      },
    }),
  ]);

  const wagers = boundedRows(wagersRaw, "wager");
  const intents = boundedRows(intentsRaw, "stake-intent");
  const bonuses = boundedRows(bonusesRaw, "founder-bonus");
  const claims = boundedRows(claimsRaw, "claim");
  const marketById = new Map(markets.map((market) => [market.id, market] as const));
  const events: BetLifecycleSourceEvent[] = [];

  function marketContext(marketId: number) {
    const market = marketById.get(marketId);
    if (!market) return null;
    return {
      marketId,
      marketTitle: displayMarketTitle(market),
      marketHref: marketHref(market),
    };
  }

  for (const intent of intents) {
    const context = marketContext(intent.marketId);
    if (!context) continue;
    const txHash = cleanHash(intent.stakeTxHash);
    events.push({
      ...context,
      source: "stake_intent",
      sourceId: intent.id,
      kind: "stake_intent",
      status: intent.status,
      occurredAt: (intent.recordedAt || intent.verifiedAt || intent.createdAt).toISOString(),
      amountWolo: intent.amountWolo,
      actor: actorName(intent.user),
      txHash,
      economicKey: `stake:intent:${intent.id}`,
      detail: `${intent.side} side · ${intent.status}`,
    });
  }

  const claimPayoutHashes = new Set(
    claims
      .map((claim) => {
        const hash = cleanHash(claim.payoutTxHash)?.toUpperCase();
        return claim.sourceMarketId && hash ? `${claim.sourceMarketId}:${hash}` : null;
      })
      .filter((value): value is string => Boolean(value)),
  );
  for (const wager of wagers) {
    const context = marketContext(wager.marketId);
    if (!context) continue;
    const txHash = cleanHash(recordedBetWagerFundingTxHash(wager));
    const verifiedEscrow =
      wager.executionMode === "onchain_escrow" && Boolean(txHash && wager.stakeLockedAt);
    events.push({
      ...context,
      source: "wager",
      sourceId: wager.id,
      kind: verifiedEscrow ? "escrow_funded" : "stake_recorded",
      status: wager.status,
      occurredAt: (wager.stakeLockedAt || wager.createdAt).toISOString(),
      amountWolo: wager.amountWolo,
      actor: actorName(wager.user),
      txHash,
      economicKey: stakeEconomicKey(wager),
      detail: verifiedEscrow
        ? `${wager.side} side · verified chain stake`
        : `${wager.side} side · app-side wager record`,
    });

    const payoutTxHash = cleanHash(wager.payoutTxHash);
    if (
      wager.payoutWolo &&
      wager.payoutWolo > 0 &&
      payoutTxHash &&
      !claimPayoutHashes.has(`${wager.marketId}:${payoutTxHash.toUpperCase()}`)
    ) {
      events.push({
        ...context,
        source: "wager",
        sourceId: `payout:${wager.id}`,
        kind: "payout",
        status: wager.status,
        occurredAt: (wager.settledAt || wager.updatedAt).toISOString(),
        amountWolo: wager.payoutWolo,
        actor: actorName(wager.user),
        txHash: payoutTxHash,
        payoutDestination: "wallet",
        economicKey: `payout:wager:${wager.id}`,
        detail: "verified payout transaction",
      });
    }
  }

  for (const bonus of bonuses) {
    const context = marketContext(bonus.marketId);
    if (!context) continue;
    events.push({
      ...context,
      source: "founder_bonus",
      sourceId: bonus.id,
      kind: bonus.bonusType === "winner" ? "founder_winner" : "founder_participants",
      status: bonus.status,
      occurredAt: (bonus.settledAt || bonus.rescindedAt || bonus.createdAt).toISOString(),
      amountWolo: bonus.totalAmountWolo,
      economicKey: `founder-bonus:${bonus.id}`,
      detail: publicFounderDetail(bonus.bonusType, bonus.status),
    });
  }

  for (const market of markets) {
    const terminal =
      Boolean(market.settledAt || market.voidedAt || market.winnerSide) ||
      ["settled", "void", "voided", "refunded"].includes(market.status.toLowerCase());
    if (!terminal) continue;
    const context = marketContext(market.id);
    if (!context) continue;
    const winner =
      market.winnerSide === "left"
        ? market.leftLabel
        : market.winnerSide === "right"
          ? market.rightLabel
          : null;
    events.push({
      ...context,
      source: "market",
      sourceId: market.id,
      kind: "result",
      status: winner ? `winner:${market.winnerSide}` : market.status,
      occurredAt: (market.settledAt || market.voidedAt || market.updatedAt).toISOString(),
      economicKey: `market-result:${market.id}`,
      detail: winner
        ? `${winner} won`
        : ["void", "voided", "refunded"].includes(market.status.toLowerCase())
          ? "Market closed and stakes are being returned"
          : "Market closed without a verified winner",
    });
  }

  for (const claim of claims) {
    if (!claim.sourceMarketId) continue;
    const context = marketContext(claim.sourceMarketId);
    const kind = claimKind(claim.claimKind);
    if (!context || !kind) continue;
    const txHash = cleanHash(claim.payoutTxHash);
    const payoutDestination = claimDestination(claim);
    events.push({
      ...context,
      source: "claim",
      sourceId: claim.id,
      kind,
      status: claim.status,
      occurredAt: (claim.claimedAt || claim.rescindedAt || claim.updatedAt || claim.createdAt).toISOString(),
      amountWolo: claim.amountWolo,
      actor: claim.displayPlayerName,
      txHash,
      payoutDestination,
      economicKey: `claim:${claim.id}`,
      detail: publicClaimDetail(kind, payoutDestination),
    });
  }

  let groups = projectBetLifecycleGroups(events).filter((group) => {
    if (before && Date.parse(group.occurredAt) >= before.getTime()) return false;
    if (minimumAt && Date.parse(group.occurredAt) < minimumAt.getTime()) return false;
    if (options.requireBounty) {
      return group.events.some((event) =>
        event.kind === "winner_bounty" ||
        event.kind === "founder_participants" ||
        event.kind === "founder_winner"
      );
    }
    return true;
  });
  const hasMore = groups.length > limit || candidateRows.length > candidateIds.length;
  groups = groups.slice(0, limit);

  return {
    groups,
    hasMore,
    nextBefore: groups.length > 0 ? groups[groups.length - 1].occurredAt : null,
  };
}
