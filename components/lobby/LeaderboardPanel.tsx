import Link from "next/link";

import SteamLinkedBadge from "@/components/SteamLinkedBadge";
import {
  getLobbyPresentationTone,
  type LobbyThemeKey,
  type LobbyViewMode,
} from "@/components/lobby/lobbyPresentation";
import { LobbyViewToggle } from "@/components/lobby/LobbyAppearanceControls";
import type { LobbyLeaderboardSummary } from "@/lib/lobby";

type LeaderboardPanelProps = {
  leaderboard: LobbyLeaderboardSummary;
  onlineCount: number;
  themeKey: LobbyThemeKey;
  viewMode: LobbyViewMode;
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

export function LeaderboardPanel({
  leaderboard,
  onlineCount,
  themeKey,
  viewMode,
  onViewModeChange,
}: LeaderboardPanelProps) {
  const tone = getLobbyPresentationTone(themeKey, viewMode);

  return (
    <div
      className={`relative rounded-[1.85rem] border p-5 transition-all duration-300 sm:p-6 ${tone.panelShell}`}
    >
      <div className="flex flex-col gap-5">
        <div className="min-w-0 pr-28 sm:pr-32">
          <div className={`text-xs uppercase tracking-[0.35em] ${tone.eyebrow}`}>Leaderboard</div>
          <div className="mt-4 flex flex-wrap items-end gap-8 sm:gap-10">
            <div className={`text-5xl font-semibold tracking-tight tabular-nums ${tone.count}`}>
              {leaderboard.trackedPlayers}
            </div>
          </div>
          <div className={`mt-2 text-[11px] uppercase tracking-[0.34em] ${tone.countLabel}`}>
            Players On Board
          </div>
        </div>

        <div className="absolute right-5 top-5 sm:right-6 sm:top-6">
          <div className={`rounded-full border px-3 py-1 text-xs font-medium ${tone.activeBadge}`}>
            {onlineCount} Online
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <div className={`rounded-full border px-3 py-1 text-xs font-medium ${tone.statusBadge}`}>
              {leaderboard.statusLabel}
            </div>

            <LobbyViewToggle
              viewMode={viewMode}
              onViewModeChange={onViewModeChange}
              tone={tone}
            />
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
              className={`block rounded-2xl border px-4 py-4 transition ${tone.card} ${tone.cardHover}`}
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
                        <MiniTag toneClassName={tone.neutralPill}>
                          {entry.claimed ? "Claimed" : "Claimable"}
                        </MiniTag>
                      )}
                      {entry.isOnline ? <MiniTag toneClassName={tone.activeBadge}>Online</MiniTag> : null}
                      {entry.provisional ? <MiniTag toneClassName={tone.neutralPill}>Provisional</MiniTag> : null}
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
                    <MetricPill toneClassName={tone.neutralPill}>{buildRecordLabel(entry)}</MetricPill>
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

      <div className={`mt-5 flex flex-wrap items-center justify-end gap-3 border-t pt-4 ${tone.divider}`}>
        <Link
          href="/players"
          className={`rounded-full px-4 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${tone.primaryButton}`}
        >
          Players
        </Link>
        <Link
          href="/rivalries"
          className={`rounded-full border px-4 py-2 text-sm transition ${tone.secondaryButton}`}
        >
          Rivalries
        </Link>
      </div>
    </div>
  );
}

function MiniTag({
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
