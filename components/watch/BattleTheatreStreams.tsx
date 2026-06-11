"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

import LiveStreamFrame from "@/components/streaming/LiveStreamFrame";
import type { WatchStreamPayload, WatchStreamRole } from "@/lib/watchStreams";

type Props = {
  sessionKey: string;
  playerNames: string[];
};

const ROLE_OPTIONS: { value: WatchStreamRole; label: string }[] = [
  { value: "caster", label: "Main Cast" },
  { value: "observer", label: "Observer" },
  { value: "player_pov", label: "Player POV" },
  { value: "team_pov", label: "Team POV" },
  { value: "postgame", label: "Postgame" },
  { value: "external", label: "External" },
];

function buildEmbedSrc(stream: WatchStreamPayload | null, browserHost: string) {
  if (!stream?.embedId) {
    return null;
  }

  if (stream.provider === "twitch") {
    const parent = encodeURIComponent(browserHost || "aoe2war.com");
    return `https://player.twitch.tv/?channel=${encodeURIComponent(
      stream.embedId
    )}&parent=${parent}&autoplay=false&muted=false`;
  }

  if (stream.provider === "youtube") {
    return `https://www.youtube.com/embed/${encodeURIComponent(
      stream.embedId
    )}?rel=0&modestbranding=1`;
  }

  return null;
}

function providerLabel(stream: WatchStreamPayload) {
  if (stream.provider === "twitch") return "Twitch";
  if (stream.provider === "youtube") return "YouTube";
  if (stream.provider === "steam") return "Steam";
  if (stream.provider === "discord") return "Discord";
  return "External";
}

