import { executeFounderWoloPayout } from "@/lib/woloBetSettlement";
import type { Prisma, PrismaClient, Trophy } from "@/lib/generated/prisma";
import { loadLobbyLeaderboard } from "@/lib/lobbyLeaderboard";
import {
  allChampionTitles,
  eloTitles,
  nationalTitles,
  type ChampionTitleDefinition,
} from "@/lib/champions/titles";
import { managedMediaPublicUrl } from "@/lib/managedMediaAssets";
import type {
  TrophyCommandSnapshot,
  TrophyHolding,
  TrophyRow,
  TrophyUserOption,
} from "@/lib/trophies/types";

type TrophySeed = {
  trophyId: string;
  definition: ChampionTitleDefinition;
  family: "national" | "elo" | "champion";
  tier: string;
  holderName?: string;
  guardianName?: string;
  status: "held" | "guardian_held" | "vacant";
};

const SEEDS: TrophySeed[] = [
  {
    trophyId: "canada_champion_belt",
    definition: nationalTitles.find((title) => title.country === "Canada")!,
    family: "national",
    tier: "National",
    holderName: "Emaren",
    status: "held",
  },
  {
    trophyId: "usa_champion_belt",
    definition: nationalTitles.find((title) => title.country === "USA")!,
    family: "national",
    tier: "National",
    holderName: "Jim",
    status: "held",
  },
  {
    trophyId: "mexico_champion_belt",
    definition: nationalTitles.find((title) => title.country === "Mexico")!,
    family: "national",
    tier: "National",
    holderName: "Julio Alvarez",
    status: "held",
  },
  {
    trophyId: "uk_champion_belt",
    definition: nationalTitles.find((title) => title.country === "UK")!,
    family: "national",
    tier: "National",
    holderName: "Sniper",
    status: "held",
  },
  {
    trophyId: "elite_champion_belt",
    definition: eloTitles.find((title) => title.id === "elo-elite")!,
    family: "elo",
    tier: "Elite",
    guardianName: "Emaren",
    status: "guardian_held",
  },
];


const CHAMPION_TROPHY_ID_ALIASES: Record<string, string> = {
  world_champion: "world",
  chaos_champion: "chaos",
  womens_champion: "womens",
  women_champion: "womens",
};

function championDefinitionForTrophyId(trophyId: string) {
  const normalized = trophyId.trim().toLowerCase();
  const aliasedTitleId = CHAMPION_TROPHY_ID_ALIASES[normalized] ?? normalized;
  return allChampionTitles.find((title) => title.id === aliasedTitleId) ?? null;
}

function syntheticChampionSeed(trophyId: string): TrophySeed | null {
  const normalized = trophyId.trim().toLowerCase();
  const definition = championDefinitionForTrophyId(normalized);

  if (!definition) return null;

  const isKnownChampionAlias =
    Boolean(CHAMPION_TROPHY_ID_ALIASES[normalized]) ||
    definition.type === "world" ||
    definition.type === "chaos" ||
    definition.type === "womens";

  if (!isKnownChampionAlias) return null;

  return {
    trophyId,
    definition,
    family: "champion",
    tier: "Champion",
    status: "vacant",
  };
}

const DEFAULT_SETTINGS: Array<{ key: string; value: Prisma.InputJsonValue; reason: string }> = [
  {
    key: "chain_backed_trophies_enabled",
    value: false,
    reason: "WoloChain Warbound module is not live yet.",
  },
  {
    key: "app_only_fallback_enabled",
    value: true,
    reason: "App-side trophy custody remains the current settlement source.",
  },
  {
    key: "dry_run_only",
    value: true,
    reason: "Trophy payout and chain settlement actions default to dry-run.",
  },
  {
    key: "trophy_tribute_auto_execute",
    value: false,
    reason: "Daily belt tribute payouts remain manual until an operator enables auto execution.",
  },
  {
    key: "nationality_change_cooldown_days",
    value: 30,
    reason: "Placeholder cooldown for represented-country changes.",
  },
  {
    key: "elo_belt_grace_period_days",
    value: 14,
    reason: "Grace window before an out-of-band ELO holder must defend or vacate.",
  },
  {
    key: "artifact_tiers",
    value: ["Common", "Rare", "Epic", "Mythic", "Legend"],
    reason: "Future artifact rarity lanes.",
  },
];

type FounderRewardsHealth = {
  ok: boolean;
  status: string;
  detail: string;
  chainId: string | null;
  payoutAddress: string | null;
  payoutBalanceWolo: number | null;
};

