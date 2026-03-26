import Link from "next/link";

import SteamLinkedBadge from "@/components/SteamLinkedBadge";
import {
  LOBBY_THEME_OPTIONS,
  LOBBY_VIEW_OPTIONS,
  type LobbyThemeKey,
  type LobbyViewMode,
} from "@/components/lobby/lobbyPresentation";
import type { LobbyLeaderboardSummary } from "@/lib/lobby";

type LeaderboardPanelProps = {
  leaderboard: LobbyLeaderboardSummary;
  themeKey: LobbyThemeKey;
  viewMode: LobbyViewMode;
  onThemeChange: (themeKey: LobbyThemeKey) => void;
  onViewModeChange: (viewMode: LobbyViewMode) => void;
};

function formatLastGame(value: string | null) {
  if (!value) {
    return "Pending";
  }

  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function buildRecordLabel(entry: LobbyLeaderboardSummary["entries"][number]) {
  const base = `${entry.wins}-${entry.losses}`;
  return entry.unknowns > 0 ? `${base} · ${entry.unknowns} unk` : base;
}

function buildWinRateLabel(entry: LobbyLeaderboardSummary["entries"][number]) {
  const resolvedMatches = entry.wins + entry.losses;
  if (resolvedMatches <= 0) {
    return "0% WR";
  }

  return `${Math.round((entry.wins / resolvedMatches) * 100)}% WR`;
}

function buildPanelTone(viewMode: LobbyViewMode) {
  if (viewMode === "field") {
    return {
      shell:
        "border-emerald-400/20 bg-[linear-gradient(180deg,rgba(74,222,128,0.12),rgba(15,23,42,0.68))] shadow-[0_24px_60px_rgba(5,46,22,0.32)]",
      eyebrow: "text-emerald-100/55",
      count: "text-emerald-50",
      countLabel: "text-emerald-100/55",
      status: "border-emerald-300/25 bg-emerald-500/15 text-emerald-50",
      entry:
        "border-emerald-200/12 bg-emerald-950/20 hover:border-emerald-300/35 hover:bg-emerald-500/10",
      rankBadge: "border-emerald-300/25 bg-emerald-500/14 text-emerald-50",
      rating: "text-emerald-100",
      primaryButton:
        "bg-emerald-300 text-slate-950 hover:bg-emerald-200 focus-visible:outline-emerald-200",
      viewToggle:
        "border-emerald-200/12 bg-emerald-950/25 text-emerald-50/85",
      viewToggleActive: "bg-emerald-300 text-slate-950",
      circleRing: "ring-emerald-200",
      metricDefault: "border-emerald-200/12 bg-emerald-950/25 text-emerald-50/90",
    };
  }

  return {
    shell:
      "border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] shadow-2xl shadow-black/20",
    eyebrow: "text-white/45",
    count: "text-white",
    countLabel: "text-white/45",
    status: "border-emerald-400/25 bg-emerald-500/10 text-emerald-100",
    entry: "border-white/8 bg-white/5 hover:border-amber-300/30 hover:bg-white/10",
    rankBadge: "border-amber-300/20 bg-amber-300/10 text-amber-100",
    rating: "text-amber-100",
    primaryButton:
      "bg-amber-300 text-slate-950 hover:bg-amber-200 focus-visible:outline-amber-200",
    viewToggle: "border-white/12 bg-white/5 text-slate-200/80",
    viewToggleActive: "bg-white text-slate-950",
    circleRing: "ring-white",
    metricDefault: "border-white/10 bg-white/5 text-slate-200",
  };
}

export function LeaderboardPanel({
  leaderboard,
  themeKey,
  viewMode,
  onThemeChange,
  onViewModeChange,
}: LeaderboardPanelProps) {
  const tone = buildPanelTone(viewMode);

  return (
    <div className={`rounded-[1.85rem] border p-5 transition-all duration-300 sm:p-6 ${tone.shell}`}>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className={`text-xs uppercase tracking-[0.35em] ${tone.eyebrow}`}>Leaderboard</div>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div className={`text-5xl font-semibold tracking-tight tabular-nums ${tone.count}`}>
              {leaderboard.trackedPlayers}
            </div>
            <div className={`pb-2 text-[11px] uppercase tracking-[0.34em] ${tone.countLabel}`}>
              Players On Board
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 lg:items-end">
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <div className={`rounded-full border px-3 py-1 text-xs font-medium ${tone.status}`}>
              {leaderboard.statusLabel}
            </div>

            <div className={`inline-flex rounded-full border p-1 ${tone.viewToggle}`}>
              {LOBBY_VIEW_OPTIONS.map((option) => {
                const isActive = option.key === viewMode;
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => onViewModeChange(option.key)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                      isActive ? tone.viewToggleActive : "text-current hover:bg-white/10"
                    }`}
                    aria-pressed={isActive}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 lg:justify-end">
            {LOBBY_THEME_OPTIONS.map((option) => {
              const isActive = option.key === themeKey;
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => onThemeChange(option.key)}
                  className={`h-8 w-8 rounded-full border border-white/10 transition hover:scale-105 ${
                    isActive ? `ring-2 ring-offset-2 ring-offset-slate-950 ${tone.circleRing}` : ""
                  }`}
                  style={{ backgroundImage: option.swatch }}
                  title={option.label}
                  aria-label={`${option.label} theme`}
                  aria-pressed={isActive}
                />
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-6 max-h-[58vh] space-y-3 overflow-y-auto pr-2 sm:max-h-[62vh] lg:max-h-[46rem]">
        {leaderboard.entries.length === 0 ? (
          <div className="rounded-2xl border border-white/8 bg-white/5 px-4 py-5 text-sm leading-6 text-slate-300">
            Need more final games.
          </div>
        ) : (
          leaderboard.entries.map((entry) => (
            <Link
              key={entry.key}
              href={entry.href}
              className={`block rounded-2xl border px-4 py-4 transition ${tone.entry}`}
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 items-start gap-4">
                  <div
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border text-sm font-semibold ${tone.rankBadge}`}
                  >
                    #{entry.rank}
                  </div>

                  <div className="min-w-0">
                    <div className="truncate text-lg font-semibold text-white">{entry.name}</div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {entry.verified ? (
                        <SteamLinkedBadge compact label="Steam" />
                      ) : (
                        <MiniTag>{entry.claimed ? "Claimed" : "Claimable"}</MiniTag>
                      )}
                      {entry.isOnline ? <MiniTag tone="emerald">Online</MiniTag> : null}
                      {entry.provisional ? <MiniTag>Provisional</MiniTag> : null}
                    </div>
                  </div>
                </div>

                <div className="sm:text-right">
                  <div className="text-[10px] uppercase tracking-[0.28em] text-slate-400">
                    {entry.primaryRatingSourceLabel}
                  </div>
                  <div className={`mt-1 text-lg font-semibold ${tone.rating}`}>
                    {entry.primaryRatingLabel}
                  </div>
                  {entry.secondaryRatingLabel ? (
                    <div className="mt-1 text-xs text-slate-400">{entry.secondaryRatingLabel}</div>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-2 sm:justify-end">
                    <MetricPill toneClassName={tone.metricDefault}>{buildRecordLabel(entry)}</MetricPill>
                    <MetricPill toneClassName={tone.metricDefault}>{buildWinRateLabel(entry)}</MetricPill>
                    {entry.streakLabel ? (
                      <MetricPill toneClassName={entry.streakLabel.startsWith("W") ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-100" : "border-rose-300/20 bg-rose-500/10 text-rose-100"}>
                        {entry.streakLabel}
                      </MetricPill>
                    ) : null}
                  </div>
                  <div className="mt-3 text-xs text-slate-400">
                    Last game {formatLastGame(entry.lastPlayedAt)}
                  </div>
                </div>
              </div>
            </Link>
          ))
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-end gap-3 border-t border-white/8 pt-4">
        <Link
          href="/players"
          className={`rounded-full px-4 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${tone.primaryButton}`}
        >
          Players
        </Link>
        <Link
          href="/rivalries"
          className="rounded-full border border-white/15 px-4 py-2 text-sm text-white/85 transition hover:border-white/30 hover:text-white"
        >
          Rivalries
        </Link>
      </div>
    </div>
  );
}

function MiniTag({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "emerald";
}) {
  const toneClass =
    tone === "emerald"
      ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-100"
      : "border-white/10 bg-white/5 text-slate-300";

  return (
    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${toneClass}`}>
      {children}
    </span>
  );
}

function MetricPill({
  children,
  toneClassName,
}: {
  children: React.ReactNode;
  toneClassName: string;
}) {
  return (
    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${toneClassName}`}>
      {children}
    </span>
  );
}
