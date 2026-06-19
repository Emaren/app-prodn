"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { FormEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Clock3, MessageSquareMore, Plus, Wallet } from "lucide-react";

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
  challengeFundingEscrowAddress,
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
  serverNow: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
};

type ChallengeCreateSnapshot = ChallengeHubSnapshot & {
  createdChallengeId?: number | null;
  linkedTrophyChallengeId?: number | null;
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
  const [routePrefillApplied, setRoutePrefillApplied] = useState(false);
  const [trophyTarget, setTrophyTarget] = useState<PublicTrophyTarget | null>(null);
  const [trophyTargetLoading, setTrophyTargetLoading] = useState(Boolean(searchParams.get("title")));
  const [wagerAmountWolo, setWagerAmountWolo] = useState(String(CHALLENGE_DEFAULT_WAGER_WOLO));
  const [guaranteeAmountWolo, setGuaranteeAmountWolo] = useState(
    String(CHALLENGE_DEFAULT_GUARANTEE_WOLO)
  );
  const [focusedMatchId, setFocusedMatchId] = useState<number | null>(null);
  const requestedTitle = searchParams.get("title");
  const requestedKind = searchParams.get("kind");
  const requestedCountry = searchParams.get("country");
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
    if (!requestedTitle) {
      setTrophyTarget(null);
      setTrophyTargetLoading(false);
      return;
    }

    let cancelled = false;
    setTrophyTargetLoading(true);
    const loadTarget = async () => {
      try {
        const response = await fetch("/api/trophies", { cache: "no-store" });
        const payload = (await response.json().catch(() => ({}))) as {
          trophies?: PublicTrophyTarget[];
        };
        const target =
          payload.trophies?.find((trophy) => {
            if (requestedTitle === "national" && requestedCountry) {
              return trophy.eligibleNationality === requestedCountry;
            }
            return trophy.championTitleId === requestedTitle || trophy.trophyId === requestedTitle;
          }) ?? null;
        if (!cancelled) setTrophyTarget(target);
      } catch {
        if (!cancelled) setTrophyTarget(null);
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
  const challengeEscrowReady = Boolean(challengeFundingEscrowAddress());
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

    if (!challengeFundingEscrowAddress()) {
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
        amountWolo: parsedWagerAmountWolo + parsedGuaranteeAmountWolo,
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
            ? `${trophyTarget?.displayName || "Trophy"} challenge funded and linked to the proof rail.`
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

      <section className="grid gap-6 xl:grid-cols-[0.88fr_1.12fr]">
        <section className="space-y-6">
          <section
            id={scheduleFormId}
            className="rounded-[1.8rem] border border-white/10 bg-slate-950/75 p-5 sm:p-6"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-xs uppercase tracking-[0.35em] text-amber-200/70">New Match</div>
                <h2 className="mt-2 text-2xl font-semibold text-white">Challenge + Fund</h2>
              </div>
              <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-slate-300">
                Wallet escrow
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
                  returnTo={returnTo}
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

                {isNationalChallengeFlow ? (
                  <label className="block space-y-2 rounded-[1.35rem] border border-amber-300/14 bg-amber-400/[0.055] p-4">
                    <span className="text-sm font-medium text-amber-50">Your Nation</span>
                    <select
                      value={selectedNationalCountry}
                      onChange={(event) => {
                        const nextCountry = isRepresentedCountry(event.target.value)
                          ? event.target.value
                          : "";
                        setSelectedNationalCountry(nextCountry);
                        setChallengeNote((current) => {
                          const nextNote = buildNationalChallengeNote(nextCountry).slice(
                            0,
                            CHALLENGE_NOTE_MAX_CHARS
                          );
                          return current.length === 0 || current.startsWith("Challenge for ")
                            ? nextNote
                            : current;
                        });
                      }}
                      className="w-full cursor-pointer rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none transition hover:border-white/20 focus:border-amber-300/50"
                    >
                      <option value="">Choose country</option>
                      {REPRESENTED_COUNTRIES.map((country) => (
                        <option key={country} value={country}>
                          {country}
                        </option>
                      ))}
                    </select>
                    <span className="block text-xs leading-5 text-amber-100/65">
                      This tells Emaren which national belt to create and schedule for your title match.
                    </span>
                  </label>
                ) : null}

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
                  disabled={saving || !challengeEscrowReady}
                  className="inline-flex items-center gap-2 rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {walletStatus !== "connected" ? <Wallet className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  {createButtonLabel}
                </button>
              </form>
            )}
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
