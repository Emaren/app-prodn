import type { PrismaClient } from "@/lib/generated/prisma";
import { parsePlayers, readMapName } from "@/lib/gameStatsView";
import {
  loadLiveSessionSnapshot,
  type LiveGameSession,
} from "@/lib/liveSessionSnapshot";
import {
  createPendingWoloClaim,
  normalizePendingWoloClaimName,
} from "@/lib/pendingWoloClaims";
import {
  executeWoloPayout,
  hasWoloPayoutExecutionConfigured,
} from "@/lib/woloBetSettlement";
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
    executionMode: "app_only" | "onchain_escrow";
    stakeTxHash: string | null;
    stakeWalletAddress: string | null;
    stakeLockedAt: string | null;
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
  settledAt: string | null;
  href: string | null;
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

function getNamedSessionPlayers(session: LiveGameSession) {
  const seen = new Map<string, { name: string; winner: boolean | null }>();

  for (const player of session.players) {
    const name = normalizeName(player.name);
    if (!name) continue;
    const key = name.toLowerCase();
    const existing = seen.get(key);

    if (!existing) {
      seen.set(key, { name, winner: player.winner });
      continue;
    }

    if (player.winner === true && existing.winner !== true) {
      existing.winner = true;
    }
  }

  return Array.from(seen.values());
}

type SessionSideDescription = {
  title: string;
  leftLabel: string;
  rightLabel: string;
  leftNames: string[];
  rightNames: string[];
};

function describeSessionSides(session: LiveGameSession): SessionSideDescription | null {
  const players = getNamedSessionPlayers(session);

  if (players.length < 2) {
    return null;
  }

  const [focusPlayer, ...fieldPlayers] = players;
  if (fieldPlayers.length === 0) {
    return null;
  }

  return {
    title: players.map((player) => player.name).join(" vs "),
    leftLabel: focusPlayer.name,
    rightLabel:
      fieldPlayers.length === 1
        ? fieldPlayers[0].name
        : fieldPlayers.map((player) => player.name).join(" / "),
    leftNames: [focusPlayer.name],
    rightNames: fieldPlayers.map((player) => player.name),
  };
}

function inferWinnerSideFromSession(session: LiveGameSession): BetSide | null {
  const sides = describeSessionSides(session);
  if (!sides) return null;

  const normalizedWinner = normalizeName(session.winner).toLowerCase();
  if (normalizedWinner) {
    if (sides.leftNames.some((name) => name.toLowerCase() === normalizedWinner)) return "left";
    if (sides.rightNames.some((name) => name.toLowerCase() === normalizedWinner)) return "right";
  }

  const players = getNamedSessionPlayers(session);
  const leftWinner = players.some(
    (player) => player.winner === true && sides.leftNames.includes(player.name)
  );
  const rightWinner = players.some(
    (player) => player.winner === true && sides.rightNames.includes(player.name)
  );

  if (leftWinner && !rightWinner) return "left";
  if (rightWinner && !leftWinner) return "right";

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
  const stableKey = slugify(
    session.sessionKey || session.originalFilename || `${leftLabel}-vs-${rightLabel}`
  );
  return `${WATCHER_MARKET_SLUG_PREFIX}${stableKey}`.slice(0, 120);
}

function buildSessionEventLabel(session: LiveGameSession) {
  const rail = session.state === "live" ? "Watcher Live" : "Watcher Final";
  return session.mapName ? `${rail} • ${session.mapName}` : rail;
}

function buildSessionMarketTitle(session: LiveGameSession) {
  const sides = describeSessionSides(session);
  if (sides) {
    return sides.title;
  }

  return session.players.length > 0
    ? session.players.map((player) => normalizeName(player.name)).filter(Boolean).join(" vs ")
    : session.originalFilename || "Replay-backed result";
}

function normalizeSettledMatchKey(title: string, mapName: string | null | undefined) {
  return `${normalizeName(title).toLowerCase()}::${normalizeName(mapName).toLowerCase()}`;
}

