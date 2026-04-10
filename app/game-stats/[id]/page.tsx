import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import FounderBonusChips from "@/components/bets/FounderBonusChips";
import SteamLinkedBadge from "@/components/SteamLinkedBadge";
import {
  displayParseReason,
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
  readPlayerCivilizationLabel,
  readPlayerSteamDmRating,
  readPlayerSteamId,
  readPlayerSteamRmRating,
  readPlayedAt,
  shortHash,
  stringifyJson,
  winnerLabel,
} from "@/lib/gameStatsView";
import {
  buildMatchupHref,
  filterHeadToHeadMatches,
  loadRecentFinalMatchupRows,
  summarizeHeadToHead,
} from "@/lib/publicMatchups";
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
  const battleTapeSessionKey = game.original_filename || game.replay_file || null;
  const battleTapeHref = battleTapeSessionKey
    ? `/game-stats/live/${encodeURIComponent(battleTapeSessionKey)}`
    : null;
  const linkedBetMarket = await prisma.betMarket.findFirst({
    where: {
      OR: [
        { linkedGameStatsId: game.id },
        ...(battleTapeSessionKey ? [{ linkedSessionKey: battleTapeSessionKey }] : []),
      ],
    },
    select: {
      founderBonuses: {
        where: {
          rescindedAt: null,
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: {
          id: true,
          bonusType: true,
          totalAmountWolo: true,
          note: true,
          status: true,
          createdAt: true,
        },
      },
    },
  });
  const founderBonuses = (linkedBetMarket?.founderBonuses || []).map((bonus) => ({
    id: bonus.id,
    bonusType: (bonus.bonusType === "winner" ? "winner" : "participants") as
      | "winner"
      | "participants",
    totalAmountWolo: bonus.totalAmountWolo,
    note: bonus.note ?? null,
    status: bonus.status,
    createdAt: bonus.createdAt.toISOString(),
  }));
  const claimedPlayers = await findClaimedUsersForReplayNames(
    prisma,
    players.map((player) => displayPlayerName(player))
  );
  const playerRefs = players.map((player) =>
    buildPublicPlayerRef(displayPlayerName(player), claimedPlayers)
  );
  const matchupHref = playerRefs.length === 2 ? buildMatchupHref(playerRefs[0], playerRefs[1]) : null;
  const rivalryCandidates =
    playerRefs.length === 2
      ? await loadRecentFinalMatchupRows(prisma, 800)
      : [];
  const rivalrySummary =
    playerRefs.length === 2
      ? summarizeHeadToHead(
          filterHeadToHeadMatches(rivalryCandidates, playerRefs[0], playerRefs[1]),
          playerRefs[0],
          playerRefs[1]
        )
      : null;
  const playedAt = readPlayedAt(game);
  const eventTypes = Array.isArray(game.event_types) ? game.event_types : [];
  const keyEvents =
    game.key_events && typeof game.key_events === "object" && !Array.isArray(game.key_events)
      ? game.key_events
      : {};
  const keyEventRecord = keyEvents as Record<string, unknown>;
  const settingsSummary =
    keyEventRecord.settings &&
    typeof keyEventRecord.settings === "object" &&
    !Array.isArray(keyEventRecord.settings)
      ? (keyEventRecord.settings as Record<string, unknown>)
      : {};
  const chatPreview = Array.isArray(keyEventRecord.chat_preview)
    ? keyEventRecord.chat_preview.filter(
        (entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object"
      )
    : [];
  const outcomeLabel = outcomeBadgeLabel(game.parse_reason, game.winner);
  const suppressPlayerWinnerState = game.parse_reason === "hd_early_exit_under_60s";
  const rivalryMatchCountLabel = rivalrySummary
    ? rivalrySummary.totalMatches === 1
      ? "1 replay-backed meeting"
      : `${rivalrySummary.totalMatches} replay-backed meetings`
    : null;
  const rivalryLastPlayedLabel = rivalrySummary?.lastPlayedAt
    ? new Date(rivalrySummary.lastPlayedAt).toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "Waiting for the first stored clash";

  return (
    <main className="space-y-6 overflow-x-hidden py-4 text-white sm:py-6">
      <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.16),_transparent_32%),linear-gradient(135deg,_#0f172a,_#111827_60%,_#020617)] p-5 sm:p-8">
        <div className="space-y-6">
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
              <Tag>{displayParseReason(game.parse_reason)}</Tag>
              {game.disconnect_detected ? <Tag>disconnect suspected</Tag> : null}
              {game.is_final ? <Tag>final replay</Tag> : <Tag>non-final replay</Tag>}
              {outcomeLabel ? <Tag>{outcomeLabel}</Tag> : null}
            </div>
            <FounderBonusChips bonuses={founderBonuses} />
          </div>

          <div className="flex flex-wrap gap-3">
            {matchupHref ? (
              <Link
                href={matchupHref}
                className="w-full rounded-full border border-white/15 px-5 py-3 text-center text-sm text-white/85 transition hover:border-sky-300/40 hover:text-white sm:w-auto"
              >
                Open Rivalry
              </Link>
            ) : null}
            {battleTapeHref ? (
              <Link
                href={battleTapeHref}
                className="w-full rounded-full border border-amber-300/30 bg-amber-400/10 px-5 py-3 text-center text-sm text-amber-100 transition hover:bg-amber-400/15 sm:w-auto"
              >
                Open Battle Tape
              </Link>
            ) : null}
            <Link
              href="/game-stats"
              className="w-full rounded-full border border-white/15 px-5 py-3 text-center text-sm text-white/85 transition hover:border-white/30 hover:text-white sm:w-auto"
            >
              Back To Parser Lab
            </Link>
            <Link
              href="/"
              className="w-full rounded-full bg-sky-300 px-5 py-3 text-center text-sm font-semibold text-slate-950 transition hover:bg-sky-200 sm:w-auto"
            >
              Back To Lobby
            </Link>
          </div>

          {rivalrySummary && playerRefs.length === 2 ? (
            <div className="rounded-[1.75rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.09),rgba(255,255,255,0.03))] p-5 shadow-2xl shadow-black/25 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.35em] text-white/45">Rivalry Score</div>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                    This is the first thing most people want: the replay-backed series record between
                    these two players.
                  </p>
                </div>
                {rivalryMatchCountLabel ? <Tag>{rivalryMatchCountLabel}</Tag> : null}
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center">
                <RivalryHeroSide name={playerRefs[0].name} wins={rivalrySummary.leftWins} align="left" />
                <div className="rounded-[1.6rem] border border-white/10 bg-slate-950/70 px-5 py-4 text-center">
                  <div className="text-[11px] uppercase tracking-[0.28em] text-slate-500">Series</div>
                  <div className="mt-2 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                    {rivalrySummary.leftWins}
                    <span className="px-3 text-slate-500">-</span>
                    {rivalrySummary.rightWins}
                  </div>
                </div>
                <RivalryHeroSide name={playerRefs[1].name} wins={rivalrySummary.rightWins} align="right" />
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <Tag>Last played {rivalryLastPlayedLabel}</Tag>
                {rivalrySummary.unknowns > 0 ? <Tag>{rivalrySummary.unknowns} unknown results</Tag> : null}
              </div>
            </div>
          ) : null}
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
              <StatRow label="Platform" value={formatPrimitive(keyEventRecord.platform_id)} />
              <StatRow label="Rated" value={formatPrimitive(keyEventRecord.rated)} />
              <StatRow
                label="Duration"
                value={formatDurationLabel(game.duration || game.game_duration)}
              />
              <StatRow label="Match ID" value={formatPrimitive(keyEventRecord.platform_match_id)} />
              <StatRow label="Played On" value={formatDateTime(playedAt)} />
              <StatRow label="Recorded At" value={formatDateTime(game.createdAt)} />
              <StatRow label="Uploader" value={renderUploader(game.user)} />
              <StatRow label="Lobby Name" value={formatPrimitive(keyEventRecord.lobby_name)} />
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
                      className="group block min-w-0 cursor-pointer rounded-2xl border border-white/8 bg-white/5 p-5 transition hover:border-sky-300/30 hover:bg-white/10"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="break-words text-lg font-semibold leading-7 text-white transition group-hover:text-sky-100">
                            {playerName}
                          </div>
                          <div className="mt-1 text-[11px] uppercase tracking-[0.22em] text-slate-400">
                            {claimedPlayer
                              ? !suppressPlayerWinnerState && player.winner === true
                                ? "claimed player · winner"
                                : "claimed player"
                              : !suppressPlayerWinnerState && player.winner === true
                                ? "unclaimed warrior · winner"
                                : "unclaimed warrior"}
                          </div>
                        </div>
                        <div className="shrink-0 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
                          {readPlayerCivilizationLabel(player)}
                        </div>
                      </div>

                      <dl className="mt-5 grid gap-3 sm:grid-cols-2">
                        <PlayerMetric label="Steam ID" value={formatPrimitive(readPlayerSteamId(player))} />
                        <PlayerMetric
                          label="RM Rating"
                          value={formatRatingMetric(readPlayerSteamRmRating(player))}
                        />
                        <PlayerMetric
                          label="DM Rating"
                          value={formatRatingMetric(readPlayerSteamDmRating(player))}
                        />
                        <PlayerMetric label="EAPM" value={formatPrimitive(player.eapm)} />
                        <PlayerMetric
                          label="Starting Position"
                          value={formatPositionValue(player.position)}
                        />
                        <PlayerMetric label="Score" value={formatPrimitive(player.score)} />
                      </dl>

                      <div className="mt-5 space-y-4">
                        {renderAchievementGroup("Military", readNestedRecord(player, "achievements", "military"))}
                        {renderAchievementGroup("Economy", readNestedRecord(player, "achievements", "economy"))}
                        {renderAchievementGroup("Technology", readNestedRecord(player, "achievements", "technology"))}
                        {renderAchievementGroup("Society", readNestedRecord(player, "achievements", "society"))}
                      </div>

                      <div className="mt-5 flex items-center justify-between gap-3 border-t border-white/8 pt-4 text-sm text-slate-400">
                        <span className="min-w-0 font-medium text-slate-300">Public player page</span>
                        <span className="shrink-0 text-sky-200 transition group-hover:translate-x-0.5 group-hover:text-sky-100">
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
              {Object.keys(settingsSummary).length > 0 ? (
                <div>
                  <div className="text-xs uppercase tracking-[0.25em] text-slate-500">Settings</div>
                  <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                    {Object.entries(settingsSummary).map(([key, value]) => (
                      <StatRow key={key} label={humanizeKey(key)} value={formatPrimitive(value)} compact />
                    ))}
                  </dl>
                </div>
              ) : null}

              {chatPreview.length > 0 ? (
                <div>
                  <div className="text-xs uppercase tracking-[0.25em] text-slate-500">Chat Preview</div>
                  <div className="mt-3 space-y-2">
                    {chatPreview.map((entry, index) => (
                      <div
                        key={`${String(entry.player_number || "system")}-${index}`}
                        className="rounded-2xl border border-white/8 bg-white/5 px-4 py-3 text-sm text-slate-200"
                      >
                        <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.2em] text-slate-500">
                          <span>{formatPrimitive(entry.origination)}</span>
                          <span>{formatPrimitive(entry.type)}</span>
                          {entry.timestamp_seconds !== null && entry.timestamp_seconds !== undefined ? (
                            <span>{formatDurationLabel(Number(entry.timestamp_seconds))}</span>
                          ) : null}
                        </div>
                        <div className="mt-2 text-sm text-slate-200">
                          {formatPrimitive(entry.message)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

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
    <section className="rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-4 sm:p-6">
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
      <dd className="mt-2 break-words text-sm leading-6 text-slate-200 [overflow-wrap:anywhere]">
        {value}
      </dd>
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

function PlayerMetric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0 rounded-[1rem] border border-white/8 bg-slate-950/40 px-3 py-3">
      <dt className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{label}</dt>
      <dd className="mt-1 break-words text-sm font-medium leading-5 text-slate-100 [overflow-wrap:anywhere]">
        {value}
      </dd>
    </div>
  );
}

function RivalryHeroSide({
  name,
  wins,
  align,
}: {
  name: string;
  wins: number;
  align: "left" | "right";
}) {
  return (
    <div
      className={`rounded-[1.5rem] border border-white/8 bg-white/5 px-4 py-4 ${
        align === "right" ? "text-left sm:text-right" : "text-left"
      }`}
    >
      <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
        {align === "left" ? "Left side" : "Right side"}
      </div>
      <div className="mt-2 break-words text-2xl font-semibold text-white">{name}</div>
      <div className="mt-3 text-sm text-slate-300">{wins} wins in stored finals</div>
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

function formatRatingMetric(value: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? String(Math.round(value)) : "Unknown";
}

function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "Unknown";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString();
}

function formatPositionValue(value: unknown) {
  return Array.isArray(value) && value.length === 2 ? value.join(", ") : "Unknown";
}

function humanizeKey(value: string) {
  return value.replace(/_/g, " ");
}
