"use client";

import React, { useEffect, useState, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";

// --- Interfaces ---
interface PlayerStats {
  name: string;
  civilization: number;
  civilization_name: string;
  winner: boolean;
  military_score: number;
  economy_score: number;
  technology_score: number;
  society_score: number;
  units_killed: number;
  buildings_destroyed: number;
  resources_gathered: number;
  fastest_castle_age: number;
  fastest_imperial_age: number;
  relics_collected: number;
}

interface GameStats {
  id: number;
  game_version: string;
  map: any;
  game_type: string;
  duration: number;
  game_duration?: number;
  players: PlayerStats[];
  timestamp: string;
  replay_hash: string;
}

// --- Helpers ---
function cleanGameType(rawType: string): string {
  const match = rawType.match(/'(VER.*?)'/);
  return match && match[1] ? match[1] : rawType;
}

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  if (hours > 0 && minutes > 0 && secs > 0) return `${hours} hours ${minutes} minutes ${secs} seconds`;
  if (hours > 0 && minutes > 0) return `${hours} hours ${minutes} minutes`;
  if (hours > 0) return `${hours} hours`;
  if (minutes > 0 && secs > 0) return `${minutes} minutes ${secs} seconds`;
  if (minutes > 0) return `${minutes} minutes`;
  return `${secs} seconds`;
}