function buildSessionMarketSeed(
  session: LiveGameSession,
  index: number,
  featured: boolean
): MarketSeed | null {
  const sides = describeSessionSides(session);
  if (!sides) return null;

  const settledAtRaw = session.completedAt || session.updatedAt || session.createdAt;

  return {
    scheduledMatchId: null,
    slug: buildSessionMarketSlug(session, sides.leftLabel, sides.rightLabel),
    title: sides.title,
    eventLabel: buildSessionEventLabel(session),
    status: session.state === "completed" ? "settled" : "live",
    featured,
    sortOrder: index,
    source: "session",
    leftLabel: sides.leftLabel,
    rightLabel: sides.rightLabel,
    leftHref: `/players/by-name/${encodeURIComponent(sides.leftLabel)}`,
    rightHref:
      sides.rightNames.length === 1
        ? `/players/by-name/${encodeURIComponent(sides.rightNames[0])}`
        : null,
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

function canAutoClaimForKnownUser(user: {
  verified?: boolean | null;
  verificationLevel?: number | null;
  steamId?: string | null;
  inGameName: string | null;
  steamPersonaName: string | null;
  walletAddress?: string | null;
}) {
  const hasTrustedIdentity = Boolean(
    user.verified || (typeof user.verificationLevel === "number" && user.verificationLevel > 0) || user.steamId
  );
  return Boolean(
    hasTrustedIdentity &&
      user.walletAddress &&
      (normalizeName(user.inGameName) || normalizeName(user.steamPersonaName))
  );
}

async function findAutoClaimUserForPlayerName(
  prisma: PrismaClient,
  playerName: string
) {
  const normalized = normalizeName(playerName).toLowerCase();
  if (!normalized) {
    return null;
  }

  const users = await prisma.user.findMany({
    where: {
      AND: [
        { OR: [{ verified: true }, { verificationLevel: { gt: 0 } }, { steamId: { not: null } }] },
        { OR: [{ inGameName: { not: null } }, { steamPersonaName: { not: null } }] },
      ],
    },
    select: {
      id: true,
      inGameName: true,
      steamPersonaName: true,
      verified: true,
      verificationLevel: true,
      steamId: true,
      walletAddress: true,
    },
    take: 250,
  });

  return (
    users.find((user) => {
      const names = [user.inGameName, user.steamPersonaName]
        .map((value) => normalizeName(value).toLowerCase())
        .filter(Boolean);
      return Boolean(user.walletAddress) && names.includes(normalized);
    }) || null
  );
}

function buildPendingClaimNote(
  market: { title: string; eventLabel: string },
  outcome: "won" | "void",
  payoutWolo: number
) {
  const reason = outcome === "void" ? "Void refund" : "Settled payout";
  return `${reason} · ${market.title} · ${market.eventLabel} · ${payoutWolo} WOLO`;
}
function buildWinnerBountyNote(
  market: { title: string; eventLabel: string },
  winnerName: string,
  losingName: string,
  payoutWolo: number
) {
  return `Winner bounty · ${market.title} · ${winnerName} beat ${losingName} · ${payoutWolo} WOLO`;
}

function getWinningPlayerName(market: { leftLabel: string; rightLabel: string }, winningSide: BetSide) {
  return winningSide === "left" ? market.leftLabel : market.rightLabel;
}

function getLosingPlayerName(market: { leftLabel: string; rightLabel: string }, winningSide: BetSide) {
  return winningSide === "left" ? market.rightLabel : market.leftLabel;
}


function buildOnchainSettlementNote(
  market: { title: string; eventLabel: string },
  payoutWolo: number,
  txHash: string
) {
  return `Auto-settled on-chain · ${market.title} · ${market.eventLabel} · ${payoutWolo} WOLO · tx ${txHash}`;
}

function summarizeSettlementError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "Unknown settlement error");
  return message.trim().replace(/\s+/g, " ").slice(0, 255);
}

