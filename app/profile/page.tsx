"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
  type UIEvent,
} from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Clock3,
  Coins,
  LogOut,
  Mail,
  Monitor,
  Palette,
  Phone,
  ShieldCheck,
  Trophy,
  Upload,
} from "lucide-react";

import ScheduledMatchCard, {
  CompactScheduledMatchHistoryRow,
} from "@/components/challenge/ScheduledMatchCard";
import {
  LobbyTextColorPicker,
  LobbyThemePicker,
  LobbyViewToggle,
} from "@/components/lobby/LobbyAppearanceControls";
import { useLobbyAppearance } from "@/components/lobby/LobbyAppearanceContext";
import TimeClockModeToggle from "@/components/time/TimeClockModeToggle";
import TimeDisplayModeToggle from "@/components/time/TimeDisplayModeToggle";
import TimeDisplayText from "@/components/time/TimeDisplayText";
import { getLobbyHeroBackground } from "@/components/lobby/lobbyPresentation";
import SteamLoginButton from "@/components/SteamLoginButton";
import { useUserAuth } from "@/hooks/useUserAuth";
import type { ChallengeHubSnapshot } from "@/lib/challenges";
import { formatDateTime as formatSiteDateTime } from "@/lib/timeDisplay";

type ProfileResponse = {
  uid: string;
  email: string | null;
  inGameName: string | null;
  verified: boolean;
  isAdmin: boolean;
  twitchStreamUrl: string | null;
  steamId: string | null;
  steamPersonaName: string | null;
  verificationLevel: number;
  verificationMethod: string;
  pendingClaimAmountWolo: number;
  pendingClaimCount: number;
  pendingClaimLatestCreatedAt: string | null;
};

type WatcherKeyRow = {
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
};

type ClaimWoloResponse = {
  claimedCount: number;
  claimedAmountWolo: number;
  pendingClaimAmountWolo: number;
  pendingClaimCount: number;
  pendingClaimLatestCreatedAt: string | null;
  detail?: string;
};

type WoloTransactionRow = {
  id: string;
  direction: "in" | "out";
  amountWolo: number;
  label: string;
  status: string;
  occurredAt: string;
  txHash: string | null;
  proofUrl?: string | null;
  category?: string;
  network?: string;
  riskLabel?: string | null;
};

type WoloTransactionsResponse = {
  rows?: WoloTransactionRow[];
  nextOffset?: number;
  hasMore?: boolean;
};

const MONEY_TX_PAGE_SIZE = 20;

function buildWatcherPairUrl(apiKey: string) {
  return `aoe2hd-watcher://pair?apiKey=${encodeURIComponent(apiKey)}`;
}

function truncateUid(value: string | null | undefined) {
  if (!value) return "—";
  if (value.length <= 18) return value;
  return `${value.slice(0, 8)}…${value.slice(-8)}`;
}

export default function ProfilePage() {
  return (
    <Suspense fallback={<ProfilePageFallback />}>
      <ProfilePageContent />
    </Suspense>
  );
}