function sanitizeDuration(seconds: number): number {
  if (seconds > 4 * 3600 || seconds < 10) return 0;
  return seconds;
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8002";

// --- Skeleton Loader ---
const LoadingSkeleton = () => (
  <div className="space-y-6">
    {Array.from({ length: 3 }).map((_, idx) => (
      <div
        key={idx}
        className="p-6 rounded-xl bg-gray-700 animate-pulse space-y-4"
      >
        <div className="h-6 bg-gray-600 rounded w-1/2"></div>
        <div className="h-4 bg-gray-600 rounded w-1/3"></div>
        <div className="h-4 bg-gray-600 rounded w-1/4"></div>
        <div className="h-4 bg-gray-600 rounded w-2/5"></div>
        <div className="h-4 bg-gray-600 rounded w-3/5"></div>
        <div className="h-4 bg-gray-600 rounded w-1/2"></div>
      </div>
    ))}
  </div>
);

const GameStatsPage = () => {
  const router = useRouter();
  const storedName = typeof window !== "undefined" ? localStorage.getItem("playerName")?.toLowerCase() || "" : "";
  const [playerName] = useState(storedName);
  const [filterMode, setFilterMode] = useState<"all" | "mine">("all"); // ⬅️ Default always to "all"
  const [games, setGames] = useState<GameStats[]>([]);
  const [loading, setLoading] = useState(true);

  const latestHashRef = useRef<string | null>(null);
  const focusRef = useRef(true);

  useEffect(() => {
    const fetchGameStats = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/game_stats?ts=${Date.now()}`, { cache: "no-store" });
        const data = await response.json();
        if (!Array.isArray(data)) {
          console.warn("⚠️ Invalid API response format.");
          setLoading(false);
          return;
        }

        const formattedGames = data.map((game: GameStats) => {
          let safePlayers: PlayerStats[] = [];
          let safeMap: any = game.map;

          if (typeof game.players === "string") {
            try { safePlayers = JSON.parse(game.players); } catch { safePlayers = []; }
          } else if (Array.isArray(game.players)) {
            safePlayers = game.players;
          }

          if (typeof safeMap === "string") {
            try { safeMap = JSON.parse(safeMap); } catch { safeMap = {}; }
          }

          return { ...game, players: safePlayers, map: safeMap };
        });

        const dedupedGames = Array.from(
          formattedGames.reduce((map, game) => {
            const existing = map.get(game.replay_hash);
            if (!existing || new Date(game.timestamp) > new Date(existing.timestamp)) {
              map.set(game.replay_hash, game);
            }
            return map;
          }, new Map<string, GameStats>()).values()
        );

        const validGames = dedupedGames.filter((g) => g.players.length > 0);
        validGames.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        if (validGames.length === 0) {
          console.warn("⚠️ No valid games found.");
          setLoading(false);
          return;
        }

        const newestHash = validGames[0].replay_hash;
        if (newestHash !== latestHashRef.current) {
          latestHashRef.current = newestHash;
          setGames(validGames);
          console.log("🔁 Game list updated. Latest replay_hash:", newestHash);
        }

        setLoading(false);
      } catch (err) {
        console.error("❌ Failed to fetch game stats:", err);
        setLoading(false);
      }
    };

    let interval: NodeJS.Timeout;
    const startPolling = () => {
      clearInterval(interval);
      interval = setInterval(fetchGameStats, focusRef.current ? 1000 : 5000);
    };

    fetchGameStats();
    startPolling();

    window.addEventListener("focus", () => { focusRef.current = true; startPolling(); });
    window.addEventListener("blur", () => { focusRef.current = false; startPolling(); });

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", () => {});
      window.removeEventListener("blur", () => {});
    };
  }, []);

  const filteredGames = useMemo(() => {
    if (filterMode === "all") return games;
    return games.filter((game) =>
      game.players.some((p) => p.name.toLowerCase() === playerName)
    );
  }, [games, playerName, filterMode]);

  const showPremium = () => (
    <span className="text-gray-400 italic">Premium Stats</span>
  );

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <div className="text-center mt-4">
        <Button
          className="bg-blue-700 hover:bg-blue-700 px-2 py-1 text-white"
          onClick={() => router.push("/")}
        >
          ⬅️ Back to Home
        </Button>
      </div>

      <div className="text-center mt-8 flex justify-center gap-4">
        <Button
          onClick={() => setFilterMode("mine")}
          className={filterMode === "mine" ? "bg-yellow-700" : "bg-gray-700"}
        >
          🎯 My Games
        </Button>
        <Button
          onClick={() => setFilterMode("all")}
          className={filterMode === "all" ? "bg-yellow-700" : "bg-gray-700"}
        >
          🌎 All Games
        </Button>
      </div>

      <h2 className="text-3xl font-bold text-center my-8 text-gray-400">
        {filterMode === "mine" ? "My Matches" : "All Matches"}
      </h2>

      {loading ? (
        <LoadingSkeleton />
      ) : filteredGames.length === 0 ? (
        <p className="text-center text-gray-400">No games detected. Play AoE2HD games using this app first to see them parsed and displayed here.</p>
      ) : (
        <div className="space-y-6">
          <AnimatePresence>
            {filteredGames.map((game, index) => {
              const isLatest = index === 0;
              const cleanedDuration = sanitizeDuration(game.duration || game.game_duration || 0);

              return (
                <motion.div
                  key={game.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                  className={`p-6 rounded-xl shadow-lg ${
                    isLatest
                      ? "bg-gray-900 text-yellow-400 border-2 border-yellow-500"
                      : "bg-gray-700 text-black border border-gray-600"
                  }`}
                >
                  <h3 className="text-2xl font-semibold">
                    {isLatest ? "🔥 Latest Match" : `Previous Match #${filteredGames.length - index}`}
                  </h3>

                  <p className="text-lg"><strong>Game Version:</strong> {game.game_version?.replace("Version.", "") || "Unknown"}</p>
                  <p className="text-lg"><strong>Map:</strong> {typeof game.map === "object" ? game.map?.name : game.map}</p>
                  <p className="text-lg"><strong>Game Type:</strong> {cleanGameType(game.game_type).replace("VER ", "v")}</p>
                  <p className="text-lg"><strong>Duration:</strong> {cleanedDuration === 0 ? "⚠️ Invalid Duration (Likely Out of Sync)" : formatDuration(cleanedDuration)}</p>

                  <h4 className="text-xl font-semibold mt-4">Players</h4>
                  <div className="mt-2 space-y-2">
                    {game.players.map((player, pIdx) => (
                      <div
                        key={pIdx}
                        className={`p-4 rounded-lg ${
                          player.winner
                            ? "bg-gray-500 text-black font-bold"
                            : "bg-gray-600 text-black"
                        }`}
                      >
                        <p><strong>Name:</strong> {player.name} {player.winner ? "🏆" : "❌"}</p>
                        <p><strong>Civilization:</strong> {player.civilization}</p>
                        <p><strong>Military Score:</strong> {showPremium()}</p>
                        <p><strong>Economy Score:</strong> {showPremium()}</p>
                        <p><strong>Technology Score:</strong> {showPremium()}</p>
                        <p><strong>Society Score:</strong> {showPremium()}</p>
                        <p><strong>More:</strong> {showPremium()}</p>
                      </div>
                    ))}
                  </div>

                  {!game.players.some((p) => p.winner) && (
                    <p className="text-red-500 italic mt-4">
                      ⚠️ No winner detected. Likely Out of Sync. Bets refunded.
                    </p>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
};

export default GameStatsPage;
