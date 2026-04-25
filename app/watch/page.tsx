import Link from "next/link";
import { promises as fs } from "node:fs";
import path from "node:path";

import WatchPreviewScreen from "@/components/watch/WatchPreviewScreen";

import {
  displayPlayerName,
  formatDurationLabel,
  parsePlayers,
  readMapName,
  winnerLabel,
} from "@/lib/gameStatsView";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type WatchStreamSummary = {
  provider: string;
  label: string;
  url: string;
  embedId: string | null;
  isPrimary: boolean;
};

type WatchMediaEntry = {
  recordingUrl?: string;
  previewUrl?: string;
  thumbnailUrl?: string;
  bestOfUrl?: string;
};

type WatchMatchSummary = {
  id: number;
  sessionKey: string;
  href: string;
  title: string;
  mapName: string;
  durationLabel: string;
  winner: string;
  parseIteration: number;
  createdLabel: string;
  mode: "live" | "archive";
  hasFeed: boolean;
  primaryStream: WatchStreamSummary | null;
  streamCount: number;
  recordingUrl: string | null;
  previewUrl: string | null;
  thumbnailUrl: string | null;
  bestOfUrl: string | null;
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function WatchIndexPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const resolvedSearchParams = await searchParams;
  const advanced = readSearchParam(resolvedSearchParams?.view) === "advanced";

  const snapshot = await loadWatchIndexSnapshot();

  const hero = snapshot.hero;
  const liveMatches = snapshot.matches.filter((match) => match.mode === "live");
  const secondaryMatches = snapshot.matches.filter((match) => match.id !== hero?.id).slice(0, 12);
  const topScreens = [hero, ...secondaryMatches].filter(Boolean).slice(0, 3) as WatchMatchSummary[];

  return (
    <main className="space-y-6 overflow-x-hidden py-4 text-white sm:py-6">
      <section className="overflow-hidden rounded-[2.2rem] border border-white/10 bg-[radial-gradient(circle_at_18%_8%,rgba(56,189,248,0.18),transparent_30%),radial-gradient(circle_at_88%_0%,rgba(251,191,36,0.14),transparent_26%),linear-gradient(135deg,#07111f,#0b1324_52%,#030712)] p-4 shadow-[0_30px_100px_rgba(2,6,23,0.45)] sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={advanced ? "/watch" : "/watch?view=advanced"}
              className={`inline-flex rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                advanced
                  ? "border-amber-300/35 bg-amber-300/15 text-amber-100"
                  : "border-sky-300/25 bg-sky-400/10 text-sky-100 hover:border-sky-200/40"
              }`}
            >
              AOE2HD WATCH
            </Link>
            <Pill tone={liveMatches.length > 0 ? "red" : "emerald"}>
              {liveMatches.length > 0 ? `${liveMatches.length} live` : "Archive"}
            </Pill>
            <Pill>{snapshot.totalStreams} feeds</Pill>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/bets"
              className="rounded-full border border-amber-300/25 bg-amber-300/10 px-4 py-2 text-xs font-semibold text-amber-100 transition hover:border-amber-200/40 hover:bg-amber-300/15"
            >
              Bets
            </Link>
            {hero ? (
              <Link
                href={hero.href}
                className="rounded-full bg-sky-300 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-sky-200"
              >
                Theatre
              </Link>
            ) : null}
          </div>
        </div>

        {topScreens.length > 0 ? (
          <div className="mb-4 grid gap-3 md:grid-cols-3">
            {topScreens.map((match, index) => (
              <MiniScreen key={`${match.sessionKey}-${index}`} match={match} />
            ))}
          </div>
        ) : null}

        {hero ? (
          <HeroScreen match={hero} advanced={advanced} />
        ) : (
          <div className="rounded-[1.8rem] border border-white/10 bg-black/35 p-8 text-center text-slate-300">
            No broadcasts yet.
          </div>
        )}

        {advanced && hero ? <AdvancedObserverRail match={hero} /> : null}
      </section>

      {liveMatches.length > 0 ? (
        <section className="rounded-[2rem] border border-red-300/15 bg-[radial-gradient(circle_at_top_left,rgba(248,113,113,0.16),transparent_30%),linear-gradient(180deg,rgba(15,23,42,0.92),rgba(8,13,25,0.98))] p-5 shadow-[0_24px_80px_rgba(2,6,23,0.36)] sm:p-6">
          <SectionHeader eyebrow="Live rail" title="Playing now" note="The hot table. Current watcher sessions with stream rails attached." />
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {liveMatches.map((match) => (
              <MatchCard key={match.sessionKey} match={match} hot />
            ))}
          </div>
        </section>
      ) : null}

      <section className="rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.92),rgba(8,13,25,0.98))] p-5 shadow-[0_24px_80px_rgba(2,6,23,0.36)] sm:p-6">
        <SectionHeader eyebrow="Recent broadcasts" title="Battle archive" note="" />

        {secondaryMatches.length > 0 ? (
          <div className="mt-5 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {secondaryMatches.map((match) => (
              <ArchiveCard key={match.sessionKey} match={match} />
            ))}
          </div>
        ) : (
          <div className="mt-5 rounded-3xl border border-white/10 bg-white/[0.035] p-6 text-sm leading-6 text-slate-300">
            Archive empty.
          </div>
        )}
      </section>
    </main>
  );
}

