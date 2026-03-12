"use client";

import Link from "next/link";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { useUserAuth } from "@/context/UserAuthContext";
import {
  type AdminReplayCandidate,
  getFallbackTournament,
  getTournamentMatchStatusLabel,
  getTournamentStatusLabel,
  TOURNAMENT_MATCH_STATUSES,
  TOURNAMENT_STATUSES,
  type LobbyTournamentMatchProof,
  type LobbyTournament,
  type LobbyTournamentEntrant,
  type LobbyTournamentMatch,
} from "@/lib/lobby";
import { inferReplayWinnerEntryId } from "@/lib/replayProof";

type FormState = {
  id: number | null;
  title: string;
  description: string;
  format: string;
  status: string;
  startsAt: string;
};

type MatchDraft = {
  id: number | null;
  round: string;
  position: string;
  label: string;
  status: string;
  playerOneEntryId: string;
  playerTwoEntryId: string;
  winnerEntryId: string;
  sourceGameStatsId: string;
  scheduledAt: string;
  proof: LobbyTournamentMatchProof | null;
};

function toFormState(tournament: LobbyTournament | null): FormState {
  const base = tournament ?? getFallbackTournament(false);
  return {
    id: base.id,
    title: base.title,
    description: base.description,
    format: base.format,
    status: base.status,
    startsAt: base.startsAt ? toDateTimeLocal(base.startsAt) : "",
  };
}

function toMatchDraft(match?: LobbyTournamentMatch): MatchDraft {
  return {
    id: match?.id ?? null,
    round: String(match?.round ?? 1),
    position: String(match?.position ?? 1),
    label: match?.label ?? "",
    status: match?.status ?? "scheduled",
    playerOneEntryId: match?.playerOne?.entryId ? String(match.playerOne.entryId) : "",
    playerTwoEntryId: match?.playerTwo?.entryId ? String(match.playerTwo.entryId) : "",
    winnerEntryId: match?.winnerEntryId ? String(match.winnerEntryId) : "",
    sourceGameStatsId: match?.sourceGameStatsId ? String(match.sourceGameStatsId) : "",
    scheduledAt: match?.scheduledAt ? toDateTimeLocal(match.scheduledAt) : "",
    proof: match?.proof ?? null,
  };
}

function findEntrantByEntryId(entrants: LobbyTournamentEntrant[], value: string) {
  const entryId = Number(value);
  if (!Number.isFinite(entryId) || entryId < 1) return null;
  return entrants.find((entrant) => entrant.entryId === entryId) ?? null;
}

function getCompatibleReplayCandidates(
  match: MatchDraft,
  replayCandidates: AdminReplayCandidate[],
  usedReplayIds: Set<number>
) {
  const playerOneId = Number(match.playerOneEntryId);
  const playerTwoId = Number(match.playerTwoEntryId);
  if (!Number.isFinite(playerOneId) || !Number.isFinite(playerTwoId)) {
    return [];
  }

  return replayCandidates.filter(
    (candidate) =>
      (!usedReplayIds.has(candidate.gameStatsId) ||
        String(candidate.gameStatsId) === match.sourceGameStatsId) &&
      candidate.matchedEntryIds.includes(playerOneId) &&
      candidate.matchedEntryIds.includes(playerTwoId)
  );
}

function formatReplayCandidateLabel(candidate: AdminReplayCandidate) {
  const players =
    candidate.players.length > 0
      ? candidate.players.map((player) => player.name).join(" vs ")
      : "Unknown players";
  const playedOn = candidate.playedOn
    ? new Date(candidate.playedOn).toLocaleString()
    : "Unknown time";
  const mapName = candidate.mapName || "Unknown map";

  return `#${candidate.gameStatsId} · ${players} · ${mapName} · ${playedOn}`;
}

