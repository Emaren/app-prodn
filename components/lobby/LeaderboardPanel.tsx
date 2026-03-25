import Link from "next/link";

import SteamLinkedBadge from "@/components/SteamLinkedBadge";
import type { LobbyLeaderboardSummary } from "@/lib/lobby";

type LeaderboardPanelProps = {
  leaderboard: LobbyLeaderboardSummary;
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

export function LeaderboardPanel({ leaderboard }: LeaderboardPanelProps) {
  return (
    <div className="rounded-[1.85rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-5 shadow-2xl shadow-black/20 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.35em] text-white/45">Leaderboard</div>
          <h3 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">{leaderboard.title}</h3>
        </div>

        <div className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-100">
          {leaderboard.statusLabel}
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {leaderboard.entries.length === 0 ? (
          <div className="rounded-2xl border border-white/8 bg-white/5 px-4 py-5 text-sm leading-6 text-slate-300">
            Need more final games.
          </div>
        ) : (
          leaderboard.entries.map((entry) => (
            <Link
              key={entry.key}
              href={entry.href}
              className="block rounded-2xl border border-white/8 bg-white/5 px-4 py-4 transition hover:border-amber-300/30 hover:bg-white/10"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 items-start gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-amber-300/20 bg-amber-300/10 text-sm font-semibold text-amber-100">
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
                  <div className="text-sm font-semibold text-amber-100">{entry.ratingLabel}</div>
                  <div className="mt-2 flex flex-wrap gap-2 sm:justify-end">
                    <MetricPill>{buildRecordLabel(entry)}</MetricPill>
                    <MetricPill>{buildWinRateLabel(entry)}</MetricPill>
                    {entry.streakLabel ? (
                      <MetricPill tone={entry.streakLabel.startsWith("W") ? "emerald" : "rose"}>
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

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/8 pt-4">
        <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
          {leaderboard.rankedPlayers > 0
            ? `${leaderboard.rankedPlayers} ranked warriors · min ${leaderboard.minimumMatches} games`
            : `Need ${leaderboard.minimumMatches} games to rank`}
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/players"
            className="rounded-full bg-amber-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
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
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "emerald" | "rose";
}) {
  const toneClass =
    tone === "emerald"
      ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-100"
      : tone === "rose"
        ? "border-rose-300/20 bg-rose-500/10 text-rose-100"
        : "border-white/10 bg-white/5 text-slate-200";

  return (
    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${toneClass}`}>
      {children}
    </span>
  );
}
