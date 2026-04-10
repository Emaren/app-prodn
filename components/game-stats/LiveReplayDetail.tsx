"use client";

import Link from "next/link";
import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import FounderBonusChips from "@/components/bets/FounderBonusChips";
import SteamLinkedBadge from "@/components/SteamLinkedBadge";
import {
  displayGameType,
  displayGameVersion,
  displayParseReason,
  displayPlayerName,
  displayReplayFilename,
  formatDurationLabel,
  outcomeBadgeLabel,
  parsePlayers,
  parseStatusLabel,
  readMapName,
  readMapSize,
  readPlayerCivilizationLabel,
  readPlayerSteamDmRating,
  readPlayerSteamId,
  readPlayerSteamRmRating,
  shortHash,
  stringifyJson,
  winnerLabel,
} from "@/lib/gameStatsView";
import type { LiveReplayDetailSnapshot, LiveReplayPlayerRecord } from "@/lib/liveReplayDetail";

const POLL_INTERVAL_MS = 5_000;

function readPlayedAt(value: { playedOn?: string | null; updatedAt?: string | null }) {
  return value.playedOn ?? value.updatedAt ?? null;
}

type HistoryPulse = LiveReplayDetailSnapshot["history"][number] & {
  parsedPlayers: LiveReplayPlayerRecord[];
};

type PlayerPulseSummary = {
  name: string;
  currentEapm: number | null;
  openingEapm: number | null;
  peakEapm: number | null;
  eapmDelta: number | null;
  pulseCount: number;
  lastKnownScore: number | null;
  scoreVisible: boolean;
};

type PlayerPulsePoint = {
  parseIteration: number;
  eapm: number | null;
  score: number | null;
};

function describeAchievementSignal(snapshot: LiveReplayDetailSnapshot) {
  if (snapshot.telemetry.hasAchievements) {
    return "achievements visible";
  }

  if (snapshot.telemetry.hasAchievementShell) {
    return "achievement shell only";
  }

  return "achievements dark";
}

function shouldWarmBattleMatrix(
  durationSeconds: number | null,
  historyRows: number,
  hasBattleMatrixSignal: boolean
) {
  if (!hasBattleMatrixSignal) {
    return true;
  }

  if ((durationSeconds ?? 0) < 60) {
    return true;
  }

  return historyRows < 2;
}

function displayBattleReasonTag(
  parseReason: string | null | undefined,
  isFinalEntry: boolean
) {
  if (!isFinalEntry) {
    return "Live pulse";
  }

  return displayParseReason(parseReason);
}

