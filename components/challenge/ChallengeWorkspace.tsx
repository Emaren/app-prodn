"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { FormEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  CalendarClock,
  Crown,
  Gem,
  MessageSquareMore,
  Plus,
  ShieldCheck,
  Sparkles,
  Swords,
  Trophy,
  Wallet,
  Zap,
} from "lucide-react";

import ScheduledMatchCard, {
  type ScheduledMatchCardActionKind,
  type ScheduledMatchCardActionState,
} from "@/components/challenge/ScheduledMatchCard";
import { useLobbyAppearance } from "@/components/lobby/LobbyAppearanceContext";
import SteamLoginButton from "@/components/SteamLoginButton";
import AutoGrowTextarea from "@/components/ui/AutoGrowTextarea";
import { useUserAuth } from "@/context/UserAuthContext";
import { useKeplr } from "@/hooks/use-keplr";
import {
  CHALLENGE_DEFAULT_GUARANTEE_WOLO,
  CHALLENGE_DEFAULT_WAGER_WOLO,
  CHALLENGE_NOTE_MAX_CHARS,
} from "@/lib/challengeConfig";
import {
  fundChallengeEscrow,
} from "@/lib/clientChallengeFunding";
import {
  isRepresentedCountry,
  REPRESENTED_COUNTRIES,
  type RepresentedCountry,
} from "@/lib/champions/titles";
import type { ChallengeHubSnapshot } from "@/lib/challenges";
import type {
  ScheduledMatchColorTag,
  ScheduledMatchViewerPreference,
} from "@/lib/scheduledMatchPreferences";
import { formatDateTime } from "@/lib/timeDisplay";
import { countriesEligibilityMatch } from "@/lib/countryEligibility";

const EMPTY_SNAPSHOT: ChallengeHubSnapshot = {
  viewer: null,
  candidates: [],
  scheduledMatches: [],
  historyMatches: [],
  historyNextCursor: null,
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
  fundingRail: {
    chainId: "wolo-1",
    escrowAddress: null,
    configured: false,
    proofMode: "wolochain_challenge_v1",
  },
  serverNow: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
};

type ChallengeCreateSnapshot = ChallengeHubSnapshot & {
  createdChallengeId?: number | null;
  linkedTrophyChallengeId?: number | null;
  linkedTrophyChallengeIds?: number[];
  titleStakeNames?: string[];
  detail?: string;
  duplicateWarning?: string | null;
};

type PublicTrophyTarget = {
  trophyId: string;
  championTitleId: string | null;
  displayName: string;
  currentHolder: string | null;
  guardianHolder: string | null;
  eligibleNationality: string | null;
  status: string;
  kind: string;
  family: string;
  currentHolderUid: string | null;
  guardianHolderUid: string | null;
  currentBountyWolo: number;
  tributeAmountWolo: number;
  imageUri: string | null;
};

type ChallengeHallView = "basic" | "advanced" | "extreme";

function parseChallengeHallView(value: string | null): ChallengeHallView {
  return value === "basic" || value === "advanced" || value === "extreme" ? value : "extreme";
}

function challengeHallViewHref(search: string, view: ChallengeHallView) {
  const params = new URLSearchParams(search);

  if (view === "extreme") {
    params.delete("view");
  } else {
    params.set("view", view);
  }

  const query = params.toString();
  return query ? `/challenge?${query}` : "/challenge";
}

function ChallengeHallBaEToggle({
  view,
  search,
}: {
  view: ChallengeHallView;
  search: string;
}) {
  const options: Array<{ key: ChallengeHallView; label: string; helper: string }> = [
    { key: "basic", label: "Basic", helper: "Classic" },
    { key: "advanced", label: "Advanced", helper: "Classic +" },
    { key: "extreme", label: "Extreme", helper: "War Hall" },
  ];

  return (
    <div className="inline-grid rounded-full border border-amber-100/14 bg-black/32 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_22px_70px_rgba(0,0,0,0.28)] sm:grid-cols-3">
      {options.map((option) => {
        const active = option.key === view;

        return (
          <Link
            key={option.key}
            href={challengeHallViewHref(search, option.key)}
            className={`rounded-full px-4 py-2.5 text-center transition ${
              active
                ? "bg-amber-300/18 text-amber-50 shadow-[inset_0_0_0_1px_rgba(253,230,138,0.22),0_0_34px_rgba(245,158,11,0.14)]"
                : "text-slate-400 hover:bg-white/[0.05] hover:text-slate-100"
            }`}
          >
            <span className="block text-xs font-black">{option.label}</span>
            <span className="mt-0.5 block text-[9px] font-black uppercase tracking-[0.22em] opacity-60">
              {option.helper}
            </span>
          </Link>
        );
      })}
    </div>
  );
}


