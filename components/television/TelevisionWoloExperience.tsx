"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Crown,
  ExternalLink,
  MonitorPlay,
  Play,
  Radio,
  ShieldCheck,
  Sparkles,
  Tv,
} from "lucide-react";

import LiveStreamFrame from "@/components/streaming/LiveStreamFrame";
import type { WatchStreamPayload } from "@/lib/watchStreams";

export type TelevisionBattle = {
  id: number | null;
  sessionKey: string;
  source: "live" | "recent" | "archive";
  title: string;
  playerNames: string[];
  mapName: string;
  winner: string | null;
  occurredAt: string | null;
  watchHref: string;
  initialStreamCount: number;
};

export type TelevisionChaosCard = {
  displayName: string;
  holderName: string | null;
  holderAvatarUrl: string | null;
  holderHref: string | null;
  beltHref: string;
  beltImageUrl: string;
  holderSince: string | null;
};

type Props = {
  battles: TelevisionBattle[];
  liveCount: number;
  archiveTotal: number;
  chaos: TelevisionChaosCard | null;
};

function relativeLabel(value: string | null) {
  if (!value) return "Time pending";
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) return "Time pending";
  const deltaMinutes = Math.max(0, Math.floor((Date.now() - ms) / 60_000));
  if (deltaMinutes < 1) return "just now";
  if (deltaMinutes < 60) return deltaMinutes + "m ago";
  const hours = Math.floor(deltaMinutes / 60);
  if (hours < 24) return hours + "h ago";
  return Math.floor(hours / 24) + "d ago";
}

function sourceLabel(source: TelevisionBattle["source"]) {
  if (source === "live") return "LIVE";
  if (source === "recent") return "REPLAY READY";
  return "ARCHIVE";
}

function streamRoleLabel(stream: WatchStreamPayload) {
  if (stream.playerLabel) return stream.playerLabel + " POV";
  if (stream.role === "caster") return "Main Cast";
  if (stream.role === "observer") return "Observer";
  if (stream.role === "player_pov") return "Player POV";
  if (stream.role === "team_pov") return "Team POV";
  if (stream.role === "postgame") return "Postgame";
  return stream.label || "Feed";
}

function externalEmbedSrc(stream: WatchStreamPayload, browserHost: string) {
  if (!stream.embedId) return null;
  if (stream.provider === "youtube") {
    return "https://www.youtube.com/embed/" + encodeURIComponent(stream.embedId) + "?rel=0&modestbranding=1";
  }
  if (stream.provider === "twitch") {
    const parent = encodeURIComponent(browserHost || "aoe2war.com");
    return "https://player.twitch.tv/?channel=" +
      encodeURIComponent(stream.embedId) +
      "&parent=" + parent + "&autoplay=false&muted=false";
  }
  return null;
}

