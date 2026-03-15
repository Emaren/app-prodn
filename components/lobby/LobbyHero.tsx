"use client";

import Link from "next/link";
import SteamLoginButton from "@/components/SteamLoginButton";
import { StatCard } from "@/components/lobby/StatCard";
import { WoloFeatureTile } from "@/components/lobby/WoloFeatureTile";

type LobbyHeroProps = {
  liveConnected: boolean;
  authError: boolean;
  authDetail: string | null;
  lobbyError: string | null;
  isAuthenticated: boolean;
  loading: boolean;
  tournamentEntryCount: number;
  onlineUserCount: number;
  recentMatchCount: number;
};

export function LobbyHero({
  liveConnected,
  authError,
  authDetail,
  lobbyError,
  isAuthenticated,
  loading,
  tournamentEntryCount,
  onlineUserCount,
  recentMatchCount,
}: LobbyHeroProps) {
  return (
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
          AoE2HD tournaments, rivalries, and verified match results.
        </h2>
        <p className="max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
          Join the community, enter tournaments, browse players, and upload recorded games to
          confirm results. AoE2HDBets brings the lobby, bracket, and match history together in one
          place.
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
          href="/rivalries"
          className="rounded-full border border-white/15 px-5 py-3 text-sm text-white/85 transition hover:border-white/30 hover:text-white"
        >
          View Rivalries
        </Link>

        <Link
          href="/players"
          className="rounded-full border border-white/15 px-5 py-3 text-sm text-white/85 transition hover:border-white/30 hover:text-white"
        >
          Browse Players
        </Link>

        <Link
          href="/download"
          className="rounded-full border border-white/15 px-5 py-3 text-sm text-white/85 transition hover:border-white/30 hover:text-white"
        >
          Download Watcher
        </Link>
      </div>

      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Entrants" value={String(tournamentEntryCount)} />
          <StatCard label="Active Lobby" value={String(onlineUserCount)} />
          <StatCard label="Recent Matches" value={String(recentMatchCount)} />
        </div>

        <WoloFeatureTile />
      </div>
    </div>
  );
}