function numberFromHealth(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseFloat(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

async function loadFounderRewardsHealth(): Promise<FounderRewardsHealth> {
  const baseUrl = process.env.WOLO_FOUNDER_SETTLEMENT_URL?.trim().replace(/\/+$/, "") || "";
  const token = process.env.WOLO_FOUNDER_SETTLEMENT_AUTH_TOKEN?.trim() || "";

  if (!baseUrl) {
    return {
      ok: false,
      status: "Not configured",
      detail: "Founder Rewards settlement URL is missing.",
      chainId: null,
      payoutAddress: null,
      payoutBalanceWolo: null,
    };
  }

  try {
    const response = await fetch(`${baseUrl}/settlement/v1/health`, {
      cache: "no-store",
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
    const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;

    if (!response.ok || !payload) {
      return {
        ok: false,
        status: "Health unavailable",
        detail: `Founder Rewards health returned HTTP ${response.status}.`,
        chainId: null,
        payoutAddress: null,
        payoutBalanceWolo: null,
      };
    }

    const ok = Boolean(payload.ok);
    const chainId = typeof payload.chain_id === "string" ? payload.chain_id : null;
    const payoutAddress =
      typeof payload.payout_address === "string" ? payload.payout_address : null;
    const payoutBalanceWolo = numberFromHealth(payload.payout_balance_wolo);

    return {
      ok,
      status: ok ? "Founder Rewards live" : "Founder Rewards blocked",
      detail: ok
        ? "Mainnet trophy tribute payouts execute through the Founder Rewards settlement service."
        : String(payload.detail || payload.failure_code || "Founder Rewards health is not ok."),
      chainId,
      payoutAddress,
      payoutBalanceWolo,
    };
  } catch (error) {
    return {
      ok: false,
      status: "Health unreachable",
      detail: error instanceof Error ? error.message : "Founder Rewards health check failed.",
      chainId: null,
      payoutAddress: null,
      payoutBalanceWolo: null,
    };
  }
}

function normalizeName(value: string | null | undefined) {
  return (value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function userName(user: {
  inGameName: string | null;
  steamPersonaName: string | null;
  uid: string;
}) {
  return user.inGameName || user.steamPersonaName || user.uid;
}

type TrophySeedUser = {
  id: number;
  uid: string;
  inGameName: string | null;
  steamPersonaName: string | null;
  walletAddress: string | null;
  representedCountry: string | null;
};

async function findSeedUser(
  prisma: PrismaClient,
  displayName: string | undefined
): Promise<TrophySeedUser | null> {
  if (!displayName) return null;
  const target = normalizeName(displayName);
  let users: TrophySeedUser[] = [];
  const where = {
    OR: [
      { inGameName: { equals: displayName, mode: "insensitive" as const } },
      { steamPersonaName: { equals: displayName, mode: "insensitive" as const } },
    ],
  };
  try {
    users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        uid: true,
        inGameName: true,
        steamPersonaName: true,
        walletAddress: true,
        representedCountry: true,
      },
      take: 10,
    });
  } catch (error) {
    console.warn("Trophy seed identity lookup unavailable; preserving display custody only:", error);
    return null;
  }
  return (
    users.find(
      (user) =>
        normalizeName(user.inGameName) === target ||
        normalizeName(user.steamPersonaName) === target
    ) ?? null
  );
}

const TROPHY_DAY_MS = 86_400_000;

function utcDayStart(input = new Date()) {
  return new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()));
}

function utcDayKey(input = new Date()) {
  return utcDayStart(input).toISOString().slice(0, 10);
}

function elapsedTrophyDays(holderSince: Date | null, now = new Date()) {
  if (!holderSince) return 0;
  const start = utcDayStart(holderSince).getTime();
  const current = utcDayStart(now).getTime();
  return Math.max(0, Math.floor((current - start) / TROPHY_DAY_MS));
}

function trophyTributeMemo(trophy: Pick<Trophy, "displayName" | "trophyId">, holderName: string, dayKey: string) {
  return `AoE2WAR ${trophy.displayName} Tribute — ${holderName} holds the belt. Daily title payout for ${dayKey}.`;
}

export function projectedTrophyBounty(
  trophy: Pick<Trophy, "currentBountyWolo" | "bountyGrowthWolo" | "holderSince" | "status">
) {
  if (!trophy.holderSince || !["held", "active", "guardian_held"].includes(trophy.status)) {
    return trophy.currentBountyWolo;
  }
  return trophy.currentBountyWolo + elapsedTrophyDays(trophy.holderSince) * trophy.bountyGrowthWolo;
}

export async function ensureDailyTrophyTributePayouts(prisma: PrismaClient, now = new Date()) {
  const dayStart = utcDayStart(now);
  const dayEnd = new Date(dayStart.getTime() + TROPHY_DAY_MS);
  const dayKey = utcDayKey(now);

  const trophies = await prisma.trophy.findMany({
    where: {
      status: { in: ["held", "active"] },
      payoutFrequency: "daily",
      tributeAmountWolo: { gt: 0 },
      holderSince: { not: null },
    },
  });

  for (const trophy of trophies) {
    // Queue the first daily tribute for the UTC day once the belt is actually held.
    // Only skip dates that end before the holder's reign begins.
    if (!trophy.holderSince || trophy.holderSince.getTime() >= dayEnd.getTime()) {
      continue;
    }

    const recipientUserId = trophy.currentHolderUserId;
    const recipientDisplayName = trophy.currentHolderDisplayName;
    const recipientWoloAddress = trophy.currentHolderWoloAddress;

    if (!recipientUserId && !recipientDisplayName && !recipientWoloAddress) continue;
    if (!recipientWoloAddress) continue;

    const existing = await prisma.trophyPayout.findFirst({
      where: {
        trophyId: trophy.id,
        payoutKind: "daily_tribute",
        scheduledFor: {
          gte: dayStart,
          lt: dayEnd,
        },
      },
      select: { id: true },
    });

    if (existing) continue;

    const holderName = recipientDisplayName || recipientWoloAddress;
    const memo = trophyTributeMemo(trophy, holderName, dayKey);

    const payout = await prisma.trophyPayout.create({
      data: {
        trophyId: trophy.id,
        recipientUserId,
        recipientDisplayName,
        recipientWoloAddress,
        amountWolo: trophy.tributeAmountWolo,
        payoutKind: "daily_tribute",
        status: "dry_run",
        scheduledFor: dayStart,
        rawRequest: {
          dayKey,
          memo,
          trophyId: trophy.trophyId,
          trophyName: trophy.displayName,
          chainStatus: trophy.chainStatus,
          holderSince: trophy.holderSince.toISOString(),
          executionMode: "dry_run_until_trophy_settlement_enabled",
        },
      },
    });

    await prisma.trophyEvent.create({
      data: {
        trophyId: trophy.id,
        eventType: "DAILY_TRIBUTE_PAYOUT_QUEUED",
        actorRole: "system",
        initiatedBy: "system",
        toHolderUserId: recipientUserId,
        toWoloAddress: recipientWoloAddress,
        amountWolo: trophy.tributeAmountWolo,
        status: "dry_run",
        rawRequest: {
          payoutId: payout.id,
          dayKey,
          memo,
        },
      },
    });
  }
}

export async function executePendingTrophyTributePayouts(
  prisma: PrismaClient,
  options: { payoutId?: number | null; limit?: number } = {}
) {
  const now = new Date();
  const take = Math.max(1, Math.min(options.limit ?? 10, 25));

  const payouts = await prisma.trophyPayout.findMany({
    where: {
      payoutKind: "daily_tribute",
      status: { in: ["dry_run", "pending", "retrying", "failed"] },
      txHash: null,
      recipientWoloAddress: { not: null },
      amountWolo: { gt: 0 },
      scheduledFor: { lte: now },
      ...(options.payoutId ? { id: options.payoutId } : {}),
    },
    include: { trophy: true },
    orderBy: [{ scheduledFor: "asc" }, { id: "asc" }],
    take,
  });

  const results: Array<{
    payoutId: number;
    trophyId: string;
    recipient: string | null;
    amountWolo: number;
    status: "paid" | "skipped" | "failed";
    txHash: string | null;
    detail: string | null;
  }> = [];

  for (const payout of payouts) {
    const toAddress = payout.recipientWoloAddress?.trim();
    if (!toAddress) {
      results.push({
        payoutId: payout.id,
        trophyId: payout.trophy.trophyId,
        recipient: payout.recipientDisplayName,
        amountWolo: payout.amountWolo,
        status: "skipped",
        txHash: null,
        detail: "Missing recipient WOLO address.",
      });
      continue;
    }

    const rawRequest =
      payout.rawRequest && typeof payout.rawRequest === "object" && !Array.isArray(payout.rawRequest)
        ? (payout.rawRequest as Record<string, unknown>)
        : {};
    const memo =
      typeof rawRequest.memo === "string" && rawRequest.memo.trim()
        ? rawRequest.memo.trim()
        : trophyTributeMemo(
            payout.trophy,
            payout.recipientDisplayName || toAddress,
            payout.scheduledFor?.toISOString().slice(0, 10) || utcDayKey(now)
          );

    try {
      const execution = await executeFounderWoloPayout({
        requestId: `trophy-tribute-${payout.id}`,
        toAddress,
        amountWolo: payout.amountWolo,
        memo,
      });

      if (!execution?.txHash) {
        throw new Error("Founder Rewards payout returned no transaction hash.");
      }

      const paidAt = new Date();

      await prisma.trophyPayout.update({
        where: { id: payout.id },
        data: {
          status: "paid",
          paidAt,
          txHash: execution.txHash,
          errorState: null,
          rawResponse: {
            ok: true,
            rail: "founder_rewards_settlement",
            txHash: execution.txHash,
            proofUrl: execution.proofUrl ?? null,
            toAddress: execution.toAddress,
            amountWolo: execution.amountWolo,
            requestId: execution.requestId ?? `trophy-tribute-${payout.id}`,
            executedAt: paidAt.toISOString(),
          },
        },
      });

      await prisma.trophyEvent.create({
        data: {
          trophyId: payout.trophyId,
          eventType: "DAILY_TRIBUTE_PAYOUT_PAID",
          actorRole: "system",
          initiatedBy: "system",
          toHolderUserId: payout.recipientUserId,
          toWoloAddress: toAddress,
          amountWolo: payout.amountWolo,
          chainTxHash: execution.txHash,
          status: "paid",
          rawRequest: {
            payoutId: payout.id,
            memo,
            rail: "founder_rewards_settlement",
          },
          rawResponse: {
            txHash: execution.txHash,
            proofUrl: execution.proofUrl ?? null,
          },
        },
      });

      results.push({
        payoutId: payout.id,
        trophyId: payout.trophy.trophyId,
        recipient: payout.recipientDisplayName,
        amountWolo: payout.amountWolo,
        status: "paid",
        txHash: execution.txHash,
        detail: execution.proofUrl ?? null,
      });
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : "Trophy tribute payout execution failed.";

      await prisma.trophyPayout.update({
        where: { id: payout.id },
        data: {
          status: "failed",
          errorState: detail.slice(0, 500),
          retryCount: { increment: 1 },
          rawResponse: {
            ok: false,
            rail: "founder_rewards_settlement",
            detail,
            failedAt: new Date().toISOString(),
          },
        },
      });

      await prisma.trophyEvent.create({
        data: {
          trophyId: payout.trophyId,
          eventType: "DAILY_TRIBUTE_PAYOUT_FAILED",
          actorRole: "system",
          initiatedBy: "system",
          toHolderUserId: payout.recipientUserId,
          toWoloAddress: toAddress,
          amountWolo: payout.amountWolo,
          status: "failed",
          errorMessage: detail.slice(0, 500),
          rawRequest: {
            payoutId: payout.id,
            memo,
            rail: "founder_rewards_settlement",
          },
        },
      });

      results.push({
        payoutId: payout.id,
        trophyId: payout.trophy.trophyId,
        recipient: payout.recipientDisplayName,
        amountWolo: payout.amountWolo,
        status: "failed",
        txHash: null,
        detail,
      });
    }
  }

  return {
    ok: results.every((row) => row.status !== "failed"),
    scanned: payouts.length,
    paid: results.filter((row) => row.status === "paid").length,
    failed: results.filter((row) => row.status === "failed").length,
    skipped: results.filter((row) => row.status === "skipped").length,
    results,
  };
}

export async function ensureTrophySeedData(prisma: PrismaClient) {
  for (const seed of SEEDS) {
    const existing = await prisma.trophy.findUnique({ where: { trophyId: seed.trophyId } });
    if (existing) continue;

    const holder = await findSeedUser(prisma, seed.holderName);
    const guardian = await findSeedUser(prisma, seed.guardianName);
    const definition = seed.definition;
    const created = await prisma.trophy.create({
      data: {
        trophyId: seed.trophyId,
        displayName: definition.displayName,
        kind: "belt",
        family: seed.family,
        tier: seed.tier,
        status: seed.status,
        currentHolderUserId: holder?.id ?? null,
        currentHolderDisplayName: seed.holderName ?? null,
        currentHolderWoloAddress: holder?.walletAddress ?? null,
        guardianHolderUserId: guardian?.id ?? null,
        guardianHolderDisplayName: seed.guardianName ?? null,
        guardianHolderWoloAddress: guardian?.walletAddress ?? null,
        eligibleNationality: definition.country ?? null,
        eloBandMin: definition.eloMin ?? null,
        eloBandMax: definition.eloMax ?? null,
        tributeAmountWolo: definition.dailyWolo,
        bountyGrowthWolo: definition.dailyWolo,
        payoutFrequency: "daily",
        bountyAccrualFrequency: "daily",
        currentBountyWolo: 0,
        holderSince: seed.status === "held" || seed.status === "guardian_held" ? new Date() : null,
        nftClassId: `aoe2war.wartrophy.${seed.family}`,
        nftId: seed.trophyId,
        nftMetadataUri: `/api/trophies/${seed.trophyId}/metadata`,
        nftImageUri: definition.assetUrl,
        chainStatus: "app_only",
      },
    });

    await prisma.trophyEconomicsVersion.create({
      data: {
        trophyId: created.id,
        tributeAmountWolo: definition.dailyWolo,
        bountyGrowthWolo: definition.dailyWolo,
        payoutFrequency: "daily",
        bountyAccrualFrequency: "daily",
        reason: "Initial AoE2WAR War Trophy seed economics.",
      },
    });

    await prisma.trophyEvent.create({
      data: {
        trophyId: created.id,
        eventType:
          seed.status === "guardian_held"
            ? "GUARDIAN_ASSIGNED"
            : seed.status === "held"
              ? "HOLDER_ASSIGNED"
              : "TROPHY_CREATED",
        actorRole: "system",
        initiatedBy: "system",
        toHolderUserId: holder?.id ?? guardian?.id ?? null,
        toWoloAddress: holder?.walletAddress ?? guardian?.walletAddress ?? null,
        status: "recorded",
        rawResponse: {
          seededDisplayName: seed.holderName ?? seed.guardianName ?? null,
          appIdentityLinked: Boolean(holder || guardian),
        },
      },
    });
  }

  for (const setting of DEFAULT_SETTINGS) {
    await prisma.trophySetting.upsert({
      where: { key: setting.key },
      update: {},
      create: setting,
    });
  }
}

async function loadRatings(prisma: PrismaClient) {
  const ratings = new Map<string, number>();
  try {
    const board = await loadLobbyLeaderboard(prisma, {
      limit: 500,
      includePendingClaimed: true,
    });
    for (const entry of board.entries) {
      const rating = entry.primaryRating ?? entry.steamRmRating ?? entry.elo ?? entry.arenaElo;
      if (typeof rating === "number" && Number.isFinite(rating)) {
        ratings.set(normalizeName(entry.name), rating);
      }
    }
  } catch (error) {
    console.warn("Trophy rating lookup unavailable:", error);
  }
  return ratings;
}

function holderEligible(
  trophy: {
    family: string;
    eligibleNationality: string | null;
    eloBandMin: number | null;
    eloBandMax: number | null;
    currentHolder: {
      representedCountry: string | null;
      inGameName: string | null;
      steamPersonaName: string | null;
    } | null;
  },
  ratings: Map<string, number>
) {
  if (!trophy.currentHolder) return null;
  if (trophy.family === "national") {
    return trophy.currentHolder.representedCountry === trophy.eligibleNationality;
  }
  if (trophy.family === "elo") {
    const rating =
      ratings.get(normalizeName(trophy.currentHolder.inGameName)) ??
      ratings.get(normalizeName(trophy.currentHolder.steamPersonaName)) ??
      null;
    if (rating === null) return null;
    if (trophy.eloBandMax !== null && rating > trophy.eloBandMax) return false;
    return true;
  }
  return true;
}

function trophyDefinitionForRow(trophyId: string) {
  const seed = SEEDS.find((item) => item.trophyId === trophyId);
  return (
    seed?.definition ??
    championDefinitionForTrophyId(trophyId) ??
    allChampionTitles.find((title) => title.id === trophyId) ??
    null
  );
}

export async function loadTrophyUsers(prisma: PrismaClient): Promise<TrophyUserOption[]> {
  const [users, ratings] = await Promise.all([
    prisma.user.findMany({
      select: {
        id: true,
        uid: true,
        inGameName: true,
        steamPersonaName: true,
        walletAddress: true,
        representedCountry: true,
      },
      orderBy: [{ lastSeen: "desc" }, { id: "asc" }],
      take: 500,
    }),
    loadRatings(prisma),
  ]);
  return users.map((user) => ({
    id: user.id,
    uid: user.uid,
    name: userName(user),
    walletAddress: user.walletAddress,
    representedCountry: user.representedCountry,
    rating:
      ratings.get(normalizeName(user.inGameName)) ??
      ratings.get(normalizeName(user.steamPersonaName)) ??
      null,
  }));
}

export async function loadTrophyCommandSnapshot(
  prisma: PrismaClient
): Promise<TrophyCommandSnapshot> {
  await ensureTrophySeedData(prisma);
  await ensureDailyTrophyTributePayouts(prisma);
  const ratings = await loadRatings(prisma);
  const [trophies, challenges, payouts, events, settings, users, replays] = await Promise.all([
    prisma.trophy.findMany({
      include: {
        currentHolder: {
          select: {
            id: true,
            uid: true,
            inGameName: true,
            steamPersonaName: true,
            representedCountry: true,
            walletAddress: true,
          },
        },
        guardianHolder: {
          select: {
            id: true,
            uid: true,
            inGameName: true,
            steamPersonaName: true,
            walletAddress: true,
          },
        },
        economics: {
          include: {
            changedBy: {
              select: { uid: true, inGameName: true, steamPersonaName: true },
            },
          },
          orderBy: { effectiveFrom: "desc" },
          take: 12,
        },
      },
      orderBy: [{ kind: "asc" }, { family: "asc" }, { displayName: "asc" }],
    }),
    prisma.trophyChallenge.findMany({
      include: {
        trophy: true,
        challenger: { select: { uid: true, inGameName: true, steamPersonaName: true } },
        defender: { select: { uid: true, inGameName: true, steamPersonaName: true } },
        guardian: { select: { uid: true, inGameName: true, steamPersonaName: true } },
        winner: { select: { uid: true, inGameName: true, steamPersonaName: true } },
        replay: {
          select: { id: true, original_filename: true, winner: true, played_on: true },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 200,
    }),
    prisma.trophyPayout.findMany({
      include: {
        trophy: true,
        recipient: { select: { uid: true, inGameName: true, steamPersonaName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 300,
    }),
    prisma.trophyEvent.findMany({
      include: {
        trophy: true,
        actor: { select: { uid: true, inGameName: true, steamPersonaName: true } },
        fromHolder: { select: { uid: true, inGameName: true, steamPersonaName: true } },
        toHolder: { select: { uid: true, inGameName: true, steamPersonaName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    prisma.trophySetting.findMany({
      include: {
        changedBy: { select: { uid: true, inGameName: true, steamPersonaName: true } },
      },
      orderBy: { key: "asc" },
    }),
    loadTrophyUsers(prisma),
    prisma.gameStats.findMany({
      where: { is_final: true },
      select: {
        id: true,
        original_filename: true,
        replay_file: true,
        winner: true,
        players: true,
        played_on: true,
        createdAt: true,
      },
      orderBy: [{ played_on: "desc" }, { createdAt: "desc" }],
      take: 100,
    }),
  ]);

  const trophyRows: TrophyRow[] = trophies.map((trophy) => {
    const eligible = holderEligible(trophy, ratings);
    const appChainMismatch = Boolean(
      trophy.chainOwnerAddress &&
        trophy.currentHolderWoloAddress &&
        trophy.chainOwnerAddress !== trophy.currentHolderWoloAddress
    );
    return {
      id: trophy.id,
      trophyId: trophy.trophyId,
      displayName: trophy.displayName,
      kind: trophy.kind,
      family: trophy.family,
      tier: trophy.tier,
      status: trophy.status,
      currentHolderUserId: trophy.currentHolderUserId,
      currentHolderDisplayName:
        trophy.currentHolderDisplayName ||
        (trophy.currentHolder ? userName(trophy.currentHolder) : null),
      currentHolderWoloAddress: trophy.currentHolderWoloAddress,
      guardianHolderUserId: trophy.guardianHolderUserId,
      guardianHolderDisplayName:
        trophy.guardianHolderDisplayName ||
        (trophy.guardianHolder ? userName(trophy.guardianHolder) : null),
      guardianHolderWoloAddress: trophy.guardianHolderWoloAddress,
      eligibleNationality: trophy.eligibleNationality,
      eloBandMin: trophy.eloBandMin,
      eloBandMax: trophy.eloBandMax,
      currentBountyWolo: trophy.currentBountyWolo,
      projectedBountyWolo: projectedTrophyBounty(trophy),
      tributeAmountWolo: trophy.tributeAmountWolo,
      bountyGrowthWolo: trophy.bountyGrowthWolo,
      payoutFrequency: trophy.payoutFrequency,
      bountyAccrualFrequency: trophy.bountyAccrualFrequency,
      nftClassId: trophy.nftClassId,
      nftId: trophy.nftId,
      nftMetadataUri: trophy.nftMetadataUri,
      nftImageUri: trophy.nftImageUri,
      chainStatus: trophy.chainStatus,
      chainOwnerAddress: trophy.chainOwnerAddress,
      lastChainSyncAt: trophy.lastChainSyncAt?.toISOString() ?? null,
      forfeitureNeeded: trophy.forfeitureNeeded,
      eligibilityNote: trophy.eligibilityNote,
      holderSince: trophy.holderSince?.toISOString() ?? null,
      appChainMismatch,
      currentHolderEligible: eligible,
      createdAt: trophy.createdAt.toISOString(),
      updatedAt: trophy.updatedAt.toISOString(),
      economics: trophy.economics.map((version) => ({
        id: version.id,
        tributeAmountWolo: version.tributeAmountWolo,
        bountyGrowthWolo: version.bountyGrowthWolo,
        payoutFrequency: version.payoutFrequency,
        bountyAccrualFrequency: version.bountyAccrualFrequency,
        effectiveFrom: version.effectiveFrom.toISOString(),
        effectiveTo: version.effectiveTo?.toISOString() ?? null,
        changedBy: version.changedBy ? userName(version.changedBy) : null,
        reason: version.reason,
      })),
    };
  });

  const pendingChallengeStatuses = new Set([
    "draft",
    "proposed",
    "accepted",
    "scheduled",
    "watcher_pending",
    "replay_uploaded",
    "verification_pending",
    "settlement_dry_run",
    "settling",
  ]);
  const failedChainTypes = new Set(["CHAIN_QUERY_FAILED", "CHAIN_TX_FAILED", "SETTLEMENT_FAILED"]);
  const totalDailyTribute = trophyRows
    .filter((trophy) => ["held", "active"].includes(trophy.status))
    .reduce((sum, trophy) => sum + trophy.tributeAmountWolo, 0);
  const totalDailyBountyGrowth = trophyRows
    .filter((trophy) => ["held", "active", "guardian_held"].includes(trophy.status))
    .reduce((sum, trophy) => sum + trophy.bountyGrowthWolo, 0);

  const now = new Date();
  const todayStart = utcDayStart(now);
  const tomorrowStart = new Date(todayStart.getTime() + TROPHY_DAY_MS);
  const tributePayouts = payouts.filter((payout) => payout.payoutKind === "daily_tribute");
  const trophyTributeDueNow = tributePayouts.filter(
    (payout) =>
      ["pending", "dry_run", "retrying", "failed"].includes(payout.status) &&
      !payout.txHash &&
      (!payout.scheduledFor || payout.scheduledFor <= now)
  ).length;
  const trophyTributePaidToday = tributePayouts.filter(
    (payout) =>
      payout.status === "paid" &&
      Boolean(payout.txHash) &&
      Boolean(payout.paidAt) &&
      payout.paidAt! >= todayStart
  ).length;
  const trophyTributeFailed = tributePayouts.filter(
    (payout) => payout.status === "failed"
  ).length;
  const lastTributePayout =
    tributePayouts
      .filter((payout) => payout.status === "paid" && payout.txHash)
      .sort(
        (left, right) =>
          (right.paidAt?.getTime() ?? right.updatedAt.getTime()) -
          (left.paidAt?.getTime() ?? left.updatedAt.getTime())
      )[0] ?? null;
  const founderRewardsHealth = await loadFounderRewardsHealth();

  return {
    overview: {
      activeTrophies: trophyRows.filter((trophy) => ["held", "active"].includes(trophy.status)).length,
      vacantTrophies: trophyRows.filter((trophy) => trophy.status === "vacant").length,
      guardianHeldTrophies: trophyRows.filter((trophy) => trophy.status === "guardian_held").length,
      appOnlyTrophies: trophyRows.filter((trophy) => trophy.chainStatus === "app_only").length,
      chainBackedTrophies: trophyRows.filter((trophy) => trophy.chainStatus !== "app_only").length,
      mintedNfts: trophyRows.filter((trophy) => trophy.chainStatus === "minted").length,
      pendingChallenges: challenges.filter((challenge) =>
        pendingChallengeStatuses.has(challenge.status)
      ).length,
      pendingPayouts: payouts.filter((payout) =>
        ["pending", "dry_run", "retrying"].includes(payout.status)
      ).length,
      failedPayouts: payouts.filter((payout) => payout.status === "failed").length,
      failedChainEvents: events.filter(
        (event) => event.status === "failed" || failedChainTypes.has(event.eventType)
      ).length,
      totalDailyTribute,
      totalDailyBountyGrowth,
      estimatedYearlyExposure: (totalDailyTribute + totalDailyBountyGrowth) * 365,
      trophyRewardsWalletStatus: `${founderRewardsHealth.status}${founderRewardsHealth.chainId ? ` · ${founderRewardsHealth.chainId}` : ""}`,
      trophyRewardsWalletDetail: founderRewardsHealth.detail,
      trophyRewardsWalletAddress: founderRewardsHealth.payoutAddress,
      trophyRewardsWalletBalanceWolo: founderRewardsHealth.payoutBalanceWolo,
      trophyRewardsWalletChainId: founderRewardsHealth.chainId,
      trophyTributeDueNow,
      trophyTributePaidToday,
      trophyTributeFailed,
      trophyTributeLastTxHash: lastTributePayout?.txHash ?? null,
      trophyTributeLastPaidAt: lastTributePayout?.paidAt?.toISOString() ?? null,
      trophyTributeLastRecipient:
        lastTributePayout?.recipientDisplayName ||
        (lastTributePayout?.recipient ? userName(lastTributePayout.recipient) : null),
      trophyTributeNextUtcDay: utcDayKey(tomorrowStart),
      eligibilityConflicts: trophyRows.filter(
        (trophy) => trophy.forfeitureNeeded || trophy.currentHolderEligible === false
      ).length,
    },
    trophies: trophyRows,
    challenges: challenges.map((challenge) => ({
      id: challenge.id,
      trophyId: challenge.trophyId,
      trophyKey: challenge.trophy.trophyId,
      trophyName: challenge.trophy.displayName,
      challengeKind: challenge.challengeKind,
      challengerUserId: challenge.challengerUserId,
      challengerName: userName(challenge.challenger),
      defenderUserId: challenge.defenderUserId,
      defenderName: challenge.defender ? userName(challenge.defender) : null,
      guardianUserId: challenge.guardianUserId,
      guardianName: challenge.guardian ? userName(challenge.guardian) : null,
      requiredNationality: challenge.requiredNationality,
      requiredEloMin: challenge.requiredEloMin,
      requiredEloMax: challenge.requiredEloMax,
      eligibilitySnapshot: challenge.eligibilitySnapshot,
      eligibilityOverride: challenge.eligibilityOverride,
      status: challenge.status,
      replayId: challenge.replayId,
      replayLabel: challenge.replay
        ? `#${challenge.replay.id} · ${challenge.replay.original_filename || "parsed replay"}`
        : null,
      scheduledMatchId: challenge.scheduledMatchId,
      watcherSessionId: challenge.watcherSessionId,
      watcherPairingId: challenge.watcherPairingId,
      winnerUserId: challenge.winnerUserId,
      winnerName: challenge.winner ? userName(challenge.winner) : null,
      verificationSummary: challenge.verificationSummary,
      settlementStatus: challenge.settlementStatus,
      chainTxHash: challenge.chainTxHash,
      payoutTxHash: challenge.payoutTxHash,
      errorState: challenge.errorState,
      createdAt: challenge.createdAt.toISOString(),
      updatedAt: challenge.updatedAt.toISOString(),
    })),
    payouts: payouts.map((payout) => ({
      id: payout.id,
      trophyId: payout.trophyId,
      trophyKey: payout.trophy.trophyId,
      trophyName: payout.trophy.displayName,
      recipientUserId: payout.recipientUserId,
      recipientName:
        payout.recipientDisplayName || (payout.recipient ? userName(payout.recipient) : null),
      recipientWoloAddress: payout.recipientWoloAddress,
      amountWolo: payout.amountWolo,
      payoutKind: payout.payoutKind,
      status: payout.status,
      scheduledFor: payout.scheduledFor?.toISOString() ?? null,
      paidAt: payout.paidAt?.toISOString() ?? null,
      txHash: payout.txHash,
      errorState: payout.errorState,
      rawRequest: payout.rawRequest,
      rawResponse: payout.rawResponse,
      retryCount: payout.retryCount,
      createdAt: payout.createdAt.toISOString(),
      updatedAt: payout.updatedAt.toISOString(),
    })),
    events: events.map((event) => ({
      id: event.id,
      trophyId: event.trophyId,
      trophyKey: event.trophy.trophyId,
      trophyName: event.trophy.displayName,
      challengeId: event.challengeId,
      eventType: event.eventType,
      actorName: event.actor ? userName(event.actor) : null,
      actorRole: event.actorRole,
      initiatedBy: event.initiatedBy,
      fromHolderName: event.fromHolder ? userName(event.fromHolder) : null,
      toHolderName: event.toHolder ? userName(event.toHolder) : null,
      fromWoloAddress: event.fromWoloAddress,
      toWoloAddress: event.toWoloAddress,
      amountWolo: event.amountWolo,
      replayId: event.replayId,
      chainTxHash: event.chainTxHash,
      status: event.status,
      rawRequest: event.rawRequest,
      rawResponse: event.rawResponse,
      errorMessage: event.errorMessage,
      retryCount: event.retryCount,
      createdAt: event.createdAt.toISOString(),
    })),
    settings: settings.map((setting) => ({
      key: setting.key,
      value: setting.value,
      reason: setting.reason,
      changedBy: setting.changedBy ? userName(setting.changedBy) : null,
      updatedAt: setting.updatedAt.toISOString(),
    })),
    users,
    replays: replays.map((replay) => {
      const playerRows = Array.isArray(replay.players) ? replay.players : [];
      const players = playerRows
        .map((player) =>
          player && typeof player === "object" && "name" in player
            ? String((player as { name?: unknown }).name || "")
            : ""
        )
        .filter(Boolean);
      return {
        id: replay.id,
        label: `#${replay.id} · ${players.join(" vs ") || replay.original_filename || replay.replay_file}`,
        winner: replay.winner,
        players,
        playedOn: (replay.played_on || replay.createdAt).toISOString(),
      };
    }),
    generatedAt: new Date().toISOString(),
  };
}

export async function loadPublicTrophies(prisma: PrismaClient) {
  await ensureTrophySeedData(prisma);
  return prisma.trophy.findMany({
    include: {
      currentHolder: {
        select: {
          uid: true,
          inGameName: true,
          steamPersonaName: true,
        },
      },
      guardianHolder: {
        select: { uid: true, inGameName: true, steamPersonaName: true },
      },
    },
    orderBy: [{ family: "asc" }, { displayName: "asc" }],
  });
}

export async function loadUserTrophyHoldings(
  prisma: PrismaClient,
  userId: number
): Promise<TrophyHolding[]> {
  await ensureTrophySeedData(prisma);
  const trophies = await prisma.trophy.findMany({
    where: { currentHolderUserId: userId, status: { in: ["held", "active"] } },
    orderBy: [{ kind: "asc" }, { displayName: "asc" }],
  });
  return trophies.map((trophy) => {
    const definition = trophyDefinitionForRow(trophy.trophyId);
    const type = definition?.type || trophy.family;
    const assetKind = trophy.kind === "artifact" ? "artifact" : "belt";
    return {
      id: trophy.trophyId,
      type,
      kind: trophy.kind,
      family: trophy.family,
      displayName: trophy.displayName,
      shortName: definition?.shortName || trophy.displayName.replace(/ Champion( Belt)?$/i, ""),
      dailyWolo: trophy.tributeAmountWolo,
      bountyGrowthWolo: trophy.bountyGrowthWolo,
      currentBountyWolo: projectedTrophyBounty(trophy),
      routeHref: definition?.routeHref || "/champions",
      assetUrl: managedMediaPublicUrl(
        assetKind,
        definition?.id || trophy.trophyId,
        trophy.nftImageUri || definition?.assetUrl
      ),
      holderSince: trophy.holderSince?.toISOString() ?? null,
      status: trophy.status,
      chainStatus: trophy.chainStatus,
      nftId: trophy.nftId,
      eligibleNationality: trophy.eligibleNationality,
    };
  });
}

export async function recordNationalityChange(
  prisma: PrismaClient,
  input: {
    userId: number;
    actorUserId?: number | null;
    previousCountry: string | null;
    nextCountry: string | null;
    initiatedBy: "user" | "admin";
    strict?: boolean;
  }
) {
  try {
    await ensureTrophySeedData(prisma);
    const heldNationalTrophies = await prisma.trophy.findMany({
      where: {
        family: "national",
        currentHolderUserId: input.userId,
        status: { in: ["held", "active"] },
      },
    });

    for (const trophy of heldNationalTrophies) {
      const eligible = trophy.eligibleNationality === input.nextCountry;
      await prisma.$transaction([
        prisma.trophyEvent.create({
          data: {
            trophyId: trophy.id,
            eventType: "NATIONALITY_CHANGED",
            actorUserId: input.actorUserId ?? input.userId,
            actorRole: input.initiatedBy === "admin" ? "admin" : "challenger",
            initiatedBy: input.initiatedBy,
            fromHolderUserId: input.userId,
            toHolderUserId: input.userId,
            status: "recorded",
            rawRequest: {
              previousCountry: input.previousCountry,
              nextCountry: input.nextCountry,
            },
          },
        }),
        ...(eligible
          ? []
          : [
              prisma.trophy.update({
                where: { id: trophy.id },
                data: {
                  forfeitureNeeded: true,
                  eligibilityNote: `Holder changed Representing Country from ${input.previousCountry || "unset"} to ${input.nextCountry || "unset"}. Admin vacate/reassign review required.`,
                },
              }),
              prisma.trophyEvent.create({
                data: {
                  trophyId: trophy.id,
                  eventType: "NATIONAL_ELIGIBILITY_FORFEITURE_NEEDED",
                  actorUserId: input.actorUserId ?? input.userId,
                  actorRole: input.initiatedBy === "admin" ? "admin" : "system",
                  initiatedBy: input.initiatedBy,
                  fromHolderUserId: input.userId,
                  status: "attention_required",
                  rawResponse: {
                    requiredNationality: trophy.eligibleNationality,
                    actualNationality: input.nextCountry,
                  },
                },
              }),
            ]),
      ]);
    }
  } catch (error) {
    if (input.strict) throw error;
    console.warn("Trophy nationality audit unavailable:", error);
  }
}

export function seededTrophyDefinition(trophyId: string): TrophySeed | null {
  return SEEDS.find((seed) => seed.trophyId === trophyId) ?? syntheticChampionSeed(trophyId);
}

export function seededTrophyKeyForChallenge(
  titleId: string | null | undefined,
  representedCountry?: string | null
) {
  const normalizedTitle = (titleId || "").trim().toLowerCase();
  const normalizedCountry = (representedCountry || "").trim().toLowerCase();

  if (normalizedTitle === "national" && normalizedCountry) {
    return (
      SEEDS.find(
        (seed) =>
          seed.family === "national" &&
          seed.definition.country?.toLowerCase() === normalizedCountry
      )?.trophyId ?? null
    );
  }

  return (
    SEEDS.find(
      (seed) =>
        seed.definition.id.toLowerCase() === normalizedTitle ||
        seed.trophyId.toLowerCase() === normalizedTitle
    )?.trophyId ?? null
  );
}
