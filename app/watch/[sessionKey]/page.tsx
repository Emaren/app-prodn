import path from "node:path";
import { promises as fs } from "node:fs";
import Link from "next/link";
import BattleTheatreStreams from "@/components/watch/BattleTheatreStreams";
import BrowserStreamStudio from "@/components/streaming/BrowserStreamStudio";
import { notFound } from "next/navigation";

import {
  displayPlayerName,
  formatDurationLabel,
  parsePlayers,
  readMapName,
  readPlayerCivilizationLabel,
  readPlayerSteamDmRating,
  readPlayerSteamRmRating,
  winnerLabel,
} from "@/lib/gameStatsView";
import {
  buildBetBroadcastPreviewUrls,
  loadBetBroadcastPreviewMap,
} from "@/lib/betBroadcastPreviews";
import { loadLiveReplayDetailSnapshot } from "@/lib/liveReplayDetail";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function BattleTheatrePage({
  params,
}: {
  params: Promise<{ sessionKey: string }>;
}) {
  const { sessionKey } = await params;
  const decodedSessionKey = decodeURIComponent(sessionKey);
  const snapshot = await loadLiveReplayDetailSnapshot(getPrisma(), decodedSessionKey);

  if (!snapshot) {
    notFound();
  }

  const game = snapshot.game;
  const players = parsePlayers(game.players);
  const playerNames = players.map((player) => displayPlayerName(player));
  const matchupLabel =
    playerNames.length > 0
      ? playerNames.join(" vs ")
      : game.originalFilename || game.replayFile || "Battle feed";
  const mapName = readMapName(game.map);
  const durationLabel = formatDurationLabel(game.duration || game.gameDuration);
  const archiveMedia = await loadBattleTheatreArchiveMedia({
    sessionKey: decodedSessionKey,
    matchupLabel,
    originalFilename: game.originalFilename,
    replayFile: game.replayFile,
  });
  const archiveVideoUrl = archiveMedia?.bestOfUrl || archiveMedia?.previewUrl || archiveMedia?.recordingUrl || null;
  const isFinal = snapshot.mode === "final" || game.isFinal;
  const liveDetailHref = `/game-stats/live/${encodeURIComponent(snapshot.sessionKey)}`;
  const finalStatsHref = snapshot.finalGameId ? `/game-stats/${snapshot.finalGameId}` : null;

  return (
    <main className="space-y-5 overflow-x-hidden py-4 text-white sm:space-y-6 sm:py-6">
      <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.18),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(251,191,36,0.14),_transparent_26%),linear-gradient(135deg,_#08111f,_#0b1324_52%,_#030712)] p-5 shadow-[0_28px_90px_rgba(2,6,23,0.42)] sm:p-8">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(19rem,0.65fr)] xl:items-start">
          <div className="min-w-0 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <TheatrePill tone="sky">Battle Theatre</TheatrePill>
              <TheatrePill tone={isFinal ? "emerald" : "amber"}>
                {isFinal ? "Archive Ready" : "Awaiting Live Feed"}
              </TheatrePill>
              <TheatrePill>{mapName}</TheatrePill>
            </div>

            <div>
              <p className="text-xs uppercase tracking-[0.38em] text-sky-200/70">
                Main Broadcast
              </p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                {matchupLabel}
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300 sm:text-base">
                Video shows the war. AoE2HDBets explains it with the live pulse, wager pressure,
                player context, and the final parse when the match closes.
              </p>
            </div>

            {archiveVideoUrl ? (
              <div className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-black shadow-[0_24px_80px_rgba(0,0,0,0.38)]">
                <div className="flex flex-wrap items-center gap-2 border-b border-white/10 bg-white/[0.035] px-4 py-3">
                  <TheatrePill tone="emerald">MP4 Ready</TheatrePill>
                  <TheatrePill>Main Cast</TheatrePill>
                  <TheatrePill>Archive Loop</TheatrePill>
                </div>
                <video
                  className="aspect-video w-full bg-black object-cover"
                  src={archiveVideoUrl}
                  controls
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="metadata"
                />
              </div>
            ) : (
              <BattleTheatreStreams
                sessionKey={snapshot.sessionKey}
                playerNames={playerNames}
              />
            )}

            {!isFinal ? (
              <BrowserStreamStudio
                sessionKey={snapshot.sessionKey}
                title={matchupLabel}
                watcherIntent
              />
            ) : null}
          </div>

          <aside className="space-y-4">
            <Panel eyebrow="Match Snapshot" title={mapName}>
              <div className="space-y-3">
                <MiniRow label="Matchup" value={matchupLabel} />
                <MiniRow label="Duration" value={durationLabel} />
                <MiniRow label="Winner Signal" value={winnerLabel(game.winner, game.parseReason)} />
                <MiniRow label="Parse Iteration" value={`#${game.parseIteration}`} />
                <MiniRow label="Mode" value={isFinal ? "Battle archive" : "Live watcher rail"} />
              </div>
            </Panel>

            <Panel eyebrow="WOLO Rail" title="Wager pressure">
              <div className="rounded-2xl border border-amber-300/20 bg-amber-400/10 p-4">
                <div className="text-xs uppercase tracking-[0.28em] text-amber-100/75">
                  Stakes module
                </div>
                <div className="mt-3 text-3xl font-semibold text-white">Standby</div>
                <p className="mt-2 text-sm leading-6 text-amber-50/70">
                  Escrow, odds, and payout state will dock here once the watch rail is wired into markets.
                </p>
              </div>
            </Panel>

            <Panel eyebrow="Actions" title="Move fast">
              <div className="grid gap-2">
                {finalStatsHref ? (
                  <Link
                    href={finalStatsHref}
                    className="rounded-full bg-sky-300 px-5 py-3 text-center text-sm font-semibold text-slate-950 transition hover:bg-sky-200"
                  >
                    Open Final Stats
                  </Link>
                ) : null}
                <Link
                  href={liveDetailHref}
                  className="rounded-full bg-white px-5 py-3 text-center text-sm font-semibold text-slate-950 transition hover:bg-slate-200"
                >
                  Open Battle Matrix
                </Link>
                <Link
                  href="/live-games"
                  className="rounded-full border border-white/15 px-5 py-3 text-center text-sm text-white/85 transition hover:border-white/30 hover:text-white"
                >
                  Back To Battle Board
                </Link>
                <Link
                  href="/lobby"
                  className="rounded-full border border-amber-300/30 bg-amber-400/10 px-5 py-3 text-center text-sm text-amber-100 transition hover:bg-amber-400/15"
                >
                  Open Lobby
                </Link>
              </div>
            </Panel>
          </aside>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <Panel eyebrow="Feed Deck" title="Optional POVs">
          <div className="grid gap-3 md:grid-cols-2">
            <FeedCard title="Main Cast" body="The default public broadcast. One clean feed, one clean story." active />
            {players.slice(0, 4).map((player) => {
              const name = displayPlayerName(player);
              return (
                <FeedCard
                  key={name}
                  title={`${name} POV`}
                  body={`${readPlayerCivilizationLabel(player)} camera slot. Delay controls come later.`}
                />
              );
            })}
            {players.length === 0 ? (
              <>
                <FeedCard title="Player 1 POV" body="Reserved for the first player stream." />
                <FeedCard title="Player 2 POV" body="Reserved for the opponent stream." />
              </>
            ) : null}
          </div>
        </Panel>

        <Panel eyebrow="Battle Intelligence" title="Stats beside the stream">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <IntelCard label="Pulse Window" value={snapshot.telemetry.historyWindowSeconds ? formatDurationLabel(snapshot.telemetry.historyWindowSeconds) : "Opening"} />
            <IntelCard label="Event Families" value={String(snapshot.telemetry.uniqueEventTypeCount || snapshot.telemetry.latestEventTypeCount || 0)} />
            <IntelCard label="Chat Signals" value={String(snapshot.telemetry.latestChatCount ?? 0)} />
            <IntelCard label="Parse Attempts" value={String(snapshot.parseAttempts.length)} />
          </div>

          <div className="mt-4 rounded-2xl border border-white/8 bg-white/[0.035] p-4 text-sm leading-6 text-slate-300">
            Later this becomes the caster radar: score pressure, eco swing, army movement, map control,
            resign detection, wager state, and stream delay status.
          </div>
        </Panel>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        {players.length > 0 ? (
          players.map((player) => {
            const name = displayPlayerName(player);
            return (
              <Panel key={name} eyebrow="Player Camera" title={name}>
                <div className="grid gap-3 sm:grid-cols-3">
                  <IntelCard label="Civilization" value={readPlayerCivilizationLabel(player)} />
                  <IntelCard label="RM" value={formatRating(readPlayerSteamRmRating(player))} />
                  <IntelCard label="DM" value={formatRating(readPlayerSteamDmRating(player))} />
                </div>
              </Panel>
            );
          })
        ) : (
          <Panel eyebrow="Player Camera" title="POV slots pending">
            <p className="text-sm leading-6 text-slate-300">
              Player cards appear here when the watcher payload has parsed the roster.
            </p>
          </Panel>
        )}
      </section>
    </main>
  );
}