async function loadWatchIndexSnapshot() {
  const prisma = getPrisma();

  const recentRows = await prisma.gameStats.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 160,
  });

  const latestBySession = new Map<string, (typeof recentRows)[number]>();

  for (const row of recentRows) {
    const sessionKey = readSessionKey(row);
    if (!sessionKey || latestBySession.has(sessionKey)) {
      continue;
    }

    latestBySession.set(sessionKey, row);
  }

  const games = Array.from(latestBySession.values()).slice(0, 36);
  const sessionKeys = games.map(readSessionKey).filter(Boolean);

  const mediaRegistry = await loadWatchMediaRegistry();

  const streams = sessionKeys.length
    ? await prisma.gameWatchStream.findMany({
        where: {
          sessionKey: {
            in: sessionKeys,
          },
          status: {
            not: "removed",
          },
        },
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }, { id: "asc" }],
      })
    : [];

  const streamsBySession = new Map<string, typeof streams>();

  for (const stream of streams) {
    const list = streamsBySession.get(stream.sessionKey) || [];
    list.push(stream);
    streamsBySession.set(stream.sessionKey, list);
  }

  const matches: WatchMatchSummary[] = games.map((game) => {
    const sessionKey = readSessionKey(game) || `game-${game.id}`;
    const players = parsePlayers(game.players);
    const playerNames = players.map((player) => displayPlayerName(player)).filter(Boolean);
    const attachedStreams = streamsBySession.get(sessionKey) || [];
    const primaryStream = attachedStreams.find((stream) => stream.isPrimary) || attachedStreams[0] || null;
    const isFinal = Boolean(game.is_final);
    const media = mediaRegistry[sessionKey] || mediaRegistry[String(game.id)] || {};

    return {
      id: game.id,
      sessionKey,
      href: `/watch/${encodeURIComponent(sessionKey)}`,
      title:
        playerNames.length > 0
          ? playerNames.join(" vs ")
          : game.original_filename || game.replay_file || "Battle feed",
      mapName: readMapName(game.map),
      durationLabel: formatDurationLabel(game.duration || game.game_duration),
      winner: winnerLabel(game.winner, game.parse_reason),
      parseIteration: game.parse_iteration || 0,
      createdLabel: formatBattleDate(game.createdAt),
      mode: isFinal ? "archive" : "live",
      hasFeed: attachedStreams.length > 0,
      primaryStream: primaryStream
        ? {
            provider: primaryStream.provider,
            label: primaryStream.label,
            url: primaryStream.url,
            embedId:
              primaryStream.embedId ||
              readTwitchChannel(primaryStream.url) ||
              null,
            isPrimary: primaryStream.isPrimary,
          }
        : null,
      streamCount: attachedStreams.length,
      recordingUrl: media.recordingUrl || null,
      previewUrl: media.previewUrl || null,
      thumbnailUrl: media.thumbnailUrl || null,
      bestOfUrl: media.bestOfUrl || null,
    };
  });

  const liveBuildingHero = buildLiveBuildingHero();
  const liveGameHero = matches.find(
    (match) =>
      match.mode === "live" &&
      (match.hasFeed || match.bestOfUrl || match.previewUrl || match.recordingUrl)
  );

  const hero = liveGameHero || liveBuildingHero;

  return {
    hero,
    matches,
    totalStreams: streams.length + 1,
  };
}

async function loadWatchMediaRegistry(): Promise<Record<string, WatchMediaEntry>> {
  const registryPath =
    process.env.WATCH_MEDIA_REGISTRY_PATH ||
    path.join(process.cwd(), "public/watch/watch-media.json");

  try {
    const raw = await fs.readFile(registryPath, "utf8");
    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return parsed as Record<string, WatchMediaEntry>;
  } catch {
    return {};
  }
}

