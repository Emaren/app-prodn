import type { PrismaClient } from "@/lib/generated/prisma";
import { parsePlayers, readMapName } from "@/lib/gameStatsView";
import { loadLobbyLeaderboard } from "@/lib/lobbyLeaderboard";
import { getFeaturedTournament } from "@/lib/communityStore";

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

const FALLBACK_FIGHTERS = [
  "Emaren",
  "Julio Alvarez",
  "Sniper",
  "Kaos",
  "Quadro",
  "Latin_k",
] as const;

const OPEN_STATUSES: BetStatus[] = ["open", "closing", "live"];

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

function statusFromTournament(status: string): BetStatus {
  if (status === "active") return "live";
  if (status === "open") return "closing";
  return "open";
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

function buildSeedPools(
  leftRating: number | null | undefined,
  rightRating: number | null | undefined,
  featured: boolean,
  seedKey: string
) {
  const base = featured ? 180 : 120;
  const hash = hashValue(seedKey);
  const fallbackShift = 14 + (hash % 24);

  if (
    typeof leftRating !== "number" ||
    !Number.isFinite(leftRating) ||
    typeof rightRating !== "number" ||
    !Number.isFinite(rightRating)
  ) {
    return {
      left: base + fallbackShift,
      right: Math.max(60, base - Math.round(fallbackShift / 1.4)),
    };
  }

  const diff = leftRating - rightRating;
  const spread = Math.min(72, Math.max(12, Math.round(Math.abs(diff) / 6)));

  if (diff >= 0) {
    return {
      left: base + spread,
      right: Math.max(60, base - Math.round(spread / 1.25)),
    };
  }

  return {
    left: Math.max(60, base - Math.round(spread / 1.25)),
    right: base + spread,
  };
}

type MarketSeed = {
  slug: string;
  title: string;
  eventLabel: string;
  status: BetStatus;
  featured: boolean;
  sortOrder: number;
  leftLabel: string;
  rightLabel: string;
  leftHref: string | null;
  rightHref: string | null;
  seedLeftWolo: number;
  seedRightWolo: number;
  closeAt: Date | null;
};

async function buildOpenMarketSeeds(prisma: PrismaClient) {
  const [tournament, leaderboard] = await Promise.all([
    getFeaturedTournament(prisma),
    loadLobbyLeaderboard(prisma),
  ]);

  const fighterNames = uniqueNames([
    ...tournament.entrants.map((entrant) => entrant.inGameName || entrant.steamPersonaName),
    ...leaderboard.entries.map((entry) => entry.name),
    ...FALLBACK_FIGHTERS,
  ]).slice(0, 6);

  const hrefByName = new Map(
    leaderboard.entries.map((entry) => [entry.name.trim().toLowerCase(), entry.href] as const)
  );
  const ratingByName = new Map(
    leaderboard.entries.map((entry) => [
      entry.name.trim().toLowerCase(),
      entry.primaryRating ?? entry.arenaElo ?? entry.steamRmRating ?? null,
    ])
  );

  const featuredCloseAt = tournament.startsAt ? new Date(tournament.startsAt) : null;
  const candidates: Array<{
    leftIndex: number;
    rightIndex: number;
    eventLabel: string;
    status: BetStatus;
    featured: boolean;
    sortOrder: number;
    closeMinutes: number;
  }> = [
    {
      leftIndex: 0,
      rightIndex: 1,
      eventLabel: tournament.isFallback ? "Founders Book" : tournament.title,
      status: statusFromTournament(tournament.status),
      featured: true,
      sortOrder: 0,
      closeMinutes: 96,
    },
    {
      leftIndex: 1,
      rightIndex: 2,
      eventLabel: "Rivalry Book",
      status: "closing",
      featured: false,
      sortOrder: 1,
      closeMinutes: 38,
    },
    {
      leftIndex: 0,
      rightIndex: 3,
      eventLabel: "Ladder Board",
      status: "open",
      featured: false,
      sortOrder: 2,
      closeMinutes: 74,
    },
    {
      leftIndex: 2,
      rightIndex: 4,
      eventLabel: "Night Book",
      status: "live",
      featured: false,
      sortOrder: 3,
      closeMinutes: 12,
    },
    {
      leftIndex: 3,
      rightIndex: 5,
      eventLabel: "Fresh Read",
      status: "open",
      featured: false,
      sortOrder: 4,
      closeMinutes: 86,
    },
  ];

  const now = Date.now();
  const seeds: MarketSeed[] = [];

  for (const candidate of candidates) {
      const leftLabel = fighterNames[candidate.leftIndex] || FALLBACK_FIGHTERS[candidate.leftIndex];
      const rightLabel = fighterNames[candidate.rightIndex] || FALLBACK_FIGHTERS[candidate.rightIndex];

      if (!leftLabel || !rightLabel || leftLabel.toLowerCase() === rightLabel.toLowerCase()) {
        continue;
      }

      const slug = slugify(`${candidate.eventLabel}-${leftLabel}-vs-${rightLabel}`);
      const ratings = buildSeedPools(
        ratingByName.get(leftLabel.toLowerCase()) ?? null,
        ratingByName.get(rightLabel.toLowerCase()) ?? null,
        candidate.featured,
        slug
      );

      seeds.push({
        slug,
        title: `${leftLabel} vs ${rightLabel}`,
        eventLabel: candidate.eventLabel,
        status: candidate.status,
        featured: candidate.featured,
        sortOrder: candidate.sortOrder,
        leftLabel,
        rightLabel,
        leftHref: hrefByName.get(leftLabel.toLowerCase()) || `/players/by-name/${encodeURIComponent(leftLabel)}`,
        rightHref:
          hrefByName.get(rightLabel.toLowerCase()) ||
          `/players/by-name/${encodeURIComponent(rightLabel)}`,
        seedLeftWolo: ratings.left,
        seedRightWolo: ratings.right,
        closeAt:
          candidate.featured && featuredCloseAt
            ? featuredCloseAt
            : new Date(now + candidate.closeMinutes * 60_000),
      } satisfies MarketSeed);
  }

  return seeds;
}

export async function ensureBetMarkets(prisma: PrismaClient) {
  const seeds = await buildOpenMarketSeeds(prisma);
  const slugs = seeds.map((seed) => seed.slug);
  const existing = await prisma.betMarket.findMany({
    where: { slug: { in: slugs } },
    select: {
      id: true,
      slug: true,
      status: true,
      winnerSide: true,
      settledAt: true,
    },
  });
  const existingBySlug = new Map(existing.map((market) => [market.slug, market] as const));

  await Promise.all(
    seeds.map(async (seed) => {
      const current = existingBySlug.get(seed.slug);
      if (!current) {
        await prisma.betMarket.create({
          data: seed,
        });
        return;
      }

      if (current.status === "settled") {
        return;
      }

      await prisma.betMarket.update({
        where: { id: current.id },
        data: {
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
        },
      });
    })
  );
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
