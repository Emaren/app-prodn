import type { Metadata } from "next";

import TelevisionWoloExperience, {
  type TelevisionBattle,
  type TelevisionChaosCard,
} from "@/components/television/TelevisionWoloExperience";
import SpeedReadyMarker from "@/components/speed/SpeedReadyMarker";
import { loadChaosium } from "@/lib/champions/chaosium";
import { loadPublicLiveGamesSnapshot } from "@/lib/liveGamesPublicSnapshot";
import { getPrisma } from "@/lib/prisma";

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
  const fallbackId =
    typeof row.id === "number" && Number.isFinite(row.id)
      ? "Battle #" + row.id
      : "Battle";
  const title = names.length >= 2 ? names.slice(0, 4).join(" vs ") : fallbackId;
  const streams = Array.isArray(row.streams) ? row.streams : [];

  return {
    id: typeof row.id === "number" ? row.id : null,
    sessionKey,
    source,
    title,
    playerNames: names,
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
