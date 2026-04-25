import Link from "next/link";

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
  isPrimary: boolean;
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
};

export default async function WatchIndexPage() {
  const snapshot = await loadWatchIndexSnapshot();

  const hero = snapshot.hero;
  const liveMatches = snapshot.matches.filter((match) => match.mode === "live");
  const archiveMatches = snapshot.matches.filter((match) => match.mode === "archive");
  const secondaryMatches = snapshot.matches.filter((match) => match.id !== hero?.id).slice(0, 12);

  return (
    <main className="space-y-6 overflow-x-hidden py-4 text-white sm:py-6">
      <section className="overflow-hidden rounded-[2.2rem] border border-white/10 bg-[radial-gradient(circle_at_18%_8%,rgba(56,189,248,0.22),transparent_28%),radial-gradient(circle_at_84%_0%,rgba(251,191,36,0.18),transparent_24%),linear-gradient(135deg,#07111f,#0b1324_52%,#030712)] p-5 shadow-[0_30px_100px_rgba(2,6,23,0.45)] sm:p-8">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)] xl:items-stretch">
          <div className="min-w-0 space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone="sky">Broadcast Hall</Pill>
              <Pill tone={liveMatches.length > 0 ? "red" : "emerald"}>
                {liveMatches.length > 0 ? `${liveMatches.length} live` : "Archive ready"}
              </Pill>
              <Pill>{snapshot.totalStreams} saved feeds</Pill>
            </div>

            <div>
              <p className="text-xs uppercase tracking-[0.42em] text-sky-200/70">
                AOE2HD WATCH
              </p>
              <h1 className="mt-3 max-w-5xl text-5xl font-semibold tracking-tight text-white sm:text-7xl">
                Watch the war, then read the wreckage.
              </h1>
              <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-300 sm:text-base">
                Live Twitch casts, watcher-fed battle pages, final parses, winner signals, and the growing match archive.
                One hall for every streamed AoE2HDBets fight.
              </p>
            </div>

            {hero ? (
              <HeroMatch match={hero} />
            ) : (
              <div className="rounded-[1.8rem] border border-white/10 bg-black/35 p-8 text-slate-300">
                No streamed matches yet. Start StreamYard, go live to Twitch, and the watcher rail will begin filling this hall.
              </div>
            )}
          </div>

          <aside className="grid gap-4">
            <StatCard label="Live now" value={String(liveMatches.length)} detail="Watcher sessions still moving." />
            <StatCard label="Archive" value={String(archiveMatches.length)} detail="Final or recent replay sessions." />
            <StatCard label="Feeds" value={String(snapshot.totalStreams)} detail="Twitch / external rails attached." />
            <StatCard label="Latest map" value={hero?.mapName || "Standby"} detail="Current theatre headline." />
          </aside>
        </div>
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
        <SectionHeader eyebrow="Recent broadcasts" title="Battle archive" note="Latest streamed or stream-ready match pages." />

        {secondaryMatches.length > 0 ? (
          <div className="mt-5 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {secondaryMatches.map((match) => (
              <MatchCard key={match.sessionKey} match={match} />
            ))}
          </div>
        ) : (
          <div className="mt-5 rounded-3xl border border-white/10 bg-white/[0.035] p-6 text-sm leading-6 text-slate-300">
            Once a few more games run through the watcher, they’ll stack here as clean broadcast cards.
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
            isPrimary: primaryStream.isPrimary,
          }
        : null,
      streamCount: attachedStreams.length,
    };
  });

  const hero = matches.find((match) => match.mode === "live" && match.hasFeed) || matches.find((match) => match.hasFeed) || matches[0] || null;

  return {
    hero,
    matches,
    totalStreams: streams.length,
  };
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

function HeroMatch({ match }: { match: WatchMatchSummary }) {
  return (
    <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-black/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1.25fr)_minmax(17rem,0.75fr)]">
        <div className="relative min-h-[18rem] overflow-hidden bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.18),transparent_35%),linear-gradient(135deg,#030712,#0b1120)] p-6">
          <div className="absolute inset-0 opacity-[0.16] [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:34px_34px]" />
          <div className="relative z-10 flex h-full min-h-[16rem] flex-col justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone={match.mode === "live" ? "red" : "emerald"}>{match.mode === "live" ? "Live now" : "Featured archive"}</Pill>
              <Pill tone={match.hasFeed ? "sky" : "amber"}>{match.hasFeed ? "Feed ready" : "No feed"}</Pill>
              <Pill>{match.mapName}</Pill>
            </div>

            <div>
              <p className="text-xs uppercase tracking-[0.36em] text-sky-200/70">Featured broadcast</p>
              <h2 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-6xl">
                {match.title}
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
                {match.primaryStream
                  ? `${match.primaryStream.label} is attached through ${match.primaryStream.provider.toUpperCase()}.`
                  : "No stream rail is attached yet."}
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href={match.href}
                className="rounded-full bg-sky-300 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-200"
              >
                Watch Battle Theatre
              </Link>
              {match.primaryStream ? (
                <a
                  href={match.primaryStream.url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-white/15 px-6 py-3 text-sm font-semibold text-white/85 transition hover:border-white/30 hover:text-white"
                >
                  Open Source Feed
                </a>
              ) : null}
            </div>
          </div>
        </div>

        <div className="border-t border-white/10 bg-white/[0.035] p-5 lg:border-l lg:border-t-0">
          <div className="grid gap-3">
            <MiniStat label="Winner signal" value={match.winner} />
            <MiniStat label="Duration" value={match.durationLabel} />
            <MiniStat label="Parse" value={`#${match.parseIteration}`} />
            <MiniStat label="Captured" value={match.createdLabel} />
          </div>
        </div>
      </div>
    </section>
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
      <p className="max-w-xl text-sm leading-6 text-slate-400">{note}</p>
    </div>
  );
}

function StatCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-[1.4rem] border border-white/10 bg-white/[0.045] p-5">
      <div className="text-xs uppercase tracking-[0.32em] text-sky-200/65">{label}</div>
      <div className="mt-3 text-4xl font-semibold text-white">{value}</div>
      <p className="mt-2 text-sm leading-6 text-slate-400">{detail}</p>
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
