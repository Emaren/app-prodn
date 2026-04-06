import type { PrismaClient } from "@/lib/generated/prisma";
import { parsePlayers, readMapName } from "@/lib/gameStatsView";
import {
  loadLiveSessionSnapshot,
  type LiveGameSession,
} from "@/lib/liveSessionSnapshot";
import { createPendingWoloClaim } from "@/lib/pendingWoloClaims";
import { recordUserActivity } from "@/lib/userExperience";

export type BetSide = "left" | "right";
export type BetStatus = "open" | "closing" | "live" | "settled";

export type BetBoardSide = {
  key: BetSide;
  name: string;
  href: string | null;
  poolWolo: number;
  crowdPercent: number;
  slips: number;
  seededWolo: number;
};

export type BetBoardMarket = {
  id: number;
  slug: string;
  title: string;
  eventLabel: string;
  status: BetStatus;
  featured: boolean;
  closeLabel: string;
  totalPotWolo: number;
  left: BetBoardSide;
  right: BetBoardSide;
  viewerWager: {
    side: BetSide;
    amountWolo: number;
  } | null;
  winnerSide: BetSide | null;
};

export type BetBookEntry = {
  marketId: number;
  marketSlug: string;
  title: string;
  eventLabel: string;
  side: BetSide;
  pickedLabel: string;
  amountWolo: number;
  projectedReturnWolo: number;
  closeLabel: string;
  status: BetStatus;
};

export type BetSettledResult = {
  id: number;
  title: string;
  eventLabel: string;
  winner: string;
  mapName: string;
  payoutWolo: number;
};

export type BetBoardSnapshot = {
  generatedAt: string;
  viewerName: string | null;
  featuredMarket: BetBoardMarket | null;
  openMarkets: BetBoardMarket[];
  settledResults: BetSettledResult[];
  yourBook: {
    activeCount: number;
    stakedWolo: number;
    projectedReturnWolo: number;
    openWagers: BetBookEntry[];
  };
  heat: {
    biggestPot: {
      label: string;
      potWolo: number;
    } | null;
    bestReturn: {
      label: string;
      returnMultiplier: number;
    } | null;
    liveCount: number;
  };
};


const OPEN_STATUSES: BetStatus[] = ["open", "closing", "live"];
const WATCHER_MARKET_SLUG_PREFIX = "watcher-live-";

function normalizeName(value: string | null | undefined) {
  return (value || "").trim().replace(/\s+/g, " ");
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

function uniqueNames(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = normalizeName(value);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }

  return result;
}

function hashValue(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 1_000_003;
  }
  return Math.abs(hash);
}

function projectReturnWolo(stakeWolo: number, selectedPoolWolo: number, oppositePoolWolo: number) {
  if (stakeWolo <= 0) return 0;
  const nextSelectedPool = selectedPoolWolo + stakeWolo;
  if (nextSelectedPool <= 0) return stakeWolo;
  return Math.max(
    stakeWolo,
    Math.round(stakeWolo + oppositePoolWolo * (stakeWolo / nextSelectedPool))
  );
}

function computeSharePercent(sidePoolWolo: number, totalPotWolo: number) {
  if (totalPotWolo <= 0) return 50;
  return Math.round((sidePoolWolo / totalPotWolo) * 100);
}

function formatCloseLabel(status: BetStatus, closeAt: Date | null) {
  if (status === "settled") return "Settled";
  if (status === "live") return "Live";
  if (!closeAt) return status === "closing" ? "Closing soon" : "Open";

  const diffMs = closeAt.getTime() - Date.now();
  if (diffMs <= 0) return status === "closing" ? "Locking now" : "Open";

  const diffMinutes = Math.max(1, Math.round(diffMs / 60_000));
  if (diffMinutes >= 60) {
    const hours = Math.round(diffMinutes / 60);
    return `${hours}h left`;
  }

  return `${diffMinutes}m left`;
}

