"use client";

import Link from "next/link";
import { type ReactNode } from "react";
import {
  getLobbyPresentationTone,
  type LobbyThemeKey,
  type LobbyViewMode,
} from "@/components/lobby/lobbyPresentation";
import {
  outcomeBadgeLabel,
  parsePlayers as parseReplayPlayers,
  readMapName,
  winnerLabel,
} from "@/lib/gameStatsView";
import type { LobbyMatchRow } from "@/lib/lobby";
import { pickLobbyMatchPlayedAt } from "@/lib/lobbyMatchTime";

type RecentMatchesPanelProps = {
  recentMatches: LobbyMatchRow[];
  themeKey: LobbyThemeKey;
  viewMode: LobbyViewMode;
};

export function RecentMatchesPanel({
  recentMatches,
  themeKey,
  viewMode,
}: RecentMatchesPanelProps) {
  const tone = getLobbyPresentationTone(themeKey, viewMode);

  return (
    <div className={`rounded-[1.75rem] border p-6 ${tone.panelShell}`}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className={`text-xs uppercase tracking-[0.35em] ${tone.eyebrow}`}>
            Match Feed
          </div>
          <h3 className="mt-2 text-2xl font-semibold text-white">
            Recent Parsed Games
          </h3>
        </div>

        <Link
          href="/game-stats"
          className={`rounded-full border px-3 py-1 text-xs transition ${tone.secondaryButton}`}
        >
          View All Matches
        </Link>
      </div>

      <div className="mt-5 space-y-3">
        {recentMatches.length === 0 ? (
          <p className={`rounded-2xl border px-4 py-5 text-sm text-slate-300 ${tone.card}`}>
            Parsed matches will show here as soon as the watcher uploads them.
          </p>
        ) : (
          recentMatches.map((match) => (
            <MatchCard
              key={match.id}
              match={match}
              themeKey={themeKey}
              viewMode={viewMode}
            />
          ))
        )}
      </div>
    </div>
  );
}

function MatchCard({
  match,
  themeKey,
  viewMode,
}: {
  match: LobbyMatchRow;
  themeKey: LobbyThemeKey;
  viewMode: LobbyViewMode;
}) {
  const tone = getLobbyPresentationTone(themeKey, viewMode);
  const players = parseReplayPlayers(match.players)
    .map((player) => String(player.name || ""))
    .filter(Boolean);

  const playedAt = pickLobbyMatchPlayedAt(match);
  const outcomeLabel = outcomeBadgeLabel(match.parse_reason, match.winner);

  return (
    <Link
      href={`/game-stats/${match.id}`}
      className={`block rounded-2xl border px-4 py-4 transition ${tone.card} ${tone.cardHover}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="font-medium text-white">{readMapName(match.map)}</div>
          <div className="mt-1 truncate text-sm text-slate-300">
            {players.join(" vs ")}
          </div>
        </div>

        <div className="shrink-0 space-y-2 text-right">
          <div className="text-xs uppercase tracking-[0.25em] text-slate-400">
            {winnerLabel(match.winner, match.parse_reason)}
          </div>
          {outcomeLabel ? (
            <ResultTypePill toneClassName={tone.resultPill}>
              {outcomeLabel}
            </ResultTypePill>
          ) : null}
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

function ResultTypePill({
  children,
  toneClassName,
}: {
  children: ReactNode;
  toneClassName: string;
}) {
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] ${toneClassName}`}
    >
      {children}
    </span>
  );
}
