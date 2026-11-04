/**
 * A05 public War Chest presentation for the confined nonfinancial website.
 *
 * This is a pure read over source-owned security-barrier views, plus the same
 * accounting/ranking functions used by the old public page. It never loads
 * raw stake intents, wallet fields, private notes, user credentials or
 * custody/reconciliation objects. Missing views fail closed, never zeroed.
 */
import type { PrismaClient } from "@/lib/generated/prisma";
import { isDesyncSideMarketType } from "@/lib/desyncSideMarket";
import { matchedMarketVolumeWolo } from "@/lib/betWagerSettlement";
import { loadLobbyWoloEarnersBoard } from "@/lib/lobbyWoloEarners";
import { getWarChestUtcWeekStart } from "@/lib/warChestPeriodTruth";
import { loadWoloDevSnapshot } from "@/lib/woloDevSnapshot";
import { getWoloMainnetDisplayStartAt, isWoloMainnet } from "@/lib/woloChain";
import { buildClaimedPlayerHref, buildReplayPlayerHref, normalizePublicPlayerName } from "@/lib/publicPlayers";
import type { WarChestSnapshot, WarChestMode } from "@/lib/warChest";

type WagerRow = {
  id: number; marketId: number; userId: number; side: string;
  amountWolo: number; payoutWolo: number | null; status: string;
  executionMode: string; createdAt: Date; settledAt: Date | null;
  stakeLockedAt: Date | null; recordedFunding: boolean;
};
type ClaimRow = {
  id: number; claimedByUserId: number | null;
  normalizedPlayerName: string; displayPlayerName: string;
  amountWolo: number; claimKind: string; status: string;
  createdAt: Date; claimedAt: Date | null;
  payoutAttemptedAt: Date | null; payoutTxHash: string | null;
  errorState: string | null; note: null;
};
type MarketRow = {
  id: number; title: string; eventLabel: string; status: string;
  marketType: string; sortOrder: number; featured: boolean;
  leftLabel: string; rightLabel: string;
  seedLeftWolo: number; seedRightWolo: number;
  closeAt: Date | null; settledAt: Date | null;
};
type PublicUser = {
  id: number; uid: string; inGameName: string | null;
  steamPersonaName: string | null; verified: boolean;
  verificationLevel: number;
};

function groupedSideTotals(wagers: WagerRow[]) {
  const grouped = new Map<string, { marketId: number; side: string; _sum: { amountWolo: number } }>();
  for (const wager of wagers) {
    const key = `${wager.marketId}:${wager.side}`;
    const value = grouped.get(key) ?? { marketId: wager.marketId, side: wager.side, _sum: { amountWolo: 0 } };
    value._sum.amountWolo += wager.amountWolo;
    grouped.set(key, value);
  }
  return [...grouped.values()];
}

function matchedVolume(wagers: WagerRow[]) {
  const byMarket = new Map<number, { left: number; right: number }>();
  for (const row of groupedSideTotals(wagers)) {
    const pools = byMarket.get(row.marketId) ?? { left: 0, right: 0 };
    if (row.side === "left") pools.left += row._sum.amountWolo;
    else if (row.side === "right") pools.right += row._sum.amountWolo;
    byMarket.set(row.marketId, pools);
  }
  return [...byMarket.values()].reduce((sum, pools) =>
    sum + matchedMarketVolumeWolo(pools.left, pools.right), 0);
}

function projectedReturn(stake: number, selectedPool: number, oppositePool: number) {
  if (stake <= 0) return 0;
  const newSelected = selectedPool + stake;
  if (newSelected <= 0) return stake;
  return Math.max(stake, Math.round(stake + oppositePool * (stake / newSelected)));
}

function userName(user: PublicUser) {
  return normalizePublicPlayerName(user.inGameName)
    || normalizePublicPlayerName(user.steamPersonaName)
    || user.uid;
}

function validMarketStatus(value: string): WarChestSnapshot["betBoard"]["openMarkets"][number]["status"] {
  if (value === "open" || value === "closing" || value === "live" ||
      value === "awaiting_final_proof" || value === "settled" ||
      value === "voided" || value === "under_review") return value;
  throw new Error("WAR_CHEST_V9_MARKET_STATUS_UNRECOGNIZED");
}