function getSessionPlayerPair(session: LiveGameSession) {
  const players = session.players
    .map((player) => ({
      name: normalizeName(player.name),
      winner: player.winner,
    }))
    .filter((player) => Boolean(player.name));

  if (players.length !== 2) {
    return null;
  }

  if (players[0].name.toLowerCase() === players[1].name.toLowerCase()) {
    return null;
  }

  return players as [{ name: string; winner: boolean | null }, { name: string; winner: boolean | null }];
}

function inferWinnerSideFromSession(session: LiveGameSession): BetSide | null {
  const pair = getSessionPlayerPair(session);
  if (!pair) return null;

  const normalizedWinner = normalizeName(session.winner).toLowerCase();
  if (normalizedWinner) {
    if (pair[0].name.toLowerCase() === normalizedWinner) return "left";
    if (pair[1].name.toLowerCase() === normalizedWinner) return "right";
  }

  if (pair[0].winner === true && pair[1].winner !== true) return "left";
  if (pair[1].winner === true && pair[0].winner !== true) return "right";

  return null;
}

type MarketSeed = {
  scheduledMatchId: number | null;
  slug: string;
  title: string;
  eventLabel: string;
  status: BetStatus;
  featured: boolean;
  sortOrder: number;
  source: "session";
  leftLabel: string;
  rightLabel: string;
  leftHref: string | null;
  rightHref: string | null;
  seedLeftWolo: number;
  seedRightWolo: number;
  closeAt: Date | null;
  settledAt: Date | null;
  winnerSide: BetSide | null;
};

function marketSeedCreateData(seed: MarketSeed) {
  return {
    scheduledMatchId: seed.scheduledMatchId,
    slug: seed.slug,
    title: seed.title,
    eventLabel: seed.eventLabel,
    status: seed.status,
    featured: seed.featured,
    sortOrder: seed.sortOrder,
    leftLabel: seed.leftLabel,
    rightLabel: seed.rightLabel,
    leftHref: seed.leftHref,
    rightHref: seed.rightHref,
    seedLeftWolo: seed.seedLeftWolo,
    seedRightWolo: seed.seedRightWolo,
    closeAt: seed.closeAt,
    settledAt: seed.settledAt,
    winnerSide: seed.winnerSide,
  };
}

function buildSessionMarketSlug(session: LiveGameSession, leftLabel: string, rightLabel: string) {
  if (session.replayHash?.trim()) {
    return `${WATCHER_MARKET_SLUG_PREFIX}${session.replayHash.trim().toLowerCase().slice(0, 24)}`;
  }

  const sessionKey = slugify(session.sessionKey || `${leftLabel}-vs-${rightLabel}`);
  return `${WATCHER_MARKET_SLUG_PREFIX}${sessionKey}`.slice(0, 120);
}

function buildSessionEventLabel(session: LiveGameSession) {
  const rail = session.state === "live" ? "Watcher Live" : "Watcher Final";
  return session.mapName ? `${rail} • ${session.mapName}` : rail;
}

function buildSessionMarketSeed(
  session: LiveGameSession,
  index: number,
  featured: boolean
): MarketSeed | null {
  const pair = getSessionPlayerPair(session);
  if (!pair) return null;

  const [left, right] = pair;
  const settledAtRaw = session.completedAt || session.updatedAt || session.createdAt;

  return {
    scheduledMatchId: null,
    slug: buildSessionMarketSlug(session, left.name, right.name),
    title: `${left.name} vs ${right.name}`,
    eventLabel: buildSessionEventLabel(session),
    status: session.state === "completed" ? "settled" : "live",
    featured,
    sortOrder: index,
    source: "session",
    leftLabel: left.name,
    rightLabel: right.name,
    leftHref: `/players/by-name/${encodeURIComponent(left.name)}`,
    rightHref: `/players/by-name/${encodeURIComponent(right.name)}`,
    seedLeftWolo: 0,
    seedRightWolo: 0,
    closeAt: null,
    settledAt: session.state === "completed" ? new Date(settledAtRaw) : null,
    winnerSide: session.state === "completed" ? inferWinnerSideFromSession(session) : null,
  } satisfies MarketSeed;
}