export default function TelevisionWoloExperience({
  battles,
  liveCount,
  archiveTotal,
  chaos,
}: Props) {
  const initialBattle =
    battles.find((battle) => battle.source === "live") ?? battles[0] ?? null;
  const [selectedKey, setSelectedKey] = useState(initialBattle?.sessionKey ?? "");
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const [streams, setStreams] = useState<WatchStreamPayload[]>([]);
  const [activeStreamId, setActiveStreamId] = useState<number | null>(null);
  const [loadingStreams, setLoadingStreams] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [browserHost, setBrowserHost] = useState("");
  const [chaosPick, setChaosPick] = useState<string | null>(null);
  const selectedBattle = useMemo(
    () => battles.find((battle) => battle.sessionKey === selectedKey) ?? initialBattle,
    [battles, initialBattle, selectedKey],
  );

  const activeStream = useMemo(
    () =>
      streams.find((stream) => stream.id === activeStreamId) ??
      streams.find((stream) => stream.isPrimary) ??
      streams[0] ??
      null,
    [activeStreamId, streams],
  );

  useEffect(() => {
    setBrowserHost(window.location.hostname);
  }, []);

  useEffect(() => {
    setPlayingKey(null);
    setStreams([]);
    setActiveStreamId(null);
    setStreamError(null);
    setChaosPick(null);
  }, [selectedKey]);

  async function playBattle() {
    if (!selectedBattle) return;
    setLoadingStreams(true);
    setStreamError(null);
    try {
      const response = await fetch(
        "/api/watch-streams?sessionKey=" + encodeURIComponent(selectedBattle.sessionKey),
        { cache: "no-store" },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        streams?: WatchStreamPayload[];
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || "Could not load television feeds.");
      const nextStreams = payload.streams ?? [];
      setStreams(nextStreams);
      setActiveStreamId(
        nextStreams.find((stream) => stream.isPrimary)?.id ?? nextStreams[0]?.id ?? null,
      );
      setPlayingKey(selectedBattle.sessionKey);
    } catch (error) {
      setStreamError(error instanceof Error ? error.message : "Could not load television feeds.");
      setPlayingKey(selectedBattle.sessionKey);
    } finally {
      setLoadingStreams(false);
    }
  }

  const liveBattles = battles.filter((battle) => battle.source === "live");
  const replayBattles = battles.filter((battle) => battle.source !== "live");
  const playing = Boolean(selectedBattle && playingKey === selectedBattle.sessionKey);

  return (
    <>
      <section className="relative overflow-hidden rounded-[2.6rem] border border-cyan-200/15 bg-[radial-gradient(circle_at_15%_0%,rgba(34,211,238,0.18),transparent_31%),radial-gradient(circle_at_88%_0%,rgba(168,85,247,0.16),transparent_28%),linear-gradient(145deg,#030712,#071221_54%,#12051a)] px-5 py-7 shadow-[0_42px_150px_rgba(0,0,0,0.5)] sm:px-8 lg:px-10">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <div className="flex items-center gap-2 text-cyan-100/70">
              <Tv className="h-4 w-4" />
              <span className="text-[10px] font-black uppercase tracking-[0.36em]">
                AoE2WAR broadcast laboratory
              </span>
            </div>
            <h1 className="mt-3 font-serif text-5xl font-semibold tracking-[-0.055em] sm:text-7xl">
              TELEVISION WOLO
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
              One control room for live battles, replay nights, every available perspective,
              and the experiments that will eventually feed Watch, Bets, and Live Games.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-[0.18em]">
            <StatusPill>{liveCount} live</StatusPill>
            <StatusPill>{archiveTotal.toLocaleString()} archived</StatusPill>
            <StatusPill>Lazy playback</StatusPill>
            <StatusPill>Sandbox V1</StatusPill>
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(20rem,0.65fr)]">
        <div className="overflow-hidden rounded-[2.2rem] border border-white/10 bg-slate-950/90 shadow-[0_30px_120px_rgba(0,0,0,0.38)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 px-5 py-4">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.26em] text-cyan-100/55">
                Main theatre
              </div>
              <div className="mt-1 text-xl font-semibold text-white">
                {selectedBattle?.title ?? "Waiting for a battle"}
              </div>
            </div>
            {selectedBattle ? (
              <div className="flex items-center gap-2">
                <StatusPill hot={selectedBattle.source === "live"}>
                  {sourceLabel(selectedBattle.source)}
                </StatusPill>
                <StatusPill>{selectedBattle.mapName}</StatusPill>
              </div>
            ) : null}
          </div>

          <div className="relative aspect-video min-h-[20rem] bg-[radial-gradient(circle_at_50%_35%,rgba(34,211,238,0.12),transparent_25%),linear-gradient(145deg,#020617,#050816_52%,#090314)]">
            {!selectedBattle ? (
              <EmptyTheatre />
            ) : !playing ? (
              <button
                type="button"
                onClick={() => void playBattle()}
                disabled={loadingStreams}
                className="absolute inset-0 flex w-full flex-col items-center justify-center gap-4 p-8 text-center transition hover:bg-white/[0.025] disabled:opacity-60"
              >
                <span className="grid h-24 w-24 place-items-center rounded-full border border-cyan-200/25 bg-cyan-300/10 text-cyan-50 shadow-[0_20px_80px_rgba(34,211,238,0.13)]">
                  <Play className="ml-1 h-9 w-9" />
                </span>
                <span className="text-2xl font-semibold">
                  {loadingStreams ? "Loading feeds…" : "Play selected battle"}
                </span>
                <span className="max-w-xl text-sm leading-6 text-slate-400">
                  Video stays asleep until you press play. Opening this page alone costs no
                  continuous battle-video bandwidth.
                </span>
              </button>
            ) : activeStream ? (
              <TelevisionFeed stream={activeStream} browserHost={browserHost} />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-8 text-center">
                <MonitorPlay className="h-12 w-12 text-slate-500" />
                <div className="text-2xl font-semibold">No registered feed on this battle</div>
                <p className="max-w-xl text-sm leading-6 text-slate-400">
                  The canonical battle still exists. Open the full Watch theatre for retained
                  media, hosted loops, and any archive fallback attached outside the stream registry.
                </p>
                <Link
                  href={selectedBattle.watchHref}
                  className="rounded-full border border-cyan-200/25 bg-cyan-300/10 px-5 py-2.5 text-sm font-semibold text-cyan-50"
                >
                  Open full theatre
                </Link>
              </div>
            )}
          </div>

          <div className="border-t border-white/8 p-4 sm:p-5">
            {streamError ? (
              <div className="mb-3 rounded-xl border border-rose-300/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                {streamError}
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {playing && streams.length > 0 ? (
                streams.map((stream) => (
                  <button
                    key={stream.id}
                    type="button"
                    onClick={() => setActiveStreamId(stream.id)}
                    className={
                      "rounded-full border px-3 py-2 text-xs font-semibold transition " +
                      (activeStream?.id === stream.id
                        ? "border-cyan-200/40 bg-cyan-300/15 text-cyan-50"
                        : "border-white/10 bg-white/[0.04] text-slate-300 hover:border-white/20 hover:text-white")
                    }
                  >
                    {streamRoleLabel(stream)}
                  </button>
                ))
              ) : (
                <span className="text-xs text-slate-500">
                  Press play to discover available Main Cast, Observer, Player POV, and Team POV feeds.
                </span>
              )}
            </div>
          </div>
        </div>

        <ChaosVoteLab chaos={chaos} battle={selectedBattle} pick={chaosPick} onPick={setChaosPick} />
      </section>

      <BattleShelf
        title="Playing now"
        note="Canonical live sessions. Selecting a battle does not start its video."
        battles={liveBattles}
        selectedKey={selectedBattle?.sessionKey ?? ""}
        onSelect={setSelectedKey}
        empty="No live battles at this instant."
      />

      <BattleShelf
        title="Replay shelf"
        note="Recent and archived battles stay ready for on-demand playback."
        battles={replayBattles}
        selectedKey={selectedBattle?.sessionKey ?? ""}
        onSelect={setSelectedKey}
        empty="No archived battles available yet."
      />

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-[1.7rem] border border-white/8 bg-white/[0.025] px-5 py-4 text-sm text-slate-400">
        <div>Television WOLO is the sandbox. The existing Watch, Bets, and Live Games rails remain authoritative.</div>
        <div className="flex flex-wrap gap-2">
          <Link href="/watch" className="rounded-full border border-white/10 px-4 py-2 text-slate-200 hover:text-white">
            Watch
          </Link>
          <Link href="/bets" className="rounded-full border border-white/10 px-4 py-2 text-slate-200 hover:text-white">
            Bets
          </Link>
          <Link href="/live-games" className="rounded-full border border-white/10 px-4 py-2 text-slate-200 hover:text-white">
            Live Games
          </Link>
        </div>
      </section>
    </>
  );
}
function TelevisionFeed({
  stream,
  browserHost,
}: {
  stream: WatchStreamPayload;
  browserHost: string;
}) {
  if (stream.provider === "aoe2war" || stream.sourceType === "browser") {
    return (
      <LiveStreamFrame
        stream={stream}
        title={stream.title || stream.label}
        className="absolute inset-0 h-full min-h-0 rounded-none border-0 shadow-none"
      />
    );
  }

  const embedSrc = externalEmbedSrc(stream, browserHost);
  if (embedSrc) {
    return (
      <iframe
        src={embedSrc}
        title={stream.title || stream.label}
        className="absolute inset-0 h-full w-full border-0"
        allow="accelerometer; autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
      />
    );
  }

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-8 text-center">
      <ExternalLink className="h-12 w-12 text-slate-500" />
      <div className="text-2xl font-semibold">{stream.label}</div>
      <a
        href={stream.url}
        target="_blank"
        rel="noreferrer"
        className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-slate-950"
      >
        Open external feed
      </a>
    </div>
  );
}