async function settleClaimRail(
  tx: Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">,
  input: {
    marketId: number;
    playerName: string;
    displayPlayerName?: string | null;
    amountWolo: number;
    note: string;
    walletAddress?: string | null;
    claimedByUserId?: number | null;
    settledAt: Date;
    claimReason: string;
    market: { title: string; eventLabel: string };
  }
) {
  const normalizedPlayerName = normalizePendingWoloClaimName(input.playerName);
  if (!normalizedPlayerName || input.amountWolo < 1) {
    return { claimStatus: "ignored" as const, txHash: null as string | null };
  }

  const existingClaim = await tx.pendingWoloClaim.findUnique({
    where: {
      sourceMarketId_normalizedPlayerName: {
        sourceMarketId: input.marketId,
        normalizedPlayerName,
      },
    },
    select: {
      id: true,
      status: true,
      note: true,
    },
  });

  if (existingClaim?.status === "claimed") {
    return { claimStatus: "claimed" as const, txHash: null as string | null };
  }

  const canAutoSettle = Boolean(
    input.walletAddress && input.claimedByUserId && hasWoloPayoutExecutionConfigured()
  );

  if (canAutoSettle) {
    try {
      const payout = await executeWoloPayout({
        toAddress: input.walletAddress as string,
        amountWolo: input.amountWolo,
        memo: `${input.market.title} · ${input.claimReason}`,
      });

      if (payout?.txHash) {
        await createPendingWoloClaim(tx as PrismaClient, {
          playerName: input.playerName,
          displayPlayerName: input.displayPlayerName || input.playerName,
          amountWolo: input.amountWolo,
          sourceMarketId: input.marketId,
          payoutTxHash: payout.txHash,
          errorState: null,
          payoutAttemptedAt: input.settledAt,
          note: buildOnchainSettlementNote(input.market, input.amountWolo, payout.txHash),
          status: "claimed",
          claimedByUserId: input.claimedByUserId,
          claimedAt: input.settledAt,
        });

        return { claimStatus: "claimed" as const, txHash: payout.txHash };
      }
    } catch (error) {
      console.error("Failed to auto-settle WOLO payout on-chain:", error);

      await createPendingWoloClaim(tx as PrismaClient, {
        playerName: input.playerName,
        displayPlayerName: input.displayPlayerName || input.playerName,
        amountWolo: input.amountWolo,
        sourceMarketId: input.marketId,
        payoutTxHash: null,
        errorState: summarizeSettlementError(error),
        payoutAttemptedAt: input.settledAt,
        note: input.note,
        status: "pending",
      });

      return { claimStatus: "pending" as const, txHash: null as string | null };
    }
  }

  await createPendingWoloClaim(tx as PrismaClient, {
    playerName: input.playerName,
    displayPlayerName: input.displayPlayerName || input.playerName,
    amountWolo: input.amountWolo,
    sourceMarketId: input.marketId,
    payoutTxHash: null,
    errorState: null,
    payoutAttemptedAt: null,
    note: input.note,
    status: "pending",
  });

  return { claimStatus: "pending" as const, txHash: null as string | null };
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
      leftLabel: true,
      rightLabel: true,
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
              verified: true,
              verificationLevel: true,
              steamId: true,
              walletAddress: true,
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
        const settlement = await settleClaimRail(tx, {
          marketId: market.id,
          playerName: claimPlayerName,
          displayPlayerName: claimPlayerName,
          amountWolo: payoutWolo,
          note: buildPendingClaimNote(market, nextStatus, payoutWolo),
          walletAddress: canAutoClaimForKnownUser(wager.user) ? wager.user.walletAddress ?? null : null,
          claimedByUserId: canAutoClaimForKnownUser(wager.user) ? wager.user.id : null,
          settledAt,
          claimReason: nextStatus === "void" ? "bet_refund" : "bet_payout",
          market,
        });

        await recordUserActivity(tx, {
          userId: wager.userId,
          type: settlement.claimStatus === "claimed" ? "wolo_claim_auto_settled" : "pending_wolo_claim_created",
          path: "/bets",
          label: market.title,
          metadata: {
            marketId: market.id,
            wagerId: wager.id,
            eventLabel: market.eventLabel,
            amountWolo: payoutWolo,
            claimReason: nextStatus === "void" ? "bet_refund" : "bet_payout",
            claimStatus: settlement.claimStatus,
            payoutTxHash: settlement.txHash,
            settledAt: settledAt.toISOString(),
          },
          dedupeWithinSeconds: 5,
        });
      }

      if (winningSide) {
        const winningWagers = market.wagers.filter((wager) => wager.side === winningSide);
        const losingWagers = market.wagers.filter((wager) => wager.side !== winningSide);
        const winnerBountyWolo = losingWagers.reduce((sum, wager) => sum + wager.amountWolo, 0);

        if (winningWagers.length === 0 && winnerBountyWolo > 0) {
          const winnerName = getWinningPlayerName(market, winningSide);
          const losingName = getLosingPlayerName(market, winningSide);
          const autoClaimUser = await findAutoClaimUserForPlayerName(tx as PrismaClient, winnerName);
          const bountySettlement = await settleClaimRail(tx, {
            marketId: market.id,
            playerName: winnerName,
            displayPlayerName: winnerName,
            amountWolo: winnerBountyWolo,
            note: buildWinnerBountyNote(market, winnerName, losingName, winnerBountyWolo),
            walletAddress: autoClaimUser?.walletAddress ?? null,
            claimedByUserId: autoClaimUser?.id ?? null,
            settledAt,
            claimReason: "winner_bounty",
            market,
          });

          if (autoClaimUser?.id) {
            await recordUserActivity(tx, {
              userId: autoClaimUser.id,
              type: bountySettlement.claimStatus === "claimed" ? "wolo_claim_auto_settled" : "pending_wolo_claim_created",
              path: "/bets",
              label: market.title,
              metadata: {
                marketId: market.id,
                eventLabel: market.eventLabel,
                amountWolo: winnerBountyWolo,
                claimReason: "winner_bounty",
                claimStatus: bountySettlement.claimStatus,
                payoutTxHash: bountySettlement.txHash,
                settledAt: settledAt.toISOString(),
              },
              dedupeWithinSeconds: 5,
            });
          }
        }
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
  const slugs = [...new Set(seeds.map((seed) => seed.slug))];
  const staleMarketCutoff = new Date(Date.now() - 2 * 60_000);

  await Promise.all(
    seeds.map(async (seed) => {
      await prisma.betMarket.upsert({
        where: { slug: seed.slug },
        create: marketSeedCreateData(seed),
        update: {
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
            updatedAt: { lt: staleMarketCutoff },
          }
        : {
            status: { in: OPEN_STATUSES },
            updatedAt: { lt: staleMarketCutoff },
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
          executionMode:
            viewerWager.executionMode === "onchain_escrow" ? "onchain_escrow" : "app_only",
          stakeTxHash: viewerWager.stakeTxHash ?? null,
          stakeWalletAddress: viewerWager.stakeWalletAddress ?? null,
          stakeLockedAt: viewerWager.stakeLockedAt?.toISOString() ?? null,
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
  const [settledMarkets, sessionSnapshot] = await Promise.all([
    prisma.betMarket.findMany({
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
    }),
    loadLiveSessionSnapshot(prisma),
  ]);

  const sessionHrefByMatchKey = new Map(
    sessionSnapshot.recentlyCompletedSessions.map((session) => [
      normalizeSettledMatchKey(buildSessionMarketTitle(session), session.mapName),
      {
        href: `/game-stats/live/${encodeURIComponent(session.sessionKey)}`,
        settledAt: session.completedAt || session.updatedAt || session.createdAt,
      },
    ])
  );

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
      const matchedSession = sessionHrefByMatchKey.get(
        normalizeSettledMatchKey(market.title, mapName)
      );

      return {
        id: market.id,
        title: market.title,
        eventLabel: market.eventLabel,
        winner,
        mapName,
        payoutWolo,
        settledAt: matchedSession?.settledAt || market.settledAt?.toISOString() || null,
        href: matchedSession?.href || null,
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
      played_on: true,
      timestamp: true,
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
      settledAt: row.played_on?.toISOString() || row.timestamp?.toISOString() || null,
      href: null,
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
