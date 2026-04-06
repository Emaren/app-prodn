
"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  LobbyTextColorPicker,
  LobbyThemePicker,
  LobbyViewToggle,
} from "@/components/lobby/LobbyAppearanceControls";
import { getLobbyHeroBackground } from "@/components/lobby/lobbyPresentation";
import { useLobbyAppearance } from "@/components/lobby/LobbyAppearanceContext";
import { useUserAuth } from "@/hooks/useUserAuth";
import SteamLoginButton from "@/components/SteamLoginButton";
import type { ChallengeHubSnapshot } from "@/lib/challenges";

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

function buildWatcherPairUrl(apiKey: string) {
  return `aoe2hd-watcher://pair?apiKey=${encodeURIComponent(apiKey)}`;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
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
    presentationTone: appearanceTone,
  } = useLobbyAppearance();

  const claimName = searchParams?.get("claim_name")?.trim() || "";
  const watcherPairIntent = searchParams?.get("watcher_pair") === "1";

  const returnToParams = new URLSearchParams();
  if (claimName) {
    returnToParams.set("claim_name", claimName);
  }
  if (watcherPairIntent) {
    returnToParams.set("watcher_pair", "1");
  }

  const profileReturnTo = returnToParams.toString()
    ? `/profile?${returnToParams.toString()}`
    : "/profile";

  const launchWatcherPairing = useCallback((apiKey: string) => {
    window.location.assign(buildWatcherPairUrl(apiKey));
  }, []);

  const hasPendingClaim = (profile?.pendingClaimAmountWolo ?? 0) > 0;

  const claimStatusMessage = useMemo(() => {
    if (!profile) return "";
    if (!hasPendingClaim) return "";

    const amount = profile.pendingClaimAmountWolo;
    const claimCount = profile.pendingClaimCount;
    const latest = formatDateTime(profile.pendingClaimLatestCreatedAt);

    if (claimCount > 1) {
      return `${amount} WOLO is waiting across ${claimCount} unclaimed purses. Latest credit: ${latest}.`;
    }

    return `${amount} WOLO is waiting to be claimed. Latest credit: ${latest}.`;
  }, [hasPendingClaim, profile]);

  const recentChallengeHistory = useMemo(
    () => challengeSnapshot?.historyMatches.slice(0, 4) ?? [],
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
    if (!claimName || claimSeedApplied || profile?.inGameName) {
      return;
    }

    setStatus(
      `Steam identity linked. Replay-backed games will confirm the AoE2HD identity for ${claimName}; manual name edits are now disabled.`
    );
    setClaimSeedApplied(true);
  }, [claimName, claimSeedApplied, profile?.inGameName]);


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
          setStatus(
            "Watcher key minted and sent to the desktop app. If macOS did not switch windows, paste the fallback key below."
          );
        } else {
          setStatus("Watcher key minted. Pair from the desktop app, or copy the fallback key below.");
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
    if (!isAuthenticated || !watcherPairIntent || watcherPairRequestStarted) {
      return;
    }

    setWatcherPairRequestStarted(true);
    void createWatcherKey({ pairToWatcher: true });
  }, [createWatcherKey, isAuthenticated, watcherPairIntent, watcherPairRequestStarted]);

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-3xl py-10">
        <div className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-8 text-white">
          <div className="text-xs uppercase tracking-[0.35em] text-white/45">Profile</div>
          <h2 className="mt-3 text-3xl font-semibold">
            {claimName
              ? `Sign in before you claim ${claimName}.`
              : "Sign in before you claim a competitive identity."}
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300">
            Steam is the first account path. That gives you a stable identity now, while replay
            verification continues to handle trust for betting and result settlement.
          </p>
          {claimName ? (
            <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-400/10 px-4 py-4 text-sm text-amber-100">
              This public warrior page exists already. Sign in, then upload one replay with your
              watcher key to confirm that identity properly.
            </div>
          ) : null}
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

  return (
    <div className="mx-auto max-w-4xl space-y-7 py-8 text-white">
      <section className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.35em] text-white/45">Identity</div>
            <h1 className="mt-2 text-3xl font-semibold">
              {profile?.steamPersonaName || playerName || "Profile"}
            </h1>
            <p className="mt-3 text-sm text-slate-300">
              UID: <span className="font-mono text-white/85">{uid}</span>
            </p>
          </div>
          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            Verification level {profile?.verificationLevel ?? 0}
          </div>
        </div>

        {claimName && !profile?.inGameName ? (
          <div className="mt-6 rounded-2xl border border-amber-300/20 bg-amber-400/10 px-4 py-4 text-sm text-amber-100">
            You came here from the public warrior page for{" "}
            <span className="font-semibold">{claimName}</span>. Steam confirms the account. Your
            first parsed replay confirms the competitive AoE2HD name.
          </div>
        ) : null}

        {hasPendingClaim ? (
          <div className="mt-6 rounded-2xl border border-emerald-300/20 bg-emerald-400/10 px-5 py-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.3em] text-emerald-200/80">
                  Claimable WOLO
                </div>
                <div className="mt-2 text-3xl font-semibold text-white">
                  {profile?.pendingClaimAmountWolo ?? 0} WOLO
                </div>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-emerald-100/90">
                  {claimStatusMessage}
                </p>
              </div>
              <div className="rounded-full border border-emerald-300/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-100">
                {profile?.pendingClaimCount ?? 0} pending
              </div>
            </div>
            <div className="mt-4 text-xs text-emerald-100/80">
              Right now this is a claim ledger signal. The visible bait is live. The final wallet
              payout rail can be tightened next.
            </div>
          </div>
        ) : null}

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-white/8 bg-white/5 p-6">
            <div className="text-sm font-medium text-white">Steam</div>
            <div className="mt-3 space-y-2 text-sm text-slate-300">
              <div>Persona: {profile?.steamPersonaName || "Unknown"}</div>
              <div>Steam ID: {profile?.steamId || "Not connected"}</div>
              <div>Verification method: {profile?.verificationMethod || "none"}</div>
            </div>
            <p className="mt-4 text-xs leading-5 text-slate-400">
              Steam supplies the account identity. It is the front-door credential, not the final
              proof of your AoE2HD competitive name.
            </p>
          </div>

          <div className="rounded-2xl border border-white/8 bg-white/5 p-6">
            <div className="text-sm font-medium text-white">Competitive Identity</div>
            <div className="mt-3 space-y-2 text-sm text-slate-300">
              <div>
                Confirmed AoE2HD Name:{" "}
                <span className="text-white">
                  {profile?.inGameName || "Awaiting replay confirmation"}
                </span>
              </div>
              <div>Manual editing: disabled</div>
              <div>
                Proof path: parsed replays + watcher-backed uploads
              </div>
            </div>
            <p className="mt-4 text-xs leading-5 text-slate-400">
              Users no longer free-type their in-game name here. Your replay-backed identity is the
              source of truth now.
            </p>
          </div>
        </div>

        {status ? <p className="mt-5 text-sm text-slate-300">{status}</p> : null}
      </section>

      <section className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.35em] text-white/45">Challenge Record</div>
            <h2 className="mt-2 text-2xl font-semibold text-white">What the ledger says</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
              This is where older challenge attempts belong: accepted, declined, cancelled,
              forfeited, completed, and the record they imply.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
            {challengeSnapshot?.record.total ?? 0} total tracked
          </div>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <ProfileMetricCard label="Wins" value={String(challengeSnapshot?.record.wins ?? 0)} />
          <ProfileMetricCard label="Losses" value={String(challengeSnapshot?.record.losses ?? 0)} />
          <ProfileMetricCard label="Completed" value={String(challengeSnapshot?.record.completed ?? 0)} />
          <ProfileMetricCard label="Forfeited" value={String(challengeSnapshot?.record.forfeited ?? 0)} />
          <ProfileMetricCard label="Pending" value={String(challengeSnapshot?.record.pending ?? 0)} />
          <ProfileMetricCard label="Accepted" value={String(challengeSnapshot?.record.accepted ?? 0)} />
          <ProfileMetricCard label="Declined" value={String(challengeSnapshot?.record.declined ?? 0)} />
          <ProfileMetricCard label="Cancelled" value={String(challengeSnapshot?.record.cancelled ?? 0)} />
        </div>

        <div className="mt-8 rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.3em] text-slate-500">Recent Challenge History</div>
              <h3 className="mt-2 text-xl font-semibold text-white">Last tracked attempts</h3>
            </div>
            <Link
              href="/challenge"
              className="rounded-full border border-white/15 px-4 py-2 text-sm text-white/85 transition hover:border-white/30 hover:text-white"
            >
              Open Challenge Hub
            </Link>
          </div>

          <div className="mt-5 space-y-3">
            {recentChallengeHistory.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-slate-950/45 px-4 py-4 text-sm text-slate-300">
                No recent challenge ledger entries yet.
              </div>
            ) : (
              recentChallengeHistory.map((match) => (
                <div
                  key={match.id}
                  className="rounded-2xl border border-white/10 bg-slate-950/45 px-4 py-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-white">
                        {match.challenger.name} vs {match.challenged.name}
                      </div>
                      <div className="mt-1 text-[11px] uppercase tracking-[0.22em] text-slate-500">
                        {new Date(match.activityAt).toLocaleString()}
                      </div>
                    </div>
                    <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-slate-300">
                      {match.displayState}
                    </div>
                  </div>
                  {match.challengeNote ? (
                    <div className="mt-3 text-sm leading-6 text-slate-300">{match.challengeNote}</div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section className={`rounded-[2rem] border p-9 ${appearanceTone.panelShell}`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className={`text-xs uppercase tracking-[0.35em] ${appearanceTone.eyebrow}`}>
              Appearance
            </div>
            <h2 className="mt-2 text-2xl font-semibold text-white">Tune your command room</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
              Theme now drives the page background and navbar. Tile Style drives the panels. Skin
              controls the steel-versus-field treatment, and Text Color lets you push the copy
              brighter, softer, or darker.
            </p>
          </div>
          <div className={`rounded-2xl border px-4 py-3 text-sm ${appearanceTone.neutralPill}`}>
            Stored to your account + this device
          </div>
        </div>

        <div className="mt-8 grid gap-7 md:grid-cols-2 xl:grid-cols-4">
          <div className={`rounded-2xl border p-6 ${appearanceTone.insetPanel}`}>
            <div className="text-sm font-medium text-white">Theme</div>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Controls the room backdrop and the navbar shell.
            </p>
            <LobbyThemePicker
              themeKey={themeKey}
              onThemeChange={setThemeKey}
              tone={appearanceTone}
              size="sm"
              className="mt-4"
            />
          </div>

          <div className={`rounded-2xl border p-6 ${appearanceTone.insetPanel}`}>
            <div className="text-sm font-medium text-white">Tile Style (Color)</div>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Recolors cards, panels, and board surfaces without touching the wallpaper.
            </p>
            <LobbyThemePicker
              themeKey={tileThemeKey}
              onThemeChange={setTileThemeKey}
              tone={appearanceTone}
              size="sm"
              className="mt-4"
            />
          </div>

          <div className={`rounded-2xl border p-6 ${appearanceTone.insetPanel}`}>
            <div className="text-sm font-medium text-white">Tile Skin</div>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Steel stays armored and neutral. Field leans greener and more war-room.
            </p>
            <LobbyViewToggle
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              tone={appearanceTone}
              className="mt-4"
            />
          </div>

          <div className={`rounded-2xl border p-6 ${appearanceTone.insetPanel}`}>
            <div className="text-sm font-medium text-white">Text Color</div>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              White stays sharp, Grey softens the room, and Black pushes the body copy inkier
              without flattening the headers.
            </p>
            <LobbyTextColorPicker
              textColor={textColor}
              onTextColorChange={setTextColor}
              tone={appearanceTone}
              className="mt-4"
            />
          </div>
        </div>

        <div
          className="mt-8 rounded-[1.75rem] border border-white/10 p-5"
          style={{ backgroundImage: getLobbyHeroBackground(themeKey, viewMode) }}
        >
          <div className="grid gap-5 md:grid-cols-[1.1fr_0.9fr]">
            <div className={`rounded-2xl border p-5 ${appearanceTone.card}`}>
              <div className={`text-[11px] uppercase tracking-[0.32em] ${appearanceTone.eyebrow}`}>
                Preview
              </div>
              <div className="mt-3 text-4xl font-semibold tracking-tight text-white">61</div>
              <div
                className={`mt-2 text-[11px] uppercase tracking-[0.28em] ${appearanceTone.countLabel}`}
              >
                Players On Board
              </div>
            </div>

            <div className={`rounded-2xl border p-5 ${appearanceTone.insetPanel}`}>
              <div className="flex items-center justify-between gap-3">
                <div className={`text-[11px] uppercase tracking-[0.32em] ${appearanceTone.accentText}`}>
                  Current Skin
                </div>
                <div
                  className={`rounded-full border px-3 py-1 text-xs font-medium ${appearanceTone.statusBadge}`}
                >
                  {viewMode === "field" ? "Field" : "Steel"}
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <span
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${appearanceTone.neutralPill}`}
                >
                  bg {themeKey}
                </span>
                <span
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${appearanceTone.rankBadge}`}
                >
                  tiles {tileThemeKey}
                </span>
                <span
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${appearanceTone.neutralPill}`}
                >
                  {viewMode}
                </span>
                <span
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${appearanceTone.neutralPill}`}
                >
                  {textColor} text
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.35em] text-white/45">Watcher</div>
            <h2 className="mt-2 text-2xl font-semibold">Pair Watcher in one click</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
              Click Pair Watcher App to mint a fresh key and hand it straight to the desktop client.
              If the browser deep link is blocked, the fallback key still appears below for manual
              paste.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void createWatcherKey({ pairToWatcher: true })}
              disabled={mintingWatcherKey}
              className="rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {mintingWatcherKey ? "Pairing..." : "Pair Watcher App"}
            </button>
            <button
              type="button"
              onClick={() => void createWatcherKey()}
              disabled={mintingWatcherKey}
              className="rounded-full border border-white/15 px-5 py-3 text-sm text-white/85 transition hover:border-white/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-70"
            >
              Mint Key Only
            </button>
          </div>
        </div>

        {watcherPairIntent ? (
          <div className="mt-6 rounded-2xl border border-emerald-300/20 bg-emerald-400/10 px-4 py-4 text-sm text-emerald-100">
            Pairing request received from the Watcher app. If macOS prompts you, choose Open
            AoE2HD Watcher to finish the handoff.
          </div>
        ) : null}

        {newWatcherKey ? (
          <div className="mt-6 rounded-2xl border border-amber-300/20 bg-amber-400/10 p-5">
            <div className="text-sm font-medium text-amber-100">
              Fallback key if one-click pairing is blocked
            </div>
            <div className="mt-3 break-all font-mono text-sm text-white">{newWatcherKey}</div>
          </div>
        ) : null}

        <div className="mt-6 space-y-3">
          {watcherKeys.length === 0 ? (
            <p className="rounded-2xl border border-white/8 bg-white/5 px-4 py-4 text-sm text-slate-300">
              No watcher keys minted yet.
            </p>
          ) : (
            watcherKeys.map((key) => (
              <div
                key={key.prefix}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/5 px-4 py-4 text-sm"
              >
                <div className="font-mono text-white">{key.prefix}</div>
                <div className="text-slate-300">
                  Created {new Date(key.createdAt).toLocaleString()}
                  {key.lastUsedAt ? ` · Last used ${new Date(key.lastUsedAt).toLocaleString()}` : ""}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="flex flex-wrap gap-3">
        <Link
          href="/"
          className="rounded-full border border-white/15 px-5 py-3 text-sm text-white/85 transition hover:border-white/30 hover:text-white"
        >
          Back To Lobby
        </Link>
        <Link
          href="/upload"
          className="rounded-full border border-white/15 px-5 py-3 text-sm text-white/85 transition hover:border-white/30 hover:text-white"
        >
          Upload Replay
        </Link>
        <button
          type="button"
          onClick={logout}
          className="rounded-full border border-red-400/20 px-5 py-3 text-sm text-red-200 transition hover:border-red-300/40 hover:bg-red-500/10"
        >
          Log Out
        </button>
      </section>
    </div>
  );
}

function ProfileMetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.35rem] border border-white/10 bg-white/[0.04] px-4 py-4">
      <div className="text-xs uppercase tracking-[0.24em] text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
    </div>
  );
}

function ProfilePageFallback() {
  return (
    <div className="mx-auto max-w-4xl py-8 text-white">
      <div className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-8">
        <div className="text-xs uppercase tracking-[0.35em] text-white/45">Profile</div>
        <h1 className="mt-2 text-3xl font-semibold">Loading profile...</h1>
        <p className="mt-3 text-sm text-slate-300">
          Preparing your account, watcher keys, and claim flow.
        </p>
      </div>
    </div>
  );
}
