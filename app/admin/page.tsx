"use client";

import Link from "next/link";
import {
  type DragEvent,
  type FormEvent,
  type ReactNode,
  useEffect,
  useState,
} from "react";
import LiveTickerAdminPanel from "@/components/admin/LiveTickerAdminPanel";
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

type BroadcastPreviewSlot = "left" | "god" | "right";

type BroadcastPreviewUrls = Record<BroadcastPreviewSlot, string | null>;

type BroadcastPreviewTarget = {
  id: string;
  kind: "market" | "result";
  title: string;
  eventLabel: string;
  sessionKey: string;
  playedAt: string | null;
  leftName: string;
  rightName: string;
  previewUrls: BroadcastPreviewUrls;
  feedSlots: Record<BroadcastPreviewSlot, boolean>;
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
  const [broadcastTargets, setBroadcastTargets] = useState<BroadcastPreviewTarget[]>([]);
  const [broadcastTargetId, setBroadcastTargetId] = useState("");
  const [broadcastSlot, setBroadcastSlot] = useState<BroadcastPreviewSlot>("god");
  const [broadcastFile, setBroadcastFile] = useState<File | null>(null);
  const [broadcastLoading, setBroadcastLoading] = useState(false);
  const [broadcastUploading, setBroadcastUploading] = useState(false);
  const [broadcastError, setBroadcastError] = useState<string | null>(null);
  const [broadcastNotice, setBroadcastNotice] = useState<string | null>(null);
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

  useEffect(() => {
    if (!isAuthenticated || !isAdmin) {
      return;
    }

    void refreshBroadcastTargets();
  }, [isAdmin, isAuthenticated]);

  async function refreshBroadcastTargets() {
    try {
      setBroadcastLoading(true);
      setBroadcastError(null);
      const response = await fetch("/api/admin/bets/broadcast-previews", {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => ({}))) as
        | { detail?: string; targets?: BroadcastPreviewTarget[] }
        | Record<string, unknown>;

      if (!response.ok) {
        throw new Error(
          typeof payload.detail === "string"
            ? payload.detail
            : "Could not load Broadcast targets."
        );
      }

      const targets = Array.isArray(payload.targets)
        ? (payload.targets as BroadcastPreviewTarget[])
        : [];
      setBroadcastTargets(targets);
      setBroadcastTargetId((current) =>
        targets.some((target) => target.id === current) ? current : targets[0]?.id ?? ""
      );
    } catch (loadError) {
      setBroadcastError(
        loadError instanceof Error ? loadError.message : "Could not load Broadcast targets."
      );
    } finally {
      setBroadcastLoading(false);
    }
  }

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

  const selectedBroadcastTarget =
    broadcastTargets.find((target) => target.id === broadcastTargetId) ||
    broadcastTargets[0] ||
    null;

  async function uploadBroadcastLoop(input?: {
    target?: BroadcastPreviewTarget | null;
    slot?: BroadcastPreviewSlot;
    file?: File | null;
  }) {
    const target = input?.target ?? selectedBroadcastTarget;
    const slot = input?.slot ?? broadcastSlot;
    const file = input?.file ?? broadcastFile;

    if (!target) {
      setBroadcastError("Choose a Broadcast target first.");
      return;
    }

    if (!file) {
      setBroadcastError("Choose a downloaded MP4 loop first.");
      return;
    }

    try {
      setBroadcastUploading(true);
      setBroadcastError(null);
      setBroadcastNotice(null);

      const formData = new FormData();
      formData.set("sessionKey", target.sessionKey);
      formData.set("slot", slot);
      formData.set("title", target.title);
      formData.set("eventLabel", target.eventLabel);
      formData.set("playedAt", target.playedAt || "");
      formData.set("file", file);

      const response = await fetch("/api/admin/bets/broadcast-previews", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json().catch(() => ({}))) as
        | { detail?: string }
        | Record<string, unknown>;

      if (!response.ok) {
        throw new Error(
          typeof payload.detail === "string"
            ? payload.detail
            : "Could not upload Broadcast loop."
        );
      }

      setBroadcastFile(null);
      setBroadcastNotice("Broadcast loop attached to the selected slot.");
      await refreshBroadcastTargets();
    } catch (uploadError) {
      setBroadcastError(
        uploadError instanceof Error ? uploadError.message : "Could not upload Broadcast loop."
      );
    } finally {
      setBroadcastUploading(false);
    }
  }

  async function handleBroadcastUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await uploadBroadcastLoop();
  }

  async function handleBroadcastDrop(slot: BroadcastPreviewSlot, file: File) {
    setBroadcastSlot(slot);
    setBroadcastFile(file);
    await uploadBroadcastLoop({ slot, file });
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
            <div className="flex flex-wrap justify-end gap-2">
              <Link
                href="/admin/hero-studio"
                className="inline-flex rounded-full border border-emerald-200/22 bg-emerald-300/10 px-5 py-3 text-sm text-emerald-100 transition hover:border-emerald-200/40 hover:bg-emerald-300/16"
              >
                Hero Studio
              </Link>
              <Link
                href="/admin/events"
                className="inline-flex rounded-full border border-amber-200/18 bg-amber-300/10 px-5 py-3 text-sm text-amber-100 transition hover:border-amber-200/36 hover:bg-amber-300/16"
              >
                Featured Event Studio
              </Link>
              <Link
                href="/admin/trophies"
                className="inline-flex rounded-full border border-amber-200/18 px-5 py-3 text-sm text-amber-100 transition hover:border-amber-200/36 hover:bg-amber-300/10"
              >
                Trophy Command
              </Link>
              <Link
                href="/admin/media-assets"
                className="inline-flex rounded-full border border-amber-200/18 px-5 py-3 text-sm text-amber-100 transition hover:border-amber-200/36 hover:bg-amber-300/10"
              >
                Media Armory
              </Link>
              <Link
                href="/admin/user-list"
                className="inline-flex rounded-full border border-white/15 px-5 py-3 text-sm text-white/85 transition hover:border-white/30 hover:text-white"
              >
                Open User List
              </Link>
              <Link
                href="/admin/market-integrity"
                className="inline-flex rounded-full border border-sky-200/18 bg-sky-300/[0.06] px-5 py-3 text-sm text-sky-100 transition hover:border-sky-200/36 hover:bg-sky-300/10"
              >
                Market Integrity
              </Link>
              <Link
                href="/admin/parser-lab"
                className="inline-flex rounded-full border border-cyan-200/18 bg-cyan-300/[0.06] px-5 py-3 text-sm text-cyan-100 transition hover:border-cyan-200/36 hover:bg-cyan-300/10"
              >
                HD Replay Engine Room
              </Link>
              <Link
                href="/admin/ai"
                className="inline-flex rounded-full border border-cyan-200/18 bg-cyan-300/[0.06] px-5 py-3 text-sm text-cyan-100 transition hover:border-cyan-200/36 hover:bg-cyan-300/10"
              >
                AI Command Center
              </Link>
              <Link
                href="/admin/bounties"
                className="inline-flex rounded-full border border-amber-200/18 bg-amber-300/[0.06] px-5 py-3 text-sm text-amber-100 transition hover:border-amber-200/36 hover:bg-amber-300/10"
              >
                Bounty Command
              </Link>
              <Link
                href="/admin/radio"
                className="inline-flex rounded-full border border-fuchsia-200/18 bg-fuchsia-300/[0.06] px-5 py-3 text-sm text-fuchsia-100 transition hover:border-fuchsia-200/36 hover:bg-fuchsia-300/10"
              >
                Radio WOLO Desk
              </Link>
            </div>
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

      <LiveTickerAdminPanel />

      <section className="rounded-[2rem] border border-amber-200/14 bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.14),_transparent_30%),linear-gradient(135deg,_rgba(15,23,42,0.78),_rgba(2,6,23,0.94))] p-6 sm:p-8">
        <div className="text-xs uppercase tracking-[0.35em] text-amber-100/70">War Trophy system</div>
        <h2 className="mt-2 text-2xl font-semibold text-white">The scaffold became a real command center.</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
          Holder custody, Guardian activation fights, eligibility, economics versions, watcher proof, payouts, NFT intent diagnostics, settings, and audit history now live on their own operator route.
        </p>
        <Link
          href="/admin/trophies"
          className="mt-5 inline-flex items-center gap-2 rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
        >
          Open Trophy Command
        </Link>
      </section>

      <BroadcastPreviewUploadPanel
        targets={broadcastTargets}
        selectedTarget={selectedBroadcastTarget}
        selectedTargetId={broadcastTargetId}
        selectedSlot={broadcastSlot}
        file={broadcastFile}
        loading={broadcastLoading}
        uploading={broadcastUploading}
        error={broadcastError}
        notice={broadcastNotice}
        onTargetChange={setBroadcastTargetId}
        onSlotChange={setBroadcastSlot}
        onFileChange={setBroadcastFile}
        onDropFile={(slot, droppedFile) => void handleBroadcastDrop(slot, droppedFile)}
        onRefresh={() => void refreshBroadcastTargets()}
        onSubmit={(event) => void handleBroadcastUpload(event)}
      />

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

function BroadcastPreviewUploadPanel({
  targets,
  selectedTarget,
  selectedTargetId,
  selectedSlot,
  file,
  loading,
  uploading,
  error,
  notice,
  onTargetChange,
  onSlotChange,
  onFileChange,
  onDropFile,
  onRefresh,
  onSubmit,
}: {
  targets: BroadcastPreviewTarget[];
  selectedTarget: BroadcastPreviewTarget | null;
  selectedTargetId: string;
  selectedSlot: BroadcastPreviewSlot;
  file: File | null;
  loading: boolean;
  uploading: boolean;
  error: string | null;
  notice: string | null;
  onTargetChange: (targetId: string) => void;
  onSlotChange: (slot: BroadcastPreviewSlot) => void;
  onFileChange: (file: File | null) => void;
  onDropFile: (slot: BroadcastPreviewSlot, file: File) => void;
  onRefresh: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const existingPreviewUrl = selectedTarget?.previewUrls[selectedSlot] ?? null;
  const [dragTarget, setDragTarget] = useState<BroadcastPreviewSlot | "preview" | null>(null);

  function handleSlotDrop(event: DragEvent<HTMLElement>, slot: BroadcastPreviewSlot) {
    event.preventDefault();
    setDragTarget(null);
    const droppedFile = event.dataTransfer.files?.[0] ?? null;
    if (!droppedFile) {
      return;
    }
    onDropFile(slot, droppedFile);
  }

  return (
    <section className="overflow-hidden rounded-[2rem] border border-amber-200/10 bg-[radial-gradient(circle_at_18%_0%,rgba(251,191,36,0.12),transparent_28%),radial-gradient(circle_at_82%_20%,rgba(56,189,248,0.12),transparent_30%),linear-gradient(180deg,rgba(15,23,42,0.78),rgba(2,6,23,0.72))] p-6 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.35em] text-amber-100/60">Broadcast</div>
          <h2 className="mt-2 text-2xl font-semibold text-white">Loop Thumbnail Control</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
            Upload the downloaded StreamYard MP4 loop against the exact game and slot. Targets include the game time and session key so repeat matchups stay separated.
          </p>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="rounded-full border border-white/15 px-5 py-3 text-sm text-white/85 transition hover:border-white/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Refreshing..." : "Refresh Targets"}
        </button>
      </div>

      <form className="mt-6 grid gap-5 xl:grid-cols-[1fr_0.86fr]" onSubmit={onSubmit}>
        <div className="space-y-4">
          <Field label="Game / Session">
            <select
              value={selectedTargetId}
              onChange={(event) => onTargetChange(event.target.value)}
              disabled={loading || targets.length === 0}
              className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none focus:border-amber-300/50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {targets.length === 0 ? (
                <option value="">No Broadcast-linked games found</option>
              ) : (
                targets.map((target) => (
                  <option key={target.id} value={target.id}>
                    {target.kind === "market" ? "Open" : "Closed"} · {target.title} ·{" "}
                    {formatBroadcastTargetTime(target.playedAt)} · {target.sessionKey}
                  </option>
                ))
              )}
            </select>
          </Field>

          {selectedTarget ? (
            <div className="rounded-[1.35rem] border border-white/8 bg-black/20 p-4">
              <div className="grid gap-3 md:grid-cols-3">
                {(["left", "god", "right"] as BroadcastPreviewSlot[]).map((slot) => {
                  const isSelected = selectedSlot === slot;
                  const slotName = getBroadcastSlotLabel(selectedTarget, slot);
                  const hasPreview = Boolean(selectedTarget.previewUrls[slot]);
                  const hasFeed = Boolean(selectedTarget.feedSlots[slot]);

                  return (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => onSlotChange(slot)}
                      onDragEnter={(event) => {
                        event.preventDefault();
                        setDragTarget(slot);
                      }}
                      onDragOver={(event) => {
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "copy";
                        setDragTarget(slot);
                      }}
                      onDragLeave={() => setDragTarget((current) => (current === slot ? null : current))}
                      onDrop={(event) => handleSlotDrop(event, slot)}
                      className={`rounded-[1.15rem] border px-4 py-3 text-left transition ${
                        isSelected
                          ? "border-amber-200/45 bg-amber-300/10 text-white"
                          : dragTarget === slot
                            ? "border-sky-200/50 bg-sky-300/10 text-white"
                          : "border-white/10 bg-white/[0.04] text-slate-200 hover:border-white/20"
                      }`}
                    >
                      <div className="text-[10px] uppercase tracking-[0.28em] text-slate-500">
                        {slot === "god" ? "Observer" : "Player cam"}
                      </div>
                      <div className="mt-1 truncate text-sm font-semibold">{slotName}</div>
                      <div className="mt-3 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.18em]">
                        <span className="rounded-full border border-white/10 bg-black/25 px-2 py-1 text-slate-300">
                          {hasFeed ? "Feed wired" : "No feed"}
                        </span>
                        <span className="rounded-full border border-white/10 bg-black/25 px-2 py-1 text-slate-300">
                          {dragTarget === slot ? "Drop MP4" : hasPreview ? "Loop set" : "Loop empty"}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 grid gap-3 text-xs uppercase tracking-[0.18em] text-slate-400 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/8 bg-slate-950/70 px-4 py-3">
                  <div className="text-slate-500">Selected slot</div>
                  <div className="mt-1 truncate font-semibold text-white">
                    {getBroadcastSlotLabel(selectedTarget, selectedSlot)}
                  </div>
                </div>
                <div className="rounded-2xl border border-white/8 bg-slate-950/70 px-4 py-3">
                  <div className="text-slate-500">Session key</div>
                  <div className="mt-1 truncate font-semibold text-white">
                    {selectedTarget.sessionKey}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-[1.35rem] border border-white/8 bg-black/20 p-4 text-sm text-slate-300">
              Broadcast targets appear here after a market or result has a linked session key.
            </div>
          )}

          <Field label="MP4 Loop">
            <input
              key={file ? file.name : "empty-broadcast-loop"}
              type="file"
              accept="video/mp4,.mp4"
              onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
              className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white file:mr-4 file:rounded-full file:border-0 file:bg-amber-300 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-slate-950 focus:border-amber-300/50"
            />
          </Field>

          {file ? (
            <div className="rounded-2xl border border-white/8 bg-white/[0.04] px-4 py-3 text-sm text-slate-300">
              Ready: <span className="font-semibold text-white">{file.name}</span>
            </div>
          ) : null}

          {error ? (
            <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              {error}
            </div>
          ) : null}

          {notice ? (
            <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
              {notice}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={uploading || !selectedTarget || !file}
            className="rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {uploading ? "Uploading Loop..." : "Attach Loop To Broadcast Slot"}
          </button>
        </div>

        <div
          onDragEnter={(event) => {
            event.preventDefault();
            setDragTarget("preview");
          }}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
            setDragTarget("preview");
          }}
          onDragLeave={() => setDragTarget((current) => (current === "preview" ? null : current))}
          onDrop={(event) => handleSlotDrop(event, selectedSlot)}
          className={`overflow-hidden rounded-[1.5rem] border bg-black shadow-2xl transition ${
            dragTarget === "preview" ? "border-sky-200/55" : "border-white/10"
          }`}
        >
          <div className="relative aspect-video min-h-[14rem] overflow-hidden bg-[radial-gradient(circle_at_34%_28%,rgba(56,189,248,0.20),transparent_32%),radial-gradient(circle_at_72%_42%,rgba(251,191,36,0.13),transparent_30%),linear-gradient(135deg,rgba(15,23,42,0.98),rgba(2,6,23,0.99))]">
            {existingPreviewUrl ? (
              <video
                key={existingPreviewUrl}
                className="absolute inset-0 h-full w-full object-cover"
                src={existingPreviewUrl}
                muted
                autoPlay
                loop
                playsInline
                preload="metadata"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="rounded-full border border-white/12 bg-white/10 px-7 py-2.5 text-[11px] font-black uppercase leading-none tracking-[0.34em] text-slate-200 shadow-[0_0_48px_rgba(125,211,252,0.18)] backdrop-blur-md">
                  {dragTarget === "preview" ? "Drop MP4" : "Preview pending"}
                </div>
              </div>
            )}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/78 via-black/12 to-black/20" />
            <div className="pointer-events-none absolute bottom-4 left-4 right-4">
              <div className="text-[10px] uppercase tracking-[0.28em] text-amber-100/65">
                {selectedTarget ? selectedTarget.eventLabel : "Broadcast"}
              </div>
              <div className="mt-1 truncate text-lg font-semibold text-white">
                {selectedTarget
                  ? getBroadcastSlotLabel(selectedTarget, selectedSlot)
                  : "No target selected"}
              </div>
            </div>
          </div>
        </div>
      </form>
    </section>
  );
}

function getBroadcastSlotLabel(target: BroadcastPreviewTarget, slot: BroadcastPreviewSlot) {
  if (slot === "left") return target.leftName || "Player 1";
  if (slot === "right") return target.rightName || "Player 2";
  return "Battle Cam";
}

function formatBroadcastTargetTime(value: string | null) {
  if (!value) return "Time pending";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
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
