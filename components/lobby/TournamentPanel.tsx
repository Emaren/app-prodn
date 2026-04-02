"use client";

import Link from "next/link";
import {
  getLobbyPresentationTone,
  type LobbyThemeKey,
  type LobbyViewMode,
} from "@/components/lobby/lobbyPresentation";
import { getTournamentMatchStatusLabel, getTournamentStatusLabel, type LobbySnapshot } from "@/lib/lobby";
import { displayMatchPlayer, displayName, formatTournamentWindow } from "@/components/lobby/utils";

type TournamentPanelProps = {
  tournament: LobbySnapshot["tournament"];
  themeKey: LobbyThemeKey;
  viewMode: LobbyViewMode;
  isAdmin: boolean;
  isAuthenticated: boolean;
  joinPending: boolean;
  joinError: string | null;
  onJoinTournament: () => void;
  onLogin: () => void;
};

export function TournamentPanel({
  tournament,
  themeKey,
  viewMode,
  isAdmin,
  isAuthenticated,
  joinPending,
  joinError,
  onJoinTournament,
  onLogin,
}: TournamentPanelProps) {
  const tone = getLobbyPresentationTone(themeKey, viewMode);

  return (
    <div className={`flex flex-col rounded-[1.75rem] border p-6 pt-7 ${tone.panelShell}`}>
      <div className="flex items-start justify-between gap-4">
        <div className={`text-xs uppercase tracking-[0.35em] ${tone.accentText}`}>
          Next Tournament
        </div>
        <div className={`rounded-full border px-3 py-1 text-xs font-medium ${tone.statusBadge}`}>
          {getTournamentStatusLabel(tournament.status)}
        </div>
      </div>

      <div className="mt-4 flex flex-1 flex-col space-y-3">
        <h3 className="text-2xl font-semibold text-white">{tournament.title}</h3>
        <p className="text-sm text-slate-300">
          <span className="font-semibold text-white">{tournament.format}</span>
          {" · "}
          {formatTournamentWindow(tournament.startsAt)}
        </p>
        <p className="text-sm leading-6 text-slate-300">{tournament.description}</p>

        <div className={`rounded-2xl border p-4 ${tone.insetPanel}`}>
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.25em] text-slate-400">Join Queue</div>
              <div className="mt-1 text-lg font-semibold text-white">
                {tournament.entryCount} {tournament.entryCount === 1 ? "entrant" : "entrants"}
              </div>
            </div>
            {isAdmin && (
              <Link
                href="/admin"
                className={`rounded-full border px-4 py-2 text-xs transition ${tone.secondaryButton}`}
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
                  className={`rounded-full border px-3 py-2 text-xs text-white ${tone.neutralPill}`}
                >
                  {displayName(entrant.inGameName, entrant.steamPersonaName)}
                </div>
              ))
            )}
          </div>
        </div>

        <div className={`rounded-2xl border p-4 ${tone.insetPanel}`}>
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.25em] text-slate-400">Bracket Preview</div>
              <div className="mt-1 text-lg font-semibold text-white">
                {tournament.matches.length} {tournament.matches.length === 1 ? "match" : "matches"}
              </div>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {tournament.matches.length === 0 ? (
              <div className="text-sm text-slate-400">
                No bracket matches posted yet. Once the first pairings are set, they will appear here
                live.
              </div>
            ) : (
              tournament.matches.slice(0, 3).map((match) => (
                <div key={match.id} className={`rounded-2xl border px-4 py-4 ${tone.card}`}>
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
                      <div className={`rounded-full border px-3 py-1 text-xs ${tone.neutralPill}`}>
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

        <div className="mt-auto flex flex-wrap gap-3 pt-1">
          <button
            type="button"
            onClick={onJoinTournament}
            disabled={joinPending || tournament.isFallback || tournament.status === "completed"}
            className={`rounded-full px-5 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${tone.primaryButton}`}
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
              onClick={onLogin}
              className={`rounded-full border px-5 py-3 text-sm transition ${tone.secondaryButton}`}
            >
              Sign In To Join
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