function BattleShelf({
  title,
  note,
  battles,
  selectedKey,
  onSelect,
  empty,
}: {
  title: string;
  note: string;
  battles: TelevisionBattle[];
  selectedKey: string;
  onSelect: (sessionKey: string) => void;
  empty: string;
}) {
  return (
    <section className="rounded-[2rem] border border-white/9 bg-[linear-gradient(180deg,rgba(15,23,42,0.88),rgba(3,7,18,0.96))] p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-500">
            Television rail
          </div>
          <h2 className="mt-1 text-3xl font-semibold">{title}</h2>
          <p className="mt-2 text-sm text-slate-400">{note}</p>
        </div>
        <StatusPill>{battles.length} battles</StatusPill>
      </div>

      {battles.length ? (
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {battles.map((battle) => (
            <button
              key={battle.sessionKey}
              type="button"
              onClick={() => onSelect(battle.sessionKey)}
              className={
                "rounded-[1.35rem] border p-4 text-left transition " +
                (selectedKey === battle.sessionKey
                  ? "border-cyan-200/35 bg-cyan-300/[0.08]"
                  : "border-white/8 bg-white/[0.025] hover:border-white/16 hover:bg-white/[0.045]")
              }
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-100/65">
                  {sourceLabel(battle.source)}
                </span>
                <span className="text-[10px] text-slate-500">{relativeLabel(battle.occurredAt)}</span>
              </div>
              <div className="mt-3 line-clamp-2 text-lg font-semibold text-white">{battle.title}</div>
              <div className="mt-2 text-xs text-slate-400">
                {battle.mapName} · {battle.initialStreamCount} known feeds
              </div>
              {battle.winner ? (
                <div className="mt-3 text-xs font-semibold text-emerald-200">Winner · {battle.winner}</div>
              ) : null}
            </button>
          ))}
        </div>
      ) : (
        <div className="mt-5 rounded-[1.3rem] border border-dashed border-white/10 p-6 text-sm text-slate-500">
          {empty}
        </div>
      )}
    </section>
  );
}