function formatRating(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "n/a";
  }

  return String(value);
}

function TheatrePill({
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


function Panel({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[1.6rem] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.92),rgba(8,13,25,0.96))] p-5 shadow-[0_22px_70px_rgba(2,6,23,0.32)]">
      <div className="text-[11px] uppercase tracking-[0.32em] text-sky-200/65">{eyebrow}</div>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function MiniRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-2xl border border-white/8 bg-white/[0.035] px-4 py-3">
      <div className="text-xs uppercase tracking-[0.22em] text-slate-400">{label}</div>
      <div className="max-w-[13rem] text-right text-sm font-semibold text-white">{value}</div>
    </div>
  );
}

function FeedCard({
  title,
  body,
  active = false,
}: {
  title: string;
  body: string;
  active?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 ${
        active
          ? "border-sky-300/30 bg-sky-400/10"
          : "border-white/10 bg-white/[0.035]"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="font-semibold text-white">{title}</div>
        <div className="h-2 w-2 rounded-full bg-slate-500" />
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-300">{body}</p>
    </div>
  );
}

function IntelCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.035] p-4">
      <div className="text-[11px] uppercase tracking-[0.24em] text-slate-400">{label}</div>
      <div className="mt-2 break-words text-xl font-semibold text-white">{value}</div>
    </div>
  );
}

