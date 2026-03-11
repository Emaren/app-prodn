"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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

export default function ProfilePage() {
  const { uid, isAuthenticated, playerName, setPlayerName, logout, refreshSession } = useUserAuth();
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [watcherKeys, setWatcherKeys] = useState<WatcherKeyRow[]>([]);
  const [newWatcherKey, setNewWatcherKey] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [savingName, setSavingName] = useState(false);

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

  const createWatcherKey = async () => {
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
    } catch (error) {
      console.error("Failed to create watcher key:", error);
      setStatus("Failed to create watcher key.");
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-3xl py-10">
        <div className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-8 text-white">
          <div className="text-xs uppercase tracking-[0.35em] text-white/45">Profile</div>
          <h2 className="mt-3 text-3xl font-semibold">Sign in before you claim a competitive identity.</h2>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300">
            Steam is the first account path. That gives you a stable identity now, while replay verification continues to handle trust for betting and result settlement.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <SteamLoginButton className="rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200" />
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

      <section className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.35em] text-white/45">Watcher</div>
            <h2 className="mt-2 text-2xl font-semibold">Mint a replay uploader key</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
              This is the clean bridge between your account and the watcher app. Replays uploaded with your watcher key can auto-strengthen trust in your claimed in-game identity.
            </p>
          </div>
          <button
            type="button"
            onClick={createWatcherKey}
            className="rounded-full border border-white/15 px-5 py-3 text-sm text-white/85 transition hover:border-white/30 hover:text-white"
          >
            Create Watcher Key
          </button>
        </div>

        {newWatcherKey && (
          <div className="mt-6 rounded-2xl border border-amber-300/20 bg-amber-400/10 p-5">
            <div className="text-sm font-medium text-amber-100">Copy this once</div>
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