function claimPlayerNameForUser(user: {
  uid: string;
  inGameName: string | null;
  steamPersonaName: string | null;
}) {
  return normalizeName(user.inGameName) || normalizeName(user.steamPersonaName) || user.uid;
}

function buildPendingClaimNote(
  market: { title: string; eventLabel: string },
  outcome: "won" | "void",
  payoutWolo: number
) {
  const reason = outcome === "void" ? "Void refund" : "Settled payout";
  return `${reason} · ${market.title} · ${market.eventLabel} · ${payoutWolo} WOLO`;
}

async function settleResolvedMarketWagers(prisma: PrismaClient) {
  const markets = await prisma.betMarket.findMany({
    where: {
      status: "settled",
      wagers: {
        some: {
          status: "active",
        },
      },
    },
    select: {
      id: true,
      title: true,
      eventLabel: true,
      winnerSide: true,
      seedLeftWolo: true,
      seedRightWolo: true,
      settledAt: true,
      wagers: {
        where: { status: "active" },
        select: {
          id: true,
          userId: true,
          side: true,
          amountWolo: true,
          user: {
            select: {
              id: true,
              uid: true,
              inGameName: true,
              steamPersonaName: true,
            },
          },
        },
      },
    },
  });

  for (const market of markets) {
    const settledAt = market.settledAt ?? new Date();
    const winningSide =
      market.winnerSide === "left" || market.winnerSide === "right"
        ? market.winnerSide
        : null;
    const winningUserPool = winningSide
      ? market.wagers
          .filter((wager) => wager.side === winningSide)
          .reduce((sum, wager) => sum + wager.amountWolo, 0)
      : 0;
    const losingSidePool =
      winningSide === "left"
        ? market.seedRightWolo +
          market.wagers
            .filter((wager) => wager.side === "right")
            .reduce((sum, wager) => sum + wager.amountWolo, 0)
        : winningSide === "right"
          ? market.seedLeftWolo +
            market.wagers
              .filter((wager) => wager.side === "left")
              .reduce((sum, wager) => sum + wager.amountWolo, 0)
          : 0;

    await prisma.$transaction(async (tx) => {
      for (const wager of market.wagers) {
        let nextStatus: "won" | "lost" | "void";
        let payoutWolo: number;

        if (!winningSide) {
          nextStatus = "void";
          payoutWolo = wager.amountWolo;
        } else if (wager.side !== winningSide) {
          nextStatus = "lost";
          payoutWolo = 0;
        } else {
          nextStatus = "won";
          payoutWolo =
            winningUserPool > 0
              ? Math.max(
                  wager.amountWolo,
                  Math.round(
                    wager.amountWolo +
                      losingSidePool * (wager.amountWolo / winningUserPool)
                  )
                )
              : wager.amountWolo;
        }

        await tx.betWager.update({
          where: { id: wager.id },
          data: {
            status: nextStatus,
            payoutWolo,
            settledAt,
          },
        });

        await recordUserActivity(tx, {
          userId: wager.userId,
          type:
            nextStatus === "won"
              ? "bet_wager_won"
              : nextStatus === "void"
                ? "bet_wager_voided"
                : "bet_wager_lost",
          path: "/bets",
          label: market.title,
          metadata: {
            marketId: market.id,
            wagerId: wager.id,
            eventLabel: market.eventLabel,
            side: wager.side,
            amountWolo: wager.amountWolo,
            payoutWolo,
            settledAt: settledAt.toISOString(),
            outcome: nextStatus,
            winnerSide: winningSide,
          },
          dedupeWithinSeconds: 5,
        });

        if (nextStatus === "lost" || payoutWolo < 1) {
          continue;
        }

        const claimPlayerName = claimPlayerNameForUser(wager.user);
        await createPendingWoloClaim(tx, {
          playerName: claimPlayerName,
          displayPlayerName: claimPlayerName,
          amountWolo: payoutWolo,
          sourceMarketId: market.id,
          note: buildPendingClaimNote(market, nextStatus, payoutWolo),
        });

        await recordUserActivity(tx, {
          userId: wager.userId,
          type: "pending_wolo_claim_created",
          path: "/bets",
          label: market.title,
          metadata: {
            marketId: market.id,
            wagerId: wager.id,
            eventLabel: market.eventLabel,
            amountWolo: payoutWolo,
            claimReason: nextStatus === "void" ? "bet_refund" : "bet_payout",
            settledAt: settledAt.toISOString(),
          },
          dedupeWithinSeconds: 5,
        });
      }
    });
  }
}