function ChaosVoteLab({
  chaos,
  battle,
  pick,
  onPick,
}: {
  chaos: TelevisionChaosCard | null;
  battle: TelevisionBattle | null;
  pick: string | null;
  onPick: (name: string | null) => void;
}) {
  const candidates = battle?.playerNames.slice(0, 4) ?? [];

  return (
    <aside className="rounded-[2.2rem] border border-violet-200/14 bg-[radial-gradient(circle_at_50%_0%,rgba(168,85,247,0.18),transparent_35%),linear-gradient(180deg,rgba(20,8,32,0.95),rgba(5,6,16,0.98))] p-5 shadow-[0_28px_100px_rgba(0,0,0,0.35)]">
      <div className="flex items-center gap-2 text-violet-100/65">
        <Crown className="h-4 w-4" />
        <span className="text-[10px] font-black uppercase tracking-[0.28em]">Chaos Vote Lab</span>
      </div>

      {chaos ? (
        <div className="mt-5 overflow-hidden rounded-[1.45rem] border border-white/9 bg-black/25">
          <div className="relative h-48">
            {chaos.holderAvatarUrl ? (
              <Image src={chaos.holderAvatarUrl} alt="" fill unoptimized className="object-cover object-top opacity-80" />
            ) : null}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/30 to-transparent" />
            <div className="absolute bottom-4 left-4 right-4">
              <div className="text-[9px] font-black uppercase tracking-[0.22em] text-violet-100/60">
                Current Chaos Champion
              </div>
              <div className="mt-1 text-2xl font-semibold">{chaos.holderName || "Vacant"}</div>
            </div>
          </div>
          <div className="flex items-center gap-3 border-t border-white/8 p-4">
            <div className="relative h-14 w-20 shrink-0">
              <Image src={chaos.beltImageUrl} alt="" fill unoptimized className="object-contain" />
            </div>
            <Link href={chaos.beltHref} className="text-sm font-semibold text-violet-100 hover:text-white">
              Open championship history
            </Link>
          </div>
        </div>
      ) : null}

      <div className="mt-5 rounded-[1.35rem] border border-amber-200/14 bg-amber-300/[0.045] p-4">
        <div className="flex items-center gap-2 text-amber-100">
          <ShieldCheck className="h-4 w-4" />
          <span className="text-xs font-black uppercase tracking-[0.18em]">Non-binding sandbox</span>
        </div>
        <p className="mt-2 text-xs leading-5 text-slate-400">
          Chaos requires dedicated popular-vote authority. These buttons test the TV experience only:
          nothing is written, no ballot is counted, and title custody cannot change.
        </p>
      </div>

      <div className="mt-5">
        <div className="text-xs font-semibold text-slate-300">Nominate from the selected battle</div>
        {candidates.length ? (
          <div className="mt-3 grid gap-2">
            {candidates.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => onPick(pick === name ? null : name)}
                className={
                  "flex items-center justify-between rounded-xl border px-3 py-3 text-left text-sm transition " +
                  (pick === name
                    ? "border-violet-200/35 bg-violet-300/12 text-violet-50"
                    : "border-white/8 bg-white/[0.025] text-slate-300 hover:border-white/18")
                }
              >
                <span>{name}</span>
                {pick === name ? <Sparkles className="h-4 w-4" /> : <Radio className="h-4 w-4 opacity-45" />}
              </button>
            ))}
          </div>
        ) : (
          <div className="mt-3 text-sm text-slate-500">Select a battle with named players.</div>
        )}
      </div>
    </aside>
  );
}

function EmptyTheatre() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-8 text-center">
      <MonitorPlay className="h-14 w-14 text-slate-600" />
      <div className="text-2xl font-semibold text-slate-300">The theatre is waiting</div>
      <p className="max-w-lg text-sm leading-6 text-slate-500">
        Pick a live or archived battle below. Television WOLO will wake its video only when asked.
      </p>
    </div>
  );
}

function StatusPill({
  children,
  hot = false,
}: {
  children: React.ReactNode;
  hot?: boolean;
}) {
  return (
    <span
      className={
        "inline-flex rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] " +
        (hot
          ? "border-red-300/25 bg-red-400/10 text-red-100"
          : "border-white/10 bg-white/[0.045] text-slate-300")
      }
    >
      {children}
    </span>
  );
}
