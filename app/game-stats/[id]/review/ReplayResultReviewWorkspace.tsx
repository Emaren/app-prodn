"use client";

import Link from "next/link";
import ReplayVerdictTrail from "@/components/game-stats/ReplayVerdictTrail";
import {
  currentConfirmedDesync,
  type ReplayDesyncIncidentView,
} from "@/components/game-stats/desyncIncidentView";
import { useCallback, useEffect, useMemo, useState } from "react";

type ReviewDeskViewMode =
  | "basic"
  | "advanced"
  | "extreme";

const REVIEW_DESK_VIEW_STORAGE_KEY =
  "aoe2war.reviewDesk.bae.v1";

const reviewDeskViews: Array<{
  value: ReviewDeskViewMode;
  label: string;
  title: string;
}> = [
  {
    value: "basic",
    label: "B",
    title: "Basic",
  },
  {
    value: "advanced",
    label: "A",
    title: "Advanced",
  },
  {
    value: "extreme",
    label: "E",
    title: "Extreme",
  },
];

function isReviewDeskViewMode(
  value: unknown
): value is ReviewDeskViewMode {
  return (
    value === "basic" ||
    value === "advanced" ||
    value === "extreme"
  );
}

function reviewDeskFrameClass(
  view: ReviewDeskViewMode
) {
  if (
    view === "basic"
  ) {
    return (
      "mx-auto w-full max-w-6xl " +
      "space-y-6 py-6 text-white " +
      "transition-[max-width] duration-300"
    );
  }

  if (
    view === "advanced"
  ) {
    return (
      "mx-auto w-full max-w-[90rem] " +
      "space-y-6 py-6 text-white " +
      "transition-[max-width] duration-300"
    );
  }

  return (
    "mx-auto w-full max-w-[112rem] " +
    "space-y-7 py-6 text-white " +
    "transition-[max-width] duration-300"
  );
}

function reviewDeskGridClass(
  view: ReviewDeskViewMode
) {
  if (
    view === "basic"
  ) {
    return (
      "grid min-w-0 gap-6 " +
      "xl:grid-cols-[minmax(0,1fr)_22rem]"
    );
  }

  if (
    view === "advanced"
  ) {
    return (
      "grid min-w-0 gap-6 " +
      "xl:grid-cols-[minmax(0,1.45fr)_minmax(24rem,0.75fr)]"
    );
  }

  return (
    "grid min-w-0 gap-7 " +
    "xl:grid-cols-[minmax(0,1.55fr)_minmax(30rem,0.95fr)]"
  );
}

function reviewDeskHeroClass(
  view: ReviewDeskViewMode
) {
  const base =
    "relative overflow-hidden rounded-[2.1rem] " +
    "border border-amber-100/14 " +
    "bg-[radial-gradient(circle_at_12%_0%,rgba(251,191,36,0.16),transparent_32%),linear-gradient(140deg,#172033,#07101e_58%,#080b12)] " +
    "p-7 sm:p-9 sm:pr-36";

  if (
    view === "basic"
  ) {
    return base;
  }

  if (
    view === "advanced"
  ) {
    return (
      base +
      " shadow-[0_28px_80px_rgba(0,0,0,0.22)]"
    );
  }

  return (
    base +
    " border-amber-100/20 " +
    "shadow-[0_34px_100px_rgba(0,0,0,0.30),0_0_70px_rgba(245,158,11,0.055)]"
  );
}

function ReviewDeskBaeToggle({
  value,
  onChange,
}: {
  value:
    ReviewDeskViewMode;
  onChange:
    (
      next:
        ReviewDeskViewMode
    ) => void;
}) {
  return (
    <div
      className="absolute right-4 top-4 z-20 inline-flex rounded-full border border-white/10 bg-slate-950/72 p-0.5 shadow-[0_12px_32px_rgba(0,0,0,0.32)] backdrop-blur-md sm:right-5 sm:top-5"
      aria-label="Review Desk view"
    >
      {reviewDeskViews.map(
        (
          option
        ) => (
          <button
            key={
              option.value
            }
            type="button"
            onClick={() =>
              onChange(
                option.value
              )
            }
            title={
              option.title
            }
            aria-pressed={
              value ===
              option.value
            }
            className={`grid h-6 min-w-6 cursor-pointer place-items-center rounded-full px-1.5 text-[9px] font-black uppercase tracking-[0.14em] transition ${
              value ===
              option.value
                ? "bg-amber-100 text-slate-950 shadow-[0_0_18px_rgba(251,191,36,0.20)]"
                : "text-slate-500 hover:bg-white/[0.07] hover:text-amber-100"
            }`}
          >
            {
              option.label
            }
          </button>
        )
      )}
    </div>
  );
}

