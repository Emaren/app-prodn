
"use client";

import Link from "next/link";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import ScheduledMatchCard, {
  type ScheduledMatchCardActionKind,
  type ScheduledMatchCardActionState,
} from "@/components/challenge/ScheduledMatchCard";
import { useLobbyAppearance } from "@/components/lobby/LobbyAppearanceContext";
import TimeDisplayText from "@/components/time/TimeDisplayText";
import SteamLoginButton from "@/components/SteamLoginButton";
import AutoGrowTextarea from "@/components/ui/AutoGrowTextarea";
import { useUserAuth } from "@/context/UserAuthContext";
import { CHALLENGE_NOTE_MAX_CHARS } from "@/lib/challengeConfig";
import type { ChallengeActivityItem, ChallengeHubSnapshot } from "@/lib/challenges";
import {
  buildUtcDateTimeInputValue,
  parseUtcDateTimeInputValue,
} from "@/lib/timeDisplay";

const EMPTY_SNAPSHOT: ChallengeHubSnapshot = {
  viewer: null,
  candidates: [],
  scheduledMatches: [],
  historyMatches: [],
  activities: [],
  record: {
    wins: 0,
    losses: 0,
    pending: 0,
    accepted: 0,
    declined: 0,
    cancelled: 0,
    completed: 0,
    forfeited: 0,
    total: 0,
  },
  updatedAt: new Date(0).toISOString(),
};

function defaultScheduledAtValue() {
  const next = new Date(Date.now() + 60 * 60 * 1000);
  next.setUTCSeconds(0, 0);

  const roundedMinutes = Math.ceil(next.getUTCMinutes() / 15) * 15;
  if (roundedMinutes >= 60) {
    next.setUTCHours(next.getUTCHours() + 1);
    next.setUTCMinutes(0, 0, 0);
  } else {
    next.setUTCMinutes(roundedMinutes, 0, 0);
  }

  return buildUtcDateTimeInputValue(next);
}

function formatActivityTitle(activity: ChallengeActivityItem) {
  switch (activity.eventType) {
    case "scheduled":
      return "Challenge scheduled";
    case "accepted":
      return "Challenge accepted";
    case "declined":
      return "Challenge declined";
    case "cancelled":
      return "Challenge cancelled";
    case "completed":
      return "Match completed";
    case "forfeited":
      return "Match forfeited";
    default:
      return activity.eventType.replace(/_/g, " ");
  }
}