export default function AdminPage() {
  const { isAuthenticated, isAdmin } = useUserAuth();
  const [form, setForm] = useState<FormState>(() => toFormState(null));
  const [tournament, setTournament] = useState<LobbyTournament | null>(null);
  const [entrants, setEntrants] = useState<LobbyTournamentEntrant[]>([]);
  const [matches, setMatches] = useState<MatchDraft[]>([]);
  const [replayCandidates, setReplayCandidates] = useState<AdminReplayCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingBracket, setSavingBracket] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [bracketError, setBracketError] = useState<string | null>(null);
  const [bracketNotice, setBracketNotice] = useState<string | null>(null);
  const usedReplayIds = new Set(
    matches
      .map((match) => (match.sourceGameStatsId ? Number(match.sourceGameStatsId) : null))
      .filter((id): id is number => typeof id === "number" && Number.isFinite(id) && id > 0)
  );

  useEffect(() => {
    if (!isAuthenticated || !isAdmin) {
      setLoading(false);
      return;
    }

    let active = true;

    (async () => {
      try {
        const [tournamentResponse, matchesResponse] = await Promise.all([
          fetch("/api/admin/tournament", { cache: "no-store" }),
          fetch("/api/admin/tournament/matches", { cache: "no-store" }),
        ]);

        const tournamentPayload = (await tournamentResponse.json().catch(() => ({}))) as
          | { detail?: string; tournament?: LobbyTournament }
          | Record<string, unknown>;
        const matchesPayload = (await matchesResponse.json().catch(() => ({}))) as
          | {
              detail?: string;
              entrants?: LobbyTournamentEntrant[];
              matches?: LobbyTournamentMatch[];
              replayCandidates?: AdminReplayCandidate[];
            }
          | Record<string, unknown>;

        if (!tournamentResponse.ok) {
          throw new Error(
            typeof tournamentPayload.detail === "string"
              ? tournamentPayload.detail
              : "Failed to load tournament."
          );
        }

        if (!matchesResponse.ok) {
          throw new Error(
            typeof matchesPayload.detail === "string"
              ? matchesPayload.detail
              : "Failed to load bracket."
          );
        }

        if (!active) return;

        const nextTournament =
          (tournamentPayload.tournament as LobbyTournament) || getFallbackTournament(false);
        const nextEntrants = Array.isArray(matchesPayload.entrants)
          ? (matchesPayload.entrants as LobbyTournamentEntrant[])
          : nextTournament.entrants;
        const nextMatches = Array.isArray(matchesPayload.matches)
          ? (matchesPayload.matches as LobbyTournamentMatch[])
          : nextTournament.matches;
        const nextReplayCandidates = Array.isArray(matchesPayload.replayCandidates)
          ? (matchesPayload.replayCandidates as AdminReplayCandidate[])
          : [];

        setTournament(nextTournament);
        setForm(toFormState(nextTournament));
        setEntrants(nextEntrants);
        setMatches(nextMatches.map(toMatchDraft));
        setReplayCandidates(nextReplayCandidates);
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load tournament.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [isAdmin, isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-3xl py-10 text-white">
        <div className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-8">
          <h1 className="text-3xl font-semibold">Admin</h1>
          <p className="mt-4 text-sm text-slate-300">
            Admin routes now sit behind the signed session model. Sign in first, then open the dedicated admin pages.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex rounded-full border border-white/15 px-5 py-3 text-sm text-white/85 transition hover:border-white/30 hover:text-white"
          >
            Back To Lobby
          </Link>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-3xl py-10 text-white">
        <div className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-8">
          <h1 className="text-3xl font-semibold">Admin</h1>
          <p className="mt-4 text-sm text-slate-300">
            Your account is signed in, but it does not have admin access.
          </p>
        </div>
      </div>
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setSaving(true);
      setError(null);
      setNotice(null);

      const response = await fetch("/api/admin/tournament", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: form.id,
          title: form.title,
          description: form.description,
          format: form.format,
          status: form.status,
          startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as
        | { detail?: string; tournament?: LobbyTournament }
        | Record<string, unknown>;

      if (!response.ok) {
        throw new Error(typeof payload.detail === "string" ? payload.detail : "Save failed.");
      }

      const nextTournament = (payload.tournament as LobbyTournament) || null;
      setTournament(nextTournament);
      setForm(toFormState(nextTournament));
      setEntrants(nextTournament?.entrants ?? []);
      setMatches((nextTournament?.matches ?? []).map(toMatchDraft));
      setReplayCandidates([]);
      setNotice("Featured tournament updated.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  function updateMatch(index: number, key: keyof MatchDraft, value: string) {
    setMatches((current) =>
      current.map((match, idx) => {
        if (idx !== index) return match;

        const next = { ...match, [key]: value };

        if (key === "playerOneEntryId" || key === "playerTwoEntryId") {
          const selectedReplay = next.sourceGameStatsId
            ? replayCandidates.find(
                (candidate) => String(candidate.gameStatsId) === next.sourceGameStatsId
              )
            : null;
          if (
            selectedReplay &&
            !getCompatibleReplayCandidates(next, replayCandidates, usedReplayIds).some(
              (candidate) => candidate.gameStatsId === selectedReplay.gameStatsId
            )
          ) {
            next.sourceGameStatsId = "";
            next.proof = null;
          }
        }

        if (key === "sourceGameStatsId") {
          const selectedReplay = value
            ? replayCandidates.find((candidate) => String(candidate.gameStatsId) === value)
            : null;
          const playerOne = findEntrantByEntryId(entrants, next.playerOneEntryId);
          const playerTwo = findEntrantByEntryId(entrants, next.playerTwoEntryId);
          const inferredWinnerEntryId =
            selectedReplay && playerOne && playerTwo
              ? inferReplayWinnerEntryId(selectedReplay, playerOne, playerTwo)
              : null;

          if (inferredWinnerEntryId) {
            next.winnerEntryId = String(inferredWinnerEntryId);
            next.status = "completed";
          }
          next.proof = selectedReplay ?? null;
        }

        return next;
      })
    );
  }

  function addMatch() {
    setMatches((current) => {
      const highestPosition = current
        .map((match) => Number(match.position) || 0)
        .reduce((max, value) => Math.max(max, value), 0);

      return [...current, { ...toMatchDraft(), position: String(highestPosition + 1) }];
    });
  }

  function removeMatch(index: number) {
    setMatches((current) => current.filter((_, idx) => idx !== index));
  }

  async function saveBracket() {
    if (!form.id) {
      setBracketError("Save the tournament card first, then add bracket matches.");
      return;
    }

    try {
      setSavingBracket(true);
      setBracketError(null);
      setBracketNotice(null);

      const response = await fetch("/api/admin/tournament/matches", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tournamentId: form.id,
          matches: matches.map((match) => ({
            id: match.id,
            round: Number(match.round || 1),
            position: Number(match.position || 1),
            label: match.label,
            status: match.status,
            playerOneEntryId: match.playerOneEntryId ? Number(match.playerOneEntryId) : null,
            playerTwoEntryId: match.playerTwoEntryId ? Number(match.playerTwoEntryId) : null,
            winnerEntryId: match.winnerEntryId ? Number(match.winnerEntryId) : null,
            sourceGameStatsId: match.sourceGameStatsId ? Number(match.sourceGameStatsId) : null,
            scheduledAt: match.scheduledAt ? new Date(match.scheduledAt).toISOString() : null,
          })),
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as
        | {
            detail?: string;
            entrants?: LobbyTournamentEntrant[];
            matches?: LobbyTournamentMatch[];
            replayCandidates?: AdminReplayCandidate[];
          }
        | Record<string, unknown>;

      if (!response.ok) {
        throw new Error(typeof payload.detail === "string" ? payload.detail : "Bracket save failed.");
      }

      const nextEntrants = Array.isArray(payload.entrants)
        ? (payload.entrants as LobbyTournamentEntrant[])
        : entrants;
      const nextMatches = Array.isArray(payload.matches)
        ? (payload.matches as LobbyTournamentMatch[])
        : [];
      const nextReplayCandidates = Array.isArray(payload.replayCandidates)
        ? (payload.replayCandidates as AdminReplayCandidate[])
        : replayCandidates;

      setEntrants(nextEntrants);
      setMatches(nextMatches.map(toMatchDraft));
      setReplayCandidates(nextReplayCandidates);
      setTournament((current) =>
        current
          ? {
              ...current,
              entrants: nextEntrants,
              matches: nextMatches,
            }
          : current
      );
      setBracketNotice("Bracket updated. Linked parsed replays now count as proof-backed results.");
    } catch (saveError) {
      setBracketError(
        saveError instanceof Error ? saveError.message : "Bracket save failed."
      );
    } finally {
      setSavingBracket(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 py-10 text-white">
      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-semibold">Admin</h1>
              <p className="mt-4 text-sm text-slate-300">
                This is the control point for the homepage tournament card and live bracket.
              </p>
            </div>
            <Link
              href="/admin/user-list"
              className="inline-flex rounded-full border border-white/15 px-5 py-3 text-sm text-white/85 transition hover:border-white/30 hover:text-white"
            >
              Open User List
            </Link>
          </div>

          <form className="mt-8 space-y-5" onSubmit={(event) => void handleSubmit(event)}>
            <label className="block space-y-2">
              <span className="text-sm text-slate-300">Title</span>
              <input
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none focus:border-amber-300/50"
                placeholder="Spring Ladder Cup"
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm text-slate-300">Description</span>
              <textarea
                value={form.description}
                onChange={(event) =>
                  setForm((current) => ({ ...current, description: event.target.value }))
                }
                rows={5}
                className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none focus:border-amber-300/50"
                placeholder="Short tournament pitch, stakes, and who should join."
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-3">
              <label className="block space-y-2">
                <span className="text-sm text-slate-300">Format</span>
                <input
                  value={form.format}
                  onChange={(event) => setForm((current) => ({ ...current, format: event.target.value }))}
                  className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none focus:border-amber-300/50"
                  placeholder="1v1 AoE2HD showcase"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm text-slate-300">Status</span>
                <select
                  value={form.status}
                  onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}
                  className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none focus:border-amber-300/50"
                >
                  {TOURNAMENT_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {getTournamentStatusLabel(status)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-2">
                <span className="text-sm text-slate-300">Starts At</span>
                <input
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, startsAt: event.target.value }))
                  }
                  className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none focus:border-amber-300/50"
                />
              </label>
            </div>

            {error && (
              <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                {error}
              </div>
            )}

            {notice && (
              <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                {notice}
              </div>
            )}

            <button
              type="submit"
              disabled={saving}
              className="rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Featured Tournament"}
            </button>
          </form>
        </div>

        <div className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-8">
          <div className="text-xs uppercase tracking-[0.35em] text-white/45">Preview</div>
          <h2 className="mt-2 text-2xl font-semibold text-white">
            {loading ? "Loading..." : tournament?.title || form.title || "Featured Tournament"}
          </h2>
          <p className="mt-3 text-sm text-slate-300">
            {tournament?.description || form.description || "No tournament has been published yet."}
          </p>

          <div className="mt-6 space-y-4 rounded-[1.5rem] border border-white/8 bg-white/5 p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm text-slate-300">{tournament?.format || form.format}</div>
              <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
                {getTournamentStatusLabel((tournament?.status || form.status) as LobbyTournament["status"])}
              </div>
            </div>
            <div className="text-3xl font-semibold text-white">{tournament?.entryCount || 0}</div>
            <div className="text-sm text-slate-400">Current entrants</div>
            <div className="text-sm text-slate-300">
              {form.startsAt ? `Starts ${new Date(form.startsAt).toLocaleString()}` : "Start time not set"}
            </div>
            <div className="pt-2 text-sm text-slate-300">
              {matches.length} bracket {matches.length === 1 ? "match" : "matches"} configured
            </div>
            <div className="text-sm text-slate-400">
              {matches.filter((match) => match.sourceGameStatsId).length} replay-backed
            </div>
          </div>
        </div>
      </div>

      <section className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.35em] text-white/45">Bracket</div>
            <h2 className="mt-2 text-2xl font-semibold">Match Control And Replay Proof</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
              Assign entrants to match slots, then attach parsed replays when they exist so winners come from proof instead of manual entry.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={addMatch}
              className="rounded-full border border-white/15 px-5 py-3 text-sm text-white/85 transition hover:border-white/30 hover:text-white"
            >
              Add Match
            </button>
            <button
              type="button"
              onClick={() => void saveBracket()}
              disabled={savingBracket || !form.id}
              className="rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {savingBracket ? "Saving Bracket..." : "Save Bracket"}
            </button>
          </div>
        </div>

        {bracketError && (
          <div className="mt-6 rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {bracketError}
          </div>
        )}

        {bracketNotice && (
          <div className="mt-6 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            {bracketNotice}
          </div>
        )}

        <div className="mt-6 grid gap-6 lg:grid-cols-[0.7fr_1.3fr]">
          <div className="rounded-[1.5rem] border border-white/8 bg-white/5 p-5">
            <div className="text-sm font-medium text-white">Joined Entrants</div>
            <div className="mt-4 space-y-3">
              {entrants.length === 0 ? (
                <div className="text-sm text-slate-400">
                  No entrants yet. Players need to join the featured tournament before you can assign matches.
                </div>
              ) : (
                entrants.map((entrant) => (
                  <div
                    key={entrant.entryId ?? entrant.uid}
                    className="rounded-2xl border border-white/8 bg-slate-950/60 px-4 py-3"
                  >
                    <div className="font-medium text-white">
                      {entrant.inGameName || entrant.steamPersonaName || entrant.uid}
                    </div>
                    <div className="mt-1 text-xs uppercase tracking-[0.25em] text-slate-400">
                      Entry #{entrant.entryId}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="space-y-4">
            {matches.length === 0 ? (
              <div className="rounded-[1.5rem] border border-white/8 bg-white/5 px-5 py-6 text-sm text-slate-300">
                No bracket matches configured yet.
              </div>
            ) : (
              matches.map((match, index) => (
                <div
                  key={match.id ?? `draft-${index}`}
                  className="rounded-[1.5rem] border border-white/8 bg-white/5 p-5"
                >
                  {(() => {
                    const compatibleReplays = getCompatibleReplayCandidates(
                      match,
                      replayCandidates,
                      usedReplayIds
                    );
                    const linkedReplay =
                      match.proof ??
                      (match.sourceGameStatsId
                        ? replayCandidates.find(
                            (candidate) => String(candidate.gameStatsId) === match.sourceGameStatsId
                          ) ?? null
                        : null);

                    return (
                      <>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <Field label="Round">
                      <input
                        value={match.round}
                        onChange={(event) => updateMatch(index, "round", event.target.value)}
                        className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none focus:border-amber-300/50"
                      />
                    </Field>

                    <Field label="Position">
                      <input
                        value={match.position}
                        onChange={(event) => updateMatch(index, "position", event.target.value)}
                        className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none focus:border-amber-300/50"
                      />
                    </Field>

                    <Field label="Label">
                      <input
                        value={match.label}
                        onChange={(event) => updateMatch(index, "label", event.target.value)}
                        placeholder="Quarterfinal A"
                        className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none focus:border-amber-300/50"
                      />
                    </Field>

                    <Field label="Status">
                      <select
                        value={match.status}
                        onChange={(event) => updateMatch(index, "status", event.target.value)}
                        className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none focus:border-amber-300/50"
                      >
                        {TOURNAMENT_MATCH_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {getTournamentMatchStatusLabel(status)}
                          </option>
                        ))}
                      </select>
                    </Field>

                    <Field label="Player One">
                      <select
                        value={match.playerOneEntryId}
                        onChange={(event) => updateMatch(index, "playerOneEntryId", event.target.value)}
                        className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none focus:border-amber-300/50"
                      >
                        <option value="">Unassigned</option>
                        {entrants.map((entrant) => (
                          <option key={`p1-${entrant.entryId}`} value={entrant.entryId ?? ""}>
                            {entrant.inGameName || entrant.steamPersonaName || entrant.uid}
                          </option>
                        ))}
                      </select>
                    </Field>

                    <Field label="Player Two">
                      <select
                        value={match.playerTwoEntryId}
                        onChange={(event) => updateMatch(index, "playerTwoEntryId", event.target.value)}
                        className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none focus:border-amber-300/50"
                      >
                        <option value="">Unassigned</option>
                        {entrants.map((entrant) => (
                          <option key={`p2-${entrant.entryId}`} value={entrant.entryId ?? ""}>
                            {entrant.inGameName || entrant.steamPersonaName || entrant.uid}
                          </option>
                        ))}
                      </select>
                    </Field>

                    <Field label="Winner">
                      <select
                        value={match.winnerEntryId}
                        onChange={(event) => updateMatch(index, "winnerEntryId", event.target.value)}
                        disabled={Boolean(match.sourceGameStatsId)}
                        className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none focus:border-amber-300/50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <option value="">
                          {match.sourceGameStatsId ? "Winner comes from replay proof" : "No winner yet"}
                        </option>
                        {entrants.map((entrant) => (
                          <option key={`w-${entrant.entryId}`} value={entrant.entryId ?? ""}>
                            {entrant.inGameName || entrant.steamPersonaName || entrant.uid}
                          </option>
                        ))}
                      </select>
                    </Field>

                    <Field label="Scheduled At">
                      <input
                        type="datetime-local"
                        value={match.scheduledAt}
                        onChange={(event) => updateMatch(index, "scheduledAt", event.target.value)}
                        className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none focus:border-amber-300/50"
                      />
                    </Field>

                    <Field label="Parsed Replay">
                      <select
                        value={match.sourceGameStatsId}
                        onChange={(event) => updateMatch(index, "sourceGameStatsId", event.target.value)}
                        disabled={!match.playerOneEntryId || !match.playerTwoEntryId}
                        className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none focus:border-amber-300/50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <option value="">
                          {!match.playerOneEntryId || !match.playerTwoEntryId
                            ? "Assign both players first"
                            : compatibleReplays.length === 0
                              ? "No parsed replay matches yet"
                              : "No replay linked"}
                        </option>
                        {compatibleReplays.map((candidate) => (
                          <option key={`replay-${candidate.gameStatsId}`} value={candidate.gameStatsId}>
                            {formatReplayCandidateLabel(candidate)}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>

                  {linkedReplay && (
                    <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-4 text-sm text-emerald-100">
                      <div className="font-medium text-white">
                        Replay proof linked: #{linkedReplay.gameStatsId}
                      </div>
                      <div className="mt-2 text-emerald-100/90">
                        {linkedReplay.players.map((player) => player.name).join(" vs ")}
                      </div>
                      <div className="mt-1 text-xs uppercase tracking-[0.25em] text-emerald-200/80">
                        {linkedReplay.mapName || "Unknown map"}
                        {linkedReplay.playedOn
                          ? ` · ${new Date(linkedReplay.playedOn).toLocaleString()}`
                          : ""}
                        {linkedReplay.winner ? ` · Winner ${linkedReplay.winner}` : ""}
                      </div>
                    </div>
                  )}

                  <div className="mt-4 flex justify-end">
                    <button
                      type="button"
                      onClick={() => removeMatch(index)}
                      className="rounded-full border border-red-400/25 px-4 py-2 text-sm text-red-200 transition hover:border-red-400/45 hover:text-red-100"
                    >
                      Remove Match
                    </button>
                  </div>
                      </>
                    );
                  })()}
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="text-sm text-slate-300">{label}</span>
      {children}
    </label>
  );
}

function toDateTimeLocal(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hour = `${date.getHours()}`.padStart(2, "0");
  const minute = `${date.getMinutes()}`.padStart(2, "0");

  return `${year}-${month}-${day}T${hour}:${minute}`;
}
