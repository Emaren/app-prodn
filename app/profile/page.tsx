"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Clock3,
  Coins,
  LogOut,
  Palette,
  ShieldCheck,
  Trophy,
  Upload,
} from "lucide-react";

import {
  LobbyTextColorPicker,
  LobbyThemePicker,
  LobbyViewToggle,
} from "@/components/lobby/LobbyAppearanceControls";
import { useLobbyAppearance } from "@/components/lobby/LobbyAppearanceContext";
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
        timezoneOverride: browserTimeZone,
      },
      {
        browserTimeZone,
      }
    );
    return count > 1
      ? `${amount} WOLO waiting across ${count} claims · latest ${latest}`
      : `${amount} WOLO waiting · latest ${latest}`;
  }, [browserTimeZone, hasPendingClaim, profile, timeDisplayMode]);

  const recentChallengeHistory = useMemo(
    () => challengeSnapshot?.historyMatches.slice(0, 4) ?? [],
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
      const [profileResponse, watcherKeyResponse, challengeResponse] = await Promise.all([
        fetch("/api/user/me", { cache: "no-store" }),
        fetch("/api/user/watcher-key", { cache: "no-store" }),
        fetch("/api/challenges", { cache: "no-store" }),
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
    } catch (error) {
      console.warn("Failed to load profile:", error);
    }
  }, [setPlayerName]);

  useEffect(() => {
    if (!isAuthenticated) return;
    void loadProfile();
  }, [isAuthenticated, loadProfile]);

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
    } catch (error) {
      console.error("Failed to claim WOLO:", error);
      setStatus(error instanceof Error ? error.message : "WOLO claim failed.");
    } finally {
      setClaimingWolo(false);
    }
  }, []);

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
                  <div className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-white">
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
                <div
                  key={match.id}
                  className="rounded-2xl border border-white/10 bg-slate-950/45 px-4 py-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="break-words text-sm font-semibold text-white">
                        {match.challenger.name} vs {match.challenged.name}
                      </div>
                      <div className="mt-1 text-[11px] uppercase tracking-[0.22em] text-slate-500">
                        <TimeDisplayText value={match.activityAt} className="text-slate-400" />
                      </div>
                    </div>
                    <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-slate-300">
                      {match.displayState}
                    </div>
                  </div>
                  {match.challengeNote ? (
                    <div className="mt-3 break-words text-sm leading-6 text-slate-300">{match.challengeNote}</div>
                  ) : null}
                </div>
              ))
            )}
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
                  {timeDisplayMode}
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
  children: React.ReactNode;
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
