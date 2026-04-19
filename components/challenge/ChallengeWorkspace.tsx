
"use client";

import Link from "next/link";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Clock3, MessageSquareMore, Plus } from "lucide-react";

import ScheduledMatchCard, {
  type ScheduledMatchCardActionKind,
  type ScheduledMatchCardActionState,
} from "@/components/challenge/ScheduledMatchCard";
import { useLobbyAppearance } from "@/components/lobby/LobbyAppearanceContext";
import TimeDisplayText from "@/components/time/TimeDisplayText";
import SteamLoginButton from "@/components/SteamLoginButton";
import AutoGrowTextarea from "@/components/ui/AutoGrowTextarea";
import { useUserAuth } from "@/context/UserAuthContext";
import {
  CHALLENGE_DEFAULT_GUARANTEE_WOLO,
  CHALLENGE_DEFAULT_WAGER_WOLO,
  CHALLENGE_NOTE_MAX_CHARS,
} from "@/lib/challengeConfig";
import type { ChallengeActivityItem, ChallengeHubSnapshot } from "@/lib/challenges";
import {
  formatDateTime,
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
    funded: 0,
    ready: 0,
    declined: 0,
    cancelled: 0,
    completed: 0,
    forfeited: 0,
    noShows: 0,
    total: 0,
  },
  serverNow: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
};

const ACTIVE_RUNWAY_STATES: string[] = [
  "proposed",
  "pending",
  "terms_accepted",
  "accepted",
  "creator_funded",
  "opponent_funded",
  "funded",
  "checkin_open",
  "left_checked_in",
  "right_checked_in",
  "ready",
  "live",
] as const;

function defaultScheduledAtValue() {
  const next = new Date(Date.now() + 60 * 60 * 1000);
  next.setSeconds(0, 0);

  const roundedMinutes = Math.ceil(next.getMinutes() / 15) * 15;
  if (roundedMinutes >= 60) {
    next.setHours(next.getHours() + 1);
    next.setMinutes(0, 0, 0);
  } else {
    next.setMinutes(roundedMinutes, 0, 0);
  }

  return toLocalDateTimeValue(next);
}