function ProfilePageContent() {
  const { uid, isAuthenticated, playerName, setPlayerName, logout } = useUserAuth();
  const searchParams = useSearchParams();
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [challengeSnapshot, setChallengeSnapshot] = useState<ChallengeHubSnapshot | null>(null);
  const [watcherKeys, setWatcherKeys] = useState<WatcherKeyRow[]>([]);
  const [newWatcherKey, setNewWatcherKey] = useState<string | null>(null);
  const [emailDraft, setEmailDraft] = useState("");
  const [twitchDraft, setTwitchDraft] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);
  const [savingTwitch, setSavingTwitch] = useState(false);
  const [moneyRows, setMoneyRows] = useState<WoloTransactionRow[]>([]);
  const [moneyLoading, setMoneyLoading] = useState(false);
  const [moneyHasMore, setMoneyHasMore] = useState(false);
  const [mintingWatcherKey, setMintingWatcherKey] = useState(false);
  const [watcherPairRequestStarted, setWatcherPairRequestStarted] = useState(false);
  const [claimingWolo, setClaimingWolo] = useState(false);
  const [status, setStatus] = useState("");
  const [claimSeedApplied, setClaimSeedApplied] = useState(false);
  const {
    themeKey,
    setThemeKey,
    tileThemeKey,
    setTileThemeKey,
    viewMode,
    setViewMode,
    textColor,
    setTextColor,
    timeDisplayMode,
    setTimeDisplayMode,
    timeClockMode,
    setTimeClockMode,
    browserTimeZone,
    presentationTone: appearanceTone,
  } = useLobbyAppearance();

  const claimName = searchParams?.get("claim_name")?.trim() || "";
  const watcherPairIntent = searchParams?.get("watcher_pair") === "1";

  const returnToParams = new URLSearchParams();
  if (claimName) returnToParams.set("claim_name", claimName);
  if (watcherPairIntent) returnToParams.set("watcher_pair", "1");

  const profileReturnTo = returnToParams.toString()
    ? `/profile?${returnToParams.toString()}`
    : "/profile";

  const launchWatcherPairing = useCallback((apiKey: string) => {
    window.location.assign(buildWatcherPairUrl(apiKey));
  }, []);

  const hasPendingClaim = (profile?.pendingClaimAmountWolo ?? 0) > 0;

  const claimStatusMessage = useMemo(() => {
    if (!profile || !hasPendingClaim) return "";
    const amount = profile.pendingClaimAmountWolo;
    const count = profile.pendingClaimCount;
    const latest = formatSiteDateTime(
      profile.pendingClaimLatestCreatedAt,
      {
        timeDisplayMode,
        timeClockMode,
        timezoneOverride: browserTimeZone,
      },
      {
        browserTimeZone,
      }
    );
    return count > 1
      ? `${amount} WOLO waiting across ${count} claims · latest ${latest}`
      : `${amount} WOLO waiting · latest ${latest}`;
  }, [browserTimeZone, hasPendingClaim, profile, timeClockMode, timeDisplayMode]);

  const recentChallengeHistory = useMemo(
    () => challengeSnapshot?.historyMatches.slice(0, 4) ?? [],
    [challengeSnapshot]
  );
  const currentScheduledMatches = useMemo(
    () => challengeSnapshot?.scheduledMatches.slice(0, 2) ?? [],
    [challengeSnapshot]
  );

  const challengeStats = useMemo(
    () => [
      { label: "Wins", value: challengeSnapshot?.record.wins ?? 0 },
      { label: "Losses", value: challengeSnapshot?.record.losses ?? 0 },
      { label: "Completed", value: challengeSnapshot?.record.completed ?? 0 },
      { label: "Forfeited", value: challengeSnapshot?.record.forfeited ?? 0 },
      { label: "Pending", value: challengeSnapshot?.record.pending ?? 0 },
      { label: "Cancelled", value: challengeSnapshot?.record.cancelled ?? 0 },
    ],
    [challengeSnapshot]
  );

  const loadProfile = useCallback(async () => {
    try {
      const [profileResponse, watcherKeyResponse, challengeResponse, moneyResponse] = await Promise.all([
        fetch("/api/user/me", { cache: "no-store" }),
        fetch("/api/user/watcher-key", { cache: "no-store" }),
        fetch("/api/challenges", { cache: "no-store" }),
        fetch(`/api/user/wolo-transactions?offset=0&limit=${MONEY_TX_PAGE_SIZE}`, {
          cache: "no-store",
        }),
      ]);

      if (profileResponse.ok) {
        const nextProfile = (await profileResponse.json()) as ProfileResponse;
        setProfile(nextProfile);
        if (nextProfile.inGameName) {
          setPlayerName(nextProfile.inGameName);
        }
      }

      if (watcherKeyResponse.ok) {
        const payload = (await watcherKeyResponse.json()) as { keys?: WatcherKeyRow[] };
        setWatcherKeys(Array.isArray(payload.keys) ? payload.keys : []);
      }

      if (challengeResponse.ok) {
        const payload = (await challengeResponse.json()) as ChallengeHubSnapshot;
        setChallengeSnapshot(payload);
      }

      if (moneyResponse.ok) {
        const payload = (await moneyResponse.json()) as WoloTransactionsResponse;
        setMoneyRows(Array.isArray(payload.rows) ? payload.rows : []);
        setMoneyHasMore(Boolean(payload.hasMore));
      }
    } catch (error) {
      console.warn("Failed to load profile:", error);
    }
  }, [setPlayerName]);

  const loadMoreMoneyRows = useCallback(async () => {
    if (moneyLoading || !moneyHasMore) return;

    setMoneyLoading(true);
    try {
      const response = await fetch(
        `/api/user/wolo-transactions?offset=${moneyRows.length}&limit=${MONEY_TX_PAGE_SIZE}`,
        { cache: "no-store" }
      );
      if (!response.ok) {
        throw new Error(`WOLO tx request failed: ${response.status}`);
      }
      const payload = (await response.json()) as WoloTransactionsResponse;
      const nextRows = Array.isArray(payload.rows) ? payload.rows : [];
      setMoneyRows((current) => {
        const seen = new Set(current.map((row) => row.id));
        return [...current, ...nextRows.filter((row) => !seen.has(row.id))];
      });
      setMoneyHasMore(Boolean(payload.hasMore));
    } catch (error) {
      console.warn("Failed to load more WOLO transactions:", error);
    } finally {
      setMoneyLoading(false);
    }
  }, [moneyHasMore, moneyLoading, moneyRows.length]);

  useEffect(() => {
    if (!isAuthenticated) return;
    void loadProfile();
  }, [isAuthenticated, loadProfile]);

  const handleMoneyScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      const element = event.currentTarget;
      const nearBottom =
        element.scrollHeight - element.scrollTop - element.clientHeight < 72;
      if (nearBottom) {
        void loadMoreMoneyRows();
      }
    },
    [loadMoreMoneyRows]
  );

  useEffect(() => {
    setEmailDraft(profile?.email ?? "");
  }, [profile?.email]);

  useEffect(() => {
    setTwitchDraft(profile?.twitchStreamUrl ?? "");
  }, [profile?.twitchStreamUrl]);

  useEffect(() => {
    if (!claimName || claimSeedApplied || profile?.inGameName) return;
    setStatus(
      `Steam linked. Replay proof will lock in ${claimName} after your first confirmed upload.`
    );
    setClaimSeedApplied(true);
  }, [claimName, claimSeedApplied, profile?.inGameName]);

  const claimPendingWolo = useCallback(async () => {
    setClaimingWolo(true);
    setStatus("");

    try {
      const response = await fetch("/api/user/wolo-claims/claim", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const payload = (await response.json().catch(() => null)) as ClaimWoloResponse | null;
      if (!response.ok || !payload) {
        throw new Error(payload?.detail || "WOLO claim failed.");
      }

      setProfile((current) =>
        current
          ? {
              ...current,
              pendingClaimAmountWolo: payload.pendingClaimAmountWolo,
              pendingClaimCount: payload.pendingClaimCount,
              pendingClaimLatestCreatedAt: payload.pendingClaimLatestCreatedAt,
            }
          : current
      );
      setStatus(
        payload.claimedCount > 0
          ? `Claimed ${payload.claimedAmountWolo} WOLO across ${payload.claimedCount} row${payload.claimedCount === 1 ? "" : "s"}.`
          : "No pending WOLO was waiting on this profile."
      );
      void loadProfile();
    } catch (error) {
      console.error("Failed to claim WOLO:", error);
      setStatus(error instanceof Error ? error.message : "WOLO claim failed.");
    } finally {
      setClaimingWolo(false);
    }
  }, [loadProfile]);

  const saveNotificationEmail = useCallback(async () => {
    setSavingEmail(true);
    setStatus("");

    try {
      const response = await fetch("/api/user/me", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: emailDraft }),
      });

      const payload = (await response.json().catch(() => null)) as
        | (ProfileResponse & { detail?: string })
        | null;

      if (!response.ok || !payload) {
        throw new Error(payload?.detail || "Email save failed.");
      }

      setProfile((current) => (current ? { ...current, email: payload.email } : current));
      setStatus("Notification email saved.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Email save failed.");
    } finally {
      setSavingEmail(false);
    }
  }, [emailDraft]);

  const saveTwitchStream = useCallback(async () => {
    setSavingTwitch(true);
    setStatus("");

    try {
      const response = await fetch("/api/user/me", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ twitchStreamUrl: twitchDraft }),
      });

      const payload = (await response.json().catch(() => null)) as
        | (ProfileResponse & { detail?: string })
        | null;

      if (!response.ok || !payload) {
        throw new Error(payload?.detail || "Twitch stream save failed.");
      }

      setProfile((current) =>
        current ? { ...current, twitchStreamUrl: payload.twitchStreamUrl } : current
      );
      setStatus(payload.twitchStreamUrl ? "Twitch stream saved." : "Twitch stream cleared.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Twitch stream save failed.");
    } finally {
      setSavingTwitch(false);
    }
  }, [twitchDraft]);

  const createWatcherKey = useCallback(
    async ({ pairToWatcher = false } = {}) => {
      setMintingWatcherKey(true);
      setStatus("");
      setNewWatcherKey(null);

      try {
        const response = await fetch("/api/user/watcher-key", { method: "POST" });
        const payload = (await response.json()) as { apiKey?: string; detail?: string };

        if (!response.ok || !payload.apiKey) {
          setStatus(payload.detail || "Failed to create watcher key.");
          return;
        }

        setNewWatcherKey(payload.apiKey);

        const refreshKeys = await fetch("/api/user/watcher-key", { cache: "no-store" });
        if (refreshKeys.ok) {
          const nextPayload = (await refreshKeys.json()) as { keys?: WatcherKeyRow[] };
          setWatcherKeys(Array.isArray(nextPayload.keys) ? nextPayload.keys : []);
        }

        if (pairToWatcher) {
          launchWatcherPairing(payload.apiKey);
          setStatus("Watcher key minted and sent to the app. Paste the fallback key below if the deep link stalls.");
        } else {
          setStatus("Watcher key minted. Paste it into the app if needed.");
        }
      } catch (error) {
        console.error("Failed to create watcher key:", error);
        setStatus("Failed to create watcher key.");
      } finally {
        setMintingWatcherKey(false);
      }
    },
    [launchWatcherPairing]
  );

  useEffect(() => {
    if (!isAuthenticated || !watcherPairIntent || watcherPairRequestStarted) return;
    setWatcherPairRequestStarted(true);
    void createWatcherKey({ pairToWatcher: true });
  }, [createWatcherKey, isAuthenticated, watcherPairIntent, watcherPairRequestStarted]);

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-3xl py-10">
        <div className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-8 text-white">
          <div className="text-xs uppercase tracking-[0.35em] text-white/45">Profile</div>
          <h2 className="mt-3 text-3xl font-semibold">
            {claimName ? `Sign in before you claim ${claimName}.` : "Sign in to open your command deck."}
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300">
            Steam gets you in. Replay proof sharpens the competitive identity after that.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <SteamLoginButton
              returnTo={profileReturnTo}
              className="rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
            />
            <Link
              href="/"
              className="rounded-full border border-white/15 px-5 py-3 text-sm text-white/85 transition hover:border-white/30 hover:text-white"
            >
              Back To Lobby
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const displayName = profile?.steamPersonaName || playerName || "Profile";
  const confirmedName = profile?.inGameName || "Awaiting replay proof";
  const latestWatcherKey = watcherKeys[0] ?? null;

  return (
    <div className="mx-auto max-w-5xl space-y-6 py-8 text-white">
      <section className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-6 sm:p-8">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] xl:items-start">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-[0.35em] text-white/45">Identity</div>
            <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <h1 className="truncate text-3xl font-semibold sm:text-4xl">{displayName}</h1>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
                    UID {truncateUid(uid)}
                  </span>
                  <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-100">
                    Verification level {profile?.verificationLevel ?? 0}
                  </span>
                  {profile?.verificationMethod ? (
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
                      {profile.verificationMethod}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <IdentityCard
                title="Competitive name"
                value={confirmedName}
                meta={profile?.inGameName ? "Replay-backed" : "Waiting for first confirmed replay"}
              />
              <IdentityCard
                title="Steam"
                value={profile?.steamPersonaName || "Unknown"}
                meta={profile?.steamId ? `Steam ID ${profile.steamId}` : "Not connected"}
              />
            </div>

            <div className="mt-4 rounded-[1.35rem] border border-white/10 bg-white/[0.035] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <Monitor className="h-4 w-4 text-sky-100" aria-hidden="true" />
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.28em] text-slate-500">
                      Video Streaming
                    </div>
                      <div className="mt-1 text-base font-semibold text-white">
                        Twitch channel for live games
                      </div>
                      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                        Add your Twitch channel once. When your watcher sees an AoE2HD game, AoE2WAR can use this as the public video rail for Watch, Bets, and the lobby hero.
                      </p>
                  </div>
                </div>
                {profile?.twitchStreamUrl ? (
                  <span className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-100">
                    Ready
                  </span>
                ) : (
                    <span className="rounded-full border border-amber-300/20 bg-amber-400/10 px-3 py-1 text-xs text-amber-100">
                      Setup Needed
                    </span>
                )}
              </div>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <input
                  type="url"
                  value={twitchDraft}
                  onChange={(event) => setTwitchDraft(event.target.value)}
                  placeholder="https://www.twitch.tv/channel"
                  className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-sky-300/45"
                />
                <button
                  type="button"
                  onClick={saveTwitchStream}
                  disabled={savingTwitch}
                  className="rounded-full bg-sky-200 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-55"
                >
                  {savingTwitch ? "Saving..." : "Save Video"}
                </button>
              </div>

                <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-400">
                  <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
                    1. Save Twitch
                  </span>
                  <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
                    2. Pair watcher
                  </span>
                  <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
                    3. Go live
                  </span>
                </div>
            </div>

            {status ? (
              <div className="mt-4 rounded-2xl border border-sky-300/20 bg-sky-400/10 px-4 py-3 text-sm text-sky-100">
                {status}
              </div>
            ) : null}

            <div className="mt-4 overflow-hidden rounded-[1.7rem] border border-emerald-300/18 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.20),_transparent_28%),radial-gradient(circle_at_82%_18%,_rgba(251,191,36,0.14),_transparent_22%),linear-gradient(135deg,_rgba(8,25,20,0.98),_rgba(5,18,24,0.98))] px-5 py-5 shadow-[0_28px_80px_rgba(0,0,0,0.28)]">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-emerald-100/80">
                    <Coins className="h-4 w-4" />
                    Claim $WOLO
                  </div>
                  <div className="mt-3 text-4xl font-semibold tracking-normal text-white">
                    {profile?.pendingClaimAmountWolo ?? 0} WOLO
                  </div>
                  <div className="mt-2 max-w-2xl text-sm leading-6 text-emerald-50/88">
                    {hasPendingClaim
                      ? claimStatusMessage
                      : "No claimable WOLO is waiting on this profile right now. When app-side rewards or payouts land, this tile becomes the front-door claim rail."}
                  </div>
                  {profile?.pendingClaimLatestCreatedAt ? (
                    <div className="mt-3 text-xs uppercase tracking-[0.22em] text-emerald-100/70">
                      Latest row{" "}
                      <TimeDisplayText
                        value={profile.pendingClaimLatestCreatedAt}
                        className="font-medium text-emerald-50"
                        bubbleClassName="w-max max-w-[18rem] text-center"
                      />
                    </div>
                  ) : null}
                </div>

                <div className="flex shrink-0 flex-col items-end gap-3">
                  <div className="rounded-full border border-emerald-300/24 bg-emerald-500/12 px-3 py-1 text-xs text-emerald-100">
                    {profile?.pendingClaimCount ?? 0} pending
                  </div>
                  <button
                    type="button"
                    onClick={() => void claimPendingWolo()}
                    disabled={claimingWolo || !hasPendingClaim}
                    className="rounded-full border border-amber-200/16 bg-[linear-gradient(135deg,#fde68a_0%,#f5c95f_28%,#d7a73e_72%,#8c5e10_100%)] px-5 py-3 text-sm font-semibold text-slate-950 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    {claimingWolo ? "Claiming..." : hasPendingClaim ? "Claim $WOLO" : "Nothing To Claim"}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="min-w-0 rounded-[1.6rem] border border-white/10 bg-white/[0.04] p-5">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.32em] text-amber-100/70">
              <ShieldCheck className="h-4 w-4" />
              Watcher
            </div>
            <h2 className="mt-3 text-2xl font-semibold">Pair fast. Play clean.</h2>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              Mint a fresh key, hand it to the desktop app, and keep replay proof flowing.
            </p>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void createWatcherKey({ pairToWatcher: true })}
                disabled={mintingWatcherKey}
                className="rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {mintingWatcherKey ? "Pairing..." : "Pair Watcher"}
              </button>
              <button
                type="button"
                onClick={() => void createWatcherKey()}
                disabled={mintingWatcherKey}
                className="rounded-full border border-white/15 px-5 py-3 text-sm text-white/85 transition hover:border-white/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-70"
              >
                Mint Key
              </button>
            </div>

            {watcherPairIntent ? (
              <div className="mt-4 rounded-2xl border border-emerald-300/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
                Pairing request received. If the deep link stalls, use the fallback key below.
              </div>
            ) : null}

            {newWatcherKey ? (
              <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-400/10 p-4">
                <div className="text-xs uppercase tracking-[0.24em] text-amber-100/80">
                  Fresh fallback key
                </div>
                <div className="mt-2 break-all rounded-xl bg-black/20 px-3 py-3 font-mono text-sm text-white">
                  {newWatcherKey}
                </div>
              </div>
            ) : latestWatcherKey ? (
              <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                <div className="text-xs uppercase tracking-[0.24em] text-slate-400">
                  Latest key
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                  <div className="font-mono text-sm text-white">{latestWatcherKey.prefix}</div>
                  <div className="text-xs text-slate-400">
                    Created{" "}
                    <TimeDisplayText value={latestWatcherKey.createdAt} className="text-slate-300" />
                    {latestWatcherKey.lastUsedAt ? " · Last used " : ""}
                    {latestWatcherKey.lastUsedAt ? (
                      <TimeDisplayText value={latestWatcherKey.lastUsedAt} className="text-slate-300" />
                    ) : null}
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-slate-300">
                No watcher keys minted yet.
              </div>
            )}

            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href="/download"
                className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm text-white/85 transition hover:border-white/30 hover:text-white"
              >
                Download Watcher
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/upload"
                className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm text-white/85 transition hover:border-white/30 hover:text-white"
              >
                Upload Replay
                <Upload className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-6">
        <div className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-6 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.32em] text-emerald-100/70">
                <Coins className="h-4 w-4" />
                Money in / money out
              </div>
              <h2 className="mt-2 text-2xl font-semibold text-white">WOLO ledger</h2>
            </div>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-slate-300">
              newest first
            </span>
          </div>

          <div
            className="mt-5 max-h-[21rem] space-y-2 overflow-y-auto pr-1"
            onScroll={handleMoneyScroll}
          >
            {moneyRows.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4 text-sm text-slate-300">
                No WOLO transaction rows yet.
              </div>
            ) : (
              moneyRows.map((row) => (
                <WoloTransactionLine key={row.id} row={row} />
              ))
            )}
          </div>

          {moneyHasMore ? (
            <button
              type="button"
              onClick={() => void loadMoreMoneyRows()}
              disabled={moneyLoading}
              className="mt-4 rounded-full border border-white/15 px-4 py-2 text-sm text-white/85 transition hover:border-white/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {moneyLoading ? "Loading..." : "Load More"}
            </button>
          ) : moneyRows.length > 0 ? (
            <div className="mt-4 text-xs uppercase tracking-[0.22em] text-slate-500">
              All visible rows loaded
            </div>
          ) : null}
        </div>

        <div className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-6 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.35em] text-emerald-100/70">
                Scheduled games
              </div>
              <h2 className="mt-2 text-2xl font-semibold text-white">Current locks</h2>
            </div>
            <Link
              href="/challenge"
              className="rounded-full border border-white/15 px-4 py-2 text-sm text-white/85 transition hover:border-white/30 hover:text-white"
            >
              Challenge Hub
            </Link>
          </div>

          <div className="mt-5 space-y-3">
            {currentScheduledMatches.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4 text-sm text-slate-300">
                No active scheduled games.
              </div>
            ) : (
              currentScheduledMatches.map((match) => (
                <ScheduledMatchCard
                  key={`profile-current-${match.id}`}
                  match={match}
                  viewerUid={uid}
                  serverNow={challengeSnapshot?.serverNow ?? null}
                  compact
                  defaultViewMode="summary"
                />
              ))
            )}
          </div>
        </div>
      </section>

      <section className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.35em] text-white/45">Challenge record</div>
            <h2 className="mt-2 text-2xl font-semibold text-white">What the ledger says</h2>
          </div>
          <Link
            href="/challenge"
            className="rounded-full border border-white/15 px-4 py-2 text-sm text-white/85 transition hover:border-white/30 hover:text-white"
          >
            Open Challenge Hub
          </Link>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          {challengeStats.map((item) => (
            <ProfileMetricCard key={item.label} label={item.label} value={String(item.value)} />
          ))}
        </div>

        <div className="mt-6 rounded-[1.6rem] border border-white/10 bg-white/[0.04] p-4 sm:p-5">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-slate-500">
            <Trophy className="h-4 w-4" />
            Recent attempts
          </div>

          <div className="mt-4 space-y-3">
            {recentChallengeHistory.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-slate-950/45 px-4 py-4 text-sm text-slate-300">
                No recent challenge entries yet.
              </div>
            ) : (
              recentChallengeHistory.map((match) => (
                <CompactScheduledMatchHistoryRow
                  key={match.id}
                  match={match}
                  viewerUid={uid}
                />
              ))
            )}
          </div>
        </div>
      </section>

      <section className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-6 sm:p-7">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.32em] text-amber-100/70">
          <Bell className="h-4 w-4" />
          Notifications
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_0.8fr]">
          <div className="grid gap-3">
            <label className="block space-y-2">
              <span className="flex items-center gap-2 text-sm text-slate-300">
                <Mail className="h-4 w-4" />
                Email
              </span>
              <input
                type="email"
                value={emailDraft}
                onChange={(event) => setEmailDraft(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-amber-300/50"
                placeholder="you@example.com"
              />
            </label>

            <label className="block space-y-2 opacity-60">
              <span className="flex items-center gap-2 text-sm text-slate-300">
                <Phone className="h-4 w-4" />
                Phone later
              </span>
              <input
                type="tel"
                disabled
                className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none"
                placeholder="SMS not wired"
              />
            </label>
          </div>

          <div>
            <div className="flex flex-wrap gap-2">
              {["All", "Challenges", "Scheduled games", "Tournaments", "Wallet"].map((label) => (
                <span
                  key={label}
                  className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs text-slate-200"
                >
                  {label}
                </span>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {["10 min", "30 min", "1 hr"].map((label) => (
                <span
                  key={label}
                  className={`rounded-full border px-3 py-1.5 text-xs ${
                    label === "10 min" || label === "30 min"
                      ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-100"
                      : "border-white/10 bg-white/[0.04] text-slate-300"
                  }`}
                >
                  {label}
                </span>
              ))}
            </div>

            <button
              type="button"
              onClick={() => void saveNotificationEmail()}
              disabled={savingEmail}
              className="mt-5 rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {savingEmail ? "Saving..." : "Save Email"}
            </button>
          </div>
        </div>
      </section>

      <section className={`rounded-[2rem] border p-6 sm:p-7 ${appearanceTone.panelShell}`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className={`text-xs uppercase tracking-[0.35em] ${appearanceTone.eyebrow}`}>
              Appearance
            </div>
            <h2 className="mt-2 text-2xl font-semibold text-white">Tune the room</h2>
          </div>
          <div className={`rounded-full border px-4 py-2 text-sm ${appearanceTone.neutralPill}`}>
            Stored to account + device
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2 xl:grid-cols-5">
          <CompactAppearanceCard title="Theme" tone={appearanceTone}>
            <LobbyThemePicker
              themeKey={themeKey}
              onThemeChange={setThemeKey}
              tone={appearanceTone}
              size="sm"
              className="mt-3"
            />
          </CompactAppearanceCard>

          <CompactAppearanceCard title="Tile color" tone={appearanceTone}>
            <LobbyThemePicker
              themeKey={tileThemeKey}
              onThemeChange={setTileThemeKey}
              tone={appearanceTone}
              size="sm"
              className="mt-3"
            />
          </CompactAppearanceCard>

          <CompactAppearanceCard title="Tile skin" tone={appearanceTone}>
            <LobbyViewToggle
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              tone={appearanceTone}
              className="mt-3"
            />
          </CompactAppearanceCard>

          <CompactAppearanceCard title="Text" tone={appearanceTone}>
            <LobbyTextColorPicker
              textColor={textColor}
              onTextColorChange={setTextColor}
              tone={appearanceTone}
              className="mt-3"
            />
          </CompactAppearanceCard>

          <CompactAppearanceCard title="Time" tone={appearanceTone}>
            <div className="mt-3 flex flex-col gap-3">
              <TimeDisplayModeToggle value={timeDisplayMode} onChange={setTimeDisplayMode} />
              <TimeClockModeToggle value={timeClockMode} onChange={setTimeClockMode} />
              <div className="flex items-center gap-2 text-xs leading-5 text-slate-300">
                <Clock3 className="h-4 w-4" />
                Local uses the browser time zone{browserTimeZone ? ` (${browserTimeZone})` : ""}.
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3 text-sm text-slate-200">
                Preview: <TimeDisplayText value={new Date()} className="font-medium text-white" />
              </div>
            </div>
          </CompactAppearanceCard>
        </div>

        <div
          className="mt-6 rounded-[1.6rem] border border-white/10 p-4"
          style={{ backgroundImage: getLobbyHeroBackground(themeKey, viewMode) }}
        >
          <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
            <div className={`rounded-2xl border p-5 ${appearanceTone.card}`}>
              <div className={`text-[11px] uppercase tracking-[0.28em] ${appearanceTone.eyebrow}`}>
                Current skin
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className={`rounded-full border px-2.5 py-1 text-[11px] ${appearanceTone.neutralPill}`}>
                  bg {themeKey}
                </span>
                <span className={`rounded-full border px-2.5 py-1 text-[11px] ${appearanceTone.rankBadge}`}>
                  tiles {tileThemeKey}
                </span>
                <span className={`rounded-full border px-2.5 py-1 text-[11px] ${appearanceTone.neutralPill}`}>
                  {viewMode}
                </span>
                <span className={`rounded-full border px-2.5 py-1 text-[11px] ${appearanceTone.neutralPill}`}>
                  {textColor} text
                </span>
                <span className={`rounded-full border px-2.5 py-1 text-[11px] ${appearanceTone.neutralPill}`}>
                  {timeDisplayMode} / {timeClockMode}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/"
                className="rounded-full border border-white/15 px-5 py-3 text-sm text-white/85 transition hover:border-white/30 hover:text-white"
              >
                Back To Lobby
              </Link>
              <button
                type="button"
                onClick={logout}
                className="inline-flex items-center gap-2 rounded-full border border-red-400/20 px-5 py-3 text-sm text-red-200 transition hover:border-red-300/40 hover:bg-red-500/10"
              >
                <LogOut className="h-4 w-4" />
                Log Out
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function WoloTransactionLine({ row }: { row: WoloTransactionRow }) {
  const isIn = row.direction === "in";
  const Icon = isIn ? ArrowDownLeft : ArrowUpRight;
  const categoryLabel =
    row.category === "chain_confirmed"
      ? "confirmed chain"
      : row.category === "app_retry"
        ? "retry-needed claim"
        : row.category === "app_pending"
          ? "app-side pending"
          : row.network === "mainnet"
            ? "mainnet"
            : "app ledger";
  const categoryClass =
    row.category === "chain_confirmed"
      ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-100"
      : row.category === "app_retry" || row.riskLabel
        ? "border-amber-300/20 bg-amber-400/10 text-amber-100"
        : "border-white/10 bg-white/[0.04] text-slate-300";

  return (
    <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm">
      <span
        className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${
          isIn
            ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-100"
            : "border-amber-300/20 bg-amber-400/10 text-amber-100"
        }`}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`shrink-0 font-semibold ${isIn ? "text-emerald-100" : "text-amber-100"}`}>
            {isIn ? "+" : "-"}
            {row.amountWolo.toLocaleString()} WOLO
          </span>
          <span className="min-w-0 truncate text-slate-200">{row.label}</span>
        </div>
        <div className="mt-0.5 flex min-w-0 items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-slate-500">
          <TimeDisplayText
            value={row.occurredAt}
            includeZone={false}
            className="text-slate-400"
            bubbleClassName="w-max max-w-[18rem] text-center"
          />
          <span>·</span>
          <span className="truncate">{row.status}</span>
          <span>·</span>
          <span className={`rounded-full border px-2 py-0.5 ${categoryClass}`}>
            {categoryLabel}
          </span>
          {row.riskLabel ? (
            <>
              <span>·</span>
              <span className="rounded-full border border-rose-300/25 bg-rose-400/10 px-2 py-0.5 text-rose-100">
                {row.riskLabel}
              </span>
            </>
          ) : null}
          {row.txHash ? (
            <>
              <span>·</span>
              {row.proofUrl ? (
                <a
                  href={row.proofUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate font-mono text-cyan-200 transition hover:text-white"
                >
                  {row.txHash.slice(0, 10)}…
                </a>
              ) : (
                <span className="truncate font-mono">{row.txHash.slice(0, 10)}…</span>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function IdentityCard({
  title,
  value,
  meta,
}: {
  title: string;
  value: string;
  meta: string;
}) {
  return (
    <div className="rounded-[1.35rem] border border-white/10 bg-white/[0.04] p-5">
      <div className="text-xs uppercase tracking-[0.24em] text-slate-500">{title}</div>
      <div className="mt-3 text-xl font-semibold text-white break-words">{value}</div>
      <div className="mt-2 text-sm text-slate-300">{meta}</div>
    </div>
  );
}

function CompactAppearanceCard({
  title,
  tone,
  children,
}: {
  title: string;
  tone: ReturnType<typeof useLobbyAppearance>["presentationTone"];
  children: ReactNode;
}) {
  return (
    <div className={`rounded-2xl border p-5 ${tone.insetPanel}`}>
      <div className="flex items-center gap-2 text-sm font-medium text-white">
        <Palette className="h-4 w-4" />
        {title}
      </div>
      {children}
    </div>
  );
}

function ProfileMetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.04] px-4 py-4">
      <div className="text-xs uppercase tracking-[0.22em] text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
    </div>
  );
}

function ProfilePageFallback() {
  return (
    <div className="mx-auto max-w-5xl py-8 text-white">
      <div className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-8">
        <div className="text-xs uppercase tracking-[0.35em] text-white/45">Profile</div>
        <h1 className="mt-2 text-3xl font-semibold">Loading command deck…</h1>
      </div>
    </div>
  );
}