export default function LiveReplayDetail({
  initialSnapshot,
  founderBonuses = [],
}: {
  initialSnapshot: LiveReplayDetailSnapshot;
  founderBonuses?: Array<{
    id: number;
    bonusType: "participants" | "winner";
    totalAmountWolo: number;
    note: string | null;
    status: string;
    createdAt: string;
  }>;
}) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [battleMatrixFullWidth, setBattleMatrixFullWidth] = useState(false);
  const refreshInFlightRef = useRef(false);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    if (refreshInFlightRef.current) {
      return;
    }

    refreshInFlightRef.current = true;

    try {
      const response = await fetch(
        `/api/game-stats/live?session=${encodeURIComponent(initialSnapshot.sessionKey)}`,
        { cache: "no-store" }
      );
      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as LiveReplayDetailSnapshot;
      if (mountedRef.current) {
        startTransition(() => {
          if (mountedRef.current) {
            setSnapshot(payload);
          }
        });
      }
    } catch (error) {
      console.warn("Failed to refresh live replay detail:", error);
    } finally {
      refreshInFlightRef.current = false;
    }
  }, [initialSnapshot.sessionKey]);

  useEffect(() => {
    void refresh();

    const interval = window.setInterval(() => {
      void refresh();
    }, POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(interval);
    };
  }, [refresh]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const game = snapshot.game;
  const isBattleArchive = snapshot.mode === "final" || game.isFinal;
  const finalStatsReady = Boolean(snapshot.finalGameId);
  const players = parsePlayers(game.players);
  const playedAt = readPlayedAt(game);
  const keyEvents =
    game.keyEvents && typeof game.keyEvents === "object" && !Array.isArray(game.keyEvents)
      ? (game.keyEvents as Record<string, unknown>)
      : {};
  const settingsSummary =
    keyEvents.settings && typeof keyEvents.settings === "object" && !Array.isArray(keyEvents.settings)
      ? (keyEvents.settings as Record<string, unknown>)
      : {};
  const chatPreview = Array.isArray(keyEvents.chat_preview)
    ? keyEvents.chat_preview.filter(
        (entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object"
      )
    : [];
  const eventTypes = Array.isArray(game.eventTypes) ? game.eventTypes : [];
  const outcomeLabel = isBattleArchive ? outcomeBadgeLabel(game.parseReason, game.winner) : null;
  const historyPulses = snapshot.history.map((entry) => ({
    ...entry,
    parsedPlayers: parsePlayers(entry.players),
  }));
  const liveDurationSeconds = game.duration || game.gameDuration || 0;
  const maxHistoryDuration = historyPulses.reduce(
    (maxDuration, entry) => Math.max(maxDuration, entry.duration || 0),
    0
  );
  const playerPulseSummaries = players.map((player) => buildPlayerPulseSummary(player, historyPulses));
  const playerPulseSeries = players.map((player) =>
    buildPlayerPulseSeries(displayPlayerName(player), historyPulses)
  );
  const globalPeakEapm = playerPulseSummaries.reduce(
    (peak, player) => Math.max(peak, player.peakEapm || 0),
    0
  );
  const hasBattleMatrixSignal = playerPulseSummaries.some(
    (player) => player.currentEapm !== null || player.openingEapm !== null || player.peakEapm !== null
  );
  const battleMatrixWarming = shouldWarmBattleMatrix(
    liveDurationSeconds,
    snapshot.history.length,
    hasBattleMatrixSignal
  );
  const showDisconnectWarning =
    game.disconnectDetected && (game.isFinal || snapshot.telemetry.completedSignal);
  const fogItems = buildFogItems(snapshot, showDisconnectWarning);
  const achievementSignalLabel = describeAchievementSignal(snapshot);

  return (
    <main className="space-y-5 overflow-x-hidden py-4 text-white sm:space-y-6 sm:py-6">
      <section className="min-w-0 overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(248,113,113,0.16),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(251,191,36,0.10),_transparent_28%),linear-gradient(135deg,_#111827,_#0f172a_55%,_#020617)] p-5 sm:p-8">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)] xl:items-start">
          <div className="space-y-4 min-w-0">
            <div className="text-xs uppercase tracking-[0.35em] text-red-200/75">
              {isBattleArchive ? "Battle Archive" : "Live Replay Detail"}
            </div>
            <h1 className="text-4xl font-semibold text-white sm:text-5xl">{readMapName(game.map)}</h1>
            <p className="max-w-3xl text-base leading-7 text-slate-300 sm:text-lg">
              {players.length > 0
                ? players.map((player) => displayPlayerName(player)).join(" vs ")
                : displayReplayFilename(game.originalFilename, game.replayFile)}
            </p>
            <p className="max-w-3xl text-sm leading-6 text-slate-400 sm:text-base">
              {isBattleArchive
                ? "The live battle tape stays here after the match closes so users can study the pulse flow, then jump into the locked final stats page when they want the official record."
                : "This battle page stays focused on the live pulse stream while the replay is unfolding, then preserves the same battle tape after the final parse lands."}
            </p>
            <div className="flex flex-wrap gap-2">
              <Tag>{isBattleArchive ? "Battle archive" : "Watcher live"}</Tag>
              <Tag>Parse #{game.parseIteration}</Tag>
              <Tag>{displayBattleReasonTag(game.parseReason, isBattleArchive)}</Tag>
              {showDisconnectWarning ? <Tag>disconnect suspected</Tag> : null}
              {outcomeLabel ? <Tag>{outcomeLabel}</Tag> : null}
              {finalStatsReady ? <Tag>final stats ready</Tag> : null}
              <Tag>Updated {formatDateTime(snapshot.updatedAt)}</Tag>
            </div>
            <FounderBonusChips bonuses={founderBonuses} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <StatCard label="Live Duration" value={formatDurationLabel(game.duration || game.gameDuration)} />
            <StatCard
              label="Pulse Window"
              value={
                snapshot.telemetry.historyWindowSeconds
                  ? formatDurationLabel(snapshot.telemetry.historyWindowSeconds)
                  : "Opening pulse"
              }
            />
            <StatCard
              label="Event Families"
              value={String(snapshot.telemetry.uniqueEventTypeCount || snapshot.telemetry.latestEventTypeCount)}
            />
            <StatCard
              label="Chat Signals"
              value={String(snapshot.telemetry.latestChatCount ?? chatPreview.length)}
            />
            <StatCard label="Parse Iterations" value={String(snapshot.history.length)} />
            <StatCard label="Recent Attempts" value={String(snapshot.parseAttempts.length)} />
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          {snapshot.finalGameId ? (
            <Link
              href={`/game-stats/${snapshot.finalGameId}`}
              className="w-full rounded-full bg-sky-300 px-5 py-3 text-center text-sm font-semibold text-slate-950 transition hover:bg-sky-200 sm:w-auto"
            >
              Open Final Stats
            </Link>
          ) : null}
          <Link
            href="/live-games"
            className="w-full rounded-full bg-white px-5 py-3 text-center text-sm font-semibold text-slate-950 transition hover:bg-slate-200 sm:w-auto"
          >
            {isBattleArchive ? "Back To Battle Board" : "Back To Live Games"}
          </Link>
          <Link
            href="/game-stats"
            className="w-full rounded-full border border-white/15 px-5 py-3 text-center text-sm text-white/85 transition hover:border-white/30 hover:text-white sm:w-auto"
          >
            Parser Lab
          </Link>
          <Link
            href="/lobby"
            className="w-full rounded-full border border-amber-300/30 bg-amber-400/10 px-5 py-3 text-center text-sm text-amber-100 transition hover:bg-amber-400/15 sm:w-auto"
          >
            Open Lobby
          </Link>
        </div>
      </section>

      <section className="min-w-0 overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.16),_transparent_26%),radial-gradient(circle_at_top_right,_rgba(251,191,36,0.12),_transparent_28%),linear-gradient(135deg,_rgba(8,15,29,0.98),_rgba(7,12,24,0.99))] p-5 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.35em] text-sky-200/70">Battle Matrix</div>
            <h2 className="mt-2 text-3xl font-semibold text-white sm:text-4xl">Live Activity Lanes</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300 sm:text-base">
              This is the premium live read: who is more active, how the pulse is growing, which signals are lighting up,
              and where the fog still hides the battlefield.
            </p>
          </div>

          <div className="flex flex-wrap items-start justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setBattleMatrixFullWidth((current) => !current);
              }}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-sky-300/20 bg-sky-300/10 text-sky-100 transition hover:border-sky-200/40 hover:bg-sky-300/15 hover:text-white"
              title={battleMatrixFullWidth ? "Switch to versus split lanes" : "Switch to full-width lanes"}
              aria-label={battleMatrixFullWidth ? "Switch to versus split lanes" : "Switch to full-width lanes"}
              aria-pressed={battleMatrixFullWidth}
            >
              <BattleMatrixLayoutIcon fullWidth={battleMatrixFullWidth} />
            </button>
            <div className="flex flex-wrap justify-end gap-2">
              <Tag>{snapshot.telemetry.uniqueEventTypeCount} event families tracked</Tag>
              <Tag>{snapshot.telemetry.latestChatCount ?? 0} live chat signals</Tag>
              <Tag>{snapshot.telemetry.hasScores ? "scores visible" : "scores dark"}</Tag>
              <Tag>{achievementSignalLabel}</Tag>
            </div>
          </div>
        </div>

        <div
          className={`mt-6 grid gap-4 ${
            battleMatrixFullWidth ? "" : "xl:grid-cols-2"
          }`}
        >
          {players.length === 0 ? (
            <EmptyPanel message="No player pulse payload has landed yet for the battle matrix." />
          ) : battleMatrixWarming ? (
            <SignalWarmupPanel
              players={players}
              historyRows={snapshot.history.length}
              durationSeconds={liveDurationSeconds}
            />
          ) : (
            players.map((player, index) => (
              <BattleMatrixLane
                key={`${displayPlayerName(player)}-${index}`}
                player={player}
                summary={playerPulseSummaries[index]}
                series={playerPulseSeries[index]}
                globalPeakEapm={globalPeakEapm}
                tone={index % 2 === 0 ? "sky" : "amber"}
              />
            ))
          )}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-6">
          <Panel title="Pulse Board" eyebrow="Spectator Mode">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <SignalTile
                label="Current winner signal"
                value={winnerLabel(game.winner, game.parseReason)}
                tone={game.winner && game.winner !== "Unknown" ? "emerald" : "neutral"}
              />
              <SignalTile
                label="Disconnect alarm"
                value={showDisconnectWarning ? "Raised" : hasBattleMatrixSignal ? "Quiet" : "Watching"}
                tone={showDisconnectWarning ? "amber" : "neutral"}
              />
              <SignalTile
                label="Postgame visibility"
                value={snapshot.telemetry.hasPostgame ? "Seen" : "Dark"}
                tone={snapshot.telemetry.hasPostgame ? "emerald" : "neutral"}
              />
              <SignalTile
                label="Completed flag"
                value={snapshot.telemetry.completedSignal ? "Seen" : "Pending"}
                tone={snapshot.telemetry.completedSignal ? "emerald" : "neutral"}
              />
              <SignalTile
                label="Live scores"
                value={snapshot.telemetry.hasScores ? "Visible" : "Fog of war"}
                tone={snapshot.telemetry.hasScores ? "emerald" : "amber"}
              />
              <SignalTile
                label="Achievement blocks"
                value={
                  snapshot.telemetry.hasAchievements
                    ? "Visible"
                    : snapshot.telemetry.hasAchievementShell
                      ? "Shell only"
                      : "Not surfaced yet"
                }
                tone={snapshot.telemetry.hasAchievements ? "emerald" : "amber"}
              />
            </div>

            <div className="mt-5 rounded-2xl border border-white/8 bg-white/5 px-4 py-4 text-sm leading-6 text-slate-200">
              The page is following the replay as a stream of watcher pulses. Right now it can confidently show
              duration growth, player identity, EAPM drift, event-family coverage, chat signals, and parser state.
              Final-style scoreboards only unlock once HD starts surfacing them or the closing replay lands.
            </div>
          </Panel>

          <Panel title="Live Match Summary" eyebrow="Overview">
            <dl className="grid gap-4 sm:grid-cols-2">
              <StatRow label="Session Key" value={snapshot.sessionKey} />
              <StatRow label="Live State" value={isBattleArchive ? "Battle archive" : "Watcher replay stream"} />
              <StatRow label="Current Winner Signal" value={winnerLabel(game.winner, game.parseReason)} />
              <StatRow
                label="Victory Hint"
                value={
                  snapshot.telemetry.completionSource === "resignation" && isBattleArchive
                    ? "Locked by recorded resignation"
                    : outcomeLabel || "Still unfolding"
                }
              />
              <StatRow label="Map" value={readMapName(game.map)} />
              <StatRow label="Map Size" value={readMapSize(game.map)} />
              <StatRow label="Game Version" value={displayGameVersion(game.gameVersion)} />
              <StatRow label="Game Type" value={displayGameType(game.gameType)} />
              <StatRow label="Duration" value={formatDurationLabel(game.duration || game.gameDuration)} />
              <StatRow label="Played On" value={formatDateTime(playedAt)} />
              <StatRow label="Latest Pulse" value={formatDateTime(snapshot.updatedAt)} />
              <StatRow label="Uploader" value={renderUploader(game.user)} />
              <StatRow label="Lobby Name" value={formatPrimitive(keyEvents.lobby_name)} />
              <StatRow label="Match ID" value={formatPrimitive(keyEvents.platform_match_id)} />
              <StatRow label="Replay File" value={displayReplayFilename(game.originalFilename, game.replayFile)} />
              <StatRow label="Replay Hash" value={shortHash(game.replayHash, 20)} />
            </dl>
          </Panel>

          <Panel title="Players" eyebrow="Roster">
            <div className="grid gap-4 lg:grid-cols-2">
              {players.length === 0 ? (
                <EmptyPanel message="No player payload has landed yet for this live replay." />
              ) : (
                players.map((player, index) => {
                  const playerName = displayPlayerName(player);
                  const pulseSummary = playerPulseSummaries[index];
                  const winnerState =
                    player.winner === true ? "winner signal" : player.winner === false ? "trailing signal" : "live";

                  return (
                    <div
                      key={`${playerName}-${index}`}
                      className="min-w-0 rounded-2xl border border-white/8 bg-white/5 p-5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="break-words text-lg font-semibold leading-7 text-white">
                            {playerName}
                          </div>
                          <div className="mt-1 text-[11px] uppercase tracking-[0.22em] text-slate-400">
                            {winnerState}
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
                        <PlayerMetric
                          label="Current EAPM"
                          value={formatActivityMetric(battleMatrixWarming ? null : pulseSummary.currentEapm)}
                        />
                        <PlayerMetric
                          label="Peak EAPM"
                          value={formatActivityMetric(battleMatrixWarming ? null : pulseSummary.peakEapm)}
                        />
                        <PlayerMetric
                          label="EAPM Delta"
                          value={formatDeltaMetric(battleMatrixWarming ? null : pulseSummary.eapmDelta)}
                        />
                        <PlayerMetric
                          label="Starting Position"
                          value={formatPositionValue(player.position)}
                        />
                        <PlayerMetric
                          label="Pulse Coverage"
                          value={`${pulseSummary.pulseCount}/${historyPulses.length || 1} pulses`}
                        />
                        <PlayerMetric
                          label="Live Score"
                          value={
                            pulseSummary.scoreVisible
                              ? formatNumericMetric(pulseSummary.lastKnownScore)
                              : "Fog of war"
                          }
                        />
                      </dl>

                      <div className="mt-5 space-y-4">
                        {renderAchievementGroup("Military", readNestedRecord(player, "achievements", "military"))}
                        {renderAchievementGroup("Economy", readNestedRecord(player, "achievements", "economy"))}
                        {renderAchievementGroup("Technology", readNestedRecord(player, "achievements", "technology"))}
                        {renderAchievementGroup("Society", readNestedRecord(player, "achievements", "society"))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Panel>

          <Panel title="Pulse Timeline" eyebrow="Iterations">
            <div className="space-y-3">
              {historyPulses.map((entry) => (
                <div
                  key={`${entry.id}-${entry.parseIteration}`}
                  className="rounded-2xl border border-white/8 bg-white/5 px-4 py-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-white">
                        {entry.isFinal ? "Final capture" : `Live parse #${entry.parseIteration}`}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-400">
                        <Tag>{entry.parseSource}</Tag>
                        <Tag>{displayBattleReasonTag(entry.parseReason, entry.isFinal)}</Tag>
                        <Tag>{formatDurationLabel(entry.duration)}</Tag>
                        <Tag>{entry.eventTypeCount} event families</Tag>
                        <Tag>{entry.chatCount ?? 0} chat signals</Tag>
                        {entry.hasAchievements ? <Tag>achievements visible</Tag> : null}
                        {entry.postgameAvailable ? <Tag>postgame seen</Tag> : null}
                        {entry.disconnectDetected && (entry.isFinal || entry.completed) ? (
                          <Tag>disconnect suspected</Tag>
                        ) : null}
                        <Tag>{shortHash(entry.replayHash)}</Tag>
                      </div>
                    </div>
                    <div className="text-right text-xs text-slate-400">
                      <div>{formatDateTime(entry.updatedAt)}</div>
                      <div className="mt-1 uppercase tracking-[0.22em] text-slate-500">
                        {entry.winner && entry.winner !== "Unknown" ? `winner ${entry.winner}` : "winner pending"}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/5">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-rose-400 via-amber-300 to-emerald-300"
                      style={{
                        width: `${Math.max(
                          8,
                          Math.min(100, ((entry.duration || 0) / Math.max(1, maxHistoryDuration || 1)) * 100)
                        )}%`,
                      }}
                    />
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {entry.parsedPlayers.length === 0 ? (
                      <span className="text-sm text-slate-400">No player pulse payload captured for this iteration.</span>
                    ) : (
                      entry.parsedPlayers.map((player, playerIndex) => (
                        <div
                          key={`${displayPlayerName(player)}-${playerIndex}-${entry.id}`}
                          className="rounded-full border border-white/10 bg-slate-950/50 px-3 py-2 text-xs text-slate-200"
                        >
                          {displayPlayerName(player)} ·{" "}
                          {!entry.isFinal && (entry.duration || 0) < 60
                            ? "warming EAPM"
                            : `${formatNumericMetric(readPlayerEapm(player))} EAPM`}{" "}
                          ·{" "}
                          {readPlayerScore(player) !== null
                            ? `${formatNumericMetric(readPlayerScore(player))} score`
                            : "score dark"}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Fog Of War" eyebrow="Truth Boundary">
            <div className="space-y-3">
              {fogItems.length === 0 ? (
                <EmptyPanel message="This live replay is surfacing every signal the current watcher pipeline expects." />
              ) : (
                fogItems.map((item) => (
                  <div
                    key={item}
                    className="rounded-2xl border border-amber-300/20 bg-amber-400/10 px-4 py-4 text-sm leading-6 text-amber-100"
                  >
                    {item}
                  </div>
                ))
              )}
            </div>
          </Panel>

          <Panel title="Parse Signals" eyebrow="Telemetry">
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
                        <div className="mt-2 text-sm text-slate-200">{formatPrimitive(entry.message)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div>
                <div className="text-xs uppercase tracking-[0.25em] text-slate-500">Event Types</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {eventTypes.length === 0 ? (
                    <span className="text-sm text-slate-400">No event types recorded yet.</span>
                  ) : (
                    eventTypes.map((eventType) => <Tag key={String(eventType)}>{String(eventType)}</Tag>)
                  )}
                </div>
              </div>

              <JsonPanel title="Key Events JSON" value={game.keyEvents} />
              <JsonPanel title="Players JSON" value={game.players} />
              <JsonPanel title="Map JSON" value={game.map} />
            </div>
          </Panel>

          <Panel title="Parse Attempts" eyebrow="Trail">
            <div className="space-y-3">
              {snapshot.parseAttempts.length === 0 ? (
                <EmptyPanel message="No parse attempts recorded for this session yet." />
              ) : (
                snapshot.parseAttempts.map((attempt) => (
                  <div
                    key={attempt.id}
                    className="rounded-2xl border border-white/8 bg-white/5 px-4 py-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium text-white">
                          {displayReplayFilename(attempt.originalFilename, snapshot.sessionKey)}
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
                      {formatDateTime(attempt.createdAt)}
                    </div>
                  </div>
                ))
              )}
            </div>
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
    <section className="min-w-0 overflow-hidden rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-4 sm:p-6">
      <div className="text-xs uppercase tracking-[0.35em] text-white/45">{eyebrow}</div>
      <h2 className="mt-2 text-2xl font-semibold text-white">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.4rem] border border-white/10 bg-white/5 px-4 py-4">
      <div className="text-xs uppercase tracking-[0.25em] text-slate-400">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
    </div>
  );
}

function SignalTile({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "amber" | "emerald";
}) {
  const toneClass =
    tone === "amber"
      ? "border-amber-300/20 bg-amber-400/10 text-amber-100"
      : tone === "emerald"
        ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-100"
        : "border-white/8 bg-white/5 text-slate-100";

  return (
    <div className={`rounded-2xl border px-4 py-4 ${toneClass}`}>
      <div className="text-[11px] uppercase tracking-[0.22em] opacity-70">{label}</div>
      <div className="mt-2 text-lg font-semibold">{value}</div>
    </div>
  );
}

function BattleMatrixLayoutIcon({ fullWidth }: { fullWidth: boolean }) {
  return fullWidth ? (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="4" y="5" width="16" height="5" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <rect x="4" y="14" width="16" height="5" rx="2" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  ) : (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="4" y="5" width="6.5" height="14" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <rect x="13.5" y="5" width="6.5" height="14" rx="2" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function BattleMatrixLane({
  player,
  summary,
  series,
  globalPeakEapm,
  tone,
}: {
  player: LiveReplayPlayerRecord;
  summary: PlayerPulseSummary;
  series: PlayerPulsePoint[];
  globalPeakEapm: number;
  tone: "sky" | "amber";
}) {
  const toneClass =
    tone === "amber"
      ? {
          shell: "border-amber-300/20 bg-[linear-gradient(180deg,rgba(251,191,36,0.09),rgba(251,191,36,0.03))]",
          accent: "text-amber-100",
          rail: "from-amber-200 via-amber-300 to-rose-300",
          active: "bg-amber-300/18 text-amber-50 border-amber-300/24",
        }
      : {
          shell: "border-sky-300/20 bg-[linear-gradient(180deg,rgba(56,189,248,0.09),rgba(56,189,248,0.03))]",
          accent: "text-sky-100",
          rail: "from-sky-300 via-cyan-300 to-emerald-300",
          active: "bg-sky-300/18 text-sky-50 border-sky-300/24",
        };

  return (
    <div className={`min-w-0 overflow-hidden rounded-[1.75rem] border p-5 sm:p-6 ${toneClass.shell}`}>
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Activity lane</div>
          <div className={`mt-2 break-words text-2xl font-semibold ${toneClass.accent}`}>
            {displayPlayerName(player)}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Tag>{readPlayerCivilizationLabel(player)}</Tag>
            <Tag>{formatRatingMetric(readPlayerSteamRmRating(player))} RM</Tag>
            <Tag>{formatPositionValue(player.position)}</Tag>
          </div>
        </div>

        <div className="rounded-[1.35rem] border border-white/8 bg-slate-950/30 px-4 py-3 text-right">
          <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Current EAPM</div>
          <div className="mt-2 text-4xl font-semibold text-white">{formatActivityMetric(summary.currentEapm)}</div>
          <div className="mt-1 text-sm text-slate-300">{formatDeltaMetric(summary.eapmDelta)} from opening</div>
        </div>
      </div>

      <div className="mt-6 grid gap-5">
        <div className="rounded-[1.35rem] border border-white/8 bg-slate-950/25 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.22em] text-slate-500">
            <span>Live activity rail</span>
            <span>{formatActivityMetric(summary.peakEapm)} peak EAPM</span>
          </div>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-white/5">
            <div
              className={`h-full rounded-full bg-gradient-to-r ${toneClass.rail}`}
              style={{
                width: `${Math.max(
                  8,
                  Math.min(100, ((summary.currentEapm || 0) / Math.max(1, globalPeakEapm || 1)) * 100)
                )}%`,
              }}
            />
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MatrixMetric label="Opening" value={formatActivityMetric(summary.openingEapm)} />
            <MatrixMetric label="Peak" value={formatActivityMetric(summary.peakEapm)} />
            <MatrixMetric label="Coverage" value={`${summary.pulseCount}/${Math.max(1, series.length)}`} />
            <MatrixMetric
              label="Score"
              value={summary.scoreVisible ? formatNumericMetric(summary.lastKnownScore) : "Fog"}
            />
          </div>
        </div>

        <div className="rounded-[1.35rem] border border-white/8 bg-slate-950/25 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.22em] text-slate-500">
            <span>Pulse strip</span>
            <span>{series.length} pulses</span>
          </div>
          <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(3.65rem,1fr))] gap-2.5">
            {series.map((point) => (
              <div
                key={`${summary.name}-${point.parseIteration}`}
                className={`rounded-[1rem] border px-3 py-3 text-center ${toneClass.active}`}
              >
                <div className="text-[10px] uppercase tracking-[0.18em] opacity-70">#{point.parseIteration}</div>
                <div className="mt-1.5 text-base font-semibold leading-none">{formatPulseMetric(point.eapm)}</div>
              </div>
            ))}
          </div>
          <div className="mt-5 text-sm leading-6 text-slate-300">{describePulseSummary(summary)}</div>
        </div>
      </div>
    </div>
  );
}

function SignalWarmupPanel({
  players,
  historyRows,
  durationSeconds,
}: {
  players: LiveReplayPlayerRecord[];
  historyRows: number;
  durationSeconds: number | null;
}) {
  return (
    <div className="xl:col-span-2 rounded-[1.75rem] border border-sky-300/18 bg-[linear-gradient(180deg,rgba(56,189,248,0.09),rgba(15,23,42,0.22))] p-5 sm:p-6">
      <div className="text-[11px] uppercase tracking-[0.24em] text-sky-200/70">Signal warming</div>
      <h3 className="mt-2 text-2xl font-semibold text-white">First live pulse is locking onto the battlefield</h3>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
        Player identity, civs, and starting positions are already in. The battle matrix waits for at least a minute
        of game time and multiple watcher pulses before it treats EAPM as stable enough to headline.
      </p>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {players.map((player, index) => (
          <div
            key={`${displayPlayerName(player)}-${index}`}
            className="rounded-2xl border border-white/8 bg-slate-950/40 p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-white">{displayPlayerName(player)}</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Tag>{readPlayerCivilizationLabel(player)}</Tag>
                  <Tag>{formatRatingMetric(readPlayerSteamRmRating(player))} RM</Tag>
                  <Tag>{formatPositionValue(player.position)}</Tag>
                </div>
              </div>
              <div className="rounded-full border border-sky-300/20 bg-sky-300/10 px-3 py-1 text-xs text-sky-50">
                {formatDurationLabel(durationSeconds)} · Pulse #{Math.max(1, historyRows)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MatrixMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-[1.2rem] border border-white/8 bg-slate-950/40 px-4 py-3.5">
      <div className="break-words text-[10px] uppercase leading-4 tracking-[0.16em] text-slate-500">
        {label}
      </div>
      <div className="mt-2 text-base font-semibold leading-none text-slate-100">{value}</div>
    </div>
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
  user: LiveReplayDetailSnapshot["game"]["user"]
) {
  if (!user) {
    return "Unknown uploader";
  }

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

function readNumericValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value);
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.round(parsed);
    }
  }

  return null;
}

function readPlayerEapm(player: LiveReplayPlayerRecord) {
  return readNumericValue(player.eapm);
}

function readPlayerScore(player: LiveReplayPlayerRecord) {
  return readNumericValue(player.score);
}

function formatRatingMetric(value: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? String(Math.round(value)) : "Unknown";
}

function formatActivityMetric(value: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? String(Math.round(value)) : "Warming";
}

function formatNumericMetric(value: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? String(Math.round(value)) : "Unknown";
}

function formatPulseMetric(value: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? String(Math.round(value)) : "...";
}

function formatDeltaMetric(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "Flat";
  if (value === 0) return "Flat";
  return value > 0 ? `+${Math.round(value)}` : String(Math.round(value));
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

function buildPlayerPulseSummary(
  player: LiveReplayPlayerRecord,
  historyPulses: HistoryPulse[]
): PlayerPulseSummary {
  const name = displayPlayerName(player);
  const playerTrail = historyPulses
    .map((entry) => entry.parsedPlayers.find((candidate) => displayPlayerName(candidate) === name) || null)
    .filter((entry): entry is LiveReplayPlayerRecord => Boolean(entry));
  const eapmTrail = playerTrail
    .map((entry) => readPlayerEapm(entry))
    .filter((value): value is number => value !== null);
  const scoreTrail = playerTrail
    .map((entry) => readPlayerScore(entry))
    .filter((value): value is number => value !== null);

  const openingEapm = eapmTrail.length > 0 ? eapmTrail[0] : null;
  const currentEapm = eapmTrail.length > 0 ? eapmTrail[eapmTrail.length - 1] : readPlayerEapm(player);
  const peakEapm = eapmTrail.length > 0 ? Math.max(...eapmTrail) : currentEapm;
  const lastKnownScore = scoreTrail.length > 0 ? scoreTrail[scoreTrail.length - 1] : readPlayerScore(player);

  return {
    name,
    currentEapm,
    openingEapm,
    peakEapm,
    eapmDelta:
      openingEapm !== null && currentEapm !== null ? Math.round(currentEapm - openingEapm) : null,
    pulseCount: playerTrail.length,
    lastKnownScore,
    scoreVisible: lastKnownScore !== null,
  };
}

function buildPlayerPulseSeries(name: string, historyPulses: HistoryPulse[]): PlayerPulsePoint[] {
  return historyPulses.map((entry) => {
    const player = entry.parsedPlayers.find((candidate) => displayPlayerName(candidate) === name) || null;
    return {
      parseIteration: entry.parseIteration,
      eapm: player ? readPlayerEapm(player) : null,
      score: player ? readPlayerScore(player) : null,
    };
  });
}

function describePulseSummary(summary: PlayerPulseSummary) {
  const eapmText =
    summary.currentEapm !== null ? `${summary.currentEapm} EAPM right now` : "Signal warming";
  const deltaText =
    summary.eapmDelta === null
      ? "opening baseline still forming"
      : summary.eapmDelta === 0
        ? "holding steady from the opening pulse"
        : summary.eapmDelta > 0
          ? `up ${summary.eapmDelta} from the opening pulse`
          : `down ${Math.abs(summary.eapmDelta)} from the opening pulse`;

  return `${eapmText}, ${deltaText}.`;
}

function buildFogItems(snapshot: LiveReplayDetailSnapshot, disconnectDetected: boolean) {
  const items: string[] = [];

  if (!snapshot.telemetry.hasScores) {
    items.push(
      "Live score snapshots are not present in the current watcher-live rows yet, so this page cannot show a true score lead during play."
    );
  }

  if (!snapshot.telemetry.hasAchievements) {
    if (snapshot.telemetry.hasAchievementShell) {
      items.push(
        "HD surfaced the achievement shell for this replay, but the actual military, economy, technology, and society values stayed empty, so richer stat rails remain dark."
      );
    } else {
      items.push(
        "Military, economy, technology, and society breakdowns are still missing before postgame, so those richer AoE stat rails stay dark until a stronger parse lands."
      );
    }
  }

  if (!snapshot.telemetry.hasPostgame) {
    if (snapshot.mode === "final" && snapshot.telemetry.completionSource === "resignation") {
      items.push(
        "The final winner is already locked by a recorded resignation signal, even though HD never surfaced a full postgame scoreboard block for this replay."
      );
    } else {
      items.push(
        "Postgame truth has not surfaced yet, which means winner state and resignation semantics remain provisional until the final replay wins."
      );
    }
  }

  if (disconnectDetected) {
    items.push(
      "The current pulse suggests the replay may be incomplete, paused, or disconnected, so some end-state hints can flip on the next iteration."
    );
  }

  return items;
}