export default function ChallengeWorkspace() {
  const { loading: authLoading, isAuthenticated, uid } = useUserAuth();
  const { timeDisplayMode, setTimeDisplayMode, browserTimeZone } = useLobbyAppearance();
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

  const historyMatches = useMemo(
    () => snapshot.historyMatches.slice(0, 8),
    [snapshot.historyMatches]
  );

  const recentActivities = useMemo(
    () => snapshot.activities.slice(0, 8),
    [snapshot.activities]
  );

  const scheduledPreview = useMemo(
    () => parseUtcDateTimeInputValue(scheduledAt),
    [scheduledAt]
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

    const parsedScheduledAt = parseUtcDateTimeInputValue(scheduledAt);
    if (!parsedScheduledAt) {
      setError("Choose a valid UTC start time.");
      setSaving(false);
      return;
    }

    try {
      const response = await fetch("/api/challenges", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          challengedUid,
          scheduledAt: parsedScheduledAt.toISOString(),
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

          <div className="grid gap-3 sm:grid-cols-4 lg:grid-cols-2">
            <StatCard label="Your Runway" value={String(activeRunwayCount)} />
            <StatCard label="Incoming" value={String(pendingIncomingCount)} />
            <StatCard label="Ready" value={String(readyCount)} live helper="Accepted scheduled games" />
            <StatCard label="Ledger" value={String(snapshot.record.total)} helper="Recent challenge history" />
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.88fr_1.12fr]">
        <section className="space-y-6">
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

                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setTimeDisplayMode(timeDisplayMode === "utc" ? "local" : "utc")
                      }
                      className="text-left text-sm text-slate-300 transition hover:text-white"
                    >
                      Start Time (UTC)
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setTimeDisplayMode(timeDisplayMode === "utc" ? "local" : "utc")
                      }
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-slate-300 transition hover:border-white/25 hover:text-white"
                    >
                      Show {timeDisplayMode === "utc" ? "Local" : "UTC"} By Default
                    </button>
                  </div>
                  <input
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(event) => setScheduledAt(event.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none focus:border-amber-300/50"
                  />
                  <div className="mt-2 space-y-2 text-xs text-slate-500">
                    <div>
                      Scheduled matches are stored in UTC so both players share one universal clock.
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3 text-slate-300">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                        Your site default
                      </div>
                      <div className="mt-2">
                        {scheduledPreview ? (
                          <TimeDisplayText
                            value={scheduledPreview}
                            className="font-medium text-white"
                            bubbleClassName="max-w-[16rem] text-center"
                          />
                        ) : (
                          "Pick a valid start time to preview it."
                        )}
                      </div>
                      <div className="mt-2 text-[11px] text-slate-400">
                        {timeDisplayMode === "local"
                          ? `Local display${browserTimeZone ? ` (${browserTimeZone})` : ""} with UTC on hover or tap.`
                          : "UTC display with your browser-local time on hover or tap."}
                      </div>
                    </div>
                  </div>
                </div>

                <label className="block space-y-2">
                  <span className="text-sm text-slate-300">Message</span>
                  <AutoGrowTextarea
                    value={challengeNote}
                    onChange={(event) =>
                      setChallengeNote(event.target.value.slice(0, CHALLENGE_NOTE_MAX_CHARS))
                    }
                    maxRows={4}
                    maxLength={CHALLENGE_NOTE_MAX_CHARS}
                    className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm leading-6 text-white outline-none focus:border-amber-300/50"
                    placeholder="Bo3 on Yucatan in an hour? Let's put it on the board."
                  />
                  <div className="text-right text-[11px] uppercase tracking-[0.18em] text-slate-500">
                    {challengeNote.length}/{CHALLENGE_NOTE_MAX_CHARS}
                  </div>
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
                <div className="text-xs uppercase tracking-[0.35em] text-slate-300/70">
                  Challenge Record
                </div>
                <h2 className="mt-2 text-2xl font-semibold text-white">Your Numbers</h2>
              </div>
              <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
                {snapshot.record.total} total
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Wins" value={String(snapshot.record.wins)} />
              <StatCard label="Losses" value={String(snapshot.record.losses)} />
              <StatCard label="Completed" value={String(snapshot.record.completed)} />
              <StatCard label="Forfeited" value={String(snapshot.record.forfeited)} />
              <StatCard label="Pending" value={String(snapshot.record.pending)} />
              <StatCard label="Accepted" value={String(snapshot.record.accepted)} />
              <StatCard label="Declined" value={String(snapshot.record.declined)} />
              <StatCard label="Cancelled" value={String(snapshot.record.cancelled)} />
            </div>
          </section>
        </section>

        <section className="space-y-6">
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
          </section>

          <section className="rounded-[1.8rem] border border-white/10 bg-slate-950/75 p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.35em] text-slate-300/70">
                  Challenge Activity
                </div>
                <h3 className="mt-2 text-xl font-semibold text-white">Recent Challenge Activity</h3>
              </div>
              <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
                {recentActivities.length} shown
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {recentActivities.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-5 text-sm text-slate-300">
                  Challenge activity will land here as the ledger fills out.
                </div>
              ) : (
                recentActivities.map((activity) => (
                  <div
                    key={`${activity.scheduledMatchId}-${activity.id}`}
                    className="rounded-[1.25rem] border border-white/10 bg-white/[0.04] px-4 py-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-white">
                          {formatActivityTitle(activity)}
                        </div>
                        <div className="mt-1 text-[11px] uppercase tracking-[0.22em] text-slate-500">
                          {activity.actorName ? `${activity.actorName} · ` : ""}
                          <TimeDisplayText value={activity.createdAt} className="text-slate-400" />
                        </div>
                      </div>
                      <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-slate-300">
                        Match #{activity.scheduledMatchId}
                      </div>
                    </div>
                    {activity.detail ? (
                      <div className="mt-3 text-sm leading-6 text-slate-300">{activity.detail}</div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="rounded-[1.8rem] border border-white/10 bg-slate-950/75 p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.35em] text-slate-300/70">
                  Challenge History
                </div>
                <h3 className="mt-2 text-xl font-semibold text-white">Past Scheduled Matches</h3>
              </div>
              <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
                {snapshot.historyMatches.length} tracked
              </div>
            </div>

            <div className="mt-5 space-y-4">
              {historyMatches.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-5 text-sm text-slate-300">
                  No older challenge history yet.
                </div>
              ) : (
                historyMatches.map((match) => (
                  <ScheduledMatchCard
                    key={`history-${match.id}`}
                    match={match}
                    viewerUid={uid}
                    onAccept={(challengeId) => updateMatch(challengeId, "accept")}
                    onDecline={(challengeId) => updateMatch(challengeId, "decline")}
                    onCancel={(challengeId) => updateMatch(challengeId, "cancel")}
                    onReschedule={(challengeId, payload) =>
                      updateMatch(challengeId, "reschedule", payload)
                    }
                    actionState={actionState}
                    compact
                  />
                ))
              )}
            </div>
          </section>
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