async function buildOpenMarketSeeds(prisma: PrismaClient) {
  const sessionSnapshot = await loadLiveSessionSnapshot(prisma);

  const seeds: MarketSeed[] = [];
  const seenSlugs = new Set<string>();

  sessionSnapshot.activeSessions.forEach((session, index) => {
    const seed = buildSessionMarketSeed(session, index, seeds.length === 0);
    if (!seed || seenSlugs.has(seed.slug)) return;
    seenSlugs.add(seed.slug);
    seeds.push(seed);
  });

  sessionSnapshot.recentlyCompletedSessions.forEach((session, index) => {
    const seed = buildSessionMarketSeed(session, 100 + index, false);
    if (!seed || seenSlugs.has(seed.slug)) return;
    seenSlugs.add(seed.slug);
    seeds.push(seed);
  });

  return seeds;
}

export async function ensureBetMarkets(prisma: PrismaClient) {
  const seeds = await buildOpenMarketSeeds(prisma);
  const slugs = seeds.map((seed) => seed.slug);

  const existing = await prisma.betMarket.findMany({
    where: slugs.length > 0 ? { slug: { in: slugs } } : undefined,
    select: {
      id: true,
      slug: true,
    },
  });
  const existingBySlug = new Map(existing.map((market) => [market.slug, market] as const));

  await Promise.all(
    seeds.map(async (seed) => {
      const current = existingBySlug.get(seed.slug);
      if (!current) {
        await prisma.betMarket.create({
          data: marketSeedCreateData(seed),
        });
        return;
      }

      await prisma.betMarket.update({
        where: { id: current.id },
        data: {
          scheduledMatchId: seed.scheduledMatchId,
          title: seed.title,
          eventLabel: seed.eventLabel,
          status: seed.status,
          featured: seed.featured,
          sortOrder: seed.sortOrder,
          leftLabel: seed.leftLabel,
          rightLabel: seed.rightLabel,
          leftHref: seed.leftHref,
          rightHref: seed.rightHref,
          seedLeftWolo: seed.seedLeftWolo,
          seedRightWolo: seed.seedRightWolo,
          closeAt: seed.closeAt,
          winnerSide: seed.winnerSide,
          settledAt: seed.settledAt,
        },
      });
    })
  );

  await prisma.betMarket.updateMany({
    where:
      slugs.length > 0
        ? {
            slug: { notIn: slugs },
            status: { in: OPEN_STATUSES },
          }
        : {
            status: { in: OPEN_STATUSES },
          },
    data: {
      status: "settled",
      featured: false,
      settledAt: new Date(),
      winnerSide: null,
      closeAt: null,
    },
  });

  await settleResolvedMarketWagers(prisma);
}