type BattleTheatreArchiveMedia = {
  bestOfUrl?: string | null;
  previewUrl?: string | null;
  recordingUrl?: string | null;
  thumbnailUrl?: string | null;
};

type BattleTheatreRegistryEntry = BattleTheatreArchiveMedia & {
  slug?: string;
  title?: string;
  aliases?: string[];
};

function normalizeBattleMediaKey(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

async function readBattleMediaJson<T>(relativePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(path.join(process.cwd(), relativePath), "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function hasBattleMedia(media: BattleTheatreArchiveMedia | null | undefined) {
  return Boolean(media?.bestOfUrl || media?.previewUrl || media?.recordingUrl);
}

async function loadBattleTheatreArchiveMedia({
  sessionKey,
  matchupLabel,
  originalFilename,
  replayFile,
}: {
  sessionKey: string;
  matchupLabel: string;
  originalFilename?: string | null;
  replayFile?: string | null;
}): Promise<BattleTheatreArchiveMedia | null> {
  const candidates = [sessionKey, originalFilename, replayFile, matchupLabel]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  const broadcastPreviewsByKey = await loadBetBroadcastPreviewMap();
  for (const candidate of candidates) {
    const urls = buildBetBroadcastPreviewUrls(candidate, broadcastPreviewsByKey);
    const broadcastLoopUrl = urls.god || urls.left || urls.right || null;
    if (broadcastLoopUrl) {
      return {
        bestOfUrl: broadcastLoopUrl,
        previewUrl: broadcastLoopUrl,
        recordingUrl: broadcastLoopUrl,
        thumbnailUrl: null,
      };
    }
  }

  const exactRegistry = await readBattleMediaJson<Record<string, BattleTheatreArchiveMedia>>(
    "public/watch/media.json",
  );

  if (exactRegistry) {
    for (const candidate of candidates) {
      const media = exactRegistry[candidate];
      if (hasBattleMedia(media)) return media;
    }
  }

  const previewRegistry = await readBattleMediaJson<{ items?: BattleTheatreRegistryEntry[] }>(
    "public/watch/previews/registry.json",
  );

  const items = Array.isArray(previewRegistry?.items) ? previewRegistry.items : [];
  const normalizedCandidates = candidates.map(normalizeBattleMediaKey).filter(Boolean);

  for (const item of items) {
    const aliases = [
      item.title,
      item.slug?.replace(/-/g, " "),
      ...(Array.isArray(item.aliases) ? item.aliases : []),
    ]
      .map(normalizeBattleMediaKey)
      .filter(Boolean);

    const matched = aliases.some((alias) =>
      normalizedCandidates.some((candidate) => candidate.includes(alias) || alias.includes(candidate)),
    );

    if (matched && hasBattleMedia(item)) {
      return item;
    }
  }

  return null;
}
