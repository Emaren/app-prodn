"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { FormEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  CalendarClock,
  Clock3,
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
import TimeDisplayText from "@/components/time/TimeDisplayText";
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
import type { ChallengeActivityItem, ChallengeHubSnapshot } from "@/lib/challenges";
import type {
  ScheduledMatchColorTag,
  ScheduledMatchViewerPreference,
} from "@/lib/scheduledMatchPreferences";
import { formatDateTime } from "@/lib/timeDisplay";

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

type ScheduleMode = "basic" | "advanced" | "extreme";

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

type ActivityMatch = ChallengeHubSnapshot["scheduledMatches"][number];

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
    case "refund_sent":
      return "Refund sent";
    case "guarantee_forfeited_to_treasury":
      return "Guarantee routed to Treasury";
    case "scheduled_settlement_completed":
      return "Escrow settlement completed";
    case "scheduled_settlement_failed":
      return "Escrow settlement failed";
    case "forfeited":
      return "Match forfeited";
    default:
      return activity.eventType.replace(/_/g, " ");
  }
}

function metadataNumber(activity: ChallengeActivityItem, key: string) {
  const value = activity.metadata?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function metadataString(activity: ChallengeActivityItem, key: string) {
  const value = activity.metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function shortHash(value: string) {
  if (value.length <= 16) return value;
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function formatActivityCompact(activity: ChallengeActivityItem, match?: ActivityMatch) {
  const totalLabel = match ? `${match.terms.totalFundingWolo.toLocaleString()} WOLO` : "WOLO";
  const matchLabel = match
    ? `${match.challenger.name} vs ${match.challenged.name}`
    : `Match #${activity.scheduledMatchId}`;

  switch (activity.eventType) {
    case "scheduled":
    case "accepted":
    case "terms_accepted":
    case "rescheduled":
      return match
        ? `${matchLabel} · ${totalLabel} each · ${match.economy.statusLabel}`
        : `${formatActivityTitle(activity)} · Match #${activity.scheduledMatchId}`;
    case "creator_funded":
      return match
        ? `${match.challenger.name} locked ${totalLabel}`
        : `Creator locked ${totalLabel}`;
    case "opponent_funded":
      return match
        ? `${match.challenged.name} locked ${totalLabel}`
        : `Opponent locked ${totalLabel}`;
    case "left_checked_in":
    case "right_checked_in":
      return `${activity.actorName || "Player"} checked in`;
    case "live_confirmed":
      return match ? `${matchLabel} · Game detected` : `Game detected · Match #${activity.scheduledMatchId}`;
    case "completed":
      return match ? `${matchLabel} · ${match.economy.resolution.label || "Resolved"}` : "Match completed";
    case "refund_sent": {
      const amount = metadataNumber(activity, "amountWolo");
      const txHash = metadataString(activity, "txHash");
      return `Refund sent${amount ? ` · ${amount.toLocaleString()} WOLO` : ""}${txHash ? ` · tx ${shortHash(txHash)}` : ""}`;
    }
    case "guarantee_forfeited_to_treasury": {
      const amount = metadataNumber(activity, "amountWolo");
      const txHash = metadataString(activity, "txHash");
      return `Guarantee to Community Treasury${amount ? ` · ${amount.toLocaleString()} WOLO` : ""}${txHash ? ` · tx ${shortHash(txHash)}` : ""}`;
    }
    case "scheduled_settlement_completed":
      return `Escrow settlement completed · Match #${activity.scheduledMatchId}`;
    case "scheduled_settlement_failed":
      return activity.detail || `Escrow settlement failed · Match #${activity.scheduledMatchId}`;
    case "declined":
      return `Challenge declined · Match #${activity.scheduledMatchId}`;
    case "cancelled":
    case "canceled":
      return `Challenge cancelled · Match #${activity.scheduledMatchId}`;
    case "no_show_left":
    case "no_show_right":
    case "double_no_show":
      return `No-show resolved · Match #${activity.scheduledMatchId}`;
    case "forfeited":
      return `Match forfeited · Match #${activity.scheduledMatchId}`;
    default:
      return match ? `${matchLabel} · ${match.economy.statusLabel}` : `${formatActivityTitle(activity)} · Match #${activity.scheduledMatchId}`;
  }
}

export default function ChallengeWorkspace() {
  const { loading: authLoading, isAuthenticated, uid } = useUserAuth();
  const searchParams = useSearchParams();
  const { status: walletStatus, address: connectedWalletAddress, connect: connectKeplr } = useKeplr();
  const { timeDisplayMode, setTimeDisplayMode, timeClockMode, browserTimeZone } = useLobbyAppearance();
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
  const [challengeNote, setChallengeNote] = useState("");
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>("extreme");
  const [routePrefillApplied, setRoutePrefillApplied] = useState(false);
  const [trophyTarget, setTrophyTarget] = useState<PublicTrophyTarget | null>(null);
  const [trophies, setTrophies] = useState<PublicTrophyTarget[]>([]);
  const [trophyTargetLoading, setTrophyTargetLoading] = useState(Boolean(searchParams.get("title")));
  const [wagerAmountWolo, setWagerAmountWolo] = useState(String(CHALLENGE_DEFAULT_WAGER_WOLO));
  const [guaranteeAmountWolo, setGuaranteeAmountWolo] = useState(
    String(CHALLENGE_DEFAULT_GUARANTEE_WOLO)
  );
  const [focusedMatchId, setFocusedMatchId] = useState<number | null>(null);
  const requestedTitle = searchParams.get("title");
  const requestedKind = searchParams.get("kind");
  const requestedCountry = searchParams.get("country");
  const requestedFocusId = Number.parseInt(searchParams.get("focus") || "", 10);
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
                return trophy.eligibleNationality === requestedCountry;
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

  useEffect(() => {
    setScheduledAt(defaultScheduledAtValue());
  }, []);

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

  const historyMatches = useMemo(() => snapshot.historyMatches.slice(0, 8), [snapshot.historyMatches]);

  const recentActivities = useMemo(() => snapshot.activities.slice(0, 8), [snapshot.activities]);
  const activityMatchById = useMemo(() => {
    const matches = new Map<number, ActivityMatch>();
    for (const match of [...snapshot.scheduledMatches, ...snapshot.historyMatches]) {
      matches.set(match.id, match);
    }
    return matches;
  }, [snapshot.historyMatches, snapshot.scheduledMatches]);

  const scheduledPreview = useMemo(() => parseLocalDateTimeInputValue(scheduledAt), [scheduledAt]);
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
      : walletStatus !== "connected"
        ? "Connect Wallet"
        : savingPhase === "creating"
          ? "Creating..."
          : savingPhase === "funding"
            ? "Sign Escrow"
            : savingPhase === "recording"
              ? "Recording..."
              : `Create + Fund ${totalFundingPreview.toLocaleString()} WOLO`;
  const focusedMatch = useMemo(
    () => activeRunwayMatches.find((match) => match.id === focusedMatchId) || activeRunwayMatches[0] || null,
    [activeRunwayMatches, focusedMatchId]
  );
  const focusedCounterpart = useMemo(() => {
    if (!focusedMatch || !uid) {
      return null;
    }

    return focusedMatch.challenger.uid === uid ? focusedMatch.challenged : focusedMatch.challenger;
  }, [focusedMatch, uid]);

  useEffect(() => {
    if (activeRunwayMatches.length === 0) {
      setFocusedMatchId(null);
      return;
    }

    if (
      Number.isFinite(requestedFocusId) &&
      activeRunwayMatches.some((match) => match.id === requestedFocusId)
    ) {
      setFocusedMatchId(requestedFocusId);
      return;
    }

    setFocusedMatchId((current) =>
      current && activeRunwayMatches.some((match) => match.id === current)
        ? current
        : activeRunwayMatches[0].id
    );
  }, [activeRunwayMatches, requestedFocusId]);

  function toggleSiteTimePreference() {
    setTimeDisplayMode(timeDisplayMode === "local" ? "utc" : "local");
  }

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

    const parsedScheduledAt = parseLocalDateTimeInputValue(scheduledAt);
    if (!parsedScheduledAt) {
      setError("Choose a valid start time.");
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

      setSavingPhase("funding");
      const fundingResult = await fundChallengeEscrow({
        challengeId: createdChallengeId,
        wagerAmountWolo: parsedWagerAmountWolo,
        guaranteeAmountWolo: parsedGuaranteeAmountWolo,
        participantSide: "left",
        escrowAddress: snapshot.fundingRail.escrowAddress,
        fallbackWalletAddress: connectedWalletAddress,
      });

      setSavingPhase("recording");
      const fundResponse = await fetch(`/api/challenges/${createdChallengeId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "fund",
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
      setNotice(
        duplicateWarning
          ? `${duplicateWarning} Challenge funded. Opponent can accept + fund.`
          : payload.linkedTrophyChallengeId
            ? `${payload.titleStakeNames?.join(", ") || trophyTarget?.displayName || "Title"} attached and funding verified.`
            : "Challenge funded. Opponent can accept + fund."
      );
      setChallengedUid("");
      setChallengeNote("");
      setScheduledAt(defaultScheduledAtValue());
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

          <div className="grid gap-3 sm:grid-cols-4 lg:grid-cols-2">
            <StatCard label="Your Runway" value={String(activeRunwayCount)} />
            <StatCard label="Incoming" value={String(pendingIncomingCount)} />
            <StatCard label="Funded" value={String(fundedCount)} helper="Money locked on the rail" />
            <StatCard label="Ready" value={String(readyCount)} live helper="Checked in or live" />
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.18fr_0.82fr]">
        <section className="space-y-6">
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
                    New match
                  </div>
</div>
                <div
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] ${
                    challengeEscrowReady
                      ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-100"
                      : "border-rose-300/25 bg-rose-400/10 text-rose-100"
                  }`}
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {challengeEscrowReady ? "" : "Escrow unavailable"}
                </div>
              </div>

              <div className="mt-6 grid grid-cols-3 gap-1 rounded-[1.2rem] border border-white/10 bg-black/25 p-1.5">
                {([
                  ["basic", "Basic", "Fast"],
                  ["advanced", "Advanced", "Control"],
                  ["extreme", "Extreme", "Smart + fun"],
                ] as const).map(([mode, label, helper]) => {
                  const active = scheduleMode === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setScheduleMode(mode)}
                      className={`rounded-[0.9rem] px-2 py-2.5 text-center transition sm:px-4 ${
                        active
                          ? "bg-[linear-gradient(135deg,rgba(251,191,36,0.24),rgba(245,158,11,0.10))] text-white shadow-[inset_0_0_0_1px_rgba(253,230,138,0.24)]"
                          : "text-slate-400 hover:bg-white/[0.05] hover:text-white"
                      }`}
                    >
                      <span className="block text-xs font-bold sm:text-sm">{label}</span>
                      <span className="mt-0.5 hidden text-[10px] uppercase tracking-[0.15em] opacity-60 sm:block">
                        {helper}
                      </span>
                    </button>
                  );
                })}
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
                    {scheduleMode === "extreme" ? (
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
                        Pick the hour
                      </div>
                      <button type="button" onClick={toggleSiteTimePreference} className="text-[11px] text-slate-400 transition hover:text-white">
                        {timeDisplayMode === "local" ? "Show UTC sitewide" : "Show local sitewide"}
                      </button>
                    </div>
                    <div className="mt-3 grid grid-cols-4 gap-2">
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
                      className="mt-3 w-full rounded-2xl border border-white/12 bg-slate-950 px-4 py-3 text-white outline-none focus:border-amber-300/50"
                    />
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                      <CalendarClock className="h-4 w-4 text-cyan-200/70" />
                      <span className="font-semibold text-white">{schedulePreviewLocal === "—" ? "Pick a start time" : schedulePreviewLocal}</span>
                      <span className="text-slate-600">·</span>
                      <span>{schedulePreviewUtc === "—" ? "UTC pending" : `UTC ${schedulePreviewUtcCompact}`}</span>
                    </div>
                  </section>

                  <section className="rounded-[1.4rem] border border-white/10 bg-black/20 p-4 sm:p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-300 text-[11px] font-black text-slate-950">3</span>
                        Set the stakes
                      </div>
                      <div className="text-sm font-black text-amber-100">{totalFundingPreview.toLocaleString()} WOLO each</div>
                    </div>
                    {scheduleMode !== "basic" ? (
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
                  </section>

                  {scheduleMode === "extreme" ? (
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

                  {scheduleMode !== "basic" ? (
                    <section className="rounded-[1.4rem] border border-white/10 bg-black/20 p-4 sm:p-5">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Make the callout</div>
                        <MessageSquareMore className="h-4 w-4 text-cyan-200/70" />
                      </div>
                      {scheduleMode === "extreme" ? (
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
                        placeholder="Name the battlefield. Set the hour. Let war decide."
                      />
                      <div className="mt-1.5 text-right text-[10px] uppercase tracking-[0.16em] text-slate-500">{challengeNote.length}/{CHALLENGE_NOTE_MAX_CHARS}</div>
                    </section>
                  ) : null}

                  {scheduleMode === "extreme" ? (

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
                        <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1">{schedulePreviewLocal}</span>
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

          {focusedMatch ? (
            <section className="rounded-[1.8rem] border border-white/10 bg-slate-950/75 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-xs uppercase tracking-[0.35em] text-cyan-200/70">
                  Coordination Rail
                </div>
                <h2 className="mt-2 text-xl font-semibold text-white">Scheduling Line</h2>
              </div>
              <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
                Match #{focusedMatch.id}
              </div>
            </div>

            {activeRunwayMatches.length > 1 ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {activeRunwayMatches.map((match) => {
                  const counterpart =
                    uid && match.challenger.uid === uid ? match.challenged : match.challenger;
                  const active = focusedMatch.id === match.id;
                  return (
                    <button
                      key={`focus-${match.id}`}
                      type="button"
                      onClick={() => setFocusedMatchId(match.id)}
                      className={`rounded-full px-3 py-1.5 text-left text-xs transition ${
                        active
                          ? "border border-amber-300/22 bg-amber-400/10 text-amber-50 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.14)]"
                          : "border border-white/10 bg-white/[0.04] text-slate-300 hover:border-white/20 hover:text-white"
                      }`}
                    >
                      <span className="font-semibold">{counterpart.name}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center gap-2 rounded-[1.1rem] border border-white/10 bg-white/[0.04] px-3 py-3 text-xs text-slate-300">
              <Clock3 className="h-4 w-4 shrink-0 text-cyan-100/70" />
              <span className="min-w-0 truncate font-semibold text-white">
                {focusedMatch.challenger.name} vs {focusedMatch.challenged.name}
              </span>
              <span className="text-slate-600">·</span>
              <span>{focusedMatch.terms.totalFundingWolo.toLocaleString()} WOLO each</span>
              <span className="text-slate-600">·</span>
              <span>
                {formatDateTime(
                  focusedMatch.scheduledAt,
                  {
                    timeDisplayMode: "local",
                    timeClockMode,
                    timezoneOverride: browserTimeZone,
                  },
                  {
                    browserTimeZone,
                    includeZone: false,
                  }
                )}
              </span>
              <span className="text-slate-600">·</span>
              <span>{focusedMatch.economy.statusLabel}</span>
              {focusedMatch.challengeNote ? (
                <>
                  <span className="text-slate-600">·</span>
                  <span className="min-w-0 truncate text-slate-400">{focusedMatch.challengeNote}</span>
                </>
              ) : null}
              {focusedCounterpart ? (
                <Link
                  href={`/contact-emaren?user=${encodeURIComponent(focusedCounterpart.uid)}`}
                  className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.05] px-3 py-1.5 text-[11px] font-medium text-white transition hover:border-white/25 hover:bg-white/[0.08]"
                >
                  <MessageSquareMore className="h-3.5 w-3.5" />
                  Thread
                </Link>
              ) : null}
            </div>
            </section>
          ) : null}

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

            <div className="mt-5 grid grid-cols-2 gap-2.5 sm:gap-3">
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
                    defaultViewMode="detail"
                    stacked
                    localTimePrimary
                    serverNow={snapshot.serverNow}
                    onAccept={(challengeId) => updateMatch(challengeId, "accept")}
                    onDecline={(challengeId) => updateMatch(challengeId, "decline")}
                    onCancel={(challengeId) => updateMatch(challengeId, "cancel")}
                    onReschedule={(challengeId, payload) => updateMatch(challengeId, "reschedule", payload)}
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
                    className="flex flex-wrap items-center justify-between gap-3 rounded-[1rem] border border-white/10 bg-white/[0.04] px-3 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-white">
                        {formatActivityCompact(activity, activityMatchById.get(activity.scheduledMatchId))}
                      </div>
                      <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-slate-500">
                        {activity.actorName ? `${activity.actorName} · ` : ""}
                        <TimeDisplayText value={activity.createdAt} className="text-slate-400" />
                      </div>
                    </div>
                    <div className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-slate-300">
                      #{activity.scheduledMatchId}
                    </div>
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
                    onReschedule={(challengeId, payload) => updateMatch(challengeId, "reschedule", payload)}
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