function buildMarketCard(
  market: Awaited<ReturnType<typeof loadOpenMarkets>>[number],
  viewerUserId: number | null
): BetBoardMarket {
  const activeWagers = market.wagers.filter((wager) => wager.status === "active");
  const leftUserPool = activeWagers
    .filter((wager) => wager.side === "left")
    .reduce((sum, wager) => sum + wager.amountWolo, 0);
  const rightUserPool = activeWagers
    .filter((wager) => wager.side === "right")
    .reduce((sum, wager) => sum + wager.amountWolo, 0);
  const leftPoolWolo = market.seedLeftWolo + leftUserPool;
  const rightPoolWolo = market.seedRightWolo + rightUserPool;
  const totalPotWolo = leftPoolWolo + rightPoolWolo;
  const viewerWager =
    viewerUserId == null ? null : activeWagers.find((wager) => wager.userId === viewerUserId) || null;

  return {
    id: market.id,
    slug: market.slug,
    title: market.title,
    eventLabel: market.eventLabel,
    status: market.status as BetStatus,
    featured: market.featured,
    closeLabel: formatCloseLabel(market.status as BetStatus, market.closeAt),
    totalPotWolo,
    left: {
      key: "left",
      name: market.leftLabel,
      href: market.leftHref,
      poolWolo: leftPoolWolo,
      crowdPercent: computeSharePercent(leftPoolWolo, totalPotWolo),
      slips: activeWagers.filter((wager) => wager.side === "left").length,
      seededWolo: market.seedLeftWolo,
    },
    right: {
      key: "right",
      name: market.rightLabel,
      href: market.rightHref,
      poolWolo: rightPoolWolo,
      crowdPercent: computeSharePercent(rightPoolWolo, totalPotWolo),
      slips: activeWagers.filter((wager) => wager.side === "right").length,
      seededWolo: market.seedRightWolo,
    },
    viewerWager: viewerWager
      ? {
          side: viewerWager.side as BetSide,
          amountWolo: viewerWager.amountWolo,
        }
      : null,
    winnerSide:
      market.winnerSide === "left" || market.winnerSide === "right"
        ? (market.winnerSide as BetSide)
        : null,
  };
}

async function loadOpenMarkets(prisma: PrismaClient) {
  return prisma.betMarket.findMany({
    where: { status: { in: OPEN_STATUSES } },
    orderBy: [{ featured: "desc" }, { sortOrder: "asc" }, { updatedAt: "desc" }],
    include: {
      wagers: {
        where: { status: "active" },
        orderBy: { updatedAt: "desc" },
      },
    },
  });
}

async function loadRecentSettledResults(prisma: PrismaClient): Promise<BetSettledResult[]> {
  const settledMarkets = await prisma.betMarket.findMany({
    where: {
      status: "settled",
      winnerSide: {
        in: ["left", "right"],
      },
    },
    orderBy: [{ settledAt: "desc" }, { updatedAt: "desc" }, { id: "desc" }],
    take: 4,
    include: {
      wagers: {
        select: {
          amountWolo: true,
          payoutWolo: true,
          status: true,
        },
      },
    },
  });

  if (settledMarkets.length > 0) {
    return settledMarkets.map((market) => {
      const winner = market.winnerSide === "right" ? market.rightLabel : market.leftLabel;
      const settledPayoutTotal = market.wagers
        .filter((wager) => wager.status === "won")
        .reduce((sum, wager) => sum + (wager.payoutWolo ?? 0), 0);
      const payoutWolo =
        settledPayoutTotal > 0
          ? settledPayoutTotal
          : market.seedLeftWolo +
            market.seedRightWolo +
            market.wagers.reduce((sum, wager) => sum + wager.amountWolo, 0);
      const mapName = market.eventLabel.includes("•")
        ? market.eventLabel.split("•").slice(1).join("•").trim() || market.eventLabel
        : market.eventLabel;

      return {
        id: market.id,
        title: market.title,
        eventLabel: market.eventLabel,
        winner,
        mapName,
        payoutWolo,
      } satisfies BetSettledResult;
    });
  }

  const rows = await prisma.gameStats.findMany({
    where: {
      is_final: true,
      winner: { not: null },
    },
    orderBy: [{ played_on: "desc" }, { timestamp: "desc" }, { id: "desc" }],
    take: 4,
    select: {
      id: true,
      winner: true,
      map: true,
      players: true,
      parse_reason: true,
    },
  });

  return rows.map((row) => {
    const players = parsePlayers(row.players);
    const names = players
      .map((player) => normalizeName(String(player.name || player.player_name || "")))
      .filter(Boolean)
      .slice(0, 2);
    const title =
      names.length >= 2
        ? `${names[0]} vs ${names[1]}`
        : names.length === 1
          ? `${names[0]} result`
          : "Replay-backed result";
    const mapName = readMapName(row.map);
    return {
      id: row.id,
      title,
      eventLabel: row.parse_reason ? row.parse_reason.replace(/_/g, " ") : "Replay proof",
      winner: row.winner || "Unknown",
      mapName,
      payoutWolo: 110 + (hashValue(`${row.id}:${row.winner}`) % 240),
    };
  });
}

