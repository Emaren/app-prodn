import type { PrismaClient } from "@/lib/generated/prisma";
import type { LobbyLeaderboardEntry } from "@/lib/lobby";
import { loadLobbyLeaderboard } from "@/lib/lobbyLeaderboard";
import {
  allChampionTitles,
  type ChampionHolder,
  type ChampionTitleDefinition,
  type TitleContender,
} from "@/lib/champions/titles";
import {
  loadPublicTrophies,
  projectedTrophyBounty,
  seededTrophyDefinition,
} from "@/lib/trophies/service";

export type ChampionTitleState = ChampionTitleDefinition & {
  contenders: TitleContender[];
  contenderStatus: "live" | "placeholder";
};

export type ChampionTitleEconomyState = {
  titles: ChampionTitleState[];
  leaderboardAvailable: boolean;
  generatedAt: string;
};

type LastTributeProof = {
  txHash: string;
  paidAt: Date | null;
  scheduledFor: Date | null;
  amountWolo: number;
  recipientDisplayName: string | null;
};

type CountryAwareLeaderboardEntry = LobbyLeaderboardEntry & {
  representedCountry?: string | null;
  genderDivision?: string | null;
};

function identityKey(value: string | null | undefined) {
  return value?.trim().toLowerCase() || null;
}

function putProfileKey(
  profileByKey: Map<string, { representedCountry: string | null; genderDivision: string | null }>,
  value: string | null | undefined,
  profile: { representedCountry: string | null; genderDivision: string | null }
) {
  const key = identityKey(value);
  if (key && !profileByKey.has(key)) {
    profileByKey.set(key, profile);
  }
}

function leaderboardEntryKeys(entry: LobbyLeaderboardEntry) {
  const keys = new Set<string>();
  const nameKey = identityKey(entry.name);
  if (nameKey) keys.add(nameKey);

  const href = entry.href || "";
  for (const part of href.split("/")) {
    try {
      const decoded = decodeURIComponent(part);
      const key = identityKey(decoded);
      if (key && key !== "players" && key !== "by-name") {
        keys.add(key);
      }
    } catch {
      const key = identityKey(part);
      if (key && key !== "players" && key !== "by-name") {
        keys.add(key);
      }
    }
  }

  return [...keys];
}

function profileForEntry(
  entry: LobbyLeaderboardEntry,
  profileByKey: Map<string, { representedCountry: string | null; genderDivision: string | null }>
) {
  for (const key of leaderboardEntryKeys(entry)) {
    const profile = profileByKey.get(key);
    if (profile) return profile;
  }
  return null;
}

function nextTributeDayKey(value: Date | null | undefined) {
  const base = value && !Number.isNaN(value.getTime()) ? value : new Date();
  const next = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + 1));
  return next.toISOString().slice(0, 10);
}

function entryRating(entry: LobbyLeaderboardEntry) {
  return entry.primaryRating ?? entry.steamRmRating ?? entry.elo ?? entry.arenaElo ?? null;
}

function toContender(entry: LobbyLeaderboardEntry, rank: number, badge?: string | null): TitleContender {
  const rating = entryRating(entry);
  return {
    rank,
    name: entry.name,
    href: entry.href,
    rating,
    ratingLabel: entry.primaryRatingLabel || entry.ratingLabel || (rating ? `${rating} ELO` : null),
    meta: `${entry.wins}-${entry.losses} verified`,
    badge: badge ?? null,
  };
}

function inEloBand(definition: ChampionTitleDefinition, entry: LobbyLeaderboardEntry) {
  const rating = entryRating(entry);
  if (rating === null) return false;
  if (typeof definition.eloMin === "number" && rating < definition.eloMin) return false;
  if (typeof definition.eloMax === "number" && rating > definition.eloMax) return false;
  return true;
}

function contenderKey(input: Pick<TitleContender, "href" | "name">) {
  return (input.href || input.name).toLowerCase().trim();
}

function holderKeys(definition: ChampionTitleDefinition) {
  return new Set(
    definition.holders.map((holder) => contenderKey({ href: holder.href, name: holder.name }))
  );
}

function withoutCurrentHolders(
  definition: ChampionTitleDefinition,
  rows: TitleContender[]
) {
  const keys = holderKeys(definition);
  return rows.filter((row) => !keys.has(contenderKey(row)));
}

function mergeUniqueContenders(rows: TitleContender[]) {
  const seen = new Set<string>();
  const merged: TitleContender[] = [];

  for (const row of rows) {
    const key = contenderKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push({ ...row, rank: merged.length + 1 });
    if (merged.length >= 10) break;
  }

  return merged;
}

