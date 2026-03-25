"use client";

import Link from "next/link";
import SteamLoginButton from "@/components/SteamLoginButton";
import { LeaderboardPanel } from "@/components/lobby/LeaderboardPanel";
import { StatCard } from "@/components/lobby/StatCard";
import type { LobbySnapshot } from "@/lib/lobby";

type LobbyHeroProps = {
  liveConnected: boolean;
  authError: boolean;
  authDetail: string | null;
  lobbyError: string | null;
  isAuthenticated: boolean;
  loading: boolean;
  leaderboard: LobbySnapshot["leaderboard"];
};

export function LobbyHero({
  liveConnected,
  authError,
  authDetail,
  lobbyError,
  isAuthenticated,
  loading,
  leaderboard,
}: LobbyHeroProps) {
  return (
    <div className="space-y-6">
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
          See who owns the ladder before the next bracket locks.
        </h2>
        <p className="max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
          Replay-backed standings, verified identities, and live activity now drive the AoE2HD
          lobby. The board leads, and the tournament card on the right points straight at the next
          battle.
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

      <LeaderboardPanel leaderboard={leaderboard} />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Active Players"
          value={String(leaderboard.activePlayers)}
          subtext="Signed-in warriors on the board right now."
          tone="emerald"
        />
        <StatCard
          label="Matches Today"
          value={String(leaderboard.matchesToday)}
          subtext="Final parsed replays driving the lobby pulse."
        />
        <StatCard
          label="$WOLO Rail"
          value={leaderboard.woloStatusLabel}
          subtext="Tournament-linked trust layer, kept secondary for now."
          tone="amber"
          valueClassName="text-3xl sm:text-[2rem]"
        />
      </div>

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
          href={isAuthenticated ? "/upload" : "/download"}
          className="rounded-full border border-white/15 px-5 py-3 text-sm text-white/85 transition hover:border-white/30 hover:text-white"
        >
          {isAuthenticated ? "Upload Replay" : "Download Watcher"}
        </Link>

        <Link
          href="/rivalries"
          className="rounded-full border border-white/15 px-5 py-3 text-sm text-white/85 transition hover:border-white/30 hover:text-white"
        >
          View Rivalries
        </Link>
      </div>
    </div>
  );
}