function buildLiveBuildingHero(): WatchMatchSummary {
  const channel = process.env.WATCH_BUILDING_STREAM_CHANNEL || "emaren19";
  const url = `https://www.twitch.tv/${channel}`;

  return {
    id: -1,
    sessionKey: "__live-building__",
    href: "/watch",
    title: "Live building",
    mapName: "AoE2HDBets",
    durationLabel: "Live",
    winner: "Building",
    parseIteration: 0,
    createdLabel: "Now",
    mode: "live",
    hasFeed: true,
    primaryStream: {
      provider: "twitch",
      label: "Live Building",
      url,
      embedId: channel,
      isPrimary: true,
    },
    streamCount: 1,
    recordingUrl: null,
    previewUrl: process.env.WATCH_BUILDING_LOOP_URL || "/watch/previews/live-building-loop.mp4",
    thumbnailUrl: "/watch/aoe2hd-screen.svg",
    bestOfUrl: process.env.WATCH_BUILDING_LOOP_URL || "/watch/previews/live-building-loop.mp4",
  };
}

function readSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function readSessionKey(game: {
  original_filename?: string | null;
  replay_file?: string | null;
}) {
  return (game.original_filename || game.replay_file || "").trim();
}

function formatBattleDate(value: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(value);
}

function readTwitchChannel(url: string) {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes("twitch.tv")) {
      return null;
    }

    const channel = parsed.pathname.split("/").filter(Boolean)[0];
    return channel || null;
  } catch {
    return null;
  }
}

