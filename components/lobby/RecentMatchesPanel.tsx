"use client";

import Link from "next/link";
import { type ReactNode } from "react";
import {
  outcomeBadgeLabel,
  parsePlayers as parseReplayPlayers,
  readMapName,
  winnerLabel,
} from "@/lib/gameStatsView";
import type { LobbyMatchRow } from "@/lib/lobby";

type RecentMatchesPanelProps = {
  recentMatches: LobbyMatchRow[];
};

export function RecentMatchesPanel({ recentMatches }: RecentMatchesPanelProps) {
  return (
    <div className="rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.35em] text-white/45">Match Feed</div>
          <h3 className="mt-2 text-2xl font-semibold text-white">Recent Parsed Games</h3>
        </div>

        <Link
          href="/game-stats"
          className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300 transition hover:border-white/20 hover:text-white"
        >
          View All Matches
        </Link>
      </div>

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
  );
}

function MatchCard({ match }: { match: LobbyMatchRow }) {
  const players = parseReplayPlayers(match.players)
    .map((player) => String(player.name || ""))
    .filter(Boolean);

  const playedAt = match.played_on || match.timestamp;
  const outcomeLabel = outcomeBadgeLabel(match.parse_reason, match.winner);

  return (
    <Link
      href={`/game-stats/${match.id}`}
      className="block rounded-2xl border border-white/8 bg-white/5 px-4 py-4 transition hover:border-sky-300/30 hover:bg-white/10"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="font-medium text-white">{readMapName(match.map)}</div>
          <div className="mt-1 truncate text-sm text-slate-300">{players.join(" vs ")}</div>
        </div>

        <div className="shrink-0 space-y-2 text-right">
          <div className="text-xs uppercase tracking-[0.25em] text-slate-400">
            {winnerLabel(match.winner, match.parse_reason)}
          </div>
          {outcomeLabel ? <ResultTypePill>{outcomeLabel}</ResultTypePill> : null}
        </div>
      </div>

      {playedAt && (
        <div className="mt-3 text-xs text-slate-400">
          {new Date(playedAt).toLocaleString()}
        </div>
      )}
    </Link>
  );
}

function ResultTypePill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex rounded-full border border-amber-300/20 bg-amber-400/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-amber-100">
      {children}
    </span>
  );
}