function toLocalDateTimeValue(value: string | Date) {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function parseLocalDateTimeInputValue(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return null;
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatActivityTitle(activity: ChallengeActivityItem) {
  switch (activity.eventType) {
    case "scheduled":
      return "Challenge scheduled";
    case "accepted":
      return "Challenge accepted";
    case "terms_accepted":
      return "Terms accepted";
    case "creator_funded":
      return "Creator funded";
    case "opponent_funded":
      return "Opponent funded";
    case "left_checked_in":
    case "right_checked_in":
      return "Check-in recorded";
    case "live_confirmed":
      return "Live confirmed";
    case "no_show_left":
    case "no_show_right":
    case "double_no_show":
      return "No-show resolved";
    case "declined":
      return "Challenge declined";
    case "cancelled":
    case "canceled":
      return "Challenge cancelled";
    case "rescheduled":
      return "Challenge rescheduled";
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
  const scheduleFormId = "schedule-game";
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
  const [wagerAmountWolo, setWagerAmountWolo] = useState(String(CHALLENGE_DEFAULT_WAGER_WOLO));
  const [guaranteeAmountWolo, setGuaranteeAmountWolo] = useState(
    String(CHALLENGE_DEFAULT_GUARANTEE_WOLO)
  );
  const [focusedMatchId, setFocusedMatchId] = useState<number | null>(null);

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
        (match) => ["proposed", "pending"].includes(match.displayState) && match.challenged.uid === uid
      ).length,
    [snapshot.scheduledMatches, uid]
  );

  const activeRunwayCount = useMemo(
    () =>
      snapshot.scheduledMatches.filter((match) => ACTIVE_RUNWAY_STATES.includes(match.displayState))
        .length,
    [snapshot.scheduledMatches]
  );

  const fundedCount = useMemo(
    () =>
      snapshot.scheduledMatches.filter((match) =>
        ["creator_funded", "opponent_funded", "funded", "checkin_open"].includes(match.displayState)
      ).length,
    [snapshot.scheduledMatches]
  );

  const readyCount = useMemo(
    () =>
      snapshot.scheduledMatches.filter((match) =>
        ["ready", "left_checked_in", "right_checked_in", "live"].includes(match.displayState)
      ).length,
    [snapshot.scheduledMatches]
  );

  const activeRunwayMatches = useMemo(
    () => snapshot.scheduledMatches.filter((match) => ACTIVE_RUNWAY_STATES.includes(match.displayState)),
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
    () => parseLocalDateTimeInputValue(scheduledAt),
    [scheduledAt]
  );
  const schedulePreviewLocal = useMemo(
    () =>
      formatDateTime(
        scheduledPreview,
        {
          timeDisplayMode: "local",
          timezoneOverride: browserTimeZone,
        },
        {
          browserTimeZone,
          includeZone: true,
        }
      ),
    [browserTimeZone, scheduledPreview]
  );
  const schedulePreviewUtc = useMemo(
    () =>
      formatDateTime(
        scheduledPreview,
        {
          timeDisplayMode: "utc",
          timezoneOverride: null,
        },
        {
          includeZone: true,
        }
      ),
    [scheduledPreview]
  );
  const schedulePreviewUtcCompact = useMemo(
    () =>
      formatDateTime(
        scheduledPreview,
        {
          timeDisplayMode: "utc",
          timezoneOverride: null,
        },
        {
          includeZone: false,
        }
      ),
    [scheduledPreview]
  );
  const totalFundingPreview = useMemo(
    () =>
      (Number.parseInt(wagerAmountWolo, 10) || 0) + (Number.parseInt(guaranteeAmountWolo, 10) || 0),
    [guaranteeAmountWolo, wagerAmountWolo]
  );
  const focusedMatch = useMemo(
    () => activeRunwayMatches.find((match) => match.id === focusedMatchId) || activeRunwayMatches[0] || null,
    [activeRunwayMatches, focusedMatchId]
  );
  const focusedMatchActivities = useMemo(
    () =>
      focusedMatch
        ? snapshot.activities
            .filter((activity) => activity.scheduledMatchId === focusedMatch.id)
            .slice(0, 4)
        : [],
    [focusedMatch, snapshot.activities]
  );
  const focusedCounterpart = useMemo(() => {
    if (!focusedMatch || !uid) {
      return null;
    }

    return focusedMatch.challenger.uid === uid
      ? focusedMatch.challenged
      : focusedMatch.challenger;
  }, [focusedMatch, uid]);

  useEffect(() => {
    if (activeRunwayMatches.length === 0) {
      setFocusedMatchId(null);
      return;
    }

    setFocusedMatchId((current) =>
      current && activeRunwayMatches.some((match) => match.id === current)
        ? current
        : activeRunwayMatches[0].id
    );
  }, [activeRunwayMatches]);

  function toggleSiteTimePreference() {
    setTimeDisplayMode(timeDisplayMode === "local" ? "utc" : "local");
  }

  async function updateMatch(
    challengeId: number,
    action: ScheduledMatchCardActionKind,
    extra?: {
      scheduledAt?: string;
      challengeNote?: string;
      wagerAmountWolo?: number;
      guaranteeAmountWolo?: number;
      fundingTxHash?: string;
      fundingWalletAddress?: string;
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
          ? "Terms accepted. Creator funding is next."
          : action === "decline"
            ? "Challenge declined."
            : action === "cancel"
              ? "Challenge cancelled."
              : action === "fund"
                ? "Funding recorded on the rail."
                : action === "check_in"
                  ? "Check-in locked before start."
                  : "New timing and terms sent."
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

    const parsedScheduledAt = parseLocalDateTimeInputValue(scheduledAt);
    if (!parsedScheduledAt) {
      setError("Choose a valid start time.");
      setSaving(false);
      return;
    }

    try {
      const parsedWagerAmountWolo = Number.parseInt(wagerAmountWolo, 10);
      const parsedGuaranteeAmountWolo = Number.parseInt(guaranteeAmountWolo, 10);
      const response = await fetch("/api/challenges", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          challengedUid,
          scheduledAt: parsedScheduledAt.toISOString(),
          challengeNote,
          wagerAmountWolo: parsedWagerAmountWolo,
          guaranteeAmountWolo: parsedGuaranteeAmountWolo,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | (ChallengeHubSnapshot & { detail?: string })
        | null;

      if (!response.ok || !payload) {
        throw new Error(payload?.detail || "Unable to schedule the game.");
      }

      setSnapshot(payload);
      setNotice("Challenge sent with terms on the rail.");
      setChallengedUid("");
      setChallengeNote("");
      setScheduledAt(defaultScheduledAtValue());
      setWagerAmountWolo(String(CHALLENGE_DEFAULT_WAGER_WOLO));
      setGuaranteeAmountWolo(String(CHALLENGE_DEFAULT_GUARANTEE_WOLO));
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
              <HeroPill live>{readyCount} match-ready</HeroPill>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href={`#${scheduleFormId}`}
                className="group inline-flex items-center gap-3 rounded-full border border-amber-200/18 bg-[linear-gradient(135deg,rgba(251,191,36,0.18),rgba(245,158,11,0.08))] px-3 py-2 text-white shadow-[0_18px_34px_rgba(245,158,11,0.12)] transition hover:border-amber-200/30 hover:bg-[linear-gradient(135deg,rgba(251,191,36,0.22),rgba(245,158,11,0.12))]"
              >
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-amber-200/20 bg-amber-300/15 text-amber-50">
                  <Plus className="h-4 w-4" />
                </span>
                <span className="text-left">
                  <span className="block text-sm font-semibold text-white">+ Game</span>
                  <span className="block text-[11px] uppercase tracking-[0.2em] text-amber-100/70">
                    Start a scheduled duel
                  </span>
                </span>
                <ArrowUpRight className="h-4 w-4 text-amber-50/80 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </Link>
              <Link
                href="/live-games"
                className="inline-flex items-center rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
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
            <StatCard label="Funded" value={String(fundedCount)} helper="Money locked on the rail" />
            <StatCard label="Ready" value={String(readyCount)} live helper="Checked in or live" />
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.88fr_1.12fr]">
        <section className="space-y-6">
          <section
            id={scheduleFormId}
            className="rounded-[1.8rem] border border-white/10 bg-slate-950/75 p-5 sm:p-6"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-xs uppercase tracking-[0.35em] text-amber-200/70">New Match</div>
                <h2 className="mt-2 text-2xl font-semibold text-white">Create The Runway</h2>
                <div className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                  Pick the rival, lock the terms, send it.
                </div>
              </div>
              <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-slate-300">
                Match economy rail
              </div>
            </div>

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
                    className="w-full cursor-pointer rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none transition hover:border-white/20 focus:border-amber-300/50"
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
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="block text-sm text-slate-200">Start Time</span>
                    <button
                      type="button"
                      onClick={toggleSiteTimePreference}
                      className="text-[11px] text-slate-400 transition hover:text-white"
                    >
                      {timeDisplayMode === "local" ? "Use UTC sitewide" : "Use Local sitewide"}
                    </button>
                  </div>
                  <input
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(event) => setScheduledAt(event.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none focus:border-amber-300/50"
                  />
                  <div className="rounded-[1.35rem] border border-white/10 bg-white/[0.04] px-4 py-4 text-slate-300">
                    <div className="text-base font-medium text-white sm:text-lg">
                      {schedulePreviewLocal === "—" ? "Pick a start time." : schedulePreviewLocal}
                    </div>
                    <div className="mt-2 text-xs text-slate-400">
                      {schedulePreviewUtc === "—"
                        ? "UTC anchor appears here."
                        : `UTC ${schedulePreviewUtcCompact}`}
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="block space-y-2">
                    <span className="text-sm text-slate-300">Wolo Wager</span>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={wagerAmountWolo}
                      onChange={(event) => setWagerAmountWolo(event.target.value)}
                      className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none focus:border-amber-300/50"
                    />
                  </label>
                  <label className="block space-y-2">
                    <span className="text-sm text-slate-300">Match Guarantee</span>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={guaranteeAmountWolo}
                      onChange={(event) => setGuaranteeAmountWolo(event.target.value)}
                      className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none focus:border-amber-300/50"
                    />
                  </label>
                  <div className="rounded-[1.35rem] border border-amber-300/18 bg-amber-400/10 px-4 py-4">
                    <div className="text-[11px] uppercase tracking-[0.2em] text-amber-100/70">
                      Funding each
                    </div>
                    <div className="mt-2 text-lg font-semibold text-white">
                      {totalFundingPreview.toLocaleString()} WOLO
                    </div>
                    <div className="mt-2 text-xs text-slate-400">
                      One signed funding action per player.
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
                  className="inline-flex items-center gap-2 rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Plus className="h-4 w-4" />
                  {saving ? "Scheduling..." : "Add Game To The Runway"}
                </button>
              </form>
            )}
          </section>

          <section className="rounded-[1.8rem] border border-white/10 bg-slate-950/75 p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-xs uppercase tracking-[0.35em] text-cyan-200/70">
                  Coordination Rail
                </div>
                <h2 className="mt-2 text-2xl font-semibold text-white">Scheduling Line</h2>
                <div className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                  Keep funding state, check-in pressure, latest note, and the direct thread in one calm rail.
                </div>
              </div>
              {focusedMatch ? (
                <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
                  Match #{focusedMatch.id}
                </div>
              ) : null}
            </div>

            {focusedMatch ? (
              <>
                {activeRunwayMatches.length > 1 ? (
                  <div className="mt-5 flex flex-wrap gap-2">
                    {activeRunwayMatches.map((match) => {
                      const counterpart =
                        uid && match.challenger.uid === uid ? match.challenged : match.challenger;
                      const active = focusedMatch.id === match.id;
                      return (
                        <button
                          key={`focus-${match.id}`}
                          type="button"
                          onClick={() => setFocusedMatchId(match.id)}
                          className={`rounded-full px-3 py-2 text-left text-xs transition ${
                            active
                              ? "border border-amber-300/22 bg-amber-400/10 text-amber-50 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.14)]"
                              : "border border-white/10 bg-white/[0.04] text-slate-300 hover:border-white/20 hover:text-white"
                          }`}
                        >
                          <span className="block font-semibold">{counterpart.name}</span>
                          <span className="mt-1 block text-[11px] text-slate-400">
                            {formatDateTime(
                              match.scheduledAt,
                              {
                                timeDisplayMode: "local",
                                timezoneOverride: browserTimeZone,
                              },
                              {
                                browserTimeZone,
                                includeZone: false,
                              }
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}

                <div className="mt-5 rounded-[1.45rem] border border-white/10 bg-white/[0.04] p-4">
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)]">
                    <div className="min-w-0 rounded-[1.25rem] border border-white/10 bg-slate-950/35 px-4 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
                            Match lock
                          </div>
                          <div className="mt-2 text-lg font-semibold text-white">
                            {focusedMatch.challenger.name} vs {focusedMatch.challenged.name}
                          </div>
                        </div>
                        <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                      </div>

                      <div className="mt-4 rounded-[1rem] border border-white/10 bg-white/[0.04] px-3 py-3">
                        <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                          Locked start
                        </div>
                        <div className="mt-2 text-sm font-medium text-white">
                          {formatDateTime(
                            focusedMatch.scheduledAt,
                            {
                              timeDisplayMode: "local",
                              timezoneOverride: browserTimeZone,
                            },
                            {
                              browserTimeZone,
                              includeZone: true,
                            }
                          )}
                        </div>
                        <div className="mt-2 text-xs leading-5 text-slate-400">
                          UTC ·{" "}
                          {formatDateTime(
                            focusedMatch.scheduledAt,
                            {
                              timeDisplayMode: "utc",
                              timezoneOverride: null,
                            },
                            {
                              includeZone: true,
                            }
                          )}
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 sm:grid-cols-3">
                        <QuickRailCell
                          label="Wolo Wager"
                          value={`${focusedMatch.terms.wagerAmountWolo.toLocaleString()} WOLO`}
                        />
                        <QuickRailCell
                          label="Match Guarantee"
                          value={`${focusedMatch.terms.guaranteeAmountWolo.toLocaleString()} WOLO`}
                        />
                        <QuickRailCell
                          label="Funding Each"
                          value={`${focusedMatch.terms.totalFundingWolo.toLocaleString()} WOLO`}
                        />
                      </div>

                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <QuickRailCell
                          label="Funding State"
                          value={focusedMatch.economy.statusLabel}
                          detail={focusedMatch.economy.statusDetail}
                        />
                        <QuickRailCell
                          label="Check-In"
                          value={
                            focusedMatch.economy.checkInWindowState === "open"
                              ? "Open now"
                              : focusedMatch.economy.checkInWindowState === "upcoming"
                                ? "Opens soon"
                                : focusedMatch.economy.checkInWindowState === "closed"
                                  ? "Closed"
                                  : "Locked after funding"
                          }
                          detail="Closes exactly at scheduled start."
                        />
                      </div>

                      <div className="mt-4 text-sm leading-6 text-slate-300">
                        {focusedMatch.challengeNote ||
                          "Use the direct line for ready checks, map lock, or a small time shift."}
                      </div>

                      {focusedCounterpart ? (
                        <Link
                          href={`/contact-emaren?user=${encodeURIComponent(focusedCounterpart.uid)}`}
                          className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.05] px-4 py-2 text-sm text-white transition hover:border-white/25 hover:bg-white/[0.08]"
                        >
                          <MessageSquareMore className="h-4 w-4" />
                          Open Direct Thread
                        </Link>
                      ) : null}
                    </div>

                    <div className="min-w-0 rounded-[1.25rem] border border-white/10 bg-slate-950/35 px-4 py-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
                          Conversation rail
                        </div>
                        <div className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-slate-300">
                          Compact by design
                        </div>
                      </div>

                      <div className="mt-4 space-y-3">
                        {focusedMatchActivities.length > 0 ? (
                          focusedMatchActivities.map((activity) => (
                            <CoordinationActivityRow key={`${focusedMatch.id}-${activity.id}`} activity={activity} />
                          ))
                        ) : (
                          <div className="rounded-[1rem] border border-white/10 bg-white/[0.04] px-4 py-4 text-sm text-slate-300">
                            Funding, check-in, and timing updates land here once this match starts moving.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="mt-5 rounded-[1.35rem] border border-white/10 bg-white/[0.04] px-4 py-5 text-sm leading-6 text-slate-300">
                Once a challenge is live, this rail keeps the latest terms, lock timing, and thread shortcut together.
              </div>
            )}
          </section>

          <section className="rounded-[1.8rem] border border-white/10 bg-slate-950/75 p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-xs uppercase tracking-[0.35em] text-slate-300/70">
                  Challenge Record
                </div>
                <h2 className="mt-2 break-words text-2xl font-semibold text-white">Your Numbers</h2>
              </div>
              <div className="shrink-0 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
                {snapshot.record.total} total
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Wins" value={String(snapshot.record.wins)} />
              <StatCard label="Losses" value={String(snapshot.record.losses)} />
              <StatCard label="Pending" value={String(snapshot.record.pending)} />
              <StatCard label="Accepted" value={String(snapshot.record.accepted)} />
              <StatCard label="Funded" value={String(snapshot.record.funded)} />
              <StatCard label="Ready" value={String(snapshot.record.ready)} />
              <StatCard label="Completed" value={String(snapshot.record.completed)} />
              <StatCard label="No-show" value={String(snapshot.record.noShows)} />
              <StatCard label="Forfeited" value={String(snapshot.record.forfeited)} />
              <StatCard label="Declined" value={String(snapshot.record.declined)} />
              <StatCard label="Canceled" value={String(snapshot.record.cancelled)} />
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
                    stacked
                    localTimePrimary
                    serverNow={snapshot.serverNow}
                    onAccept={(challengeId) => updateMatch(challengeId, "accept")}
                    onDecline={(challengeId) => updateMatch(challengeId, "decline")}
                    onCancel={(challengeId) => updateMatch(challengeId, "cancel")}
                    onReschedule={(challengeId, payload) =>
                      updateMatch(challengeId, "reschedule", payload)
                    }
                    onFund={(challengeId, payload) => updateMatch(challengeId, "fund", payload)}
                    onCheckIn={(challengeId) => updateMatch(challengeId, "check_in")}
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
                    localTimePrimary
                    serverNow={snapshot.serverNow}
                    onAccept={(challengeId) => updateMatch(challengeId, "accept")}
                    onDecline={(challengeId) => updateMatch(challengeId, "decline")}
                    onCancel={(challengeId) => updateMatch(challengeId, "cancel")}
                    onReschedule={(challengeId, payload) =>
                      updateMatch(challengeId, "reschedule", payload)
                    }
                    onFund={(challengeId, payload) => updateMatch(challengeId, "fund", payload)}
                    onCheckIn={(challengeId) => updateMatch(challengeId, "check_in")}
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
    <div className="min-w-0 rounded-[1.4rem] border border-white/10 bg-white/5 px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 break-words text-xs uppercase tracking-[0.25em] text-slate-400">
          {label}
        </div>
        {live ? (
          <div className="shrink-0 rounded-full border border-emerald-300/25 bg-emerald-400/10 px-2.5 py-1 text-[11px] text-emerald-100">
            live
          </div>
        ) : null}
      </div>
      <div className="mt-2 break-words text-2xl font-semibold text-white">{value}</div>
      {helper ? <div className="mt-1 text-xs leading-5 text-slate-400">{helper}</div> : null}
    </div>
  );
}

function QuickRailCell({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-[1rem] border border-white/10 bg-white/[0.04] px-3 py-3">
      <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-2 break-words text-sm font-semibold text-white">{value}</div>
      {detail ? <div className="mt-1 text-xs leading-5 text-slate-400">{detail}</div> : null}
    </div>
  );
}

function CoordinationActivityRow({
  activity,
}: {
  activity: ChallengeActivityItem;
}) {
  return (
    <div className="rounded-[1rem] border border-white/10 bg-white/[0.04] px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-white">{formatActivityTitle(activity)}</div>
          <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-slate-500">
            {activity.actorName ? `${activity.actorName} · ` : ""}
            <TimeDisplayText value={activity.createdAt} className="text-slate-400" includeZone={false} />
          </div>
        </div>
      </div>
      {activity.detail ? (
        <div className="mt-2 break-words text-sm leading-6 text-slate-300">{activity.detail}</div>
      ) : null}
    </div>
  );
}
