import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import SteamLinkedBadge from "@/components/SteamLinkedBadge";
import {
  formatDurationLabel,
  displayGameType,
  displayGameVersion,
  displayPlayerName,
  displayReplayFilename,
  outcomeBadgeLabel,
  parsePlayers,
  parseStatusLabel,
  readMapName,
  readMapSize,
  readPlayedAt,
  shortHash,
  stringifyJson,
  winnerLabel,
} from "@/lib/gameStatsView";
import { buildMatchupHref } from "@/lib/publicMatchups";
import { getPrisma } from "@/lib/prisma";
import {
  buildPublicPlayerRef,
  findClaimedUsersForReplayNames,
  getClaimedPublicPlayer,
  getPublicPlayerHref,
} from "@/lib/publicPlayers";

export const dynamic = "force-dynamic";

export default async function GameStatsDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const gameId = Number(id);
  if (!Number.isInteger(gameId) || gameId <= 0) {
    notFound();
  }

  const prisma = getPrisma();
  const game = await prisma.gameStats.findUnique({
    where: { id: gameId },
    include: {
      user: {
        select: {
          uid: true,
          inGameName: true,
          steamPersonaName: true,
          verificationLevel: true,
          verified: true,
          lastSeen: true,
        },
      },
      tournamentMatchProof: {
        select: {
          id: true,
          tournament: {
            select: {
              slug: true,
              title: true,
            },
          },
        },
      },
    },
  });

  if (!game) {
    notFound();
  }

  const parseAttempts = await prisma.replayParseAttempt.findMany({
    where: {
      OR: [
        { gameStatsId: game.id },
        ...(game.original_filename ? [{ originalFilename: game.original_filename }] : []),
        ...(game.replayHash ? [{ replayHash: game.replayHash }] : []),
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  const players = parsePlayers(game.players);
  const claimedPlayers = await findClaimedUsersForReplayNames(
    prisma,
    players.map((player) => displayPlayerName(player))
  );
  const playerRefs = players.map((player) =>
    buildPublicPlayerRef(displayPlayerName(player), claimedPlayers)
  );
  const matchupHref = playerRefs.length === 2 ? buildMatchupHref(playerRefs[0], playerRefs[1]) : null;
  const playedAt = readPlayedAt(game);
  const eventTypes = Array.isArray(game.event_types) ? game.event_types : [];
  const keyEvents =
    game.key_events && typeof game.key_events === "object" && !Array.isArray(game.key_events)
      ? game.key_events
      : {};
  const outcomeLabel = outcomeBadgeLabel(game.parse_reason, game.winner);

  return (
    <main className="space-y-6 py-6 text-white">
      <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.16),_transparent_32%),linear-gradient(135deg,_#0f172a,_#111827_60%,_#020617)] p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-4">
            <div className="text-xs uppercase tracking-[0.35em] text-sky-200/70">Replay Detail</div>
            <h1 className="text-4xl font-semibold text-white sm:text-5xl">{readMapName(game.map)}</h1>
            <p className="max-w-3xl text-base leading-7 text-slate-300 sm:text-lg">
              {players.length > 0 ? (
                players.map((player, index) => {
                  const name = displayPlayerName(player);
                  return (
                    <span key={`${name}-${index}`}>
                      {index > 0 ? " vs " : null}
                      <Link
                        href={getPublicPlayerHref(name, claimedPlayers)}
                        className="text-sky-200 transition hover:text-sky-100"
                      >
                        {name}
                      </Link>
                    </span>
                  );
                })
              ) : (
                "Player list unavailable"
              )}
            </p>
            <div className="flex flex-wrap gap-2">
              <Tag>{winnerLabel(game.winner, game.parse_reason)}</Tag>
              <Tag>{game.parse_source}</Tag>
              <Tag>{game.parse_reason}</Tag>
              {game.disconnect_detected ? <Tag>disconnect suspected</Tag> : null}
              {game.is_final ? <Tag>final replay</Tag> : <Tag>non-final replay</Tag>}
              {outcomeLabel ? <Tag>{outcomeLabel}</Tag> : null}
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            {matchupHref ? (
              <Link
                href={matchupHref}
                className="rounded-full border border-white/15 px-5 py-3 text-sm text-white/85 transition hover:border-sky-300/40 hover:text-white"
              >
                Open Rivalry
              </Link>
            ) : null}
            <Link
              href="/game-stats"
              className="rounded-full border border-white/15 px-5 py-3 text-sm text-white/85 transition hover:border-white/30 hover:text-white"
            >
              Back To Parser Lab
            </Link>
            <Link
              href="/"
              className="rounded-full bg-sky-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-200"
            >
              Back To Lobby
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-6">
          <Panel title="Replay Summary" eyebrow="Overview">
            <dl className="grid gap-4 sm:grid-cols-2">
              <StatRow label="Replay ID" value={`#${game.id}`} />
              <StatRow label="Winner" value={winnerLabel(game.winner, game.parse_reason)} />
              <StatRow label="Victory Type" value={outcomeLabel || "Recorded final result"} />
              <StatRow label="Map" value={readMapName(game.map)} />
              <StatRow label="Map Size" value={readMapSize(game.map)} />
              <StatRow label="Game Version" value={displayGameVersion(game.game_version)} />
              <StatRow label="Game Type" value={displayGameType(game.game_type)} />
              <StatRow
                label="Duration"
                value={formatDurationLabel(game.duration || game.game_duration)}
              />
              <StatRow label="Played On" value={formatDateTime(playedAt)} />
              <StatRow label="Recorded At" value={formatDateTime(game.createdAt)} />
              <StatRow label="Uploader" value={renderUploader(game.user)} />
              <StatRow
                label="Replay File"
                value={displayReplayFilename(game.original_filename, game.replay_file)}
              />
              <StatRow label="Replay Hash" value={shortHash(game.replayHash, 20)} />
            </dl>

            {game.tournamentMatchProof ? (
              <div className="mt-5 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-4 text-sm text-emerald-100">
                Linked to tournament match #{game.tournamentMatchProof.id}
                {game.tournamentMatchProof.tournament
                  ? ` in ${game.tournamentMatchProof.tournament.title}`
                  : ""}
                .
              </div>
            ) : null}
          </Panel>

          <Panel title="Players" eyebrow="Roster">
            <div className="grid gap-4 lg:grid-cols-2">
              {players.length === 0 ? (
                <EmptyPanel message="No player payload was stored for this replay." />
              ) : (
                players.map((player, index) => {
                  const playerName = displayPlayerName(player);
                  const playerRef = playerRefs[index];
                  const claimedPlayer = getClaimedPublicPlayer(playerName, claimedPlayers);

                  return (
                    <Link
                      key={`${playerName}-${index}`}
                      href={playerRef?.href || getPublicPlayerHref(playerName, claimedPlayers)}
                      className="group block cursor-pointer rounded-2xl border border-white/8 bg-white/5 p-5 transition hover:border-sky-300/30 hover:bg-white/10"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-lg font-semibold text-white transition group-hover:text-sky-100">
                            {playerName}
                          </div>
                          <div className="mt-1 text-[11px] uppercase tracking-[0.22em] text-slate-400">
                            {claimedPlayer
                              ? Boolean(player.winner)
                                ? "claimed player · winner"
                                : "claimed player"
                              : Boolean(player.winner)
                                ? "unclaimed warrior · winner"
                                : "unclaimed warrior"}
                          </div>
                        </div>
                        <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
                          Civ {formatPrimitive(player.civilization)}
                        </div>
                      </div>

                      <dl className="mt-5 grid gap-3 sm:grid-cols-2">
                        <StatRow label="Steam ID" value={formatPrimitive(player.user_id)} compact />
                        <StatRow label="Score" value={formatPrimitive(player.score)} compact />
                        <StatRow label="EAPM" value={formatPrimitive(player.eapm)} compact />
                        <StatRow
                          label="Starting Position"
                          value={Array.isArray(player.position) ? player.position.join(", ") : "Unknown"}
                          compact
                        />
                      </dl>

                      <div className="mt-5 space-y-4">
                        {renderAchievementGroup("Military", readNestedRecord(player, "achievements", "military"))}
                        {renderAchievementGroup("Economy", readNestedRecord(player, "achievements", "economy"))}
                        {renderAchievementGroup("Technology", readNestedRecord(player, "achievements", "technology"))}
                        {renderAchievementGroup("Society", readNestedRecord(player, "achievements", "society"))}
                      </div>

                      <div className="mt-5 flex items-center justify-between gap-3 border-t border-white/8 pt-4 text-sm text-slate-400">
                        <span className="font-medium text-slate-300">Public player page</span>
                        <span className="text-sky-200 transition group-hover:translate-x-0.5 group-hover:text-sky-100">
                          Open profile
                        </span>
                      </div>
                    </Link>
                  );
                })
              )}
            </div>
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Parse Signals" eyebrow="Metadata">
            <div className="space-y-4">
              <div>
                <div className="text-xs uppercase tracking-[0.25em] text-slate-500">Event Types</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {eventTypes.length === 0 ? (
                    <span className="text-sm text-slate-400">No event types recorded.</span>
                  ) : (
                    eventTypes.map((eventType) => <Tag key={String(eventType)}>{String(eventType)}</Tag>)
                  )}
                </div>
              </div>

              <JsonPanel title="Key Events JSON" value={keyEvents} />
              <JsonPanel title="Map JSON" value={game.map} />
            </div>
          </Panel>

          <Panel title="Parse Attempts" eyebrow="Trail">
            <div className="space-y-3">
              {parseAttempts.length === 0 ? (
                <EmptyPanel message="No parse attempts were recorded for this replay." />
              ) : (
                parseAttempts.map((attempt) => (
                  <div
                    key={attempt.id}
                    className="rounded-2xl border border-white/8 bg-white/5 px-4 py-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium text-white">
                          {displayReplayFilename(attempt.originalFilename, null)}
                        </div>
                        <div className="mt-2 text-sm leading-6 text-slate-300">
                          {attempt.detail || "No parser detail recorded."}
                        </div>
                      </div>
                      <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
                        {parseStatusLabel(attempt.status)}
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <Tag>{attempt.parseSource}</Tag>
                      <Tag>{attempt.uploadMode || "unknown mode"}</Tag>
                      <Tag>{shortHash(attempt.replayHash)}</Tag>
                    </div>

                    <div className="mt-3 text-xs text-slate-400">
                      {attempt.createdAt.toLocaleString()}
                    </div>
                  </div>
                ))
              )}
            </div>
          </Panel>

          <Panel title="Stored Player JSON" eyebrow="Raw Output">
            <JsonPanel title="Players JSON" value={game.players} />
          </Panel>
        </div>
      </section>
    </main>
  );
}

function Panel({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-6">
      <div className="text-xs uppercase tracking-[0.35em] text-white/45">{eyebrow}</div>
      <h2 className="mt-2 text-2xl font-semibold text-white">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function JsonPanel({ title, value }: { title: string; value: unknown }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-[0.25em] text-slate-500">{title}</div>
      <pre className="mt-3 overflow-x-auto rounded-2xl border border-white/8 bg-slate-950/70 p-4 text-xs leading-6 text-slate-200">
        {stringifyJson(value)}
      </pre>
    </div>
  );
}

function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
      {children}
    </span>
  );
}

function StatRow({
  label,
  value,
  compact = false,
}: {
  label: string;
  value: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "" : "rounded-2xl border border-white/8 bg-white/5 px-4 py-4"}>
      <dt className="text-xs uppercase tracking-[0.25em] text-slate-500">{label}</dt>
      <dd className="mt-2 text-sm text-slate-200">{value}</dd>
    </div>
  );
}

