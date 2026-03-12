"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import SteamLoginButton from "@/components/SteamLoginButton";
import { useUserAuth } from "@/context/UserAuthContext";
import {
  getFallbackTournament,
  getTournamentMatchStatusLabel,
  getTournamentStatusLabel,
  type LobbyMatchPlayer,
  type LobbyMatchRow,
  type LobbyMessage,
  type LobbyOnlineUser,
  type LobbySnapshot,
} from "@/lib/lobby";

export default function HomePage() {
  const { isAdmin, isAuthenticated, loading, loginWithSteam, playerName, user } = useUserAuth();
  const [lobby, setLobby] = useState<LobbySnapshot | null>(null);
  const [liveConnected, setLiveConnected] = useState(false);
  const [authError, setAuthError] = useState(false);
  const [authDetail, setAuthDetail] = useState<string | null>(null);
  const [lobbyError, setLobbyError] = useState<string | null>(null);
  const [messageBody, setMessageBody] = useState("");
  const [chatError, setChatError] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [chatPending, setChatPending] = useState(false);
  const [joinPending, setJoinPending] = useState(false);

  const loadLobby = useCallback(async () => {
    try {
      const response = await fetch("/api/lobby", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Lobby request failed: ${response.status}`);
      }

      const payload = (await response.json()) as LobbySnapshot;
      setLobby(payload);
      setLobbyError(null);
    } catch (error) {
      console.warn("Failed to load lobby:", error);
      setLobbyError("Lobby data is temporarily unavailable.");
    }
  }, []);

  useEffect(() => {
    void loadLobby();
    const interval = window.setInterval(() => {
      void loadLobby();
    }, 30_000);

    return () => {
      window.clearInterval(interval);
    };
  }, [loadLobby]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof EventSource === "undefined") {
      return;
    }

    const source = new EventSource("/api/lobby/stream");

    const handleSnapshot = (event: MessageEvent<string>) => {
      try {
        const snapshot = JSON.parse(event.data) as LobbySnapshot;
        setLobby(snapshot);
        setLobbyError(null);
        setLiveConnected(true);
      } catch (error) {
        console.warn("Failed to parse live lobby snapshot:", error);
      }
    };

    const handleStreamError = () => {
      setLiveConnected(false);
    };

    source.addEventListener("snapshot", handleSnapshot as EventListener);
    source.addEventListener("error", handleStreamError as EventListener);
    source.onopen = () => {
      setLiveConnected(true);
    };
    source.onerror = () => {
      setLiveConnected(false);
    };

    return () => {
      source.removeEventListener("snapshot", handleSnapshot as EventListener);
      source.removeEventListener("error", handleStreamError as EventListener);
      source.close();
      setLiveConnected(false);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    setAuthError(params.get("auth") === "steam-error");
    setAuthDetail(params.get("detail"));
  }, []);

  const tournament = lobby?.tournament ?? getFallbackTournament(false);
  const onlineUsers = lobby?.onlineUsers ?? [];
  const recentMatches = lobby?.recentMatches ?? [];
  const messages = lobby?.messages ?? [];
  const chatRoomTitle =
    messages.length > 0 && messages[0]?.roomSlug === tournament.roomSlug && !tournament.isFallback
      ? `${tournament.title} Chat`
      : "Live Chat";

  async function handleJoinTournament() {
    if (!tournament.id) return;
    if (!isAuthenticated) {
      loginWithSteam("/");
      return;
    }

    try {
      setJoinPending(true);
      setJoinError(null);

      const response = await fetch("/api/lobby/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tournamentId: tournament.id }),
      });

      const payload = (await response.json().catch(() => ({}))) as
        | { detail?: string; tournament?: LobbySnapshot["tournament"] }
        | Record<string, unknown>;

      if (!response.ok) {
        throw new Error(typeof payload.detail === "string" ? payload.detail : "Join failed.");
      }

      setLobby((current) =>
        current
          ? {
              ...current,
              tournament: (payload.tournament as LobbySnapshot["tournament"]) || current.tournament,
            }
          : current
      );
      await loadLobby();
    } catch (error) {
      setJoinError(error instanceof Error ? error.message : "Join failed.");
    } finally {
      setJoinPending(false);
    }
  }

  async function handleSendMessage() {
    const trimmed = messageBody.trim();
    if (!trimmed) return;
    if (!isAuthenticated) {
      loginWithSteam("/");
      return;
    }

    try {
      setChatPending(true);
      setChatError(null);

      const response = await fetch("/api/lobby/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: trimmed, roomSlug: tournament.roomSlug }),
      });

      const payload = (await response.json().catch(() => ({}))) as
        | { detail?: string; messages?: LobbyMessage[] }
        | Record<string, unknown>;

      if (!response.ok) {
        throw new Error(typeof payload.detail === "string" ? payload.detail : "Message failed.");
      }

      setMessageBody("");
      setLobby((current) =>
        current
          ? {
              ...current,
              messages: Array.isArray(payload.messages) ? payload.messages : current.messages,
            }
          : current
      );
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "Message failed.");
    } finally {
      setChatPending(false);
    }
  }

  return (
    <main className="space-y-6 py-6 text-white">
      <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.18),_transparent_30%),linear-gradient(135deg,_#0f172a,_#111827_55%,_#0b1120)] p-8">
        <div className="grid gap-8 lg:grid-cols-[1.2fr_0.95fr]">
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-3">
              <div className="text-sm uppercase tracking-[0.4em] text-amber-200/70">
                Community Lobby
              </div>
              <div
                className={`rounded-full px-3 py-1 text-xs ${
                  liveConnected
                    ? "border border-emerald-400/30 bg-emerald-500/10 text-emerald-100"
                    : "border border-white/10 bg-white/5 text-slate-300"
                }`}
              >
                {liveConnected ? "Live updates connected" : "Polling fallback"}
              </div>
            </div>
            <div className="max-w-3xl space-y-3">
              <h2 className="text-4xl font-semibold leading-tight text-white sm:text-5xl">
                One homepage for the next tournament, the live lobby, and the proof system behind trusted bets.
              </h2>
              <p className="max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
                Browse anonymously. Sign in with Steam when you want a persistent identity, tournament entry, replay uploads, and a trust path toward peer-to-peer betting.
              </p>
            </div>

            {authError && (
              <div className="max-w-2xl rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                Steam sign-in failed{authDetail ? `: ${authDetail}` : "."}
              </div>
            )}

            {lobbyError && (
              <div className="max-w-2xl rounded-2xl border border-amber-300/25 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
                {lobbyError}
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

            <div className="grid gap-3 sm:grid-cols-3">
              <StatCard label="Entrants" value={String(tournament.entryCount)} />
              <StatCard label="Active Lobby" value={String(onlineUsers.length)} />
              <StatCard label="Recent Matches" value={String(recentMatches.length)} />
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6 shadow-2xl shadow-black/20">
            <div className="flex items-start justify-between gap-4">
              <div className="text-xs uppercase tracking-[0.35em] text-amber-200/70">
                Next Tournament
              </div>
              <div className="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-xs font-medium text-amber-100">
                {getTournamentStatusLabel(tournament.status)}
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <h3 className="text-2xl font-semibold text-white">{tournament.title}</h3>
              <p className="text-sm text-slate-300">
                <span className="font-semibold text-white">{tournament.format}</span>
                {" · "}
                {formatTournamentWindow(tournament.startsAt)}
              </p>
              <p className="text-sm leading-6 text-slate-300">{tournament.description}</p>

              <div className="rounded-2xl border border-white/8 bg-slate-950/40 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-xs uppercase tracking-[0.25em] text-slate-400">
                      Join Queue
                    </div>
                    <div className="mt-1 text-lg font-semibold text-white">
                      {tournament.entryCount} {tournament.entryCount === 1 ? "entrant" : "entrants"}
                    </div>
                  </div>
                  {isAdmin && (
                    <Link
                      href="/admin"
                      className="rounded-full border border-white/15 px-4 py-2 text-xs text-white/85 transition hover:border-white/30 hover:text-white"
                    >
                      Edit Tournament
                    </Link>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {tournament.entrants.length === 0 ? (
                    <div className="text-sm text-slate-400">
                      No one has joined yet. The first few players set the tone.
                    </div>
                  ) : (
                    tournament.entrants.slice(0, 12).map((entrant) => (
                      <div
                        key={`${entrant.entryId ?? entrant.uid}-${entrant.joinedAt}`}
                        className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-white"
                      >
                        {displayName(entrant.inGameName, entrant.steamPersonaName)}
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-white/8 bg-slate-950/40 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-xs uppercase tracking-[0.25em] text-slate-400">
                      Bracket Preview
                    </div>
                    <div className="mt-1 text-lg font-semibold text-white">
                      {tournament.matches.length} {tournament.matches.length === 1 ? "match" : "matches"}
                    </div>
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  {tournament.matches.length === 0 ? (
                    <div className="text-sm text-slate-400">
                      No bracket matches posted yet. Once the first pairings are set, they will appear here live.
                    </div>
                  ) : (
                    tournament.matches.slice(0, 3).map((match) => (
                      <div
                        key={match.id}
                        className="rounded-2xl border border-white/8 bg-white/5 px-4 py-4"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="text-sm font-medium text-white">
                              {match.label || `Round ${match.round} · Match ${match.position}`}
                            </div>
                            <div className="mt-1 text-sm text-slate-300">
                              {displayMatchPlayer(match.playerOne)} vs {displayMatchPlayer(match.playerTwo)}
                            </div>
                          </div>
                          <div className="space-y-2 text-right">
                            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
                              {getTournamentMatchStatusLabel(match.status)}
                            </div>
                            {match.proof && (
                              <div className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-[11px] text-emerald-100">
                                Replay Verified
                              </div>
                            )}
                          </div>
                        </div>
                        {match.scheduledAt && (
                          <div className="mt-3 text-xs text-slate-400">
                            {new Date(match.scheduledAt).toLocaleString()}
                          </div>
                        )}
                        {match.proof && (
                          <div className="mt-3 text-xs text-emerald-100/90">
                            {match.proof.mapName || "Unknown map"}
                            {match.proof.playedOn
                              ? ` · ${new Date(match.proof.playedOn).toLocaleString()}`
                              : ""}
                            {match.proof.winner ? ` · Winner ${match.proof.winner}` : ""}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {joinError && (
                <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                  {joinError}
                </div>
              )}

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => {
                    void handleJoinTournament();
                  }}
                  disabled={joinPending || tournament.isFallback || tournament.status === "completed"}
                  className="rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {tournament.viewerJoined
                    ? joinPending
                      ? "Refreshing..."
                      : "Joined"
                    : joinPending
                      ? "Joining..."
                      : tournament.isFallback
                        ? "Waiting For Setup"
                        : "Join Tournament"}
                </button>

                {!isAuthenticated && (
                  <button
                    type="button"
                    onClick={() => loginWithSteam("/")}
                    className="rounded-full border border-white/15 px-5 py-3 text-sm text-white/85 transition hover:border-white/30 hover:text-white"
                  >
                    Sign In To Join
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.35em] text-white/45">Chat</div>
              <h3 className="mt-2 text-2xl font-semibold text-white">{chatRoomTitle}</h3>
            </div>
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
              {messages.length} recent
            </div>
          </div>

          <div className="mt-5 space-y-3">
            <div className="max-h-[26rem] space-y-3 overflow-y-auto pr-1">
              {messages.length === 0 ? (
                <div className="rounded-2xl border border-white/8 bg-white/5 px-4 py-5 text-sm text-slate-300">
                  No messages yet. The first tournament chatter starts here.
                </div>
              ) : (
                messages.map((message) => (
                  <div
                    key={message.id}
                    className="rounded-2xl border border-white/8 bg-white/5 px-4 py-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium text-white">
                        {displayName(message.user.inGameName, message.user.steamPersonaName)}
                      </div>
                      <div className="text-xs text-slate-400">
                        {new Date(message.createdAt).toLocaleTimeString([], {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </div>
                    </div>
                    <div className="mt-1 text-xs uppercase tracking-[0.25em] text-slate-500">
                      {message.user.verificationLevel > 0 ? "Steam Linked" : "Unverified"}
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-200">{message.body}</p>
                  </div>
                ))
              )}
            </div>

            {chatError && (
              <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                {chatError}
              </div>
            )}

            <div className="rounded-[1.5rem] border border-white/8 bg-white/5 p-3">
              {isAuthenticated ? (
                <div className="space-y-3">
                  <div className="text-sm text-slate-300">
                    Chatting as {playerName || displayName(user?.inGameName || null, user?.steamPersonaName || null)}
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <input
                      value={messageBody}
                      onChange={(event) => setMessageBody(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          void handleSendMessage();
                        }
                      }}
                      maxLength={280}
                      placeholder="Call out the matchup, look for practice games, or talk bracket."
                      className="min-w-0 flex-1 rounded-full border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-amber-300/50"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        void handleSendMessage();
                      }}
                      disabled={chatPending || messageBody.trim().length === 0}
                      className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {chatPending ? "Sending..." : "Send"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm text-slate-300">
                    Sign in to join the live lobby instead of just watching it.
                  </div>
                  <SteamLoginButton
                    className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-200"
                    label="Sign In To Chat"
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
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
                  No recent presence yet. Once signed-in players start pinging the site, this becomes the real lobby roster.
                </p>
              ) : (
                onlineUsers.map((onlineUser) => (
                  <OnlineUserCard key={onlineUser.uid} user={onlineUser} />
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
                recentMatches.map((match) => <MatchCard key={match.id} match={match} />)
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.4rem] border border-white/10 bg-white/5 px-4 py-4">
      <div className="text-xs uppercase tracking-[0.25em] text-slate-400">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
    </div>
  );
}

function OnlineUserCard({ user }: { user: LobbyOnlineUser }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-white/5 px-4 py-4">
      <div>
        <div className="font-medium text-white">{user.in_game_name}</div>
        <div className="text-xs uppercase tracking-[0.25em] text-slate-400">
          {user.verified ? "Replay Verified" : "Unverified"}
        </div>
      </div>
      <div
        className={`rounded-full px-3 py-1 text-xs ${
          user.verified ? "bg-emerald-500/15 text-emerald-200" : "bg-white/8 text-slate-300"
        }`}
      >
        {user.verified ? "Trusted" : "New"}
      </div>
    </div>
  );
}

function MatchCard({ match }: { match: LobbyMatchRow }) {
  const players = normalizePlayers(match.players);
  const playedAt = match.played_on || match.timestamp;

  return (
    <div className="rounded-2xl border border-white/8 bg-white/5 px-4 py-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-medium text-white">{readMapName(match.map)}</div>
          <div className="mt-1 text-sm text-slate-300">{players.join(" vs ")}</div>
        </div>
        <div className="text-right text-xs uppercase tracking-[0.25em] text-slate-400">
          {match.winner || "Unknown"}
        </div>
      </div>
      {playedAt && (
        <div className="mt-3 text-xs text-slate-400">{new Date(playedAt).toLocaleString()}</div>
      )}
    </div>
  );
}

function displayName(inGameName: string | null | undefined, steamPersonaName: string | null | undefined) {
  return inGameName || steamPersonaName || "Steam user";
}

function displayMatchPlayer(
  entrant:
    | LobbySnapshot["tournament"]["matches"][number]["playerOne"]
    | LobbySnapshot["tournament"]["matches"][number]["playerTwo"]
) {
  if (!entrant) return "Open Slot";
  return displayName(entrant.inGameName, entrant.steamPersonaName);
}

function formatTournamentWindow(startsAt: string | null) {
  if (!startsAt) return "Scheduling now";

  const date = new Date(startsAt);
  if (Number.isNaN(date.getTime())) return "Scheduling now";

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function readMapName(value: LobbyMatchRow["map"]) {
  if (!value) return "Unknown Map";
  if (typeof value === "string") return value;
  return value.name || "Unknown Map";
}

function normalizePlayers(value: LobbyMatchRow["players"]) {
  if (Array.isArray(value)) {
    return value.map((player) => player.name).filter(Boolean).slice(0, 4);
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as LobbyMatchPlayer[];
      return Array.isArray(parsed)
        ? parsed.map((player) => player.name).filter(Boolean).slice(0, 4)
        : [];
    } catch {
      return [];
    }
  }

  return [];
}
