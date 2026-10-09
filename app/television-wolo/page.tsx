import type { Metadata } from "next";

import TelevisionWoloExperience, {
  type TelevisionBattle,
  type TelevisionChaosCard,
} from "@/components/television/TelevisionWoloExperience";
import SpeedReadyMarker from "@/components/speed/SpeedReadyMarker";
import { loadChaosium } from "@/lib/champions/chaosium";
import { loadPublicLiveGamesSnapshot } from "@/lib/liveGamesPublicSnapshot";
import { getPrisma } from "@/lib/prisma";
import { resolveReplayTeams, type CanonicalReplayPlayer } from "@/lib/teamResolution";
import type { TelevisionStage } from "@/lib/televisionDirection";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Television WOLO",
  description:
    "AoE2WAR's live television laboratory: battles, perspectives, archives, and Chaos Champion experiments.",
};

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function playerNames(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return value.flatMap((player) => {
    if (!player || typeof player !== "object") return [];
    const row = player as Record<string, unknown>;
    const name =
      cleanText(row.name) ||
      cleanText(row.playerName) ||
      cleanText(row.player_name);
    return name && name.toLowerCase() !== "unknown" ? [name] : [];
  });
}

function buildStage(row: Record<string, unknown>, isFinal: boolean): TelevisionStage {
  const players = Array.isArray(row.players) ? row.players : [];
  const prior = row.teamResolution;
  const resolution = prior && typeof prior === "object" && !Array.isArray(prior)
    ? prior as ReturnType<typeof resolveReplayTeams>
    : resolveReplayTeams(players, { final: isFinal });
  const makePlayer = (player: CanonicalReplayPlayer, index: number) => ({
    key: player.stablePlayerKey || `player-${index}`,
    name: player.name,
    steamId: player.steamId,
    civilization: player.civilizationName,
  });
  if (
    resolution.status === "resolved" &&
    resolution.teams.length === 2 &&
    resolution.teams.every(team => team.players.length >= 1) &&
    resolution.teams.reduce((total, team) => total + team.players.length, 0) <= 8
  ) {
    return {
      confirmedTeams: true,
      format: resolution.format,
      teams: resolution.teams.map((team, index) => ({
        key: team.teamKey,
        label: `TEAM ${index + 1}`,
        players: team.players.map(makePlayer),
      })),
    };
  }
  // Never invent team identity, including FFA and incomplete rosters.
  const valid = players.flatMap((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
    const player = raw as Record<string, unknown>;
    const name = cleanText(player.name || player.playerName || player.player_name);
    if (!name || name.toLowerCase() === "unknown") return [];
    return [{ key: `unverified-${index}`, name,
      steamId: typeof player.steamId === "string" ? player.steamId : null,
      civilization: null }];
  }).slice(0, 8);
  return { confirmedTeams: false, format: "Teams unverified",
    teams: [{ key: "unresolved", label: "PARTICIPANTS · TEAM UNKNOWN", players: valid }] };
}

function mapName(row: Record<string, unknown>) {
  const direct = cleanText(row.mapName) || cleanText(row.map_name);
  if (direct) return direct;
  if (row.map && typeof row.map === "object" && !Array.isArray(row.map)) {
    return cleanText((row.map as Record<string, unknown>).name) || "Unknown map";
  }
  return "Unknown map";
}

function timestamp(row: Record<string, unknown>) {
  for (const key of ["completedAt", "playedOn", "played_on", "createdAt", "created_at"]) {
    const value = row[key];
    if (value instanceof Date) return value.toISOString();
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}
function toBattle(
  value: unknown,
  source: TelevisionBattle["source"],
): TelevisionBattle | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const sessionKey = cleanText(row.sessionKey) || cleanText(row.session_key);
  if (!sessionKey) return null;

  const names = playerNames(row.players);
  const stage = buildStage(row, source !== "live");
  const fallbackId =
    typeof row.id === "number" && Number.isFinite(row.id)
      ? "Battle #" + row.id
      : "Battle";
  const title = stage.confirmedTeams
    ? stage.teams.map(team => team.players.map(player => player.name).join(" + ")).join(" vs ")
    : names.length >= 2 ? names.slice(0, 8).join(" · ") : fallbackId;
  const streams = Array.isArray(row.streams) ? row.streams : [];

  return {
    id: typeof row.id === "number" ? row.id : null,
    sessionKey,
    source,
    title,
    playerNames: names,
    stage,
    mapName: mapName(row),
    winner: cleanText(row.winner) || null,
    occurredAt: timestamp(row),
    watchHref: "/watch/" + encodeURIComponent(sessionKey),
    initialStreamCount: streams.length,
  };
}

function buildBattleShelf(snapshot: Awaited<ReturnType<typeof loadPublicLiveGamesSnapshot>>) {
  const candidates = [
    ...snapshot.activeSessions.map((row) => toBattle(row, "live")),
    ...snapshot.recentlyCompletedSessions.map((row) => toBattle(row, "recent")),
    ...snapshot.recentMatches.map((row) => toBattle(row, "archive")),
  ];

  const seen = new Set<string>();
  const battles: TelevisionBattle[] = [];
  for (const battle of candidates) {
    if (!battle || seen.has(battle.sessionKey)) continue;
    seen.add(battle.sessionKey);
    battles.push(battle);
    if (battles.length >= 36) break;
  }
  return battles;
}

export default async function TelevisionWoloPage() {
  const prisma = getPrisma();
  const [snapshot, chaosium] = await Promise.all([
    loadPublicLiveGamesSnapshot(prisma),
    loadChaosium(prisma),
  ]);

  const chaos = chaosium.find((belt) => belt.id === "chaos") ?? null;
  const chaosCard: TelevisionChaosCard | null = chaos
    ? {
        displayName: chaos.displayName,
        holderName: chaos.currentHolder,
        holderAvatarUrl: chaos.currentHolderAvatarUrl,
        holderHref: chaos.currentHolderHref,
        beltHref: chaos.routeHref,
        beltImageUrl: chaos.assetUrl,
        holderSince: chaos.holderSince,
      }
    : null;

  const battles = buildBattleShelf(snapshot);

  return (
    <main className="mx-auto w-full max-w-[112rem] space-y-6 overflow-x-hidden px-3 py-4 text-white sm:px-5 sm:py-6">
      <SpeedReadyMarker route="/television-wolo" />
      <TelevisionWoloExperience
        battles={battles}
        liveCount={snapshot.liveCount}
        archiveTotal={snapshot.archiveTotal}
        chaos={chaosCard}
      />
    </main>
  );
}