type CanonicalPlayer = {
  stablePlayerKey: string;
  name: string;
  steamId: string | null;
  teamId: string | null;
  civilizationName: string | null;
  winner: boolean | null;
};

type TeamAssignment = {
  teamKey: string;
  players: Array<{ stablePlayerKey: string; name: string }>;
};

type Adjudication = {
  id: number;
  decisionStatus: string;
  actorDisplayNameSnapshot: string;
  actorRole: string;
  teamAssignments: TeamAssignment[];
  winningTeamKey: string;
  reason: string;
  createdAt: string;
};

type ReviewState = {
  access: {
    isAdmin: boolean;
    role: "site_admin" | "verified_submitter";
    ownerMarketCorrectionsRequireAdminApproval: boolean;
  };
  game: {
    id: number;
    replayHash: string;
    parse_iteration: number;
    original_filename: string | null;
    replay_file: string;
    sourceRosterHash: string;
    canonicalRoster: CanonicalPlayer[];
    map: unknown;
  };
  adjudications: Adjudication[];
  currentAdjudication: Adjudication | null;
  desyncIncidents: ReplayDesyncIncidentView[];
  currentDesyncIncident: ReplayDesyncIncidentView | null;
  linkedMarkets: Array<{
    id: number;
    title: string;
    status: string;
    wagerCount: number;
    hasTerminalMoney: boolean;
  }>;
};

type TeamKey = "gold" | "blue";
type Assignments = Record<string, TeamKey | null>;

function messageFromPayload(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const detail = (payload as { detail?: unknown }).detail;
    if (typeof detail === "string" && detail.trim()) return detail;
  }
  return fallback;
}

function mapName(value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const name = (value as { name?: unknown }).name;
    if (
      typeof name === "string" &&
      name.trim() &&
      !/(unknown|unavailable|unresolved)/i.test(name)
    ) {
      return name.trim();
    }
  }
  return "HD Battle Record";
}

function initialAssignments(state: ReviewState): Assignments {
  const latest = state.adjudications[0];
  const fromVerdict = new Map<string, TeamKey>();
  if (latest && Array.isArray(latest.teamAssignments)) {
    latest.teamAssignments.forEach((team, index) => {
      const teamKey: TeamKey = index === 0 ? "gold" : "blue";
      team.players.forEach((player) => fromVerdict.set(player.stablePlayerKey, teamKey));
    });
  }
  if (fromVerdict.size > 0) {
    return Object.fromEntries(
      state.game.canonicalRoster.map((player) => [player.stablePlayerKey, fromVerdict.get(player.stablePlayerKey) ?? null])
    );
  }

  const distinctReplayTeams = [...new Set(
    state.game.canonicalRoster.map((player) => player.teamId).filter((teamId): teamId is string => Boolean(teamId))
  )];
  if (distinctReplayTeams.length === 2) {
    return Object.fromEntries(
      state.game.canonicalRoster.map((player) => [
        player.stablePlayerKey,
        player.teamId === distinctReplayTeams[0] ? "gold" : player.teamId === distinctReplayTeams[1] ? "blue" : null,
      ])
    );
  }
  if (state.game.canonicalRoster.length === 2) {
    return {
      [state.game.canonicalRoster[0].stablePlayerKey]: "gold",
      [state.game.canonicalRoster[1].stablePlayerKey]: "blue",
    };
  }
  return Object.fromEntries(state.game.canonicalRoster.map((player) => [player.stablePlayerKey, null]));
}

function initialWinner(state: ReviewState): TeamKey | null {
  const latest = state.adjudications[0];

  // Parser evidence may suggest a candidate winner, but this
  // control represents the commissioner's actual selection.
  // Never preselect a victorious side before an adjudication.
  if (!latest) return null;

  const index = latest.teamAssignments.findIndex(
    (team) =>
      team.teamKey === latest.winningTeamKey
  );

  return index === 0
    ? "gold"
    : index === 1
      ? "blue"
      : null;
}

