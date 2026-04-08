"use client";

import Link from "next/link";
import SteamLoginButton from "@/components/SteamLoginButton";
import { LeaderboardPanel } from "@/components/lobby/LeaderboardPanel";
import {
  type LobbyThemeKey,
  type LobbyViewMode,
} from "@/components/lobby/lobbyPresentation";
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
  wolo: LobbySnapshot["wolo"];
  themeKey: LobbyThemeKey;
  viewMode: LobbyViewMode;
  onViewModeChange: (viewMode: LobbyViewMode) => void;
};

function formatCompactWolo(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
    notation: value >= 1000 ? "compact" : "standard",
  }).format(value);
}

function formatUpdatedAt(value: string | null | undefined) {
  if (!value) return "Waiting for snapshot";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Waiting for snapshot";
  return `Updated ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

export function LobbyHero({
  liveConnected,
  authError,
  authDetail,
  lobbyError,
  isAuthenticated,
  loading,
  leaderboard,
  wolo,
  themeKey,
  viewMode,
  onViewModeChange,
}: LobbyHeroProps) {
  const accentTextClassName =
    viewMode === "field" ? "text-emerald-200/70" : "text-amber-200/70";

  const primaryActionClassName =
    viewMode === "field"
      ? "rounded-full bg-emerald-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-200"
      : "rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200";

  const woloShellClassName =
    viewMode === "field"
      ? "border border-emerald-300/20 bg-emerald-950/20"
      : "border border-amber-200/15 bg-slate-950/25";

  const woloPillClassName =
    viewMode === "field"
      ? "border border-emerald-300/25 bg-emerald-400/10 text-emerald-100"
      : "border border-amber-300/20 bg-amber-300/10 text-amber-100";

  const faucetPool = wolo?.accounts.faucetgrowth?.wolo ?? null;
  const treasury = wolo?.accounts.communitytreasury?.wolo ?? null;
  const liquidity = wolo?.accounts.dexliquidity?.wolo ?? null;

  return (
    <div className="space-y-6" data-lobby-hero-stack="true">
      <div className="flex flex-wrap items-center gap-3">
        <div className={`text-sm uppercase tracking-[0.4em] ${accentTextClassName}`}>
          Community Lobby
        </div>
        <div
          className={`rounded-full px-3 py-1 text-xs ${
            liveConnected
              ? viewMode === "field"
                ? "border border-emerald-300/30 bg-emerald-500/12 text-emerald-50"
                : "border border-emerald-400/30 bg-emerald-500/10 text-emerald-100"
              : "border border-white/10 bg-white/5 text-slate-300"
          }`}
        >
          {liveConnected ? "Live updates connected" : "Polling fallback"}
        </div>

        {wolo?.enabled && (
          <div className={`rounded-full px-3 py-1 text-xs ${woloPillClassName}`}>
            WoloChain {wolo.chainId}
          </div>
        )}
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

      <LeaderboardPanel
        leaderboard={leaderboard}
        onlineCount={leaderboard.activePlayers}
        themeKey={themeKey}
        viewMode={viewMode}
        onViewModeChange={onViewModeChange}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          label="Active Players"
          value={String(leaderboard.activePlayers)}
          subtext="Online right now."
          tone="emerald"
          themeKey={themeKey}
          viewMode={viewMode}
        />
        <StatCard
          label="Matches Today"
          value={String(leaderboard.matchesToday)}
          subtext="Final games on the board."
          themeKey={themeKey}
          viewMode={viewMode}
        />
      </div>

      {wolo?.enabled && (
        <div className={`rounded-[1.5rem] p-4 sm:p-5 ${woloShellClassName}`}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.35em] text-white/45">
                WOLO Dev Rail
              </div>
              <div className="mt-1 text-sm text-white/70">
                Local chain snapshot feeding AoE2HDBets dev mode.
              </div>
            </div>
            <div className="text-xs text-white/45">{formatUpdatedAt(wolo.updatedAt)}</div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard
              label="Faucet Pool"
              value={formatCompactWolo(faucetPool)}
              subtext="Daily claim fuel."
              tone="emerald"
              themeKey={themeKey}
              viewMode={viewMode}
            />
            <StatCard
              label="Treasury"
              value={formatCompactWolo(treasury)}
              subtext="Community war chest."
              themeKey={themeKey}
              viewMode={viewMode}
            />
            <StatCard
              label="DEX Liquidity"
              value={formatCompactWolo(liquidity)}
              subtext="Reserved market depth."
              themeKey={themeKey}
              viewMode={viewMode}
            />
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {isAuthenticated ? (
          <Link href="/profile" className={`${primaryActionClassName} block text-center`}>
            Open Profile
          </Link>
        ) : (
          <SteamLoginButton
            className={`${primaryActionClassName} block w-full text-center`}
            label={loading ? "Loading..." : "Claim Your Steam Identity"}
            disabled={loading}
          />
        )}

        <Link
          href={isAuthenticated ? "/upload" : "/download"}
          className="block rounded-full border border-white/15 px-5 py-3 text-center text-sm text-white/85 transition hover:border-white/30 hover:text-white"
        >
          {isAuthenticated ? "Upload Replay" : "Download Watcher"}
        </Link>

        <Link
          href="/rivalries"
          className="block rounded-full border border-white/15 px-5 py-3 text-center text-sm text-white/85 transition hover:border-white/30 hover:text-white"
        >
          View Rivalries
        </Link>
      </div>
    </div>
  );
}