export default function BattleTheatreStreams({ sessionKey, playerNames }: Props) {
  const [streams, setStreams] = useState<WatchStreamPayload[]>([]);
  const [activeStreamId, setActiveStreamId] = useState<number | null>(null);
  const [browserHost, setBrowserHost] = useState("");
  const [url, setUrl] = useState("");
  const [role, setRole] = useState<WatchStreamRole>("caster");
  const [label, setLabel] = useState("Main Cast");
  const [playerLabel, setPlayerLabel] = useState("");
  const [isPrimary, setIsPrimary] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function loadStreams() {
    const response = await fetch(
      `/api/watch-streams?sessionKey=${encodeURIComponent(sessionKey)}`,
      { cache: "no-store" }
    );

    if (!response.ok) {
      throw new Error("Could not load watch feeds.");
    }

    const payload = (await response.json()) as { streams?: WatchStreamPayload[] };
    const nextStreams = payload.streams || [];
    setStreams(nextStreams);

    setActiveStreamId((current) => {
      if (current && nextStreams.some((stream) => stream.id === current)) {
        return current;
      }

      return nextStreams.find((stream) => stream.isPrimary)?.id || nextStreams[0]?.id || null;
    });
  }

  useEffect(() => {
    setBrowserHost(window.location.hostname);
    void loadStreams().catch((loadError) => {
      setError(loadError instanceof Error ? loadError.message : "Could not load watch feeds.");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey]);

  const activeStream = useMemo(() => {
    if (streams.length === 0) return null;

    return (
      streams.find((stream) => stream.id === activeStreamId) ||
      streams.find((stream) => stream.isPrimary) ||
      streams[0]
    );
  }, [activeStreamId, streams]);

  const embedSrc = useMemo(
    () => buildEmbedSrc(activeStream, browserHost),
    [activeStream, browserHost]
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    try {
      setSaving(true);
      const response = await fetch("/api/watch-streams", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionKey,
          url,
          role,
          label,
          playerLabel,
          isPrimary,
        }),
      });

      const payload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;

      if (!response.ok) {
        throw new Error(payload?.error || "Could not save watch feed.");
      }

      setUrl("");
      setNotice("Watch feed saved.");
      await loadStreams();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save watch feed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="relative isolate overflow-hidden rounded-[1.8rem] border border-white/10 bg-black shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
        <div className="aspect-video bg-[radial-gradient(circle_at_50%_35%,rgba(56,189,248,0.18),transparent_22%),radial-gradient(circle_at_70%_70%,rgba(251,191,36,0.12),transparent_24%),linear-gradient(135deg,#020617,#050816_48%,#0f172a)]">
          {activeStream?.provider === "aoe2war" || activeStream?.sourceType === "browser" ? (
            <LiveStreamFrame
              stream={activeStream}
              title={activeStream.title || activeStream.label}
              className="absolute inset-0 h-full min-h-0 rounded-none border-0 shadow-none"
            />
          ) : embedSrc ? (
            <iframe
              src={embedSrc}
              title={activeStream?.label || "Battle Theatre stream"}
              className="absolute inset-0 h-full w-full"
              allow="autoplay; fullscreen; picture-in-picture"
              allowFullScreen
            />
          ) : activeStream ? (
            <div className="absolute inset-0 flex items-center justify-center p-6">
              <div className="max-w-xl text-center">
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-white/15 bg-white/8 text-white shadow-[0_18px_60px_rgba(0,0,0,0.45)]">
                  <PlayIcon />
                </div>
                <div className="mt-5 text-2xl font-semibold tracking-tight text-white">
                  {activeStream.label}
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  {providerLabel(activeStream)} is saved as an external feed for now.
                </p>
                <a
                  href={activeStream.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-5 inline-flex rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-200"
                >
                  Open Watch Feed
                </a>
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center p-6">
              <div className="text-center">
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-white/15 bg-white/8 text-white shadow-[0_18px_60px_rgba(0,0,0,0.45)]">
                  <PlayIcon />
                </div>
                <div className="mt-5 text-2xl font-semibold tracking-tight text-white">
                  Broadcast feed lands here
                </div>
                <div className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-300">
                  Paste a Twitch or YouTube URL below. Steam and Discord become clean external watch buttons.
                </div>
              </div>
            </div>
          )}

          <div className="absolute left-5 top-5 flex flex-wrap gap-2">
            <FeedPill tone={activeStream ? "emerald" : "red"}>
              {activeStream ? "Feed Ready" : "No Feed"}
            </FeedPill>
            <FeedPill>{activeStream ? providerLabel(activeStream) : "Embed Later"}</FeedPill>
            <FeedPill>{activeStream?.label || "Main Cast"}</FeedPill>
          </div>

          <div className="absolute inset-x-0 bottom-0 border-t border-white/10 bg-black/35 p-4 backdrop-blur">
            <div className="flex flex-wrap items-center gap-2">
              {streams.length > 0 ? (
                streams.map((stream) => (
                  <button
                    key={stream.id}
                    type="button"
                    onClick={() => setActiveStreamId(stream.id)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                      activeStream?.id === stream.id
                        ? "border-sky-300/35 bg-sky-300/15 text-sky-50"
                        : "border-white/10 bg-white/5 text-slate-300 hover:border-white/25 hover:text-white"
                    }`}
                  >
                    {stream.label}
                  </button>
                ))
              ) : (
                <>
                  <FeedPill active>Main Cast</FeedPill>
                  {playerNames.slice(0, 4).map((name) => (
                    <FeedPill key={name}>{name} POV</FeedPill>
                  ))}
                  <FeedPill>Postgame Replay</FeedPill>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <details className="rounded-[1.4rem] border border-white/10 bg-white/[0.025] p-4">
        <summary className="cursor-pointer text-sm font-semibold text-slate-200 marker:text-sky-200">
          External feed fallback
        </summary>

      <form
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
        className="mt-4"
      >
        <div className="grid gap-3">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:grid-cols-[10rem_minmax(10rem,1fr)_11rem_8rem]">
            <label className="grid gap-2">
              <span className="text-[11px] uppercase tracking-[0.24em] text-slate-400">
                Role
              </span>
              <select
                value={role}
                onChange={(event) => {
                  const nextRole = event.target.value as WatchStreamRole;
                  setRole(nextRole);
                  if (!label || label === "Main Cast") {
                    setLabel(
                      nextRole === "caster"
                        ? "Main Cast"
                        : ROLE_OPTIONS.find((item) => item.value === nextRole)?.label ||
                            "Watch Feed"
                    );
                  }
                }}
                className="h-12 w-full rounded-2xl border border-white/10 bg-slate-950 px-4 text-sm text-white outline-none focus:border-sky-300/40"
              >
                {ROLE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2">
              <span className="text-[11px] uppercase tracking-[0.24em] text-slate-400">
                Label
              </span>
              <input
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                className="h-12 w-full rounded-2xl border border-white/10 bg-slate-950 px-4 text-sm text-white outline-none placeholder:text-slate-500 focus:border-sky-300/40"
                placeholder="Main Cast"
              />
            </label>

            <label className="grid gap-2">
              <span className="text-[11px] uppercase tracking-[0.24em] text-slate-400">
                Player
              </span>
              <select
                value={playerLabel}
                onChange={(event) => setPlayerLabel(event.target.value)}
                className="h-12 w-full rounded-2xl border border-white/10 bg-slate-950 px-4 text-sm text-white outline-none focus:border-sky-300/40"
              >
                <option value="">None</option>
                {playerNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2">
              <span className="text-[11px] uppercase tracking-[0.24em] text-slate-400">
                Primary
              </span>
              <span className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-slate-950 px-4 text-sm text-slate-200">
                <input
                  type="checkbox"
                  checked={isPrimary}
                  onChange={(event) => setIsPrimary(event.target.checked)}
                />
                Primary
              </span>
            </label>
          </div>

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_8.5rem]">
            <label className="grid min-w-0 gap-2">
              <span className="text-[11px] uppercase tracking-[0.24em] text-slate-400">
                Stream URL
              </span>
              <input
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                className="h-12 w-full rounded-2xl border border-white/10 bg-slate-950 px-4 text-sm text-white outline-none placeholder:text-slate-500 focus:border-sky-300/40"
                placeholder="https://www.twitch.tv/emaren19"
              />
            </label>

            <button
              type="submit"
              disabled={saving || !url.trim()}
              className="mt-0 rounded-2xl bg-sky-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-200 disabled:cursor-not-allowed disabled:opacity-60 xl:mt-7"
            >
              {saving ? "Saving..." : "Save Feed"}
            </button>
          </div>
        </div>

        {notice ? (
          <div className="mt-3 rounded-2xl border border-emerald-300/25 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
            {notice}
          </div>
        ) : null}

        {error ? (
          <div className="mt-3 rounded-2xl border border-red-300/25 bg-red-400/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        ) : null}
      </form>

      {streams.length > 0 ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {streams.map((stream) => (
            <button
              key={stream.id}
              type="button"
              onClick={() => setActiveStreamId(stream.id)}
              className={`rounded-2xl border p-4 text-left transition ${
                activeStream?.id === stream.id
                  ? "border-sky-300/30 bg-sky-400/10"
                  : "border-white/10 bg-white/[0.035] hover:border-white/20"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="font-semibold text-white">{stream.label}</div>
                <div className="text-xs uppercase tracking-[0.18em] text-sky-100/70">
                  {providerLabel(stream)}
                </div>
              </div>
              <p className="mt-2 break-all text-sm leading-6 text-slate-300">
                {stream.url}
              </p>
            </button>
          ))}
        </div>
      ) : null}
      </details>
    </div>
  );
}

function FeedPill({
  children,
  active = false,
  tone = "slate",
}: {
  children: React.ReactNode;
  active?: boolean;
  tone?: "slate" | "emerald" | "red";
}) {
  const toneClassName =
    tone === "emerald"
      ? "border-emerald-300/30 bg-emerald-400/12 text-emerald-100"
      : tone === "red"
        ? "border-red-300/25 bg-red-400/10 text-red-100"
        : active
          ? "border-sky-300/35 bg-sky-300/15 text-sky-50"
          : "border-white/10 bg-white/5 text-slate-300";

  return (
    <span className={`rounded-full border px-3 py-1.5 text-xs font-medium ${toneClassName}`}>
      {children}
    </span>
  );
}

function PlayIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 40 40" className="h-9 w-9" fill="none">
      <path
        d="M15 11.8v16.4c0 1.4 1.55 2.25 2.74 1.5l13-8.2c1.1-.7 1.1-2.3 0-3l-13-8.2C16.55 9.55 15 10.4 15 11.8Z"
        fill="currentColor"
      />
    </svg>
  );
}