function contendersForTitle(
  definition: ChampionTitleDefinition,
  leaderboardEntries: CountryAwareLeaderboardEntry[]
): { contenders: TitleContender[]; contenderStatus: "live" | "placeholder" } {
  if (definition.type === "world") {
    const contenders = withoutCurrentHolders(
      definition,
      leaderboardEntries.map((entry, index) => toContender(entry, index + 1))
    ).slice(0, 10).map((row, index) => ({ ...row, rank: index + 1 }));
    return {
      contenders,
      contenderStatus: contenders.length > 0 ? "live" : "placeholder",
    };
  }

  if (definition.type === "elo") {
    const bandRows = leaderboardEntries
      .filter((entry) => inEloBand(definition, entry))
      .map((entry, index) => toContender(entry, index + 1));
    const contenders = mergeUniqueContenders(withoutCurrentHolders(definition, bandRows));
    return {
      contenders,
      contenderStatus: contenders.length > 0 ? "live" : "placeholder",
    };
  }

  if (definition.type === "womens") {
    const womensRows = leaderboardEntries
      .filter((entry) => entry.genderDivision === "Woman")
      .map((entry, index) => toContender(entry, index + 1, "Women's division"));

    const contenders = mergeUniqueContenders(withoutCurrentHolders(definition, womensRows));
    return {
      contenders,
      contenderStatus: contenders.length > 0 ? "live" : "placeholder",
    };
  }

  if (definition.type === "designation") {
    const contenders = withoutCurrentHolders(
      definition,
      leaderboardEntries.map((entry, index) => toContender(entry, index + 1))
    ).slice(0, 10).map((row, index) => ({
      ...row,
      rank: index + 1,
      meta: row.ratingLabel || "Verified result hunter",
    }));
    return {
      contenders,
      contenderStatus: contenders.length > 0 ? "live" : "placeholder",
    };
  }

  if (definition.type === "national") {
    const country = definition.country?.toLowerCase().trim();
    const nationalRows = country
      ? leaderboardEntries
          .filter((entry) => entry.representedCountry?.toLowerCase().trim() === country)
          .map((entry, index) =>
            toContender(
              entry,
              index + 1,
              entry.representedCountry ? `${entry.representedCountry} eligible` : null
            )
          )
      : [];

    const contenders = mergeUniqueContenders(withoutCurrentHolders(definition, nationalRows));
    return {
      contenders,
      contenderStatus: contenders.length > 0 ? "live" : "placeholder",
    };
  }

  if (definition.type === "tag_team") {
    return {
      contenders: [],
      contenderStatus: "placeholder",
    };
  }

  return {
    contenders: [],
    contenderStatus: "placeholder",
  };
}

