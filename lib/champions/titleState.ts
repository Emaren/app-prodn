import type { PrismaClient } from "@/lib/generated/prisma";
import type { LobbyLeaderboardEntry } from "@/lib/lobby";
import { loadLobbyLeaderboard } from "@/lib/lobbyLeaderboard";
import {
  allChampionTitles,
  type ChampionTitleDefinition,
  type TitleContender,
} from "@/lib/champions/titles";

export type ChampionTitleState = ChampionTitleDefinition & {
  contenders: TitleContender[];
  contenderStatus: "live" | "placeholder";
};

export type ChampionTitleEconomyState = {
  titles: ChampionTitleState[];
  leaderboardAvailable: boolean;
  generatedAt: string;
};

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
    badge: badge ?? (entry.provisional ? "Provisional" : null),
  };
}

function holderAsContenders(definition: ChampionTitleDefinition): TitleContender[] {
  return definition.holders.slice(0, 10).map((holder, index) => ({
    rank: index + 1,
    name: holder.name,
    href: holder.href,
    rating: null,
    ratingLabel: holder.meta ?? null,
    meta: holder.representedCountry ? `Representing Country: ${holder.representedCountry}` : holder.meta ?? null,
    badge: holder.invaderChampion ? "Invader Champion" : index === 0 ? "Holder" : "Holder pair",
  }));
}

function inEloBand(definition: ChampionTitleDefinition, entry: LobbyLeaderboardEntry) {
  const rating = entryRating(entry);
  if (rating === null) return false;
  if (typeof definition.eloMin === "number" && rating < definition.eloMin) return false;
  if (typeof definition.eloMax === "number" && rating > definition.eloMax) return false;
  return true;
}

function mergeUniqueContenders(rows: TitleContender[]) {
  const seen = new Set<string>();
  const merged: TitleContender[] = [];

  for (const row of rows) {
    const key = row.href || row.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push({ ...row, rank: merged.length + 1 });
    if (merged.length >= 10) break;
  }

  return merged;
}

function contendersForTitle(
  definition: ChampionTitleDefinition,
  leaderboardEntries: LobbyLeaderboardEntry[]
): { contenders: TitleContender[]; contenderStatus: "live" | "placeholder" } {
  if (definition.type === "world") {
    const contenders = leaderboardEntries.slice(0, 10).map((entry, index) => toContender(entry, index + 1));
    return {
      contenders,
      contenderStatus: contenders.length > 0 ? "live" : "placeholder",
    };
  }

  if (definition.type === "elo") {
    const bandRows = leaderboardEntries
      .filter((entry) => inEloBand(definition, entry))
      .slice(0, 10)
      .map((entry, index) => toContender(entry, index + 1));
    const holderRows = definition.holders.map((holder, index) => ({
      rank: index + 1,
      name: holder.name,
      href: holder.href,
      rating: null,
      ratingLabel: holder.meta ?? null,
      meta: holder.invaderChampion ? "Holding above current ELO lane" : holder.meta ?? null,
      badge: holder.invaderChampion ? "Invader Champion" : "Holder",
    }));
    const contenders = mergeUniqueContenders([...holderRows, ...bandRows]);
    return {
      contenders,
      contenderStatus: contenders.length > 0 ? "live" : "placeholder",
    };
  }

  if (definition.type === "national") {
    const holders = holderAsContenders(definition);
    return {
      contenders: holders,
      contenderStatus: holders.length > 0 ? "live" : "placeholder",
    };
  }

  if (definition.type === "tag_team") {
    const holders = holderAsContenders(definition);
    return {
      contenders: holders,
      contenderStatus: holders.length > 0 ? "live" : "placeholder",
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
  let leaderboardEntries: LobbyLeaderboardEntry[] = [];
  let leaderboardAvailable = false;

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

  return {
    titles: allChampionTitles.map((definition) => ({
      ...definition,
      ...contendersForTitle(definition, leaderboardEntries),
    })),
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