const ACTIVE_RUNWAY_STATES: string[] = [
  "issued",
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

type ChallengeWorkspaceProps = {
  initialFocusId?: number | null;
};

export default function ChallengeWorkspace({ initialFocusId = null }: ChallengeWorkspaceProps) {
  const { loading: authLoading, isAuthenticated, uid } = useUserAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { status: walletStatus, address: connectedWalletAddress, connect: connectKeplr } = useKeplr();
  const { timeClockMode, browserTimeZone } = useLobbyAppearance();
  const scheduleFormId = "schedule-game";
  const [snapshot, setSnapshot] = useState<ChallengeHubSnapshot>(EMPTY_SNAPSHOT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingPhase, setSavingPhase] = useState<"idle" | "connecting" | "creating" | "funding" | "recording">("idle");
  const [actionState, setActionState] = useState<ScheduledMatchCardActionState>({
    challengeId: null,
    kind: null,
  });
  const [preferenceBusyId, setPreferenceBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [challengedUid, setChallengedUid] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [useExactSchedule, setUseExactSchedule] = useState(false);
  const [acceptanceWindowHours, setAcceptanceWindowHours] = useState(72);
  const [challengeNote, setChallengeNote] = useState("");
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [routePrefillApplied, setRoutePrefillApplied] = useState(false);
  const [trophyTarget, setTrophyTarget] = useState<PublicTrophyTarget | null>(null);
  const [trophies, setTrophies] = useState<PublicTrophyTarget[]>([]);
  const [trophyTargetLoading, setTrophyTargetLoading] = useState(Boolean(searchParams.get("title")));
  const [wagerAmountWolo, setWagerAmountWolo] = useState(String(CHALLENGE_DEFAULT_WAGER_WOLO));
  const [guaranteeAmountWolo, setGuaranteeAmountWolo] = useState(
    String(CHALLENGE_DEFAULT_GUARANTEE_WOLO)
  );
  const creationAttemptRef = useRef<{
    requestId: string;
    challengeId: number | null;
    fundingResult: { fundingTxHash: string; walletAddress: string } | null;
  } | null>(null);
  const requestedTitle = searchParams.get("title");
  const requestedKind = searchParams.get("kind");
  const requestedCountry = searchParams.get("country");
  const requestedFocusId = Number.parseInt(searchParams.get("focus") || "", 10);
  const challengeHallView = parseChallengeHallView(searchParams.get("view"));
  const challengeHallExtreme = challengeHallView === "extreme";
  const challengeHallAdvanced = challengeHallView !== "basic";
  const routeFocusId =
    typeof initialFocusId === "number" && Number.isFinite(initialFocusId) && initialFocusId > 0
      ? initialFocusId
      : null;
  const effectiveFocusId =
    routeFocusId ??
    (Number.isFinite(requestedFocusId) && requestedFocusId > 0 ? requestedFocusId : null);
  const isNationalChallengeFlow =
    requestedKind === "national" || requestedTitle === "national" || Boolean(requestedCountry);
  const initialNationalCountry = isRepresentedCountry(requestedCountry) ? requestedCountry : "";
  const [selectedNationalCountry, setSelectedNationalCountry] = useState<RepresentedCountry | "">(
    initialNationalCountry
  );
  const returnTo = useMemo(() => {
    const params = searchParams.toString();
    return params ? `/challenge?${params}` : "/challenge";
  }, [searchParams]);

  const buildNationalChallengeNote = useCallback((country: RepresentedCountry | "") => {
    const countryLabel = country || requestedCountry || "my nation";
    const titleLabel = requestedTitle && requestedTitle !== "national"
      ? requestedTitle.replace(/-/g, " ")
      : "national belt";

    return `Challenge for ${countryLabel}'s ${titleLabel}: scheduling with Emaren so the national belt can be created, played for, and awarded after verified match proof.`;
  }, [requestedCountry, requestedTitle]);

  useEffect(() => {
    let cancelled = false;
    setTrophyTargetLoading(Boolean(requestedTitle));
    const loadTarget = async () => {
      try {
        const response = await fetch("/api/trophies", { cache: "no-store" });
        const payload = (await response.json().catch(() => ({}))) as {
          trophies?: PublicTrophyTarget[];
        };
        const nextTrophies = payload.trophies ?? [];
        const target = requestedTitle
          ? nextTrophies.find((trophy) => {
              if (requestedTitle === "national" && requestedCountry) {
                return countriesEligibilityMatch(trophy.eligibleNationality, requestedCountry);
              }
              return trophy.championTitleId === requestedTitle || trophy.trophyId === requestedTitle;
            }) ?? null
          : null;
        if (!cancelled) {
          setTrophies(nextTrophies);
          setTrophyTarget(target);
        }
      } catch {
        if (!cancelled) {
          setTrophies([]);
          setTrophyTarget(null);
        }
      } finally {
        if (!cancelled) setTrophyTargetLoading(false);
      }
    };
    void loadTarget();
    return () => {
      cancelled = true;
    };
  }, [requestedCountry, requestedTitle]);

  useEffect(() => {
    if (authLoading) return;

    let cancelled = false;

    const load = async () => {
      setLoading(true);

      try {
        const challengeApiHref = effectiveFocusId
          ? `/api/challenges?focus=${effectiveFocusId}`
          : "/api/challenges";
        const response = await fetch(challengeApiHref, {
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
  }, [authLoading, effectiveFocusId, isAuthenticated]);

  useEffect(() => {
    if (challengeHallView === "basic") {
      setUseExactSchedule(false);
      setAcceptanceWindowHours(72);
    }
  }, [challengeHallView]);

  useEffect(() => {
    if (routePrefillApplied || loading || authLoading || trophyTargetLoading) {
      return;
    }

    if (!isNationalChallengeFlow && !trophyTarget) {
      setRoutePrefillApplied(true);
      return;
    }

    if (initialNationalCountry) {
      setSelectedNationalCountry(initialNationalCountry);
    }

    const note = trophyTarget
      ? `Challenge for ${trophyTarget.displayName}: scheduled against ${trophyTarget.currentHolder || trophyTarget.guardianHolder || "the current custodian"} and settled only after verified watcher or replay proof.`
      : buildNationalChallengeNote(initialNationalCountry);
    setChallengeNote((current) => current || note.slice(0, CHALLENGE_NOTE_MAX_CHARS));
    setChallengedUid((current) => {
      if (current) return current;
      const targetName = trophyTarget?.currentHolder || trophyTarget?.guardianHolder;
      if (!targetName) return current;
      const normalizedTarget = targetName.trim().toLowerCase();
      const target = snapshot.candidates.find((candidate) => {
        const candidateName = candidate.name.trim().toLowerCase();
        return candidateName === normalizedTarget || candidateName.includes(normalizedTarget);
      });
      return target?.uid || current;
    });
    setRoutePrefillApplied(true);
  }, [
    authLoading,
    buildNationalChallengeNote,
    initialNationalCountry,
    isNationalChallengeFlow,
    loading,
    routePrefillApplied,
    snapshot.candidates,
    trophyTarget,
    trophyTargetLoading,
  ]);

  const pendingIncomingCount = useMemo(
    () =>
      snapshot.scheduledMatches.filter(
        (match) => ["issued", "proposed", "pending"].includes(match.displayState) && match.challenged.uid === uid
      ).length,
    [snapshot.scheduledMatches, uid]
  );

  const activeRunwayCount = useMemo(
    () =>
      snapshot.scheduledMatches.filter((match) => ACTIVE_RUNWAY_STATES.includes(match.displayState))
        .length,
    [snapshot.scheduledMatches]
  );

  const readyCount = useMemo(
    () =>
      snapshot.scheduledMatches.filter((match) =>
        ["ready", "left_checked_in", "right_checked_in", "live"].includes(match.displayState)
      ).length,
    [snapshot.scheduledMatches]
  );

  const activeRunwayMatches = useMemo(() => {
    const attentionStates = new Set(["issued", "proposed", "pending", "creator_funded", "terms_accepted"]);
    return snapshot.scheduledMatches
      .filter((match) => ACTIVE_RUNWAY_STATES.includes(match.displayState))
      .sort((left, right) => {
        const leftNeedsViewer = left.challenged.uid === uid && attentionStates.has(left.displayState);
        const rightNeedsViewer = right.challenged.uid === uid && attentionStates.has(right.displayState);
        if (leftNeedsViewer !== rightNeedsViewer) return leftNeedsViewer ? -1 : 1;
        if (left.displayState === "live" && right.displayState !== "live") return -1;
        if (right.displayState === "live" && left.displayState !== "live") return 1;
        return new Date(right.activityAt).getTime() - new Date(left.activityAt).getTime();
      });
  }, [snapshot.scheduledMatches, uid]);

  const historyMatches = useMemo(
    () => snapshot.historyMatches.slice(0, historyExpanded ? snapshot.historyMatches.length : 3),
    [historyExpanded, snapshot.historyMatches]
  );

  const scheduledPreview = useMemo(
    () => (useExactSchedule ? parseLocalDateTimeInputValue(scheduledAt) : null),
    [scheduledAt, useExactSchedule]
  );
  const schedulePreviewLocal = useMemo(
    () =>
      formatDateTime(
        scheduledPreview,
        {
          timeDisplayMode: "local",
          timeClockMode,
          timezoneOverride: browserTimeZone,
        },
        {
          browserTimeZone,
          includeZone: true,
        }
      ),
    [browserTimeZone, scheduledPreview, timeClockMode]
  );
  const schedulePreviewUtc = useMemo(
    () =>
      formatDateTime(
        scheduledPreview,
        {
          timeDisplayMode: "utc",
          timeClockMode,
          timezoneOverride: null,
        },
        {
          includeZone: true,
        }
      ),
    [scheduledPreview, timeClockMode]
  );
  const schedulePreviewUtcCompact = useMemo(
    () =>
      formatDateTime(
        scheduledPreview,
        {
          timeDisplayMode: "utc",
          timeClockMode,
          timezoneOverride: null,
        },
        {
          includeZone: false,
        }
      ),
    [scheduledPreview, timeClockMode]
  );
  const totalFundingPreview = useMemo(
    () =>
      (Number.parseInt(wagerAmountWolo, 10) || 0) + (Number.parseInt(guaranteeAmountWolo, 10) || 0),
    [guaranteeAmountWolo, wagerAmountWolo]
  );
  const challengeEscrowReady = snapshot.fundingRail.configured;
  const selectedOpponent = useMemo(
    () => snapshot.candidates.find((candidate) => candidate.uid === challengedUid) ?? null,
    [challengedUid, snapshot.candidates]
  );
  const automaticTitleStakes = useMemo(() => {
    if (!challengedUid || !uid) return trophyTarget ? [trophyTarget] : [];
    const participantUids = new Set([uid, challengedUid]);
    const titleRows = trophies.filter((trophy) =>
      participantUids.has(trophy.currentHolderUid || "") ||
      participantUids.has(trophy.guardianHolderUid || "")
    );
    if (trophyTarget && !titleRows.some((trophy) => trophy.trophyId === trophyTarget.trophyId)) {
      titleRows.unshift(trophyTarget);
    }
    return titleRows;
  }, [challengedUid, trophies, trophyTarget, uid]);
  const createButtonLabel = !challengeEscrowReady
    ? "Escrow Not Wired"
    : savingPhase === "connecting"
      ? "Connecting..."
      : savingPhase === "creating"
          ? "Creating..."
          : savingPhase === "funding"
            ? "Sign Escrow"
            : savingPhase === "recording"
              ? "Recording..."
              : `Send Challenge · ${totalFundingPreview.toLocaleString()} WOLO`;

  function setQuickSchedule(minutesFromNow: number) {
    const next = new Date(Date.now() + minutesFromNow * 60_000);
    next.setSeconds(0, 0);
    const roundedMinutes = Math.ceil(next.getMinutes() / 15) * 15;
    if (roundedMinutes >= 60) {
      next.setHours(next.getHours() + 1, 0, 0, 0);
    } else {
      next.setMinutes(roundedMinutes, 0, 0);
    }
    setScheduledAt(toLocalDateTimeValue(next));
  }

  function applyChallengeLine(line: string) {
    const opponentName = selectedOpponent?.name || "warrior";
    setChallengeNote(
      line.replaceAll("{opponent}", opponentName).slice(0, CHALLENGE_NOTE_MAX_CHARS)
    );
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
      const requestId = [
        action,
        challengeId,
        extra?.fundingTxHash || extra?.scheduledAt || uid || "viewer",
      ]
        .join(":")
        .slice(0, 128);
      const response = await fetch(`/api/challenges/${challengeId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": requestId,
        },
        body: JSON.stringify({
          action,
          requestId,
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
          ? "Terms accepted."
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
      const message = updateError instanceof Error ? updateError.message : "Challenge update failed.";
      setError(message);
      throw new Error(message);
    } finally {
      setActionState({
        challengeId: null,
        kind: null,
      });
    }
  }

  async function updatePreference(
    challengeId: number,
    payload: {
      favorite: boolean;
      bookmarked: boolean;
      colorTag: ScheduledMatchColorTag | null;
    }
  ) {
    setPreferenceBusyId(challengeId);
    setError(null);

    try {
      const response = await fetch(`/api/challenges/${challengeId}/preference`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const responsePayload = (await response.json().catch(() => ({}))) as {
        detail?: string;
        preference?: ScheduledMatchViewerPreference;
      };

      if (!response.ok || !responsePayload.preference) {
        throw new Error(responsePayload.detail || "Could not update this private tile preference.");
      }

      const nextPreference = responsePayload.preference;
      setSnapshot((current) => ({
        ...current,
        scheduledMatches: current.scheduledMatches.map((match) =>
          match.id === challengeId ? { ...match, viewerPreference: nextPreference } : match
        ),
        historyMatches: current.historyMatches.map((match) =>
          match.id === challengeId ? { ...match, viewerPreference: nextPreference } : match
        ),
      }));
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Could not update this private tile preference."
      );
    } finally {
      setPreferenceBusyId((current) => (current === challengeId ? null : current));
    }
  }

  async function loadOlderHistory() {
    if (!snapshot.historyNextCursor || historyLoading) return;
    setHistoryLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/challenges/history?cursor=${snapshot.historyNextCursor}&limit=12`,
        { cache: "no-store" }
      );
      const payload = (await response.json().catch(() => null)) as
        | Pick<ChallengeHubSnapshot, "historyMatches" | "historyNextCursor">
        | { detail?: string }
        | null;
      if (!response.ok || !payload || !("historyMatches" in payload)) {
        throw new Error(payload && "detail" in payload ? payload.detail : "Could not load older records.");
      }
      setSnapshot((current) => {
        const matches = new Map(
          [...current.historyMatches, ...payload.historyMatches].map((match) => [match.id, match])
        );
        return {
          ...current,
          historyMatches: Array.from(matches.values()),
          historyNextCursor: payload.historyNextCursor,
        };
      });
      setHistoryExpanded(true);
    } catch (historyError) {
      setError(historyError instanceof Error ? historyError.message : "Could not load older records.");
    } finally {
      setHistoryLoading(false);
    }
  }

  async function submitChallenge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setSavingPhase("creating");
    setError(null);
    setNotice(null);

    if (!snapshot.fundingRail.configured || !snapshot.fundingRail.escrowAddress) {
      setError("Challenge escrow is not configured yet.");
      setSaving(false);
      setSavingPhase("idle");
      return;
    }

    if (walletStatus !== "connected" || !connectedWalletAddress) {
      try {
        setSavingPhase("connecting");
        await connectKeplr();
      } catch (walletError) {
        setError(walletError instanceof Error ? walletError.message : "Connect wallet before creating.");
      } finally {
        setSaving(false);
        setSavingPhase("idle");
      }
      return;
    }

    const parsedScheduledAt = useExactSchedule
      ? parseLocalDateTimeInputValue(scheduledAt)
      : null;
    if (useExactSchedule && !parsedScheduledAt) {
      setError("Choose a valid exact match time, or switch back to Play Anytime.");
      setSaving(false);
      setSavingPhase("idle");
      return;
    }

    if (isNationalChallengeFlow && !selectedNationalCountry) {
      setError("Choose your representing country for this national belt challenge.");
      setSaving(false);
      setSavingPhase("idle");
      return;
    }

    try {
      const parsedWagerAmountWolo = Number.parseInt(wagerAmountWolo, 10);
      const parsedGuaranteeAmountWolo = Number.parseInt(guaranteeAmountWolo, 10);
      const attempt =
        creationAttemptRef.current ??
        {
          requestId:
            typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID()
              : `challenge-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          challengeId: null,
          fundingResult: null,
        };
      creationAttemptRef.current = attempt;
      const response = await fetch("/api/challenges", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": attempt.requestId,
        },
        body: JSON.stringify({
          creationRequestId: attempt.requestId,
          challengedUid,
          scheduleMode: useExactSchedule ? "exact" : "open",
          acceptanceWindowHours,
          ...(parsedScheduledAt ? { scheduledAt: parsedScheduledAt.toISOString() } : {}),
          challengeNote,
          wagerAmountWolo: parsedWagerAmountWolo,
          guaranteeAmountWolo: parsedGuaranteeAmountWolo,
          trophyTitleId: requestedTitle || null,
          trophyCountry: selectedNationalCountry || requestedCountry || null,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | ChallengeCreateSnapshot
        | null;

      if (!response.ok || !payload) {
        throw new Error(payload?.detail || "Unable to schedule the game.");
      }

      setSnapshot(payload);
      const duplicateWarning = payload.duplicateWarning;
      const createdChallengeId = payload.createdChallengeId;
      if (!createdChallengeId || !Number.isFinite(createdChallengeId)) {
        throw new Error("Challenge created, but the funding rail did not return a match id.");
      }
      attempt.challengeId = createdChallengeId;

      const createdTile = [...payload.scheduledMatches, ...payload.historyMatches].find(
        (match) => match.id === createdChallengeId
      );
      if (createdTile?.economy.creatorFundedAt) {
        creationAttemptRef.current = null;
        router.push(`/challenge/${createdChallengeId}`);
        setNotice("Challenge already funded. Opponent can accept + fund.");
        return;
      }

      setSavingPhase("funding");
      const fundingResult =
        attempt.fundingResult ??
        (await fundChallengeEscrow({
          challengeId: createdChallengeId,
          wagerAmountWolo: parsedWagerAmountWolo,
          guaranteeAmountWolo: parsedGuaranteeAmountWolo,
          participantSide: "left",
          escrowAddress: payload.fundingRail.escrowAddress,
          fallbackWalletAddress: connectedWalletAddress,
        }));
      attempt.fundingResult = fundingResult;

      setSavingPhase("recording");
      const fundResponse = await fetch(`/api/challenges/${createdChallengeId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": `fund:${fundingResult.fundingTxHash}`,
        },
        body: JSON.stringify({
          action: "fund",
          requestId: `fund:${fundingResult.fundingTxHash}`,
          fundingTxHash: fundingResult.fundingTxHash,
          fundingWalletAddress: fundingResult.walletAddress,
        }),
      });

      const fundedPayload = (await fundResponse.json().catch(() => null)) as
        | (ChallengeHubSnapshot & { detail?: string })
        | null;

      if (!fundResponse.ok || !fundedPayload) {
        throw new Error(fundedPayload?.detail || "Challenge was created, but funding could not be recorded.");
      }

      setSnapshot(fundedPayload);
      creationAttemptRef.current = null;
      router.push(`/challenge/${createdChallengeId}`);
      setNotice(
        duplicateWarning
          ? `${duplicateWarning} Challenge funded. Opponent can accept + fund.`
          : payload.linkedTrophyChallengeId
            ? `${payload.titleStakeNames?.join(", ") || trophyTarget?.displayName || "Title"} attached and funding verified.`
            : "Challenge funded. Opponent can accept + fund."
      );
      setChallengedUid("");
      setChallengeNote("");
      setScheduledAt("");
      setUseExactSchedule(false);
      setAcceptanceWindowHours(72);
      setWagerAmountWolo(String(CHALLENGE_DEFAULT_WAGER_WOLO));
      setGuaranteeAmountWolo(String(CHALLENGE_DEFAULT_GUARANTEE_WOLO));
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to schedule the game.");
    } finally {
      setSaving(false);
      setSavingPhase("idle");
    }
  }

  return (
    <main
      className={`${
        challengeHallExtreme
          ? "mx-auto w-full max-w-[min(98vw,118rem)] space-y-5 px-3 py-4 text-white sm:space-y-6 sm:px-5 sm:py-5 lg:px-8"
          : "mx-auto w-full max-w-[min(96vw,92rem)] space-y-5 py-5 text-white sm:space-y-6 sm:py-6"
      }`}
    >
      <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.16),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(34,197,94,0.10),_transparent_24%),linear-gradient(135deg,_#101828,_#0f172a_45%,_#020617)] p-6 sm:p-8">
        <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-5">
            <div className="text-sm uppercase tracking-[0.4em] text-amber-200/70">Challenge</div>
            <h1
              className={`${
                challengeHallExtreme
                  ? "max-w-5xl bg-[linear-gradient(180deg,#fff7d6_0%,#f0cf78_27%,#c18a2d_65%,#74420f_100%)] bg-clip-text font-serif text-[clamp(3.15rem,5.8vw,7rem)] font-semibold leading-[0.88] tracking-[-0.055em] text-transparent drop-shadow-[0_16px_34px_rgba(0,0,0,0.85)]"
                  : "max-w-3xl text-4xl font-semibold leading-[1.02] text-white sm:text-5xl"
              }`}
            >
              Challenge Hall
            </h1>
            {challengeHallExtreme ? (
              <p className="max-w-3xl font-serif text-base italic tracking-[0.08em] text-amber-100/56 sm:text-lg">
                summon the duel · lock the rail · let the record remember
              </p>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <HeroPill>{snapshot.candidates.length} players available</HeroPill>
              <HeroPill>{pendingIncomingCount} awaiting you</HeroPill>
              <HeroPill live>{readyCount} match-ready</HeroPill>
            </div>

            <ChallengeHallBaEToggle view={challengeHallView} search={searchParams.toString()} />

            <div className="flex flex-wrap gap-3">
              <Link
                href={`#${scheduleFormId}`}
                className="group inline-flex items-center gap-3 rounded-full border border-amber-200/18 bg-[linear-gradient(135deg,rgba(251,191,36,0.18),rgba(245,158,11,0.08))] px-3 py-2 text-white shadow-[0_18px_34px_rgba(245,158,11,0.12)] transition hover:border-amber-200/30 hover:bg-[linear-gradient(135deg,rgba(251,191,36,0.22),rgba(245,158,11,0.12))]"
              >
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-amber-200/20 bg-amber-300/15 text-amber-50">
                  <Plus className="h-4 w-4" />
                </span>
                <span className="text-left">
                  <span className="block text-sm font-semibold text-white">Send a Challenge</span>
                  <span className="block text-[11px] uppercase tracking-[0.2em] text-amber-100/70">
                    Rival · terms · one clean send
                  </span>
                </span>
                <ArrowUpRight className="h-4 w-4 text-amber-50/80 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </Link>
              <Link
                href="/live-games"
                className="inline-flex min-h-[3rem] items-center justify-center rounded-full bg-amber-300 px-5 py-3 text-center text-sm font-semibold leading-none text-slate-950 transition hover:bg-amber-200"
              >
                Back To Live Games
              </Link>
              <Link
                href="/players"
                className="inline-flex min-h-[3rem] items-center justify-center rounded-full border border-white/15 px-5 py-3 text-sm text-white/85 transition hover:border-white/30 hover:text-white"
              >
                Browse Players
              </Link>
              <Link
                href="/betting-mechanics"
                className="inline-flex min-h-[3rem] items-center justify-center rounded-full border border-white/15 px-5 py-3 text-sm text-white/85 transition hover:border-white/30 hover:text-white"
              >
                Mechanics
              </Link>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
            <StatCard label="Active" value={String(activeRunwayCount)} />
            <StatCard label="Awaiting you" value={String(pendingIncomingCount)} />
            <StatCard label="Ready" value={String(readyCount)} live helper="Checked in or live" />
          </div>
        </div>
      </section>

      <section className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.12fr)_minmax(30rem,0.88fr)]">
        <section className="order-2 min-w-0 space-y-6">
          <section
            id={scheduleFormId}
            className="relative overflow-hidden rounded-[2rem] border border-amber-200/16 bg-[radial-gradient(circle_at_8%_0%,rgba(251,191,36,0.16),transparent_32%),radial-gradient(circle_at_95%_90%,rgba(34,211,238,0.10),transparent_28%),linear-gradient(160deg,rgba(12,19,34,0.98),rgba(2,6,23,0.98))] p-5 shadow-[0_32px_80px_rgba(0,0,0,0.28)] sm:p-7"
          >
            <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full border border-amber-200/10 bg-amber-300/[0.035]" />
            <div className="relative">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.32em] text-amber-200/70">
                    <Swords className="h-4 w-4" />
                    Build a Challenge
                  </div>
                  <h2 className="mt-2 text-2xl font-semibold text-white">One rival. Clear terms. Done.</h2>
                </div>
                <div
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] ${
                    challengeEscrowReady
                      ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-100"
                      : "border-rose-300/25 bg-rose-400/10 text-rose-100"
                  }`}
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {challengeEscrowReady ? "WoloChain ready" : "Escrow unavailable"}
                </div>
              </div>

              <div className="mt-6 flex items-center justify-between gap-3 rounded-[1.1rem] border border-white/10 bg-black/25 px-4 py-3">
                <div>
                  <div className="text-sm font-bold capitalize text-white">{challengeHallView} invitation</div>
                  <div className="mt-0.5 text-[11px] text-slate-400">The Hall mode controls this entire flow.</div>
                </div>
                <span className="rounded-full border border-amber-200/18 bg-amber-300/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-amber-100">
                  {challengeHallView}
                </span>
              </div>

              {authLoading || loading ? (
                <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 px-4 py-5 text-sm text-slate-300">
                  Loading the challenge board...
                </div>
              ) : !isAuthenticated ? (
                <div className="mt-5 rounded-[1.5rem] border border-white/10 bg-white/5 p-5">
                  <div className="text-lg font-semibold text-white">Sign in. Pick a rival. Ring the bell.</div>
                  <div className="mt-2 text-sm text-slate-300">
                    Steam keeps every challenge attached to a real player and a real result.
                  </div>
                  <SteamLoginButton
                    returnTo={returnTo}
                    className="mt-4 rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-200"
                  />
                </div>
              ) : (
                <form onSubmit={submitChallenge} className="mt-6 space-y-5">
                  <section className="rounded-[1.4rem] border border-white/10 bg-black/20 p-4 sm:p-5">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-300 text-[11px] font-black text-slate-950">1</span>
                      Choose your rival
                    </div>
                    <select
                      value={challengedUid}
                      onChange={(event) => setChallengedUid(event.target.value)}
                      className="mt-3 w-full cursor-pointer rounded-2xl border border-white/12 bg-slate-950 px-4 py-3.5 text-base font-semibold text-white outline-none transition hover:border-white/25 focus:border-amber-300/55"
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
                    {challengeHallExtreme ? (
                      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                        {snapshot.candidates.slice(0, 8).map((candidate) => {
                          const active = candidate.uid === challengedUid;
                          return (
                            <button
                              key={`rival-${candidate.uid}`}
                              type="button"
                              onClick={() => setChallengedUid(candidate.uid)}
                              className={`shrink-0 rounded-full border px-3 py-2 text-xs font-semibold transition ${
                                active
                                  ? "border-amber-200/35 bg-amber-300/16 text-amber-50"
                                  : "border-white/10 bg-white/[0.04] text-slate-300 hover:border-white/25 hover:text-white"
                              }`}
                            >
                              <span className={`mr-2 inline-block h-2 w-2 rounded-full ${candidate.isOnline ? "bg-emerald-300" : "bg-slate-600"}`} />
                              {candidate.name}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}

                    {isNationalChallengeFlow ? (
                      <label className="mt-4 block rounded-[1.1rem] border border-amber-300/16 bg-amber-400/[0.06] p-3">
                        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-100/70">Your nation</span>
                        <select
                          value={selectedNationalCountry}
                          onChange={(event) => {
                            const nextCountry = isRepresentedCountry(event.target.value)
                              ? event.target.value
                              : "";
                            setSelectedNationalCountry(nextCountry);
                            setChallengeNote((current) => {
                              const nextNote = buildNationalChallengeNote(nextCountry).slice(0, CHALLENGE_NOTE_MAX_CHARS);
                              return current.length === 0 || current.startsWith("Challenge for ") ? nextNote : current;
                            });
                          }}
                          className="mt-2 w-full cursor-pointer rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 text-white outline-none focus:border-amber-300/50"
                        >
                          <option value="">Choose country</option>
                          {REPRESENTED_COUNTRIES.map((country) => (
                            <option key={country} value={country}>{country}</option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                  </section>

                  <section className="rounded-[1.4rem] border border-white/10 bg-black/20 p-4 sm:p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-300 text-[11px] font-black text-slate-950">2</span>
                        Accept within
                      </div>
                      <div className="text-xs font-bold text-amber-100">
                        {acceptanceWindowHours === 24 ? "24 hours" : `${acceptanceWindowHours / 24} days`}
                      </div>
                    </div>

                    {challengeHallAdvanced ? (
                      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {[
                          ["24 hours", 24],
                          ["3 days", 72],
                          ["7 days", 168],
                          ["30 days", 720],
                        ].map(([label, hours]) => {
                          const active = acceptanceWindowHours === Number(hours);
                          return (
                            <button
                              key={String(label)}
                              type="button"
                              onClick={() => setAcceptanceWindowHours(Number(hours))}
                              className={`rounded-xl border px-2 py-2.5 text-xs font-semibold transition ${
                                active
                                  ? "border-amber-200/30 bg-amber-300/14 text-amber-50"
                                  : "border-white/10 bg-white/[0.04] text-slate-300 hover:border-white/20 hover:text-white"
                              }`}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="mt-3 rounded-xl border border-amber-200/15 bg-amber-300/[0.07] px-3 py-3 text-sm text-slate-200">
                        Your rival gets three days to accept. No calendar negotiation required.
                      </div>
                    )}

                    {challengeHallAdvanced ? (
                      <div className="mt-4 border-t border-white/10 pt-4">
                        <button
                          type="button"
                          onClick={() => {
                            setUseExactSchedule((current) => {
                              if (!current && !scheduledAt) setScheduledAt(defaultScheduledAtValue());
                              return !current;
                            });
                          }}
                          className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-3 text-left transition ${
                            useExactSchedule
                              ? "border-cyan-200/25 bg-cyan-300/[0.08] text-white"
                              : "border-white/10 bg-white/[0.035] text-slate-300 hover:border-white/20 hover:text-white"
                          }`}
                        >
                          <span>
                            <span className="block text-sm font-semibold">Set an exact match time</span>
                            <span className="mt-0.5 block text-[11px] text-slate-400">Optional · otherwise both players can play anytime after funding.</span>
                          </span>
                          <span className="rounded-full border border-current/20 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.15em]">
                            {useExactSchedule ? "Exact" : "Play anytime"}
                          </span>
                        </button>

                        {useExactSchedule ? (
                          <div className="mt-3 rounded-[1rem] border border-cyan-200/14 bg-slate-950/65 p-3">
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                              {[
                                ["30 min", 30],
                                ["1 hour", 60],
                                ["2 hours", 120],
                                ["Tomorrow", 24 * 60],
                              ].map(([label, minutes]) => (
                                <button
                                  key={String(label)}
                                  type="button"
                                  onClick={() => setQuickSchedule(Number(minutes))}
                                  className="rounded-xl border border-white/10 bg-white/[0.045] px-2 py-2.5 text-xs font-semibold text-slate-200 transition hover:border-amber-200/30 hover:bg-amber-300/10 hover:text-white"
                                >
                                  {label}
                                </button>
                              ))}
                            </div>
                            <input
                              type="datetime-local"
                              value={scheduledAt}
                              onChange={(event) => setScheduledAt(event.target.value)}
                              className="mt-3 w-full rounded-xl border border-white/12 bg-slate-950 px-4 py-3 text-white outline-none focus:border-amber-300/50"
                            />
                            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                              <CalendarClock className="h-4 w-4 text-cyan-200/70" />
                              <span className="font-semibold text-white">{schedulePreviewLocal === "—" ? "Pick a local start time" : schedulePreviewLocal}</span>
                              <span className="text-slate-600">·</span>
                              <span>{schedulePreviewUtc === "—" ? "UTC pending" : `UTC ${schedulePreviewUtcCompact}`}</span>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </section>

                  <section className="rounded-[1.4rem] border border-white/10 bg-black/20 p-4 sm:p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-300 text-[11px] font-black text-slate-950">3</span>
                        Set the stakes
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-100/55">Total lock each</div>
                        <div className="mt-0.5 text-sm font-black text-amber-100">{totalFundingPreview.toLocaleString()} WOLO</div>
                      </div>
                    </div>
                    {challengeHallAdvanced ? (
                      <>
                        <div className="mt-3 grid grid-cols-3 gap-2">
                          {[
                            ["Friendly", 10, 5],
                            ["Ranked", 25, 10],
                            ["Grudge", 100, 25],
                          ].map(([label, wager, guarantee]) => {
                            const active = wagerAmountWolo === String(wager) && guaranteeAmountWolo === String(guarantee);
                            return (
                              <button
                                key={String(label)}
                                type="button"
                                onClick={() => {
                                  setWagerAmountWolo(String(wager));
                                  setGuaranteeAmountWolo(String(guarantee));
                                }}
                                className={`rounded-xl border px-2 py-2.5 text-xs font-semibold transition ${
                                  active
                                    ? "border-amber-200/30 bg-amber-300/14 text-amber-50"
                                    : "border-white/10 bg-white/[0.04] text-slate-300 hover:border-white/20 hover:text-white"
                                }`}
                              >
                                {label}
                              </button>
                            );
                          })}
                        </div>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          <label>
                            <span className="text-xs text-slate-400">Winner&apos;s wager</span>
                            <input type="number" min={1} step={1} value={wagerAmountWolo} onChange={(event) => setWagerAmountWolo(event.target.value)} className="mt-1.5 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 text-white outline-none focus:border-amber-300/50" />
                          </label>
                          <label>
                            <span className="text-xs text-slate-400">Show-up guarantee</span>
                            <input type="number" min={1} step={1} value={guaranteeAmountWolo} onChange={(event) => setGuaranteeAmountWolo(event.target.value)} className="mt-1.5 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 text-white outline-none focus:border-amber-300/50" />
                          </label>
                        </div>
                      </>
                    ) : (
                      <div className="mt-3 text-xs leading-5 text-slate-400">
                        Smart default: {wagerAmountWolo} wager + {guaranteeAmountWolo} guarantee. You can tune both in Advanced.
                      </div>
                    )}
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200/14 bg-amber-300/[0.065] px-3 py-3 text-xs">
                      <span className="text-slate-300">{wagerAmountWolo || "0"} wager + {guaranteeAmountWolo || "0"} show-up guarantee</span>
                      <span className="font-black text-amber-50">You lock {totalFundingPreview.toLocaleString()} WOLO</span>
                    </div>
                  </section>

                  {challengeHallExtreme ? (
                    <section className="overflow-hidden rounded-[1.4rem] border border-amber-200/18 bg-[linear-gradient(135deg,rgba(120,53,15,0.18),rgba(15,23,42,0.48))] p-4 sm:p-5">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-amber-100/70">
                            <Crown className="h-4 w-4" />
                            Automatic title stakes
                          </div>
                          <div className="mt-1 text-sm text-slate-300">The rules engine puts eligible belts and artifacts on the table for you.</div>
                        </div>
                        <Sparkles className="h-5 w-5 shrink-0 text-amber-200" />
                      </div>
                      {automaticTitleStakes.length > 0 ? (
                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          {automaticTitleStakes.map((title) => (
                            <div key={title.trophyId} className="flex min-w-0 items-center gap-3 rounded-[1rem] border border-amber-100/15 bg-black/20 p-3">
                              <div className="relative h-14 w-20 shrink-0">
                                {title.imageUri ? (
                                  <Image src={title.imageUri} alt="" fill unoptimized sizes="80px" className="object-contain drop-shadow-[0_8px_16px_rgba(0,0,0,0.45)]" />
                                ) : (
                                  <Trophy className="mx-auto h-10 w-10 text-amber-200/70" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <div className="truncate text-sm font-bold text-white">{title.displayName}</div>
                                <div className="mt-1 text-[11px] text-amber-100/65">
                                  {title.kind === "artifact" ? "Metric proof required" : "Moves on verified win"}
                                  {title.currentBountyWolo > 0 ? ` · ${title.currentBountyWolo.toLocaleString()} WOLO bounty` : ""}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="mt-4 flex items-center gap-3 rounded-[1rem] border border-white/10 bg-black/15 p-3 text-sm text-slate-300">
                          <Gem className="h-5 w-5 text-violet-200/70" />
                          No eligible title detected yet. This one is for WOLO, pride, and the permanent record.
                        </div>
                      )}
                    </section>
                  ) : null}

                  <section className="rounded-[1.4rem] border border-white/10 bg-black/20 p-4 sm:p-5">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Callout <span className="normal-case tracking-normal text-slate-600">· optional</span></div>
                        <MessageSquareMore className="h-4 w-4 text-cyan-200/70" />
                      </div>
                      {challengeHallExtreme ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {[
                            "You. Me. One clean set. Winner owns the room.",
                            "Name the battlefield. Set the hour. Let war decide.",
                            "{opponent}, the board needs our names on it.",
                          ].map((line) => (
                            <button key={line} type="button" onClick={() => applyChallengeLine(line)} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] text-slate-300 transition hover:border-cyan-200/25 hover:text-white">
                              {line.replace("{opponent}", selectedOpponent?.name || "Rival")}
                            </button>
                          ))}
                        </div>
                      ) : null}
                      <AutoGrowTextarea
                        value={challengeNote}
                        onChange={(event) => setChallengeNote(event.target.value.slice(0, CHALLENGE_NOTE_MAX_CHARS))}
                        maxRows={4}
                        maxLength={CHALLENGE_NOTE_MAX_CHARS}
                        className="mt-3 w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm leading-6 text-white outline-none focus:border-amber-300/50"
                        placeholder="One clean set. Let war decide."
                      />
                      <div className="mt-1.5 text-right text-[10px] uppercase tracking-[0.16em] text-slate-500">{challengeNote.length}/{CHALLENGE_NOTE_MAX_CHARS}</div>
                  </section>

                  {challengeHallExtreme ? (

                    <section className="rounded-[1.5rem] border border-amber-200/20 bg-[radial-gradient(circle_at_80%_0%,rgba(251,191,36,0.16),transparent_38%),linear-gradient(135deg,rgba(30,41,59,0.88),rgba(2,6,23,0.92))] p-4 sm:p-5">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-amber-100/65">Their invitation preview</div>
                        <Zap className="h-4 w-4 text-amber-200" />
                      </div>

                      <div className="mx-auto mt-4 grid w-full max-w-[30rem] grid-cols-3 items-start text-center sm:max-w-[34rem]">
                        <div className="flex min-w-0 flex-col items-center">
                          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-amber-200/20 bg-amber-300/10 text-lg font-black text-amber-50">
                            YOU
                          </div>
                          <div className="mt-3 w-full truncate text-xl font-black leading-none text-white">
                            You
                          </div>
                        </div>

                        <div className="flex min-w-0 flex-col items-center">
                          <div className="h-4 text-[10px] uppercase tracking-[0.28em] text-amber-100/55">
                            Challenge
                          </div>
                          <Swords className="mt-1 h-7 w-7 text-amber-200" />
                          <div className="mt-3 w-full truncate text-xl font-black lowercase leading-none text-amber-100">
                            vs
                          </div>
                        </div>

                        <div className="flex min-w-0 flex-col items-center">
                          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-cyan-200/20 bg-cyan-300/10 text-lg font-black text-cyan-50">
                            {(selectedOpponent?.name || "?").slice(0, 2).toUpperCase()}
                          </div>
                          <div className="mt-3 w-full truncate text-xl font-black leading-none text-white">
                            {selectedOpponent?.name || "Choose a rival"}
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap justify-center gap-2 text-[11px] text-slate-300">
                        <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1">
                          {useExactSchedule ? schedulePreviewLocal : `Play anytime · accept within ${acceptanceWindowHours === 24 ? "24h" : `${acceptanceWindowHours / 24}d`}`}
                        </span>
                        <span className="rounded-full border border-amber-200/15 bg-amber-300/10 px-3 py-1 text-amber-50">{totalFundingPreview.toLocaleString()} WOLO each</span>
                        {automaticTitleStakes.length > 0 ? <span className="rounded-full border border-violet-200/15 bg-violet-300/10 px-3 py-1 text-violet-50">{automaticTitleStakes.length} title {automaticTitleStakes.length === 1 ? "stake" : "stakes"}</span> : null}
                      </div>
                    </section>
                  ) : null}

                  {error ? <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">{error}</div> : null}
                  {notice ? <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{notice}</div> : null}

                  <div className="rounded-[1.35rem] border border-emerald-300/16 bg-emerald-400/[0.055] p-3 sm:flex sm:items-center sm:justify-between sm:gap-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-300/12 text-emerald-100"><ShieldCheck className="h-5 w-5" /></span>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-emerald-50">One signature. Real chain proof.</div>
                        <div className="mt-0.5 truncate text-[11px] text-emerald-100/55">{snapshot.fundingRail.chainId} · structured challenge deposit · replay-verified result</div>
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={saving || !challengeEscrowReady || !challengedUid}
                      className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,#fde68a,#fbbf24)] px-5 py-3 text-sm font-black text-slate-950 shadow-[0_14px_34px_rgba(251,191,36,0.22)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50 sm:mt-0 sm:w-auto"
                    >
                      {walletStatus !== "connected" ? <Wallet className="h-4 w-4" /> : saving ? <Sparkles className="h-4 w-4" /> : <Swords className="h-4 w-4" />}
                      {createButtonLabel}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </section>

        </section>

        <section className="order-1 min-w-0 space-y-6">
          <section
            className="min-w-0 overflow-hidden rounded-[1.8rem] border border-amber-100/14 bg-[radial-gradient(circle_at_10%_0%,rgba(251,191,36,0.09),transparent_28%),rgba(2,6,23,0.82)] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)] sm:p-6"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.35em] text-cyan-200/70">Needs attention first</div>
                <h2 className="mt-2 break-words text-2xl font-semibold text-white">Your Challenges</h2>
              </div>
              <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
                {activeRunwayMatches.length} active
              </div>
            </div>

            <div className="mt-5 min-w-0 space-y-4">
              {activeRunwayMatches.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-5 text-sm text-slate-300">
                  No active challenges. Pick a rival and send one clean invitation.
                </div>
              ) : (
                activeRunwayMatches.map((match) => (
                  <ScheduledMatchCard
                    key={match.id}
                    match={match}
                    viewerUid={uid}
                    defaultViewMode="summary"
                    stacked
                    localTimePrimary
                    serverNow={snapshot.serverNow}
                    onAccept={(challengeId) => updateMatch(challengeId, "accept")}
                    onDecline={(challengeId) => updateMatch(challengeId, "decline")}
                    onCancel={(challengeId) => updateMatch(challengeId, "cancel")}
                    onReschedule={(challengeId, payload) => updateMatch(challengeId, "reschedule", payload)}
                    onConfirmTime={(challengeId) => updateMatch(challengeId, "confirm_time")}
                    onFund={(challengeId, payload) => updateMatch(challengeId, "fund", payload)}
                    onCheckIn={(challengeId) => updateMatch(challengeId, "check_in")}
                    onPreferenceChange={updatePreference}
                    preferenceBusy={preferenceBusyId === match.id}
                    actionState={actionState}
                  />
                ))
              )}
            </div>
          </section>

          <section
            className="min-w-0 overflow-hidden rounded-[1.8rem] border border-white/10 bg-slate-950/70 p-5 sm:p-6"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.35em] text-slate-300/70">
                  The record
                </div>
                <h3 className="mt-2 text-xl font-semibold text-white">
                  Challenge History
                </h3>
              </div>
              <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
                {snapshot.record.total} total
              </div>
            </div>

            <div className="mt-5 min-w-0 space-y-4">
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
                    onReschedule={(challengeId, payload) => updateMatch(challengeId, "reschedule", payload)}
                    onConfirmTime={(challengeId) => updateMatch(challengeId, "confirm_time")}
                    onFund={(challengeId, payload) => updateMatch(challengeId, "fund", payload)}
                    onCheckIn={(challengeId) => updateMatch(challengeId, "check_in")}
                    onPreferenceChange={updatePreference}
                    preferenceBusy={preferenceBusyId === match.id}
                    actionState={actionState}
                    compact
                    defaultViewMode="summary"
                  />
                ))
              )}
            </div>
            {snapshot.historyMatches.length > 3 || snapshot.historyNextCursor ? (
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setHistoryExpanded((current) => !current)}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.035] px-4 py-3 text-sm font-semibold text-slate-300 transition hover:border-white/20 hover:bg-white/[0.06] hover:text-white"
                >
                  {historyExpanded
                    ? "Fold history"
                    : `Show ${Math.max(0, snapshot.historyMatches.length - 3)} more`}
                </button>
                {historyExpanded && snapshot.historyNextCursor ? (
                  <button
                    type="button"
                    onClick={() => void loadOlderHistory()}
                    disabled={historyLoading}
                    className="w-full rounded-xl border border-amber-200/15 bg-amber-300/[0.06] px-4 py-3 text-sm font-semibold text-amber-50 transition hover:border-amber-200/25 hover:bg-amber-300/10 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {historyLoading ? "Loading records..." : "Load older records"}
                  </button>
                ) : null}
              </div>
            ) : null}
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
    <div className="min-w-0 rounded-[1.22rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.025))] px-3 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:px-4 sm:py-4">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 truncate whitespace-nowrap text-[10px] uppercase tracking-[0.16em] text-slate-400 sm:text-[11px]">
          {label}
        </div>
        {live ? (
          <div className="shrink-0 rounded-full border border-emerald-300/25 bg-emerald-400/10 px-2.5 py-1 text-[11px] text-emerald-100">
            live
          </div>
        ) : null}
      </div>
      <div className="mt-2 text-2xl font-semibold leading-none text-white">{value}</div>
      {helper ? <div className="mt-1 text-xs leading-5 text-slate-400">{helper}</div> : null}
    </div>
  );
}