export async function loadChampionTitleEconomyState(
  prisma: PrismaClient
): Promise<ChampionTitleEconomyState> {
  let leaderboardEntries: CountryAwareLeaderboardEntry[] = [];
  let leaderboardAvailable = false;
  const liveDefinitionMap = new Map<string, ChampionTitleDefinition>();
  const lastTributeByTrophyId = new Map<number, LastTributeProof>();

  try {
    const leaderboard = await loadLobbyLeaderboard(prisma, {
      limit: 120,
      includePendingClaimed: false,
    });
    leaderboardEntries = leaderboard.entries;
    leaderboardAvailable = true;
  } catch (error) {
    console.warn("Champion contender leaderboard unavailable:", error);
  }

  if (leaderboardEntries.length > 0) {
    try {
      const users = await prisma.user.findMany({
        where: {
          OR: [
            { representedCountry: { not: null } },
            { genderDivision: "Woman" },
          ],
        },
        select: {
          uid: true,
          inGameName: true,
          steamPersonaName: true,
          representedCountry: true,
          genderDivision: true,
        },
        take: 1000,
      });
      const profileByKey = new Map<string, { representedCountry: string | null; genderDivision: string | null }>();

      for (const user of users) {
        const profile = {
          representedCountry: user.representedCountry,
          genderDivision: user.genderDivision || "Man",
        };
        putProfileKey(profileByKey, user.uid, profile);
        putProfileKey(profileByKey, user.inGameName, profile);
        putProfileKey(profileByKey, user.steamPersonaName, profile);
      }

      leaderboardEntries = leaderboardEntries.map((entry) => {
        const profile = profileForEntry(entry, profileByKey);
        return {
          ...entry,
          representedCountry: profile?.representedCountry ?? null,
          genderDivision: profile?.genderDivision ?? null,
        };
      });
    } catch (error) {
      console.warn("Champion represented-country enrichment unavailable:", error);
    }
  }

  try {
    const trophies = await loadPublicTrophies(prisma);
    const trophyIds = trophies.map((trophy) => trophy.id);
    const paidTributes = trophyIds.length
      ? await prisma.trophyPayout.findMany({
          where: {
            trophyId: { in: trophyIds },
            payoutKind: "daily_tribute",
            status: "paid",
            txHash: { not: null },
          },
          select: {
            trophyId: true,
            txHash: true,
            paidAt: true,
            scheduledFor: true,
            amountWolo: true,
            recipientDisplayName: true,
          },
          orderBy: [{ paidAt: "desc" }, { id: "desc" }],
          take: Math.max(25, trophyIds.length * 3),
        })
      : [];

    for (const payout of paidTributes) {
      if (!payout.txHash || lastTributeByTrophyId.has(payout.trophyId)) continue;
      lastTributeByTrophyId.set(payout.trophyId, {
        txHash: payout.txHash,
        paidAt: payout.paidAt,
        scheduledFor: payout.scheduledFor,
        amountWolo: payout.amountWolo,
        recipientDisplayName: payout.recipientDisplayName,
      });
    }

    for (const trophy of trophies) {
      const seed = seededTrophyDefinition(trophy.trophyId);
      if (!seed) continue;
      const definition = seed.definition;
      const activeHolder = trophy.currentHolder;
      const guardianHolder = trophy.guardianHolder;
      const holderName =
        trophy.currentHolderDisplayName ||
        activeHolder?.inGameName ||
        activeHolder?.steamPersonaName ||
        trophy.guardianHolderDisplayName ||
        guardianHolder?.inGameName ||
        guardianHolder?.steamPersonaName ||
        null;
      const holderUid = activeHolder?.uid || guardianHolder?.uid || null;
      const holders: ChampionHolder[] = holderName
        ? [
            {
              name: holderName,
              uid: holderUid ?? undefined,
              href: holderUid ? `/players/${encodeURIComponent(holderUid)}` : undefined,
              meta:
                trophy.status === "guardian_held"
                  ? "Commissioner Guardian · activation fight open"
                  : trophy.eligibleNationality || "Current title holder",
              representedCountry:
                trophy.eligibleNationality &&
                ["Canada", "USA", "Mexico", "UK"].includes(trophy.eligibleNationality)
                  ? (trophy.eligibleNationality as ChampionHolder["representedCountry"])
                  : undefined,
            },
          ]
        : [];
      const lastTribute = lastTributeByTrophyId.get(trophy.id) ?? null;
      liveDefinitionMap.set(definition.id, {
        ...definition,
        assetUrl: trophy.nftImageUri?.trim() || definition.assetUrl,
        dailyWolo: trophy.tributeAmountWolo,
        status:
          trophy.status === "held" || trophy.status === "active" || trophy.status === "guardian_held"
            ? "held"
            : "vacant",
        holders,
        trophyId: trophy.trophyId,
        trophyStatus: trophy.status,
        currentBountyWolo: projectedTrophyBounty(trophy),
        bountyGrowthWolo: trophy.bountyGrowthWolo,
        chainStatus: trophy.chainStatus,
        guardianHeld: trophy.status === "guardian_held",
        holderSince: trophy.holderSince?.toISOString() ?? null,
        lastTributeTxHash: lastTribute?.txHash ?? null,
        lastTributePaidAt: lastTribute?.paidAt?.toISOString() ?? null,
        lastTributeAmountWolo: lastTribute?.amountWolo ?? null,
        lastTributeRecipient: lastTribute?.recipientDisplayName ?? holderName,
        nextTributeDay: lastTribute
          ? nextTributeDayKey(lastTribute.scheduledFor || lastTribute.paidAt)
          : null,
      });
    }
  } catch (error) {
    console.warn("Live Trophy registry unavailable; using title definitions:", error);
  }

  return {
    titles: allChampionTitles.map((definition) => {
      const liveDefinition = liveDefinitionMap.get(definition.id) ?? definition;
      return {
        ...liveDefinition,
        ...contendersForTitle(liveDefinition, leaderboardEntries),
      };
    }),
    leaderboardAvailable,
    generatedAt: new Date().toISOString(),
  };
}

export function getTitleState(
  state: ChampionTitleEconomyState,
  definition: ChampionTitleDefinition
): ChampionTitleState {
  return state.titles.find((title) => title.id === definition.id) ?? {
    ...definition,
    contenders: [],
    contenderStatus: "placeholder",
  };
}
