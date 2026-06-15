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
  leaderboardEntries: LobbyLeaderboardEntry[]
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
    return {
      contenders: [],
      contenderStatus: "placeholder",
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