export async function loadBetBoardSnapshot(
  prisma: PrismaClient,
  viewerUid?: string | null
): Promise<BetBoardSnapshot> {
  await ensureBetMarkets(prisma);

  const viewer = viewerUid
    ? await prisma.user.findUnique({
        where: { uid: viewerUid },
        select: {
          id: true,
          inGameName: true,
          steamPersonaName: true,
        },
      })
    : null;

  const [openMarketsRaw, settledResults] = await Promise.all([
    loadOpenMarkets(prisma),
    loadRecentSettledResults(prisma),
  ]);

  const openMarkets = openMarketsRaw.map((market) => buildMarketCard(market, viewer?.id ?? null));
  const featuredMarket = openMarkets.find((market) => market.featured) || openMarkets[0] || null;

  const openWagers = openMarkets
    .filter((market) => market.viewerWager)
    .map((market) => {
      const side = market.viewerWager?.side || "left";
      const amountWolo = market.viewerWager?.amountWolo || 0;
      const selectedPool = side === "left" ? market.left.poolWolo : market.right.poolWolo;
      const otherPool = side === "left" ? market.right.poolWolo : market.left.poolWolo;

      return {
        marketId: market.id,
        marketSlug: market.slug,
        title: market.title,
        eventLabel: market.eventLabel,
        side,
        pickedLabel: side === "left" ? market.left.name : market.right.name,
        amountWolo,
        projectedReturnWolo: projectReturnWolo(
          amountWolo,
          Math.max(0, selectedPool - amountWolo),
          otherPool
        ),
        closeLabel: market.closeLabel,
        status: market.status,
      } satisfies BetBookEntry;
    })
    .sort((left, right) => right.amountWolo - left.amountWolo);

  const bestReturn = openMarkets.reduce<{
    label: string;
    returnMultiplier: number;
  } | null>((current, market) => {
    const leftProjection = projectReturnWolo(25, market.left.poolWolo, market.right.poolWolo) / 25;
    const rightProjection = projectReturnWolo(25, market.right.poolWolo, market.left.poolWolo) / 25;
    const leftLabel = `${market.left.name} · ${market.eventLabel}`;
    const rightLabel = `${market.right.name} · ${market.eventLabel}`;

    const candidate =
      leftProjection >= rightProjection
        ? { label: leftLabel, returnMultiplier: Number(leftProjection.toFixed(2)) }
        : { label: rightLabel, returnMultiplier: Number(rightProjection.toFixed(2)) };

    if (!current || candidate.returnMultiplier > current.returnMultiplier) {
      return candidate;
    }

    return current;
  }, null);

  const biggestPot = openMarkets.reduce<{
    label: string;
    potWolo: number;
  } | null>((current, market) => {
    const candidate = { label: market.title, potWolo: market.totalPotWolo };
    if (!current || candidate.potWolo > current.potWolo) {
      return candidate;
    }
    return current;
  }, null);

  return {
    generatedAt: new Date().toISOString(),
    viewerName: viewer?.inGameName || viewer?.steamPersonaName || null,
    featuredMarket,
    openMarkets,
    settledResults,
    yourBook: {
      activeCount: openWagers.length,
      stakedWolo: openWagers.reduce((sum, wager) => sum + wager.amountWolo, 0),
      projectedReturnWolo: openWagers.reduce(
        (sum, wager) => sum + wager.projectedReturnWolo,
        0
      ),
      openWagers,
    },
    heat: {
      biggestPot,
      bestReturn,
      liveCount: openMarkets.filter((market) => market.status === "live").length,
    },
  };
}
