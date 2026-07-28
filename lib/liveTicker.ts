import type { PrismaClient } from "@/lib/generated/prisma";
import type {
  LobbyLeaderboardSummary,
  LobbyMatchRow,
  LobbyTournament,
} from "@/lib/lobby";
import type { WoloMarketSnapshot } from "@/lib/woloMarket";

export const LIVE_TICKER_MESSAGE_MAX_CHARS = 160;

export type LiveTickerMessage = {
  id: number;
  text: string;
  enabled: boolean;
  priority: number;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LiveTickerItem = {
  key: string;
  text: string;
  source: "admin" | "system";
  priority: number;
  expiresAt: string | null;
};

export type LiveTickerSnapshot = {
  items: LiveTickerItem[];
  updatedAt: string;
};

type LiveTickerInput = {
  tournament: LobbyTournament;
  leaderboard: LobbyLeaderboardSummary;
  recentMatches: LobbyMatchRow[];
  woloMarket: WoloMarketSnapshot;
};

function cleanTickerText(value: unknown, maxLength = LIVE_TICKER_MESSAGE_MAX_CHARS) {
  return String(value ?? "")
    .replace(/[<>]/g, "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function normalizeLiveTickerText(value: unknown) {
  return cleanTickerText(value);
}

export function toLiveTickerMessage(row: {
  id: number;
  text: string;
  enabled: boolean;
  priority: number;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): LiveTickerMessage {
  return {
    id: row.id,
    text: row.text,
    enabled: row.enabled,
    priority: row.priority,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function loadAdminLiveTickerMessages(prisma: PrismaClient) {
  const rows = await prisma.liveTickerMessage.findMany({
    orderBy: [{ priority: "desc" }, { updatedAt: "desc" }, { id: "desc" }],
    take: 50,
  });

  return rows.map(toLiveTickerMessage);
}

async function loadEnabledAdminTickerItems(prisma: PrismaClient): Promise<LiveTickerItem[]> {
  const rows = await prisma.liveTickerMessage.findMany({
    where: {
      enabled: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    take: 8,
  });

  return rows.map((row) => ({
    key: `admin-${row.id}`,
    text: row.text,
    source: "admin" as const,
    priority: 1000 + row.priority,
    expiresAt: row.expiresAt?.toISOString() ?? null,
  }));
}

function parseMatchPlayers(match: LobbyMatchRow | null | undefined) {
  if (!match) return [];
  if (Array.isArray(match.players)) {
    return match.players
      .map((player) => player.name?.trim())
      .filter((name): name is string => Boolean(name));
  }

  if (typeof match.players === "string") {
    return match.players
      .split(/,| vs |\sv\s/gi)
      .map((name) => name.trim())
      .filter(Boolean);
  }

  return [];
}

function parseMapName(match: LobbyMatchRow | null | undefined) {
  if (!match) return null;
  if (typeof match.map === "string") return cleanTickerText(match.map, 48) || null;
  if (typeof match.map?.name === "string") return cleanTickerText(match.map.name, 48) || null;
  return null;
}

function formatWoloMarketTickerPrice(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "pool syncing";
  if (value < 0.001) return `$${value.toFixed(7)}`;
  if (value < 1) return `$${value.toFixed(6)}`;
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 4 })}`;
}

function buildSystemTickerItems({
  tournament,
  leaderboard,
  recentMatches,
  woloMarket,
}: LiveTickerInput): LiveTickerItem[] {
  const latestReplay = recentMatches[0] ?? null;
  const replayPlayers = parseMatchPlayers(latestReplay).slice(0, 2);
  const replayMap = parseMapName(latestReplay);
  const liveMatch = tournament.matches.find((match) => match.status === "live");
  const readyMatch = tournament.matches.find((match) => match.status === "ready");
  const items: LiveTickerItem[] = [];

  if (liveMatch) {
    items.push({
      key: `system-tournament-live-${liveMatch.id}`,
      text: cleanTickerText(`LIVE · ${tournament.title} · ${liveMatch.label || "Match live"}`),
      source: "system",
      priority: 90,
      expiresAt: null,
    });
  }

  if (readyMatch) {
    items.push({
      key: `system-tournament-ready-${readyMatch.id}`,
      text: cleanTickerText(`READY · ${tournament.title} · ${readyMatch.label || "Match ready"}`),
      source: "system",
      priority: 70,
      expiresAt: null,
    });
  }

  if (!tournament.isFallback) {
    items.push({
      key: `system-tournament-${tournament.slug}`,
      text: cleanTickerText(
        `TOURNAMENT · ${tournament.title} · ${tournament.entryCount} ${
          tournament.entryCount === 1 ? "entrant" : "entrants"
        }`
      ),
      source: "system",
      priority: 55,
      expiresAt: null,
    });
  }

  if (latestReplay) {
    const replayLabel =
      replayPlayers.length >= 2
        ? `${replayPlayers[0]} vs ${replayPlayers[1]}`
        : latestReplay.winner
          ? `Winner ${latestReplay.winner}`
          : "Last verified war";
    items.push({
      key: `system-replay-${latestReplay.id}`,
      text: cleanTickerText(
        `REPLAYING · ${replayLabel}${replayMap ? ` · ${replayMap}` : ""}`
      ),
      source: "system",
      priority: 45,
      expiresAt: null,
    });
  }

  items.push({
    key: "system-lobby-counts",
    text: cleanTickerText(
      `LOBBY · ${leaderboard.activePlayers} online · ${leaderboard.matchesToday} matches today · ${leaderboard.trackedPlayers} identity rows`
    ),
    source: "system",
    priority: 35,
    expiresAt: null,
  });

  if (woloMarket.poolId) {
    items.push({
      key: `system-wolo-market-${woloMarket.poolId}`,
      text: cleanTickerText(
        `MARKET · 1 WOLO = ${formatWoloMarketTickerPrice(woloMarket.priceUsd)} · ${woloMarket.pairLabel} pool ${woloMarket.poolId}`
      ),
      source: "system",
      priority: 25,
      expiresAt: null,
    });
  }

  return items;
}

export function getFallbackLiveTickerSnapshot(): LiveTickerSnapshot {
  return {
    items: [
      {
        key: "system-fallback",
        text: "LIVE · AoE2HD lobby open · Join the next Founders Cup",
        source: "system",
        priority: 1,
        expiresAt: null,
      },
    ],
    updatedAt: new Date().toISOString(),
  };
}

export async function loadLiveTickerSnapshot(
  prisma: PrismaClient,
  input: LiveTickerInput
): Promise<LiveTickerSnapshot> {
  const [adminItems] = await Promise.all([loadEnabledAdminTickerItems(prisma)]);
  const systemItems = buildSystemTickerItems(input);
  const items = [...adminItems, ...systemItems]
    .filter((item) => item.text.length > 0)
    .sort((left, right) => right.priority - left.priority)
    .slice(0, 8);

  if (items.length === 0) {
    return getFallbackLiveTickerSnapshot();
  }

  return {
    items,
    updatedAt: new Date().toISOString(),
  };
}
