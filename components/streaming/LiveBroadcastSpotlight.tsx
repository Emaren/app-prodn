"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Gamepad2, Radio, Video } from "lucide-react";

import LiveStreamFrame from "@/components/streaming/LiveStreamFrame";
import type { WatchStreamPayload } from "@/lib/watchStreams";

type LiveGamePlayer = {
  name: string;
};

type StreamedLiveGameSession = {
  sessionKey: string;
  state: string;
  mapName: string | null;
  updatedAt: string;
  completedAt?: string | null;
  originalFilename?: string | null;
  players: LiveGamePlayer[];
  streams?: WatchStreamPayload[];
  primaryStream?: WatchStreamPayload | null;
};

type LiveGamesPayload = {
  activeSessions?: StreamedLiveGameSession[];
  recentlyCompletedSessions?: StreamedLiveGameSession[];
};

type ActiveStreamsPayload = {
  streams?: WatchStreamPayload[];
};

const REFRESH_MS = 18_000;

function playerTitle(session: StreamedLiveGameSession | null, stream: WatchStreamPayload | null) {
  if (stream?.title?.trim()) return stream.title.trim();
  const players = session?.players.map((player) => player.name).filter(Boolean) ?? [];
  if (players.length >= 2) return `${players[0]} vs ${players[1]}`;
  if (players.length === 1) return `${players[0]} live`;
  return session?.originalFilename || "AoE2WAR Live";
}

function isFreeStream(sessionKey: string | null | undefined) {
  return !sessionKey || sessionKey.startsWith("free:");
}

function streamHref(session: StreamedLiveGameSession | null, stream: WatchStreamPayload | null) {
  const sessionKey = session?.sessionKey || stream?.sessionKey || "";
  if (isFreeStream(sessionKey)) return "/watch";
  return `/watch/${encodeURIComponent(sessionKey)}`;
}

function providerLabel(stream: WatchStreamPayload | null) {
  if (!stream) return "Ready";
  if (stream.provider === "aoe2war") return "AoE2WAR";
  if (stream.provider === "twitch") return "Twitch";
  if (stream.provider === "youtube") return "YouTube";
  return "Feed";
}

export default function LiveBroadcastSpotlight() {
  const [liveGames, setLiveGames] = useState<LiveGamesPayload | null>(null);
  const [activeStreams, setActiveStreams] = useState<WatchStreamPayload[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [gamesResponse, streamsResponse] = await Promise.all([
          fetch("/api/live-games", { cache: "no-store" }),
          fetch("/api/streams/active", { cache: "no-store" }),
        ]);

        const gamesPayload = gamesResponse.ok
          ? ((await gamesResponse.json()) as LiveGamesPayload)
          : null;
        const streamsPayload = streamsResponse.ok
          ? ((await streamsResponse.json()) as ActiveStreamsPayload)
          : null;

        if (cancelled) return;
        setLiveGames(gamesPayload);
        setActiveStreams(Array.isArray(streamsPayload?.streams) ? streamsPayload.streams : []);
      } catch (error) {
        console.warn("Failed to load live broadcast spotlight:", error);
      }
    }

    void load();
    const interval = window.setInterval(() => {
      void load();
    }, REFRESH_MS);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const featured = useMemo(() => {
    const sessions = [
      ...(liveGames?.activeSessions || []),
      ...(liveGames?.recentlyCompletedSessions || []),
    ];

    const streamedSession =
      sessions.find((session) => session.primaryStream) ||
      sessions.find((session) => (session.streams?.length ?? 0) > 0) ||
      null;
    const stream = streamedSession?.primaryStream || streamedSession?.streams?.[0] || activeStreams[0] || null;

    return {
      session: streamedSession,
      stream,
      title: playerTitle(streamedSession, stream),
      href: streamHref(streamedSession, stream),
    };
  }, [activeStreams, liveGames]);

  const hasStream = Boolean(featured.stream);
  const mapName = featured.session?.mapName || null;

  return (
    <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_18%_12%,rgba(56,189,248,0.17),transparent_28%),radial-gradient(circle_at_78%_20%,rgba(251,191,36,0.13),transparent_26%),linear-gradient(135deg,rgba(8,13,25,0.96),rgba(15,23,42,0.92)_50%,rgba(2,6,23,0.98))] p-4 shadow-[0_24px_90px_rgba(2,6,23,0.36)] sm:p-5">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(18rem,0.75fr)] lg:items-stretch">
        <div className="min-w-0 overflow-hidden rounded-[1.45rem] border border-white/10 bg-black/25">
          {hasStream ? (
            <LiveStreamFrame
              stream={featured.stream}
              title={featured.title}
              fallbackLabel="Live"
              className="rounded-[1.45rem]"
            />
          ) : (
            <div className="grid aspect-video place-items-center bg-[radial-gradient(circle_at_36%_26%,rgba(56,189,248,0.18),transparent_32%),radial-gradient(circle_at_72%_44%,rgba(251,191,36,0.14),transparent_28%),linear-gradient(135deg,#020617,#07111f)]">
              <div className="grid place-items-center gap-3 text-white/76">
                <Video className="h-14 w-14" aria-hidden="true" />
                <span className="rounded-full border border-white/10 bg-black/35 px-4 py-1.5 text-xs uppercase tracking-[0.24em]">
                  Ready
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-col justify-between rounded-[1.45rem] border border-white/10 bg-slate-950/38 p-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-sky-300/25 bg-sky-400/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.22em] text-sky-100">
                <Radio className="h-3.5 w-3.5" aria-hidden="true" />
                Broadcast
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-300">
                {providerLabel(featured.stream)}
              </span>
            </div>

            <h2 className="mt-4 text-2xl font-black leading-tight text-white sm:text-3xl">
              {hasStream ? featured.title : "AoE2WAR Live"}
            </h2>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <SignalStat label="State" value={hasStream ? "Live" : "Standby"} />
              <SignalStat label="Source" value={providerLabel(featured.stream)} />
              <SignalStat label="Map" value={mapName || "Open"} />
              <SignalStat
                label="Match"
                value={isFreeStream(featured.stream?.sessionKey) ? "Free" : "Watcher"}
              />
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              href={hasStream ? featured.href : "/profile?watcher_stream=1"}
              className="inline-flex items-center gap-2 rounded-full bg-sky-200 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-100"
            >
              {hasStream ? "Watch" : "Start Stream"}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link
              href="/live-games"
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-slate-200 transition hover:border-white/25 hover:text-white"
            >
              <Gamepad2 className="h-4 w-4" aria-hidden="true" />
              Live Games
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function SignalStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-white/10 bg-black/22 px-3 py-2">
      <div className="text-[9px] uppercase tracking-[0.22em] text-slate-500">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold text-white">{value}</div>
    </div>
  );
}