export async function loadNonfinancialWarChestSnapshot(
  prisma: PrismaClient, mode: WarChestMode
): Promise<WarChestSnapshot> {
  const generatedAt = new Date();
  const weekStartsAt = getWarChestUtcWeekStart(generatedAt);
  const [earn, wolo, publicWagers, publicClaims, markets, users] = await Promise.all([
    loadLobbyWoloEarnersBoard(prisma, { mode, generatedAt }),
    loadWoloDevSnapshot(),
    prisma.$queryRaw<WagerRow[]>`
      SELECT id,"marketId","userId",side,"amountWolo","payoutWolo",
             status,"executionMode","createdAt","settledAt",
             "stakeLockedAt","recordedFunding"
      FROM aoe2war_public_v9.published_wagers
      ORDER BY "createdAt" DESC,id DESC
    `,
    prisma.$queryRaw<ClaimRow[]>`
      SELECT id,"claimedByUserId","normalizedPlayerName",
             "displayPlayerName","amountWolo","claimKind",status,
             "createdAt","claimedAt","payoutAttemptedAt",
             "payoutTxHash","errorState",note
      FROM aoe2war_public_v9.published_claims
      ORDER BY "createdAt" DESC,id DESC
    `,
    prisma.$queryRaw<MarketRow[]>`
      SELECT id,title,"eventLabel",status,"marketType","sortOrder",
             featured,"leftLabel","rightLabel","seedLeftWolo","seedRightWolo",
             "closeAt","settledAt"
      FROM aoe2war_public_v9.published_markets
      ORDER BY "sortOrder",id
    `,
    prisma.$queryRaw<PublicUser[]>`
      SELECT id,uid,in_game_name AS "inGameName",
             steam_persona_name AS "steamPersonaName",
             verified,verification_level AS "verificationLevel"
      FROM aoe2war_public_v5.user_profiles
    `,
  ]);
  // On mainnet only wagers whose real chain funding is recorded are visible.
  // App-only, unsigned and not-yet-locked wagers NEVER enter public figures.
  const mainnetStart = getWoloMainnetDisplayStartAt();
  const wagers = isWoloMainnet() ? publicWagers.filter((wager) =>
    wager.recordedFunding && wager.stakeLockedAt !== null &&
    wager.stakeLockedAt >= mainnetStart
  ) : publicWagers;
  const claims = isWoloMainnet()
    ? publicClaims.filter((claim) => claim.createdAt >= mainnetStart)
    : publicClaims;
  const userById = new Map(users.map((user) => [user.id, user]));
  const wagersByMarket = new Map<number, WagerRow[]>();
  for (const wager of wagers) {
    const list = wagersByMarket.get(wager.marketId) ?? [];
    list.push(wager);
    wagersByMarket.set(wager.marketId, list);
  }

  const openMarkets = markets
    .filter((market) => ["open", "closing", "live"].includes(market.status))
    .map((market) => {
      const ownWagers = wagersByMarket.get(market.id) ?? [];
      const leftWagers = ownWagers.filter((wager) => wager.side === "left");
      const rightWagers = ownWagers.filter((wager) => wager.side === "right");
      const leftPool = market.seedLeftWolo +
        leftWagers.reduce((total, wager) => total + wager.amountWolo, 0);
      const rightPool = market.seedRightWolo +
        rightWagers.reduce((total, wager) => total + wager.amountWolo, 0);
      const totalPot = leftPool + rightPool;
      const crowd = (pool: number) => totalPot > 0 ? Math.round((pool / totalPot) * 100) : 50;
      return {
        id: market.id,
        title: market.title,
        eventLabel: market.eventLabel,
        status: validMarketStatus(market.status),
        closeLabel: market.status === "live" ? "Live" :
          market.status === "closing" ? "Closing" : "Open",
        left: {
          name: market.leftLabel, poolWolo: leftPool,
          crowdPercent: crowd(leftPool), slips: leftWagers.length,
        },
        right: {
          name: market.rightLabel, poolWolo: rightPool,
          crowdPercent: crowd(rightPool), slips: rightWagers.length,
        },
        marketType: market.marketType,
        featured: market.featured,
        potWolo: totalPot,
      };
    });
  const primary = openMarkets.filter((market) => !isDesyncSideMarketType(market.marketType));
  const biggestPotCandidates = [
    ...primary.map((market) => ({ label: market.title, potWolo: market.potWolo })),
    ...markets.filter((market) => market.status === "settled" &&
      (!isWoloMainnet() || wagersByMarket.has(market.id)))
      .map((market) => ({
        label: market.title,
        potWolo: market.seedLeftWolo + market.seedRightWolo +
          (wagersByMarket.get(market.id) ?? []).reduce((sum, wager) => sum + wager.amountWolo, 0),
      })),
  ];
  const biggestPot = biggestPotCandidates.reduce<{label:string;potWolo:number}|null>(
    (best, row) => (!best || row.potWolo > best.potWolo) ? row : best, null);
  const bestReturn = primary.reduce<{label:string;returnMultiplier:number}|null>((best, market) => {
    const left = projectedReturn(25, market.left.poolWolo, market.right.poolWolo) / 25;
    const right = projectedReturn(25, market.right.poolWolo, market.left.poolWolo) / 25;
    const candidate = left >= right
      ? { label: `${market.left.name} · ${market.eventLabel}`, returnMultiplier: Number(left.toFixed(2)) }
      : { label: `${market.right.name} · ${market.eventLabel}`, returnMultiplier: Number(right.toFixed(2)) };
    return !best || candidate.returnMultiplier > best.returnMultiplier ? candidate : best;
  }, null);
  const weeklyWagers = wagers.filter((row) => row.createdAt >= weekStartsAt);
  const pendingClaims = claims.filter((row) => row.status === "pending");
  const recentWagers = wagers.slice(0, 10).map((wager) => {
    const user = userById.get(wager.userId);
    const market = markets.find((row) => row.id === wager.marketId);
    if (!user || !market) throw new Error("WAR_CHEST_V9_PUBLIC_WAGER_RELATION_MISSING");
    return {
      id: wager.id, actorName: userName(user), actorHref: buildClaimedPlayerHref(user.uid),
      verified: user.verified, amountWolo: wager.amountWolo,
      payoutWolo: wager.payoutWolo,
      status: wager.status, executionMode: wager.executionMode,
      createdAt: wager.createdAt.toISOString(),
      marketTitle: market.title, eventLabel: market.eventLabel,
      pickedLabel: wager.side === "left" ? market.leftLabel : market.rightLabel,
    };
  });
  const recentClaims = claims.slice(0, 10).map((claim) => {
    const name = normalizePublicPlayerName(claim.displayPlayerName) || "Unknown player";
    return {
      id: claim.id, playerName: name, href: buildReplayPlayerHref(name),
      amountWolo: claim.amountWolo, status: claim.status,
      createdAt: claim.createdAt.toISOString(),
      claimedAt: claim.claimedAt?.toISOString() ?? null,
      payoutAttemptedAt: claim.payoutAttemptedAt?.toISOString() ?? null,
      payoutTxHash: claim.payoutTxHash,
      errorState: claim.errorState,
      note: null,
    };
  });
  return {
    generatedAt: generatedAt.toISOString(),
    wolo, earners: earn,
    betBoard: {
      openMarkets,
      heat: {
        biggestPot,
        bestReturn,
        liveCount: primary.filter((market) => market.status === "live").length,
      },
    },
    weekly: {
      volumeWolo: matchedVolume(weeklyWagers),
      paidOutWolo: weeklyWagers.reduce((sum, row) => sum + (row.payoutWolo ?? 0), 0),
      activeBettors: new Set(weeklyWagers.map((row) => row.userId)).size,
      slips: weeklyWagers.length,
      onchainEscrowedWolo: weeklyWagers.filter((row) => row.executionMode === "onchain_escrow")
        .reduce((sum, row) => sum + row.amountWolo, 0),
      pendingClaims: pendingClaims.length,
      pendingWolo: pendingClaims.reduce((sum, row) => sum + row.amountWolo, 0),
    },
    lifetime: {
      totalWageredWolo: matchedVolume(wagers),
      totalPayoutWolo: wagers.reduce((sum, row) => sum + (row.payoutWolo ?? 0), 0),
      totalParticipants: earn.totalParticipants,
      settledMarkets: markets.filter((market) => market.status === "settled" &&
        (!isWoloMainnet() || wagersByMarket.has(market.id))).length,
      openMarkets: openMarkets.length,
    },
    recentWagers, recentClaims,
  };
}