function HeroScreen({
  match,
  advanced,
}: {
  match: WatchMatchSummary;
  advanced: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-black/45 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
      <div className="relative aspect-video min-h-[22rem] overflow-hidden bg-black sm:min-h-[30rem]">
        <PreviewMotion match={match} large />

        <div className="absolute left-4 top-4 flex flex-wrap gap-2">
          <Pill tone={match.mode === "live" ? "red" : "emerald"}>
            {match.mode === "live" ? "Live" : "Archive"}
          </Pill>
          <Pill tone={match.hasFeed ? "sky" : "amber"}>{match.hasFeed ? "Feed" : "No feed"}</Pill>
          <Pill>{match.mapName}</Pill>
          {advanced ? <Pill tone="amber">Advanced</Pill> : null}
        </div>

        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/60 to-transparent p-5 sm:p-7">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-end">
            <div className="min-w-0">
              <h1 className="max-w-4xl text-4xl font-semibold tracking-tight text-white sm:text-6xl">
                {match.title}
              </h1>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href={match.href}
                  className="rounded-full bg-sky-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-200"
                >
                  Watch
                </Link>
                <Link
                  href="/bets"
                  className="rounded-full border border-amber-300/25 bg-amber-300/10 px-5 py-3 text-sm font-semibold text-amber-100 transition hover:border-amber-200/40"
                >
                  Bets
                </Link>
                {match.primaryStream ? (
                  <a
                    href={match.primaryStream.url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white/85 transition hover:border-white/30 hover:text-white"
                  >
                    Source
                  </a>
                ) : null}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <MiniStat label="Winner" value={match.winner} />
              <MiniStat label="Duration" value={match.durationLabel} />
              <MiniStat label="Parse" value={`#${match.parseIteration}`} />
              <MiniStat label="Captured" value={match.createdLabel} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function MiniScreen({ match }: { match: WatchMatchSummary }) {
  return (
    <Link
      href={match.href}
      className="group relative block overflow-hidden rounded-[1.35rem] border border-white/10 bg-black/50 shadow-[0_18px_60px_rgba(0,0,0,0.24)] transition hover:-translate-y-0.5 hover:border-sky-300/35"
    >
      <div className="aspect-video">
        <PreviewMotion match={match} />
      </div>
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/70 to-transparent p-3">
        <div className="truncate text-sm font-semibold text-white group-hover:text-sky-100">
          {match.title}
        </div>
        <div className="mt-1 text-[11px] uppercase tracking-[0.2em] text-slate-400">
          {match.mode === "live" ? "Live" : "Archive"} · {match.mapName}
        </div>
      </div>
    </Link>
  );
}

function AdvancedObserverRail({ match }: { match: WatchMatchSummary }) {
  return (
    <section className="mt-4 rounded-[1.7rem] border border-amber-300/15 bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.12),transparent_30%),rgba(15,23,42,0.82)] p-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div>
          <div className="text-[11px] uppercase tracking-[0.32em] text-amber-200/70">
            Observer betting
          </div>
          <div className="mt-2 text-xl font-semibold text-white">{match.title}</div>
        </div>

        <div className="flex flex-wrap gap-2">
          {[10, 25, 50, 100].map((amount) => (
            <Link
              key={amount}
              href="/bets"
              className="rounded-full border border-white/10 bg-white/[0.045] px-4 py-2 text-sm font-semibold text-white transition hover:border-amber-300/35 hover:bg-amber-300/10"
            >
              {amount}
            </Link>
          ))}
          <Link
            href="/bets"
            className="rounded-full bg-amber-300 px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
          >
            Open Book
          </Link>
        </div>
      </div>
    </section>
  );
}

function ArchiveCard({ match }: { match: WatchMatchSummary }) {
  return (
    <Link
      href={match.href}
      className="group block overflow-hidden rounded-[1.6rem] border border-white/10 bg-white/[0.035] transition hover:-translate-y-0.5 hover:border-sky-300/35 hover:bg-sky-400/[0.06]"
    >
      <div className="relative aspect-video overflow-hidden bg-black">
        <PreviewMotion match={match} />
        <div className="absolute left-3 top-3 flex flex-wrap gap-2">
          <Pill tone="emerald">Archive</Pill>
          <Pill tone={match.hasFeed ? "sky" : "amber"}>{match.hasFeed ? "Feed" : "No feed"}</Pill>
        </div>
        <div className="absolute right-3 top-3 rounded-full border border-white/10 bg-black/35 px-3 py-1 text-xs text-white">
          #{match.parseIteration}
        </div>
      </div>

      <div className="p-5">
        <h3 className="text-2xl font-semibold tracking-tight text-white group-hover:text-sky-100">
          {match.title}
        </h3>
        <p className="mt-2 text-sm text-slate-400">{match.mapName} · {match.createdLabel}</p>

        <div className="mt-5 grid grid-cols-3 gap-3">
          <MiniStat label="Winner" value={match.winner} />
          <MiniStat label="Time" value={match.durationLabel} />
          <MiniStat label="Feeds" value={String(match.streamCount)} />
        </div>
      </div>
    </Link>
  );
}

function MatchCard({ match, hot = false }: { match: WatchMatchSummary; hot?: boolean }) {
  return (
    <Link
      href={match.href}
      className={`group block rounded-[1.6rem] border p-5 transition hover:-translate-y-0.5 hover:border-sky-300/35 hover:bg-sky-400/[0.06] ${
        hot
          ? "border-red-300/20 bg-red-400/[0.07]"
          : "border-white/10 bg-white/[0.035]"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={match.mode === "live" ? "red" : "emerald"}>{match.mode === "live" ? "Live" : "Archive"}</Pill>
            <Pill tone={match.hasFeed ? "sky" : "amber"}>{match.hasFeed ? "Feed" : "No feed"}</Pill>
          </div>

          <h3 className="mt-4 text-2xl font-semibold tracking-tight text-white group-hover:text-sky-100">
            {match.title}
          </h3>
          <p className="mt-2 text-sm text-slate-400">{match.mapName} · {match.createdLabel}</p>
        </div>

        <div className="rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-xs uppercase tracking-[0.22em] text-slate-300">
          #{match.parseIteration}
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <MiniStat label="Winner" value={match.winner} />
        <MiniStat label="Duration" value={match.durationLabel} />
        <MiniStat label="Streams" value={String(match.streamCount)} />
      </div>
    </Link>
  );
}

function PreviewMotion({
  match,
  large = false,
}: {
  match?: WatchMatchSummary;
  large?: boolean;
}) {
  const videoUrl = match?.bestOfUrl || match?.previewUrl || match?.recordingUrl || null;

  return (
    <WatchPreviewScreen
      title={match?.title || "AoE2HD preview"}
      mediaKey={match?.sessionKey || "aoe2hd-watch-preview"}
      videoUrl={videoUrl}
      posterUrl={match?.thumbnailUrl || "/watch/aoe2hd-screen.svg"}
      liveEmbedUrl={null}
      large={large}
      badge={videoUrl ? "AUTO" : "READY"}
    />
  );
}

function SectionHeader({
  eyebrow,
  title,
  note,
}: {
  eyebrow: string;
  title: string;
  note: string;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-xs uppercase tracking-[0.36em] text-amber-200/70">{eyebrow}</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white">{title}</h2>
      </div>
      {note ? <p className="max-w-xl text-sm leading-6 text-slate-400">{note}</p> : null}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="text-[11px] uppercase tracking-[0.24em] text-slate-400">{label}</div>
      <div className="mt-2 break-words text-lg font-semibold text-white">{value}</div>
    </div>
  );
}

function Pill({
  children,
  tone = "slate",
}: {
  children: React.ReactNode;
  tone?: "slate" | "sky" | "amber" | "emerald" | "red";
}) {
  const toneClassName =
    tone === "sky"
      ? "border-sky-300/25 bg-sky-400/10 text-sky-100"
      : tone === "amber"
        ? "border-amber-300/25 bg-amber-400/10 text-amber-100"
        : tone === "emerald"
          ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-100"
          : tone === "red"
            ? "border-red-300/25 bg-red-400/10 text-red-100"
            : "border-white/10 bg-white/5 text-slate-200";

  return (
    <span className={`inline-flex rounded-full border px-3 py-1.5 text-xs font-medium ${toneClassName}`}>
      {children}
    </span>
  );
}
