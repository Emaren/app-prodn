"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  LobbyTextColorPicker,
  LobbyThemePicker,
  LobbyViewToggle,
} from "@/components/lobby/LobbyAppearanceControls";
import {
  getLobbyHeroBackground,
} from "@/components/lobby/lobbyPresentation";
import { useLobbyAppearance } from "@/components/lobby/LobbyAppearanceContext";
import { useUserAuth } from "@/hooks/useUserAuth";
import SteamLoginButton from "@/components/SteamLoginButton";

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
};

type WatcherKeyRow = {
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
};

function buildWatcherPairUrl(apiKey: string) {
  return `aoe2hd-watcher://pair?apiKey=${encodeURIComponent(apiKey)}`;
}

export default function ProfilePage() {
  return (
    <Suspense fallback={<ProfilePageFallback />}>
      <ProfilePageContent />
    </Suspense>
  );
}

function ProfilePageContent() {
  const { uid, isAuthenticated, playerName, setPlayerName, logout, refreshSession } = useUserAuth();
  const searchParams = useSearchParams();
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [watcherKeys, setWatcherKeys] = useState<WatcherKeyRow[]>([]);
  const [newWatcherKey, setNewWatcherKey] = useState<string | null>(null);
  const [mintingWatcherKey, setMintingWatcherKey] = useState(false);
  const [watcherPairRequestStarted, setWatcherPairRequestStarted] = useState(false);
  const [status, setStatus] = useState("");
  const [savingName, setSavingName] = useState(false);
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

  useEffect(() => {
    if (!isAuthenticated) return;

    const load = async () => {
      try {
        const [profileResponse, watcherKeyResponse] = await Promise.all([
          fetch("/api/user/me", { cache: "no-store" }),
          fetch("/api/user/watcher-key", { cache: "no-store" }),
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
      } catch (error) {
        console.warn("Failed to load profile:", error);
      }
    };

    void load();
  }, [isAuthenticated, setPlayerName]);

  useEffect(() => {
    if (!claimName || claimSeedApplied) return;
    if (profile?.inGameName) {
      setClaimSeedApplied(true);
      return;
    }

    if (!playerName) {
      setPlayerName(claimName);
    }
    setStatus(`Claim suggestion loaded for ${claimName}. Save it, then upload a replay to verify it.`);
    setClaimSeedApplied(true);
  }, [claimName, claimSeedApplied, playerName, profile?.inGameName, setPlayerName]);

  const saveName = async () => {
    const nextName = playerName.trim();
    if (!nextName) {
      setStatus("Enter an in-game name first.");
      return;
    }

    setSavingName(true);
    setStatus("");

    try {
      const response = await fetch("/api/user/update_name", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ inGameName: nextName }),
      });

      const payload = (await response.json().catch(() => ({}))) as
        | ProfileResponse
        | { detail?: string };

      if (!response.ok) {
        const detail =
          "detail" in payload && typeof payload.detail === "string"
            ? payload.detail
            : "Failed to save name.";
        setStatus(detail);
        return;
      }

      setProfile(payload as ProfileResponse);
      setStatus("In-game name updated.");
      await refreshSession();
    } catch (error) {
      console.error("Failed to save name:", error);
      setStatus("Failed to save name.");
    } finally {
      setSavingName(false);
    }
  };

  const createWatcherKey = useCallback(async ({ pairToWatcher = false } = {}) => {
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
  }, [launchWatcherPairing]);

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
            Steam is the first account path. That gives you a stable identity now, while replay verification continues to handle trust for betting and result settlement.
          </p>
          {claimName ? (
            <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-400/10 px-4 py-4 text-sm text-amber-100">
              This public warrior page exists already. Sign in, save <span className="font-semibold">{claimName}</span>,
              then upload one replay with your watcher key to claim it properly.
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
    <div className="mx-auto max-w-4xl space-y-6 py-8 text-white">
      <section className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.35em] text-white/45">Identity</div>
            <h1 className="mt-2 text-3xl font-semibold">{profile?.steamPersonaName || playerName || "Profile"}</h1>
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
            You came here from the public warrior page for <span className="font-semibold">{claimName}</span>.
            Save that name below, then upload one replay with your watcher key to verify and claim it.
          </div>
        ) : null}

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-white/8 bg-white/5 p-5">
            <div className="text-sm font-medium text-white">Steam</div>
            <div className="mt-3 space-y-2 text-sm text-slate-300">
              <div>Persona: {profile?.steamPersonaName || "Unknown"}</div>
              <div>Steam ID: {profile?.steamId || "Not connected"}</div>
              <div>Verification method: {profile?.verificationMethod || "none"}</div>
            </div>
            <p className="mt-4 text-xs leading-5 text-slate-400">
              Steam can supply your profile persona. Your replay uploads are still the trust source for your actual AoE2HD playable name.
            </p>
          </div>

          <div className="rounded-2xl border border-white/8 bg-white/5 p-5">
            <div className="text-sm font-medium text-white">Playable Name</div>
            <label className="mt-3 block text-sm text-slate-300">
              In-game name
              <input
                value={playerName}
                onChange={(event) => setPlayerName(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none transition focus:border-amber-300/50"
                placeholder="Enter your AoE2HD name"
              />
            </label>
            <button
              type="button"
              onClick={saveName}
              disabled={savingName}
              className="mt-4 rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {savingName ? "Saving..." : "Save Name"}
            </button>
          </div>
        </div>

        {status && <p className="mt-4 text-sm text-slate-300">{status}</p>}
      </section>

      <section className={`rounded-[2rem] border p-8 ${appearanceTone.panelShell}`}>
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

        <div className="mt-6 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          <div className={`rounded-2xl border p-5 ${appearanceTone.insetPanel}`}>
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

          <div className={`rounded-2xl border p-5 ${appearanceTone.insetPanel}`}>
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

          <div className={`rounded-2xl border p-5 ${appearanceTone.insetPanel}`}>
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

          <div className={`rounded-2xl border p-5 ${appearanceTone.insetPanel}`}>
            <div className="text-sm font-medium text-white">Text Color</div>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              White stays sharp, Grey softens the room, and Black pushes the body copy inkier without flattening the headers.
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
          className="mt-6 rounded-[1.75rem] border border-white/10 p-4"
          style={{ backgroundImage: getLobbyHeroBackground(themeKey, viewMode) }}
        >
          <div className="grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
            <div className={`rounded-2xl border p-4 ${appearanceTone.card}`}>
              <div className={`text-[11px] uppercase tracking-[0.32em] ${appearanceTone.eyebrow}`}>
                Preview
              </div>
              <div className="mt-3 text-4xl font-semibold tracking-tight text-white">61</div>
              <div className={`mt-2 text-[11px] uppercase tracking-[0.28em] ${appearanceTone.countLabel}`}>
                Players On Board
              </div>
            </div>

            <div className={`rounded-2xl border p-4 ${appearanceTone.insetPanel}`}>
              <div className="flex items-center justify-between gap-3">
                <div className={`text-[11px] uppercase tracking-[0.32em] ${appearanceTone.accentText}`}>
                  Current Skin
                </div>
                <div className={`rounded-full border px-3 py-1 text-xs font-medium ${appearanceTone.statusBadge}`}>
                  {viewMode === "field" ? "Field" : "Steel"}
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${appearanceTone.neutralPill}`}>
                  bg {themeKey}
                </span>
                <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${appearanceTone.rankBadge}`}>
                  tiles {tileThemeKey}
                </span>
                <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${appearanceTone.neutralPill}`}>
                  {viewMode}
                </span>
                <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${appearanceTone.neutralPill}`}>
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
              Click Pair Watcher App to mint a fresh key and hand it straight to the desktop client. If the browser deep link is blocked, the fallback key still appears below for manual paste.
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

        {watcherPairIntent && (
          <div className="mt-6 rounded-2xl border border-emerald-300/20 bg-emerald-400/10 px-4 py-4 text-sm text-emerald-100">
            Pairing request received from the Watcher app. If macOS prompts you, choose Open
            AoE2HD Watcher to finish the handoff.
          </div>
        )}

        {newWatcherKey && (
          <div className="mt-6 rounded-2xl border border-amber-300/20 bg-amber-400/10 p-5">
            <div className="text-sm font-medium text-amber-100">Fallback key if one-click pairing is blocked</div>
            <div className="mt-3 break-all font-mono text-sm text-white">{newWatcherKey}</div>
          </div>
        )}

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
