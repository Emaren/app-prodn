"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useUserAuth } from "@/context/UserAuthContext";
import SteamLoginButton from "@/components/SteamLoginButton";

type OnlineUser = {
  uid: string;
  in_game_name: string;
  verified: boolean;
};

type MatchPlayer = {
  name: string;
  winner?: boolean | null;
};

type MatchRow = {
  id: number;
  winner: string | null;
  map: { name?: string } | string | null;
  players: MatchPlayer[] | string;
  played_on: string | null;
  timestamp: string | null;
};

const NEXT_TOURNAMENT = {
  name: "Next Community Tournament",
  status: "Planning",
  format: "1v1 AoE2HD showcase",
  summary:
    "Steam sign-in, replay verification, and live lobby activity are now the core path. Formal brackets and onsite chat are next.",
};

export default function HomePage() {
  const { isAuthenticated, loading, playerName } = useUserAuth();
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [recentMatches, setRecentMatches] = useState<MatchRow[]>([]);
  const [authError, setAuthError] = useState(false);
  const [authDetail, setAuthDetail] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadLobby = async () => {
      try {
        const [onlineResponse, matchesResponse] = await Promise.all([
          fetch("/api/user/online_users", { cache: "no-store" }),
          fetch("/api/game_stats", { cache: "no-store" }),
        ]);

        if (!cancelled && onlineResponse.ok) {
          const online = (await onlineResponse.json()) as OnlineUser[];
          setOnlineUsers(Array.isArray(online) ? online.slice(0, 8) : []);
        }

        if (!cancelled && matchesResponse.ok) {
          const matches = (await matchesResponse.json()) as MatchRow[];
          setRecentMatches(Array.isArray(matches) ? matches.slice(0, 6) : []);
        }
      } catch (error) {
        if (!cancelled) {
          console.warn("Failed to load lobby data:", error);
        }
      }
    };

    void loadLobby();
    const interval = window.setInterval(loadLobby, 15_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    setAuthError(params.get("auth") === "steam-error");
    setAuthDetail(params.get("detail"));
  }, []);

  return (
    <main className="space-y-6 py-6 text-white">
      <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.18),_transparent_32%),linear-gradient(135deg,_#0f172a,_#111827_55%,_#0b1120)] p-8">
        <div className="grid gap-8 lg:grid-cols-[1.4fr_0.9fr]">
          <div className="space-y-5">
            <div className="text-sm uppercase tracking-[0.4em] text-amber-200/70">
              Builder Mode
            </div>
            <div className="max-w-3xl space-y-3">
              <h2 className="text-4xl font-semibold leading-tight text-white sm:text-5xl">
                AoE2HD players need one lobby for tournaments, replay proof, and trusted bets.
              </h2>
              <p className="max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
                Browse anonymously. Sign in with Steam when you want a persistent identity, replay uploads, and a path toward trusted peer-to-peer betting.
              </p>
            </div>

            {authError && (
              <div className="max-w-2xl rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                Steam sign-in failed{authDetail ? `: ${authDetail}` : "."}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              {isAuthenticated ? (
                <Link
                  href="/profile"
                  className="rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
                >
                  Open Profile
                </Link>
              ) : (
                <SteamLoginButton
                  className="rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
                  label={loading ? "Loading..." : "Claim Your Steam Identity"}
                  disabled={loading}
                />
              )}

              <Link
                href="/game-stats"
                className="rounded-full border border-white/15 px-5 py-3 text-sm text-white/85 transition hover:border-white/30 hover:text-white"
              >
                Watch Parsed Matches
              </Link>

              <Link
                href="/download"
                className="rounded-full border border-white/15 px-5 py-3 text-sm text-white/85 transition hover:border-white/30 hover:text-white"
              >
                Download Watcher
              </Link>
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6 shadow-2xl shadow-black/20">
            <div className="text-xs uppercase tracking-[0.35em] text-amber-200/70">
              Next Tournament
            </div>
            <div className="mt-4 space-y-3">
              <h3 className="text-2xl font-semibold text-white">{NEXT_TOURNAMENT.name}</h3>
              <p className="text-sm text-slate-300">
                <span className="font-semibold text-white">{NEXT_TOURNAMENT.status}</span>
                {" · "}
                {NEXT_TOURNAMENT.format}
              </p>
              <p className="text-sm leading-6 text-slate-300">{NEXT_TOURNAMENT.summary}</p>
              <div className="rounded-2xl border border-amber-300/15 bg-slate-950/40 p-4 text-sm text-slate-300">
                Early structure:
                <div className="mt-2 text-white">1. Steam identity for accounts</div>
                <div className="text-white">2. Replay-linked name verification for trust</div>
                <div className="text-white">3. Wallet connect only when a bet is actually placed</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.35em] text-white/45">Lobby</div>
              <h3 className="mt-2 text-2xl font-semibold text-white">Online Warriors</h3>
            </div>
            <div className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-200">
              {onlineUsers.length} active
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {onlineUsers.length === 0 ? (
              <p className="rounded-2xl border border-white/8 bg-white/5 px-4 py-5 text-sm text-slate-300">
                No recent presence yet. Once signed-in players are pinging the site, this list becomes your live lobby.
              </p>
            ) : (
              onlineUsers.map((user) => (
                <div
                  key={user.uid}
                  className="flex items-center justify-between rounded-2xl border border-white/8 bg-white/5 px-4 py-4"
                >
                  <div>
                    <div className="font-medium text-white">{user.in_game_name}</div>
                    <div className="text-xs uppercase tracking-[0.25em] text-slate-400">
                      {user.verified ? "Replay Verified" : "Unverified"}
                    </div>
                  </div>
                  <div
                    className={`rounded-full px-3 py-1 text-xs ${
                      user.verified
                        ? "bg-emerald-500/15 text-emerald-200"
                        : "bg-white/8 text-slate-300"
                    }`}
                  >
                    {user.verified ? "Trusted" : "New"}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-6">
          <div className="text-xs uppercase tracking-[0.35em] text-white/45">Match Feed</div>
          <h3 className="mt-2 text-2xl font-semibold text-white">Recent Parsed Games</h3>

          <div className="mt-5 space-y-3">
            {recentMatches.length === 0 ? (
              <p className="rounded-2xl border border-white/8 bg-white/5 px-4 py-5 text-sm text-slate-300">
                Parsed matches will show here as soon as the watcher uploads them.
              </p>
            ) : (
              recentMatches.map((match) => {
                const players = normalizePlayers(match.players);
                const playedAt = match.played_on || match.timestamp;

                return (
                  <div
                    key={match.id}
                    className="rounded-2xl border border-white/8 bg-white/5 px-4 py-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="font-medium text-white">{readMapName(match.map)}</div>
                        <div className="mt-1 text-sm text-slate-300">
                          {players.join(" vs ")}
                        </div>
                      </div>
                      <div className="text-right text-xs uppercase tracking-[0.25em] text-slate-400">
                        {match.winner || "Unknown"}
                      </div>
                    </div>
                    {playedAt && (
                      <div className="mt-3 text-xs text-slate-400">
                        {new Date(playedAt).toLocaleString()}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <div className="rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-6">
          <div className="text-xs uppercase tracking-[0.35em] text-white/45">Identity</div>
          <h3 className="mt-2 text-2xl font-semibold text-white">
            {isAuthenticated ? `Signed in as ${playerName || "Steam user"}` : "Browse first, sign in when ready"}
          </h3>
          <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300">
            My call is to keep authentication narrow for now. Steam becomes the first supported account path, while replay verification remains the real trust anchor for payouts.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            {!isAuthenticated && (
              <SteamLoginButton
                className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-200"
              />
            )}
            <Link
              href="/profile"
              className="rounded-full border border-white/15 px-5 py-3 text-sm text-white/85 transition hover:border-white/30 hover:text-white"
            >
              Account Details
            </Link>
          </div>
        </div>

        <div className="rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-6">
          <div className="text-xs uppercase tracking-[0.35em] text-white/45">Chat</div>
          <h3 className="mt-2 text-2xl font-semibold text-white">Lobby Chat Is Next</h3>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            I did not fake a chat system here. The next step is a real Postgres-backed room tied to signed-in identities and tournament lobbies, not local-only messages.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <a
              href="https://discord.gg/EfghKZY7U9"
              target="_blank"
              rel="noreferrer"
              className="rounded-full bg-indigo-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-indigo-300"
            >
              Join Discord
            </a>
            <Link
              href="/users"
              className="rounded-full border border-white/15 px-5 py-3 text-sm text-white/85 transition hover:border-white/30 hover:text-white"
            >
              View Online Users
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

function readMapName(value: MatchRow["map"]) {
  if (!value) return "Unknown Map";
  if (typeof value === "string") return value;
  return value.name || "Unknown Map";
}

function normalizePlayers(value: MatchRow["players"]) {
  if (Array.isArray(value)) {
    return value.map((player) => player.name).filter(Boolean).slice(0, 4);
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as MatchPlayer[];
      return Array.isArray(parsed)
        ? parsed.map((player) => player.name).filter(Boolean).slice(0, 4)
        : [];
    } catch {
      return [];
    }
  }

  return [];
}