export default function ReplayResultReviewWorkspace({ gameStatsId }: { gameStatsId: number }) {

  const [
    reviewView,
    setReviewView,
  ] =
    useState<ReviewDeskViewMode>(
      "extreme"
    );

  useEffect(() => {
    try {
      const saved =
        window.localStorage.getItem(
          REVIEW_DESK_VIEW_STORAGE_KEY
        );

      if (
        isReviewDeskViewMode(
          saved
        )
      ) {
        setReviewView(
          saved
        );
      }
    } catch {
      /*
       * Private browsing or blocked storage:
       * retain the premium E default.
       */
    }
  }, []);

  const chooseReviewView =
    useCallback(
      (
        next:
          ReviewDeskViewMode
      ) => {
        setReviewView(
          next
        );

        try {
          window.localStorage.setItem(
            REVIEW_DESK_VIEW_STORAGE_KEY,
            next
          );
        } catch {
          /*
           * View switching must remain available
           * even when localStorage is unavailable.
           */
        }
      },
      []
    );

  const [state, setState] = useState<ReviewState | null>(null);
  const [assignments, setAssignments] = useState<Assignments>({});
  const [winningTeam, setWinningTeam] = useState<TeamKey | null>(null);
  const [reason, setReason] = useState("Reviewer confirmed the complete team composition and final result.");
  const [evidenceNote, setEvidenceNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [desyncSaving, setDesyncSaving] = useState(false);
  const [desyncArmed, setDesyncArmed] = useState<"confirm" | "correct" | null>(null);
  const [desyncNote, setDesyncNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/replay-results/${gameStatsId}/adjudications`, { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as ReviewState | { detail?: string } | null;
      if (!response.ok) throw new Error(messageFromPayload(payload, "This result review lane is reserved for authorized reviewers."));
      const next = payload as ReviewState;
      setState(next);
      setAssignments(initialAssignments(next));
      setWinningTeam(initialWinner(next));
      if (next.adjudications[0]?.reason) setReason(next.adjudications[0].reason);
      return next;
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "The battle record could not be opened.");
      return null;
    } finally {
      setLoading(false);
    }
  }, [gameStatsId]);

  useEffect(() => { void load(); }, [load]);

  const teamPlayers = useMemo(() => {
    const gold = state?.game.canonicalRoster.filter((player) => assignments[player.stablePlayerKey] === "gold") ?? [];
    const blue = state?.game.canonicalRoster.filter((player) => assignments[player.stablePlayerKey] === "blue") ?? [];
    const unassigned = state?.game.canonicalRoster.filter((player) => !assignments[player.stablePlayerKey]) ?? [];
    return { gold, blue, unassigned };
  }, [assignments, state]);

  const complete = Boolean(
    state && teamPlayers.unassigned.length === 0 && teamPlayers.gold.length > 0 && teamPlayers.blue.length > 0 && winningTeam
  );

  async function submit() {
    if (
      !state ||
      !state.access.isAdmin ||
      !complete ||
      !winningTeam ||
      currentConfirmedDesync(state.desyncIncidents)
    ) {
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    const latest = state.adjudications[0] ?? null;
    const teams = (["gold", "blue"] as const).map((teamKey) => ({
      teamKey,
      playerKeys: teamPlayers[teamKey].map((player) => player.stablePlayerKey),
    }));

    try {
      const response = await fetch(`/api/replay-results/${gameStatsId}/adjudications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: `review:${gameStatsId}:${crypto.randomUUID()}`,
          sourceReplayHash: state.game.replayHash,
          sourceParseIteration: state.game.parse_iteration,
          sourceRosterHash: state.game.sourceRosterHash,
          teams,
          winningTeamKey: winningTeam,
          reason,
          evidence: { note: evidenceNote.trim() || null, submittedVia: "review_result_workspace" },
          supersedesId: latest?.id ?? null,
        }),
      });
      const payload = await response.json().catch(() => null) as { adjudication?: Adjudication; detail?: string } | null;
      if (!response.ok) throw new Error(messageFromPayload(payload, "The result could not be locked."));

      const adjudication = payload?.adjudication;

      if (!adjudication?.id) {
        throw new Error(
          "The server did not return a durable verdict ID. No successful result confirmation was received."
        );
      }

      const pending =
        adjudication.decisionStatus ===
        "pending_admin_approval";

      const refreshedState = await load();

      const durableConfirmation =
        refreshedState?.adjudications.some(
          (entry) => entry.id === adjudication.id
        ) ?? false;

      if (!durableConfirmation) {
        setNotice(
          `Verdict #${adjudication.id} was saved, but the Verdict Trail could not be refreshed. Reload the page before submitting anything again.`
        );
        return;
      }

      setNotice(
        pending
          ? `Verdict #${adjudication.id} saved and sent for admin review.`
          : `Verdict #${adjudication.id} locked into the permanent battle record.`
      );
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "The result could not be locked.");
    } finally {
      setSaving(false);
    }
  }

  async function submitDesyncIncident(desyncOccurred: boolean) {
    if (!state?.access.isAdmin || desyncSaving) return;

    const latest = state.desyncIncidents[0] ?? null;
    setDesyncSaving(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(
        `/api/replay-results/${gameStatsId}/desync-incidents`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            idempotencyKey: `desync:${gameStatsId}:${crypto.randomUUID()}`,
            sourceReplayHash: state.game.replayHash,
            sourceParseIteration: state.game.parse_iteration,
            desyncOccurred,
            competitiveResultStatus: desyncOccurred
              ? "unresolved"
              : "not_applicable",
            settlementDisposition: desyncOccurred
              ? "commissioner_review"
              : "not_applicable",
            note: desyncNote.trim() || null,
            supersedesId: latest?.id ?? null,
          }),
        }
      );
      const payload = (await response.json().catch(() => null)) as
        | { incident?: ReplayDesyncIncidentView; detail?: string }
        | null;

      if (!response.ok) {
        throw new Error(
          messageFromPayload(payload, "The desync incident could not be recorded.")
        );
      }

      const incident = payload?.incident;
      if (!incident?.id) {
        throw new Error(
          "The server did not return a durable desync incident ID. No confirmation was received."
        );
      }

      const refreshedState = await load();
      const durableConfirmation =
        refreshedState?.desyncIncidents.some((entry) => entry.id === incident.id) ??
        false;

      if (!durableConfirmation) {
        setNotice(
          `Incident #${incident.id} was saved, but the Verdict Trail could not be refreshed. Reload before submitting again.`
        );
        return;
      }

      setDesyncArmed(null);
      setDesyncNote("");
      setNotice(
        desyncOccurred
          ? `Desync incident #${incident.id} is locked into the permanent battle record. No winner was created.`
          : `Correction #${incident.id} was appended. The original desync incident remains in provenance.`
      );
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "The desync incident could not be recorded."
      );
    } finally {
      setDesyncSaving(false);
    }
  }

  if (loading) {
    return <main className="py-10 text-white"><div className="rounded-[2rem] border border-white/10 bg-slate-950/80 p-8 text-slate-300">Opening the battle record…</div></main>;
  }

  if (!state || error) {
    return (
      <main className="py-10 text-white">
        <div className="rounded-[2rem] border border-rose-200/15 bg-rose-300/[0.06] p-8">
          <h1 className="text-2xl font-semibold">Result review access</h1>
          <p className="mt-3 text-slate-300">{error || "This battle record is not available for review."}</p>
          <Link href={`/game-stats/${gameStatsId}`} className="mt-5 inline-flex rounded-full bg-white px-4 py-2 text-sm font-bold text-slate-950">Back to battle</Link>
        </div>
      </main>
    );
  }

  const latest = state.adjudications[0] ?? null;
  const canAdminister = state.access.isAdmin;
  const confirmedDesync = currentConfirmedDesync(state.desyncIncidents);
  const resultWritePaused = Boolean(confirmedDesync);

  const primaryAction =
    canAdminister &&
    latest?.decisionStatus ===
      "pending_admin_approval"
      ? "Approve & Lock Result"
      : latest
        ? "Append Corrected Result"
        : "Lock Result";

  return (
    <main
      data-review-desk-view={
        reviewView
      }
      className={
        reviewDeskFrameClass(
          reviewView
        )
      }
    >
      <section
        className={
          reviewDeskHeroClass(
            reviewView
          )
        }
      >
        <ReviewDeskBaeToggle
          value={
            reviewView
          }
          onChange={
            chooseReviewView
          }
        />

        <div className="text-xs font-bold uppercase tracking-[0.38em] text-amber-100/70">Result Review Desk</div>
        <h1 className="mt-3 font-serif text-4xl tracking-[-0.03em] sm:text-5xl">Review Battle #{state.game.id}</h1>
        <p className="mt-3 text-slate-300">
          {mapName(state.game.map)} ·{" "}
          {canAdminister
            ? "assign the complete roster, select the victorious side, and lock an attributable verdict."
            : "inspect the immutable replay, screenshot evidence, parser confidence, and provenance trail."}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href={`/game-stats/${gameStatsId}`} className="rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-white">Open Battle Record</Link>
          {state.linkedMarkets.length > 0 ? <span className="rounded-full border border-violet-200/20 bg-violet-300/10 px-4 py-2 text-sm text-violet-100">{state.linkedMarkets.length} market link{state.linkedMarkets.length === 1 ? "" : "s"} protected</span> : null}
        </div>
      </section>

      <section
        className={
          reviewDeskGridClass(
            reviewView
          )
        }
      >
        <div className="min-w-0 space-y-5">
          <div className="rounded-[1.7rem] border border-white/10 bg-slate-950/75 p-5 sm:p-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.3em] text-white/45">
                  Complete Roster
                </div>
                <h2 className="mt-2 text-2xl font-semibold">
                  {canAdminister
                    ? "Set the teams"
                    : "Team composition"}
                </h2>
              </div>
              <span className="text-sm text-slate-400">
                {state.game.canonicalRoster.length} warriors
              </span>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {state.game.canonicalRoster.map((player) => (
                <div key={player.stablePlayerKey} className="rounded-2xl border border-white/9 bg-white/[0.04] p-4">
                  <div className="font-semibold text-white">{player.name}</div>
                  <div className="mt-1 text-xs text-slate-500">{player.civilizationName || "HD warrior"}</div>
                  {canAdminister ? (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <TeamButton
                        active={assignments[player.stablePlayerKey] === "gold"}
                        tone="gold"
                        onClick={() =>
                          setAssignments((current) => ({
                            ...current,
                            [player.stablePlayerKey]: "gold",
                          }))
                        }
                      >
                        Gold Team
                      </TeamButton>

                      <TeamButton
                        active={assignments[player.stablePlayerKey] === "blue"}
                        tone="blue"
                        onClick={() =>
                          setAssignments((current) => ({
                            ...current,
                            [player.stablePlayerKey]: "blue",
                          }))
                        }
                      >
                        Blue Team
                      </TeamButton>
                    </div>
                  ) : (
                    <div className="mt-3 inline-flex rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-bold text-slate-300">
                      {assignments[player.stablePlayerKey] === "gold"
                        ? "Gold Team"
                        : assignments[player.stablePlayerKey] === "blue"
                          ? "Blue Team"
                          : "Team unresolved"}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <TeamPanel
              label="Gold Team"
              players={teamPlayers.gold}
              active={winningTeam === "gold"}
              onWinner={() => setWinningTeam("gold")}
              tone="gold"
              canSetWinner={canAdminister && !resultWritePaused}
            />

            <TeamPanel
              label="Blue Team"
              players={teamPlayers.blue}
              active={winningTeam === "blue"}
              onWinner={() => setWinningTeam("blue")}
              tone="blue"
              canSetWinner={canAdminister && !resultWritePaused}
            />
          </div>

          {canAdminister ? (
            <DesyncIncidentControl
              currentIncident={state.currentDesyncIncident}
              confirmedIncident={confirmedDesync}
              armed={desyncArmed}
              note={desyncNote}
              saving={desyncSaving}
              onArm={setDesyncArmed}
              onNoteChange={setDesyncNote}
              onSubmit={submitDesyncIncident}
            />
          ) : null}

          {canAdminister ? (
            <div className="rounded-[1.7rem] border border-white/10 bg-slate-950/75 p-5 sm:p-6">
              <label className="block text-xs uppercase tracking-[0.28em] text-white/50">Decision note</label>
            <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} className="mt-3 w-full rounded-2xl border border-white/12 bg-black/25 px-4 py-3 text-sm text-white outline-none focus:border-amber-200/40" />
            <label className="mt-4 block text-xs uppercase tracking-[0.28em] text-white/50">Supporting note (optional)</label>
            <textarea value={evidenceNote} onChange={(event) => setEvidenceNote(event.target.value)} rows={2} placeholder="End-screen screenshot, player confirmation, replay observation…" className="mt-3 w-full rounded-2xl border border-white/12 bg-black/25 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-amber-200/40" />
            {teamPlayers.unassigned.length > 0 ? <div className="mt-4 text-sm font-semibold text-amber-100">Assign all {teamPlayers.unassigned.length} remaining warrior{teamPlayers.unassigned.length === 1 ? "" : "s"} to lock the result.</div> : null}
            {resultWritePaused ? <div className="mt-4 rounded-xl border border-amber-300/20 bg-[linear-gradient(90deg,rgba(69,10,10,0.40),rgba(15,23,42,0.72))] px-4 py-3 text-sm font-semibold text-amber-50">Winner locking is paused while this replay has a current human-confirmed desync. Append a no-desync correction or resolve competition through the linked rematch protocol first.</div> : null}
            {notice ? <div className="mt-4 rounded-xl border border-emerald-200/20 bg-emerald-300/10 px-4 py-3 text-sm font-semibold text-emerald-100">{notice}</div> : null}
            {error ? <div className="mt-4 rounded-xl border border-rose-200/20 bg-rose-300/10 px-4 py-3 text-sm text-rose-100">{error}</div> : null}
              <button type="button" disabled={resultWritePaused || !complete || reason.trim().length < 8 || saving} onClick={() => void submit()} className="mt-5 w-full rounded-full bg-amber-300 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-40">{resultWritePaused ? "Winner Lock Paused — Desync Review" : saving ? "Locking battle record…" : primaryAction}</button>
            </div>
          ) : null}
        </div>

        <aside className="min-w-0 space-y-4">
          <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/75 p-5"><div className="text-xs uppercase tracking-[0.3em] text-white/45">Protection</div><p className="mt-3 text-sm leading-6 text-slate-300">Every verdict is immutable. A later correction appends a new signed entry and preserves the complete history.</p>{state.linkedMarkets.length > 0 ? <p className="mt-3 text-sm leading-6 text-violet-100">Only site administrators can change team assignments, lock or correct results, add evidence, or launch parser passes. Public visitors can inspect the immutable trail. Wagers, claims, payouts, and chain history are never rewritten here.</p> : null}</div>
          <ReplayVerdictTrail
            gameStatsId={gameStatsId}
            isAdmin={canAdminister}
            adjudications={state.adjudications}
            desyncIncidents={state.desyncIncidents}
          />
        </aside>
      </section>
    </main>
  );
}

function DesyncIncidentControl({
  currentIncident,
  confirmedIncident,
  armed,
  note,
  saving,
  onArm,
  onNoteChange,
  onSubmit,
}: {
  currentIncident: ReplayDesyncIncidentView | null;
  confirmedIncident: ReplayDesyncIncidentView | null;
  armed: "confirm" | "correct" | null;
  note: string;
  saving: boolean;
  onArm: (next: "confirm" | "correct" | null) => void;
  onNoteChange: (next: string) => void;
  onSubmit: (desyncOccurred: boolean) => Promise<void>;
}) {
  const correcting = armed === "correct";

  if (
    confirmedIncident &&
    !armed
  ) {
    return (
      <section
        data-admin-desync-control
        className="relative overflow-hidden rounded-2xl border border-amber-300/20 bg-[radial-gradient(circle_at_10%_0%,rgba(127,29,29,0.30),transparent_36%),linear-gradient(100deg,rgba(34,7,12,0.98),rgba(7,17,35,0.99)_65%,rgba(31,22,8,0.96))] px-4 py-3 shadow-[0_16px_45px_rgba(0,0,0,0.28)]"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/55 to-transparent"
        />

        <div className="flex items-center gap-3 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <span className="shrink-0 text-sm font-black uppercase tracking-[0.1em] text-amber-100">
            ⚡ DESYNCED — human confirmed
          </span>

          <span
            aria-hidden="true"
            className="h-4 w-px shrink-0 bg-amber-300/25"
          />

          <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
            Incident #{confirmedIncident.id} · {confirmedIncident.reviewerDisplayName}
          </span>

          <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
            Winner unchanged · Settlement commissioner review
          </span>

          <button
            type="button"
            onClick={() => onArm("correct")}
            className="ml-auto shrink-0 cursor-pointer rounded-full border border-amber-300/20 bg-amber-300/[0.06] px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-amber-100 transition hover:border-amber-200/40 hover:bg-amber-300/[0.11]"
          >
            Append correction
          </button>
        </div>
      </section>
    );
  }

  return (
    <section
      data-admin-desync-control
      className="relative overflow-hidden rounded-[1.7rem] border border-amber-300/20 bg-[radial-gradient(circle_at_15%_0%,rgba(127,29,29,0.34),transparent_38%),radial-gradient(circle_at_90%_20%,rgba(161,98,7,0.11),transparent_30%),linear-gradient(145deg,rgba(29,7,12,0.98),rgba(6,15,30,0.99))] p-5 shadow-[0_25px_70px_rgba(0,0,0,0.30)] sm:p-6"
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/55 to-transparent" />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <div className="text-[10px] font-black uppercase tracking-[0.34em] text-amber-200/60">
            Catastrophic Incident Rail
          </div>
          <h2 className="mt-2 text-2xl font-black tracking-[-0.025em] text-white">
            {confirmedIncident ? "⚡ DESYNCED — human confirmed" : "Was this battle desynced?"}
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            This is independent from choosing a winner. It records append-only human
            ground truth and moves linked competition and settlement into commissioner
            resolution without manufacturing a victorious side.
          </p>
        </div>

        {confirmedIncident ? (
          <div className="rounded-2xl border border-amber-300/20 bg-[linear-gradient(135deg,rgba(127,29,29,0.25),rgba(15,23,42,0.62))] px-4 py-3 text-right">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-100">
              Human · Desync Confirmed
            </div>
            <div className="mt-1 text-xs text-amber-100/55">
              #{confirmedIncident.id} · {confirmedIncident.reviewerDisplayName}
            </div>
          </div>
        ) : currentIncident ? (
          <div className="rounded-2xl border border-slate-200/12 bg-white/[0.04] px-4 py-3 text-right">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-300">
              Latest entry is a correction
            </div>
            <div className="mt-1 text-xs text-slate-500">Incident #{currentIncident.id}</div>
          </div>
        ) : null}
      </div>

      {armed ? (
        <div className="mt-5 rounded-2xl border border-amber-300/18 bg-slate-950/55 p-4">
          <div className="text-sm font-black text-amber-50">
            {correcting
              ? "Append a correction that this replay did not desync?"
              : "Confirm this replay DESYNCED?"}
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-400">
            {correcting
              ? "The confirmed incident remains visible forever; this adds a newer correction to the trail."
              : "This does not pick a winner or pay a wager. Linked protocol activity will require commissioner resolution."}
          </p>
          <label className="mt-4 block text-[10px] font-bold uppercase tracking-[0.2em] text-white/45">
            Reviewer note (optional)
          </label>
          <textarea
            value={note}
            onChange={(event) => onNoteChange(event.target.value)}
            rows={2}
            maxLength={2000}
            placeholder={
              correcting
                ? "Why the earlier incident should no longer be current…"
                : "What players, watcher, replay, or spectator evidence confirmed the desync…"
            }
            className="mt-2 w-full rounded-xl border border-white/10 bg-black/35 px-3 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-amber-300/35"
          />
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => void onSubmit(!correcting)}
              className="group relative inline-flex min-h-11 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-amber-200/35 bg-[linear-gradient(105deg,#4c0d18_0%,#7f1d1d_36%,#172033_72%,#8a6116_100%)] px-6 text-sm font-black uppercase tracking-[0.12em] text-amber-50 shadow-[0_0_32px_rgba(127,29,29,0.22)] transition duration-200 hover:-translate-y-0.5 hover:scale-[1.01] hover:border-amber-200/55 hover:shadow-[0_0_48px_rgba(180,83,9,0.24)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transform-none"
            >
              <span className="transition group-hover:animate-pulse motion-reduce:animate-none">
                {saving
                  ? "Writing immutable incident…"
                  : correcting
                    ? "Append No-Desync Correction"
                    : "⚡ Confirm DESYNCED ⚡"}
              </span>
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => onArm(null)}
              className="cursor-pointer rounded-full border border-white/12 bg-white/[0.04] px-5 py-2 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.08] hover:text-white disabled:opacity-45"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : confirmedIncident ? (
        <button
          type="button"
          onClick={() => onArm("correct")}
          className="mt-5 cursor-pointer rounded-full border border-white/12 bg-white/[0.035] px-4 py-2 text-xs font-bold text-slate-300 transition hover:border-white/25 hover:text-white"
        >
          Append a correction
        </button>
      ) : (
        <button
          type="button"
          onClick={() => onArm("confirm")}
          className="group relative mt-5 inline-flex min-h-14 w-full cursor-pointer items-center justify-center overflow-hidden rounded-2xl border border-amber-200/35 bg-[linear-gradient(105deg,#3f0b14_0%,#7f1d1d_38%,#172033_72%,#8a6116_100%)] px-6 text-lg font-black uppercase tracking-[0.16em] text-amber-50 shadow-[0_0_34px_rgba(127,29,29,0.20)] transition duration-200 hover:-translate-y-0.5 hover:scale-[1.005] hover:border-amber-200/55 hover:shadow-[0_0_52px_rgba(180,83,9,0.25)] active:translate-y-0 motion-reduce:transform-none"
        >
          <span aria-hidden="true" className="absolute inset-y-0 -left-1/3 w-1/3 skew-x-[-18deg] bg-amber-100/10 blur-sm transition-transform duration-700 group-hover:translate-x-[430%]" />
          <span className="relative transition group-hover:animate-pulse motion-reduce:animate-none">⚡ DESYNCED! ⚡</span>
        </button>
      )}

      <div className="mt-4 grid gap-2 text-[10px] uppercase tracking-[0.14em] text-slate-500 sm:grid-cols-3">
        <div className="rounded-xl border border-white/[0.07] bg-black/20 px-3 py-2">Incident · independent truth</div>
        <div className="rounded-xl border border-white/[0.07] bg-black/20 px-3 py-2">Winner · unchanged</div>
        <div className="rounded-xl border border-white/[0.07] bg-black/20 px-3 py-2">Settlement · commissioner review</div>
      </div>
    </section>
  );
}

function TeamButton({ active, tone, onClick, children }: { active: boolean; tone: TeamKey; onClick: () => void; children: string }) {
  const activeClass = tone === "gold" ? "border-amber-200/50 bg-amber-300 text-slate-950" : "border-sky-200/50 bg-sky-300 text-slate-950";
  return <button type="button" onClick={onClick} className={`rounded-full border px-3 py-2 text-xs font-bold transition ${active ? activeClass : "border-white/10 bg-white/5 text-slate-300 hover:border-white/25"}`}>{children}</button>;
}

function TeamPanel({
  label,
  players,
  active,
  onWinner,
  tone,
  canSetWinner,
}: {
  label: string;
  players: CanonicalPlayer[];
  active: boolean;
  onWinner: () => void;
  tone: TeamKey;
  canSetWinner: boolean;
}) {
  const activeClass =
    tone === "gold"
      ? "border-amber-200/35 bg-amber-300/[0.08]"
      : "border-sky-200/35 bg-sky-300/[0.08]";

  return (
    <div
      className={`rounded-[1.55rem] border p-5 ${
        active
          ? activeClass
          : "border-white/10 bg-slate-950/70"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xl font-semibold text-white">
          {label}
        </h3>

        {canSetWinner ? (
          <button
            type="button"
            onClick={onWinner}
            disabled={players.length === 0}
            className={`rounded-full px-3 py-2 text-xs font-black transition disabled:opacity-35 ${
              active
                ? "bg-emerald-300 text-emerald-950"
                : "border border-white/12 bg-white/5 text-slate-200"
            }`}
          >
            {active
              ? "Victorious Side"
              : "Set As Winner"}
          </button>
        ) : active ? (
          <span className="rounded-full border border-emerald-200/20 bg-emerald-300/[0.07] px-3 py-2 text-xs font-black text-emerald-100/80">
            Victorious Side
          </span>
        ) : null}
      </div>

      <div className="mt-4 space-y-2">
        {players.length === 0 ? (
          <div className="text-sm text-slate-500">
            Team not resolved.
          </div>
        ) : (
          players.map((player) => (
            <div
              key={player.stablePlayerKey}
              className="rounded-xl border border-white/8 bg-black/20 px-3 py-2 text-sm font-semibold text-white"
            >
              {player.name}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
