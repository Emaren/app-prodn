"use client";

import Link from "next/link";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import ScheduledMatchCard, {
  type ScheduledMatchCardActionKind,
  type ScheduledMatchCardActionState,
} from "@/components/challenge/ScheduledMatchCard";
import SteamLoginButton from "@/components/SteamLoginButton";
import { useUserAuth } from "@/context/UserAuthContext";
import type { ChallengeHubSnapshot } from "@/lib/challenges";

const EMPTY_SNAPSHOT: ChallengeHubSnapshot = {
  viewer: null,
  candidates: [],
  scheduledMatches: [],
  updatedAt: new Date(0).toISOString(),
};

function defaultScheduledAtValue() {
  const next = new Date(Date.now() + 60 * 60 * 1000);
  next.setSeconds(0, 0);

  const roundedMinutes = Math.ceil(next.getMinutes() / 15) * 15;
  if (roundedMinutes >= 60) {
    next.setHours(next.getHours() + 1);
    next.setMinutes(0);
  } else {
    next.setMinutes(roundedMinutes);
  }

  const local = new Date(next.getTime() - next.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export default function ChallengeWorkspace() {
  const { loading: authLoading, isAuthenticated, uid } = useUserAuth();
  const [snapshot, setSnapshot] = useState<ChallengeHubSnapshot>(EMPTY_SNAPSHOT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionState, setActionState] = useState<ScheduledMatchCardActionState>({
    challengeId: null,
    kind: null,
  });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [challengedUid, setChallengedUid] = useState("");
  const [scheduledAt, setScheduledAt] = useState(() => defaultScheduledAtValue());
  const [challengeNote, setChallengeNote] = useState("");

  useEffect(() => {
    if (authLoading) return;

    let cancelled = false;

    const load = async () => {
      setLoading(true);

      try {
        const response = await fetch("/api/challenges", {
          cache: "no-store",
        });

        const payload = (await response.json().catch(() => null)) as ChallengeHubSnapshot | null;
        if (!response.ok) {
          throw new Error(
            payload && typeof payload === "object" && "detail" in payload
              ? String((payload as { detail?: unknown }).detail || "Challenge hub unavailable.")
              : "Challenge hub unavailable."
          );
        }

        if (!cancelled && payload) {
          setError(null);
          setSnapshot(payload);
        }
      } catch (loadError) {
        if (!cancelled) {
          const message =
            loadError instanceof Error ? loadError.message : "Challenge hub unavailable.";
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [authLoading, isAuthenticated]);

  const pendingIncomingCount = useMemo(
    () =>
      snapshot.scheduledMatches.filter(
        (match) => match.displayState === "pending" && match.challenged.uid === uid
      ).length,
    [snapshot.scheduledMatches, uid]
  );

  const activeRunwayCount = useMemo(
    () =>
      snapshot.scheduledMatches.filter((match) =>
        ["pending", "accepted", "live"].includes(match.displayState)
      ).length,
    [snapshot.scheduledMatches]
  );

  const readyCount = useMemo(
    () => snapshot.scheduledMatches.filter((match) => match.displayState === "accepted").length,
    [snapshot.scheduledMatches]
  );
  const activeRunwayMatches = useMemo(
    () =>
      snapshot.scheduledMatches.filter((match) =>
        ["pending", "accepted", "live"].includes(match.displayState)
      ),
    [snapshot.scheduledMatches]
  );
  const recentDecisionMatches = useMemo(
    () =>
      snapshot.scheduledMatches.filter((match) =>
        ["declined", "cancelled", "completed", "forfeited"].includes(match.displayState)
      ),
    [snapshot.scheduledMatches]
  );

  async function updateMatch(
    challengeId: number,
    action: ScheduledMatchCardActionKind,
    extra?: {
      scheduledAt?: string;
      challengeNote?: string;
    }
  ) {
    setActionState({
      challengeId,
      kind: action,
    });
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(`/api/challenges/${challengeId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action,
          ...extra,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | (ChallengeHubSnapshot & { detail?: string })
        | null;

      if (!response.ok || !payload) {
        throw new Error(payload?.detail || "Challenge update failed.");
      }

      setSnapshot(payload);
      setNotice(
        action === "accept"
          ? "Challenge accepted. Ready on board."
          : action === "decline"
            ? "Challenge declined."
            : action === "cancel"
              ? "Challenge cancelled."
              : "New start time sent. Waiting on acceptance again."
      );
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Challenge update failed.");
    } finally {
      setActionState({
        challengeId: null,
        kind: null,
      });
    }
  }

  async function submitChallenge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/challenges", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          challengedUid,
          scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : "",
          challengeNote,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | (ChallengeHubSnapshot & { detail?: string })
        | null;

      if (!response.ok || !payload) {
        throw new Error(payload?.detail || "Unable to schedule the game.");
      }

      setSnapshot(payload);
      setNotice("Challenge sent to inbox and board.");
      setChallengedUid("");
      setChallengeNote("");
      setScheduledAt(defaultScheduledAtValue());
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to schedule the game.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="space-y-5 py-5 text-white sm:space-y-6 sm:py-6">
      <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.16),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(34,197,94,0.10),_transparent_24%),linear-gradient(135deg,_#101828,_#0f172a_45%,_#020617)] p-6 sm:p-8">
        <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-5">
            <div className="text-sm uppercase tracking-[0.4em] text-amber-200/70">Challenge</div>
            <h1 className="max-w-3xl text-4xl font-semibold leading-[1.02] text-white sm:text-5xl">
              Schedule Matches
            </h1>

            <div className="flex flex-wrap gap-2">
              <HeroPill>{snapshot.candidates.length} players available</HeroPill>
              <HeroPill>{pendingIncomingCount} awaiting you</HeroPill>
              <HeroPill live>{readyCount} locked in</HeroPill>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/live-games"
                className="rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
              >
                Back To Live Games
              </Link>
              <Link
                href="/players"
                className="rounded-full border border-white/15 px-5 py-3 text-sm text-white/85 transition hover:border-white/30 hover:text-white"
              >
                Browse Players
              </Link>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <StatCard label="Your Runway" value={String(activeRunwayCount)} />
            <StatCard label="Incoming" value={String(pendingIncomingCount)} />
            <StatCard label="Ready" value={String(readyCount)} live helper="Accepted scheduled games" />
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <section className="rounded-[1.8rem] border border-white/10 bg-slate-950/75 p-5 sm:p-6">
          <div className="text-xs uppercase tracking-[0.35em] text-amber-200/70">New Match</div>
          <h2 className="mt-2 text-2xl font-semibold text-white">Schedule New Game</h2>

          {authLoading || loading ? (
            <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 px-4 py-5 text-sm text-slate-300">
              Loading challenge hub...
            </div>
          ) : !isAuthenticated ? (
            <div className="mt-5 rounded-[1.5rem] border border-white/10 bg-white/5 p-5">
              <div className="text-lg font-semibold text-white">Sign in to challenge another player.</div>
              <div className="mt-2 text-sm text-slate-300">
                Steam sign-in keeps the scheduled match tied to a real identity.
              </div>
              <SteamLoginButton
                returnTo="/challenge"
                className="mt-4 rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-200"
              />
            </div>
          ) : (
            <form onSubmit={submitChallenge} className="mt-5 space-y-4">
              <label className="block space-y-2">
                <span className="text-sm text-slate-300">Challenge Player</span>
                <select
                  value={challengedUid}
                  onChange={(event) => setChallengedUid(event.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none focus:border-amber-300/50"
                >
                  <option value="">Choose a warrior</option>
                  {snapshot.candidates.map((candidate) => (
                    <option key={candidate.uid} value={candidate.uid}>
                      {candidate.name}
                      {candidate.isOnline ? " · Online" : ""}
                      {candidate.verified ? " · Verified" : ""}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-2">
                <span className="text-sm text-slate-300">Start Time</span>
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(event) => setScheduledAt(event.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none focus:border-amber-300/50"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm text-slate-300">Message</span>
                <textarea
                  value={challengeNote}
                  onChange={(event) => setChallengeNote(event.target.value)}
                  rows={4}
                  className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none focus:border-amber-300/50"
                  placeholder="Bo3 on Yucatan in an hour? Let's put it on the board."
                />
              </label>

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
                disabled={saving}
                className="rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Scheduling..." : "Schedule Match"}
              </button>
            </form>
          )}
        </section>

        <section className="rounded-[1.8rem] border border-white/10 bg-slate-950/75 p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.35em] text-cyan-200/70">Your Runway</div>
              <h2 className="mt-2 text-2xl font-semibold text-white">Active Match Tiles</h2>
            </div>
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
              {activeRunwayMatches.length} active
            </div>
          </div>

          <div className="mt-5 space-y-4">
            {activeRunwayMatches.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-5 text-sm text-slate-300">
                No active scheduled matches.
              </div>
            ) : (
              activeRunwayMatches.map((match) => (
                <ScheduledMatchCard
                  key={match.id}
                  match={match}
                  viewerUid={uid}
                  onAccept={(challengeId) => updateMatch(challengeId, "accept")}
                  onDecline={(challengeId) => updateMatch(challengeId, "decline")}
                  onCancel={(challengeId) => updateMatch(challengeId, "cancel")}
                  onReschedule={(challengeId, payload) =>
                    updateMatch(challengeId, "reschedule", payload)
                  }
                  actionState={actionState}
                />
              ))
            )}
          </div>

          {recentDecisionMatches.length > 0 ? (
            <div className="mt-6 border-t border-white/10 pt-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-xs uppercase tracking-[0.35em] text-slate-300/70">
                    Recent Decisions
                  </div>
                  <h3 className="mt-2 text-xl font-semibold text-white">Recent Updates</h3>
                </div>
                <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
                  {recentDecisionMatches.length} recent
                </div>
              </div>

              <div className="mt-5 space-y-4">
                {recentDecisionMatches.map((match) => (
                  <ScheduledMatchCard
                    key={`recent-${match.id}`}
                    match={match}
                    viewerUid={uid}
                    onAccept={(challengeId) => updateMatch(challengeId, "accept")}
                    onDecline={(challengeId) => updateMatch(challengeId, "decline")}
                    onCancel={(challengeId) => updateMatch(challengeId, "cancel")}
                    onReschedule={(challengeId, payload) =>
                      updateMatch(challengeId, "reschedule", payload)
                    }
                    actionState={actionState}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </section>
      </section>
    </main>
  );
}

function HeroPill({
  children,
  live = false,
}: {
  children: ReactNode;
  live?: boolean;
}) {
  return (
    <div
      className={
        live
          ? "rounded-full border border-emerald-300/25 bg-emerald-400/10 px-3 py-1.5 text-xs text-emerald-100"
          : "rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200"
      }
    >
      {children}
    </div>
  );
}

function StatCard({
  label,
  value,
  live = false,
  helper,
}: {
  label: string;
  value: string;
  live?: boolean;
  helper?: string;
}) {
  return (
    <div className="rounded-[1.4rem] border border-white/10 bg-white/5 px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs uppercase tracking-[0.25em] text-slate-400">{label}</div>
        {live ? (
          <div className="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-2.5 py-1 text-[11px] text-emerald-100">
            live
          </div>
        ) : null}
      </div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
      {helper ? <div className="mt-1 text-xs text-slate-400">{helper}</div> : null}
    </div>
  );
}