function EmptyPanel({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/5 px-4 py-5 text-sm text-slate-300">
      {message}
    </div>
  );
}

function readNestedRecord(source: Record<string, unknown>, ...keys: string[]) {
  let current: unknown = source;
  for (const key of keys) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return {};
    }
    current = (current as Record<string, unknown>)[key];
  }

  if (!current || typeof current !== "object" || Array.isArray(current)) {
    return {};
  }
  return current as Record<string, unknown>;
}

function renderAchievementGroup(title: string, record: Record<string, unknown>) {
  const entries = Object.entries(record).filter(([, value]) => value !== null && value !== undefined);
  if (entries.length === 0) {
    return null;
  }

  return (
    <div>
      <div className="text-xs uppercase tracking-[0.25em] text-slate-500">{title}</div>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
        {entries.map(([key, value]) => (
          <StatRow key={key} label={humanizeKey(key)} value={formatPrimitive(value)} compact />
        ))}
      </dl>
    </div>
  );
}

function renderUploader(
  user:
    | {
        uid: string;
        inGameName: string | null;
        steamPersonaName: string | null;
        verificationLevel: number;
        verified: boolean;
        lastSeen: Date | null;
      }
    | null
) {
  if (!user) return "Unknown uploader";
  const label = user.inGameName || user.steamPersonaName || user.uid;

  return (
    <span className="flex flex-wrap items-center gap-2">
      <Link href={`/players/${user.uid}`} className="text-sky-200 transition hover:text-sky-100">
        {label}
      </Link>
      {user.verificationLevel > 0 ? <SteamLinkedBadge compact /> : null}
    </span>
  );
}

function formatPrimitive(value: unknown) {
  if (value === null || value === undefined || value === "") return "Unknown";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "Unknown";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString();
}

function humanizeKey(value: string) {
  return value.replace(/_/g, " ");
}
