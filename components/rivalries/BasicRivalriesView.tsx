"use client";

import Link from "next/link";
import {
  useState,
  type ReactNode,
} from "react";

import SteamLinkedBadge from "@/components/SteamLinkedBadge";
import type {
  PublicLatestRivalry,
  PublicRivalryEntry,
  PublicTeamRivalryEntry,
} from "@/lib/publicMatchups";
import { teamRivalryFormatLabel } from "@/lib/replaySides";

type BasicLayoutMode =
  | "two-up"
  | "single"
  | "original";

type BasicRivalryBoard =
  | {
      kind: "duel";
      key: string;
      entry: PublicRivalryEntry;
    }
  | {
      kind: "team";
      key: string;
      entry: PublicTeamRivalryEntry;
    };

type BasicPlayer =
  PublicRivalryEntry["left"];

export default function BasicRivalriesView({
  duels,
  teams,
}: {
  duels: PublicRivalryEntry[];
  teams: PublicTeamRivalryEntry[];
  latestRivalry?:
    | PublicLatestRivalry
    | null;
  totalTeamBattles: number;
}) {
  const [
    layoutMode,
    setLayoutMode,
  ] = useState<BasicLayoutMode>(
    "two-up"
  );

  const allBoards: BasicRivalryBoard[] = [
    ...duels.map(
      (entry): BasicRivalryBoard => ({
        kind: "duel",
        key: `duel:${entry.key}`,
        entry,
      })
    ),
    ...teams.map(
      (entry): BasicRivalryBoard => ({
        kind: "team",
        key: `team:${entry.key}`,
        entry,
      })
    ),
  ].sort(compareBoards);

  const latestBoard =
    allBoards[0] ?? null;

  const establishedRivalries = [
    ...(latestBoard
      ? [latestBoard]
      : []),
    ...allBoards.filter(
      (board) =>
        board.key !== latestBoard?.key &&
        board.entry.totalMatches >= 2
    ),
  ];

  const freshFeuds =
    allBoards.filter(
      (board) =>
        board.key !== latestBoard?.key &&
        board.entry.totalMatches < 2
    );

  function cycleLayout() {
    setLayoutMode((current) => {
      if (current === "two-up") {
        return "single";
      }

      if (current === "single") {
        return "original";
      }

      return "two-up";
    });
  }

  return (
    <div
      className="space-y-6 py-1 text-white"
      data-rivalries-basic-style="original-20260709"
      data-rivalries-basic-order="latest-first"
      data-rivalries-basic-latest-promoted="true"
      data-rivalries-basic-layout={
        layoutMode
      }
    >
      <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(96,165,250,0.22),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(245,158,11,0.14),_transparent_30%),linear-gradient(135deg,_#0f172a,_#111827_56%,_#020617)] p-7 shadow-[0_30px_90px_rgba(2,6,23,0.35)] sm:p-8">
        <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-5">
            <div className="text-sm uppercase tracking-[0.4em] text-sky-200/70">
              Rivalries
            </div>

            <h1 className="sr-only">
              AoE2WAR Rivalries
            </h1>

            <div className="flex flex-wrap gap-2">
              <Tag>
                {allBoards.length} boards live
              </Tag>

              <Tag>
                {establishedRivalries.length} established
              </Tag>

              <Tag>
                {freshFeuds.length} fresh
              </Tag>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/battle-archive"
                className="rounded-full bg-sky-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-200"
              >
                Battle Archive
              </Link>

              <Link
                href="/players"
                className="rounded-full border border-white/15 px-5 py-3 text-sm text-white/85 transition hover:border-white/30 hover:text-white"
              >
                Browse Players
              </Link>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <StatCard
              label="All Rivalries"
              value={String(
                allBoards.length
              )}
            />

            <StatCard
              label="Established Rivalries"
              value={String(
                establishedRivalries.length
              )}
            />

            <StatCard
              label="Fresh Feuds"
              value={String(
                freshFeuds.length
              )}
            />
          </div>
        </div>
      </section>

      <LayoutPanel
        mode={layoutMode}
        onCycle={cycleLayout}
      >
        <RivalryGrid
          boards={establishedRivalries}
          mode={layoutMode}
          emptyMessage="No established rivalries yet."
        />
      </LayoutPanel>

      <Panel
        title="Fresh"
        eyebrow="New Blood"
      >
        <RivalryGrid
          boards={freshFeuds}
          mode={layoutMode}
          emptyMessage="No fresh feuds yet."
        />
      </Panel>
    </div>
  );
}

function LayoutPanel({
  mode,
  onCycle,
  children,
}: {
  mode: BasicLayoutMode;
  onCycle: () => void;
  children: ReactNode;
}) {
  return (
    <section
      className="rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-5 sm:p-6"
      data-basic-layout-panel
    >
      <button
        type="button"
        onClick={onCycle}
        className="-m-2 flex w-[calc(100%+1rem)] cursor-pointer items-center rounded-2xl p-2 text-left transition hover:bg-white/[0.025]"
        aria-label={`Replay-Backed Battles layout is ${mode}. Activate to change layout.`}
        title="Change rivalry layout"
        data-basic-layout-trigger
      >
        <span className="text-xs uppercase tracking-[0.35em] text-white/45 transition group-hover:text-white/65">
          Replay-Backed Battles
        </span>
      </button>

      <div className="mt-5">
        {children}
      </div>
    </section>
  );
}

function RivalryGrid({
  boards,
  mode,
  emptyMessage,
}: {
  boards: BasicRivalryBoard[];
  mode: BasicLayoutMode;
  emptyMessage: string;
}) {
  if (boards.length === 0) {
    return (
      <EmptyPanel
        message={emptyMessage}
      />
    );
  }

  const gridClass =
    mode === "single"
      ? "grid gap-5"
      : mode === "original"
        ? "grid gap-4 xl:grid-cols-2"
        : "grid gap-5 xl:grid-cols-2";

  return (
    <div
      className={gridClass}
      data-basic-rivalry-grid={mode}
    >
      {boards.map((board) => (
        <RivalryCard
          key={board.key}
          board={board}
          mode={mode}
        />
      ))}
    </div>
  );
}

function RivalryCard({
  board,
  mode,
}: {
  board: BasicRivalryBoard;
  mode: BasicLayoutMode;
}) {
  if (mode === "original") {
    if (board.kind === "duel") {
      return (
        <OriginalDuelCard
          entry={board.entry}
        />
      );
    }

    return (
      <OriginalTeamCard
        entry={board.entry}
      />
    );
  }

  return (
    <ModernRivalryCard
      board={board}
      mode={mode}
    />
  );
}

function ModernRivalryCard({
  board,
  mode,
}: {
  board: BasicRivalryBoard;
  mode: Exclude<
    BasicLayoutMode,
    "original"
  >;
}) {
  const entry = board.entry;

  const actionLabel =
    board.kind === "team"
      ? "Open Team Rivalry"
      : "Open Player Rivalry";

  const leftSide =
    board.kind === "duel" ? (
      <RivalryPlayer
        player={board.entry.left}
        align="left"
      />
    ) : (
      <RivalryRoster
        players={board.entry.left}
        align="left"
      />
    );

  const rightSide =
    board.kind === "duel" ? (
      <RivalryPlayer
        player={board.entry.right}
        align="right"
      />
    ) : (
      <RivalryRoster
        players={board.entry.right}
        align="right"
      />
    );

  return (
    <Link
      href={entry.href}
      className="group block overflow-hidden rounded-[1.8rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.025))] p-5 transition hover:border-sky-300/30 hover:bg-white/[0.075] sm:p-6"
    >
      <CardHeader
        board={board}
      />

      {mode === "two-up" ? (
        <div className="mt-5 space-y-4">
          <SeriesScore
            left={entry.leftWins}
            right={entry.rightWins}
            variant="wide"
          />

          <div className="grid min-w-0 gap-4 sm:grid-cols-2">
            {leftSide}
            {rightSide}
          </div>
        </div>
      ) : (
        <div className="mt-5 grid min-w-0 gap-4 md:grid-cols-[minmax(0,1fr)_10rem_minmax(0,1fr)] md:items-stretch">
          {leftSide}

          <SeriesScore
            left={entry.leftWins}
            right={entry.rightWins}
            variant="center"
          />

          {rightSide}
        </div>
      )}

      <CardMetrics
        entry={entry}
        actionLabel={actionLabel}
      />
    </Link>
  );
}

function OriginalDuelCard({
  entry,
}: {
  entry: PublicRivalryEntry;
}) {
  const lastPlayedLabel =
    formatDate(entry.lastPlayedAt);

  return (
    <Link
      href={entry.href}
      className="block rounded-[1.8rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 transition hover:border-sky-300/30 hover:bg-white/10"
      data-basic-original-duel
    >
      <div className="flex items-start justify-between gap-4">
        <div className="text-xs uppercase tracking-[0.32em] text-white/45">
          Head-To-Head
        </div>

        <Tag>
          {entry.totalMatches === 1
            ? "1 meeting"
            : `${entry.totalMatches} meetings`}
        </Tag>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-center">
        <OriginalRivalryPlayer
          player={entry.left}
          align="left"
        />

        <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 px-5 py-5 text-center">
          <div className="text-[11px] uppercase tracking-[0.28em] text-slate-500">
            Series
          </div>

          <div className="mt-2 text-5xl font-semibold tracking-tight text-white sm:text-6xl">
            {entry.leftWins}

            <span className="px-3 text-slate-500">
              -
            </span>

            {entry.rightWins}
          </div>
        </div>

        <OriginalRivalryPlayer
          player={entry.right}
          align="right"
        />
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <SummaryMetric
          label="Decided Battles"
          value={String(
            Math.max(0, entry.totalMatches - entry.unknowns)
          )}
        />

        <SummaryMetric
          label="Last Meeting"
          value={lastPlayedLabel}
        />

        <SummaryMetric
          label="Action"
          value="Open Player Rivalry"
        />
      </div>
    </Link>
  );
}

function OriginalTeamCard({
  entry,
}: {
  entry: PublicTeamRivalryEntry;
}) {
  return (
    <Link
      href={entry.href}
      className="block rounded-[1.8rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 transition hover:border-amber-200/25 hover:bg-white/10"
      data-basic-original-team
    >
      <div className="flex items-start justify-between gap-4">
        <div className="text-xs uppercase tracking-[0.32em] text-white/45">
          {teamRivalryFormatLabel(
            entry.format
          )}
        </div>

        <Tag>
          {entry.totalMatches === 1
            ? "1 meeting"
            : `${entry.totalMatches} meetings`}
        </Tag>
      </div>

      <div className="mt-5 rounded-[1.5rem] border border-white/10 bg-slate-950/70 px-5 py-5 text-center">
        <div className="text-[11px] uppercase tracking-[0.28em] text-slate-500">
          Series
        </div>

        <div className="mt-2 text-5xl font-semibold tracking-tight text-white sm:text-6xl">
          {entry.leftWins}

          <span className="px-3 text-slate-500">
            -
          </span>

          {entry.rightWins}
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <OriginalTeamRoster
          players={entry.left}
          align="left"
        />

        <OriginalTeamRoster
          players={entry.right}
          align="right"
        />
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <SummaryMetric
          label="Decided Battles"
          value={String(
            Math.max(0, entry.totalMatches - entry.unknowns)
          )}
        />

        <SummaryMetric
          label="Last Meeting"
          value={formatDate(
            entry.lastPlayedAt
          )}
        />

        <SummaryMetric
          label="Action"
          value="Open Team Rivalry"
        />
      </div>
    </Link>
  );
}

function CardHeader({
  board,
}: {
  board: BasicRivalryBoard;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="text-xs uppercase tracking-[0.32em] text-white/45">
        {board.kind === "team"
          ? teamRivalryFormatLabel(
              board.entry.format
            )
          : "Head-To-Head"}
      </div>

      <Tag>
        {board.entry.totalMatches === 1
          ? "1 meeting"
          : `${board.entry.totalMatches} meetings`}
      </Tag>
    </div>
  );
}

function CardMetrics({
  entry,
  actionLabel,
}: {
  entry:
    | PublicRivalryEntry
    | PublicTeamRivalryEntry;
  actionLabel: string;
}) {
  return (
    <div className="mt-5 grid gap-3 sm:grid-cols-3">
      <SummaryMetric
        label="Decided Battles"
        value={String(
          Math.max(0, entry.totalMatches - entry.unknowns)
        )}
      />

      <SummaryMetric
        label="Last Meeting"
        value={formatDate(
          entry.lastPlayedAt
        )}
      />

      <SummaryMetric
        label="Action"
        value={actionLabel}
      />
    </div>
  );
}

function SeriesScore({
  left,
  right,
  variant,
}: {
  left: number;
  right: number;
  variant: "wide" | "center";
}) {
  return (
    <div
      className={
        variant === "wide"
          ? "flex min-h-[8rem] w-full flex-col items-center justify-center rounded-[1.5rem] border border-white/10 bg-slate-950/75 px-4 py-5 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]"
          : "flex min-h-[10rem] flex-col items-center justify-center rounded-[1.5rem] border border-white/10 bg-slate-950/75 px-3 py-5 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]"
      }
    >
      <div className="text-[11px] uppercase tracking-[0.3em] text-slate-500">
        Series
      </div>

      <div className="mt-3 whitespace-nowrap text-5xl font-semibold tracking-[-0.055em] text-white sm:text-6xl">
        {left}

        <span className="px-2 text-slate-500">
          -
        </span>

        {right}
      </div>
    </div>
  );
}

function RivalryPlayer({
  player,
  align,
}: {
  player: BasicPlayer;
  align: "left" | "right";
}) {
  return (
    <div
      className={`flex min-h-[10rem] min-w-0 flex-col justify-center overflow-hidden rounded-[1.4rem] border border-white/60 bg-white/[0.045] px-5 py-5 ${
        align === "right"
          ? "md:text-right"
          : ""
      }`}
    >
      <div className="text-[11px] uppercase tracking-[0.25em] text-slate-400">
        {player.claimed
          ? "Claimed Warrior"
          : "Replay-Built Warrior"}
      </div>

      <div className="mt-3 min-w-0 break-words [overflow-wrap:anywhere] text-xl font-semibold leading-tight text-white sm:text-2xl">
        {player.name}
      </div>

      <div
        className={`mt-4 flex min-w-0 flex-wrap gap-2 ${
          align === "right"
            ? "md:justify-end"
            : ""
        }`}
      >
        {player.claimed ? (
          <SteamLinkedBadge compact />
        ) : (
          <Tag>
            Claimable identity
          </Tag>
        )}

        {player.pendingWoloClaimCount > 0 ? (
          <Tag>
            {player.pendingWoloClaimAmount} WOLO unclaimed
          </Tag>
        ) : null}
      </div>
    </div>
  );
}

function RivalryRoster({
  players,
  align,
}: {
  players: BasicPlayer[];
  align: "left" | "right";
}) {
  return (
    <div
      className={`flex min-h-[10rem] min-w-0 flex-col justify-center overflow-hidden rounded-[1.4rem] border border-white/60 bg-white/[0.045] px-5 py-5 ${
        align === "right"
          ? "md:text-right"
          : ""
      }`}
    >
      <div className="text-[11px] uppercase tracking-[0.25em] text-slate-400">
        War Party
      </div>

      <div className="mt-4 min-w-0 space-y-3">
        {players.map((player) => (
          <div
            key={player.token}
            className={`flex min-w-0 flex-wrap items-center gap-2 ${
              align === "right"
                ? "md:justify-end"
                : ""
            }`}
          >
            <span className="min-w-0 max-w-full break-words [overflow-wrap:anywhere] text-sm font-semibold leading-5 text-white sm:text-base">
              {player.name}
            </span>

            {player.claimed ? (
              <SteamLinkedBadge compact />
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function OriginalRivalryPlayer({
  player,
  align,
}: {
  player: BasicPlayer;
  align: "left" | "right";
}) {
  return (
    <div
      className={`min-w-0 rounded-[1.4rem] border border-white/8 bg-white/5 px-4 py-4 ${
        align === "right"
          ? "lg:text-right"
          : ""
      }`}
    >
      <div className="text-[11px] uppercase tracking-[0.25em] text-slate-500">
        {player.claimed
          ? "Claimed Warrior"
          : "Replay-Built Warrior"}
      </div>

      <div className="mt-3 break-words text-2xl font-semibold leading-tight text-white">
        {player.name}
      </div>

      <div
        className={`mt-3 flex flex-wrap gap-2 ${
          align === "right"
            ? "lg:justify-end"
            : ""
        }`}
      >
        {player.claimed ? (
          <SteamLinkedBadge compact />
        ) : (
          <Tag>
            Claimable identity
          </Tag>
        )}

        {player.pendingWoloClaimCount > 0 ? (
          <Tag>
            {player.pendingWoloClaimAmount} WOLO unclaimed
          </Tag>
        ) : null}
      </div>
    </div>
  );
}

function OriginalTeamRoster({
  players,
  align,
}: {
  players: BasicPlayer[];
  align: "left" | "right";
}) {
  return (
    <div
      className={`min-w-0 rounded-[1.4rem] border border-white/8 bg-white/5 px-4 py-4 ${
        align === "right"
          ? "text-right"
          : ""
      }`}
    >
      <div className="text-[11px] uppercase tracking-[0.25em] text-slate-500">
        War Party
      </div>

      <div className="mt-3 space-y-2">
        {players.map((player) => (
          <div
            key={player.token}
            className="min-w-0 break-words [overflow-wrap:anywhere] text-sm font-semibold leading-5 text-white"
          >
            {player.name}
          </div>
        ))}
      </div>
    </div>
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
    <section className="rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-5 sm:p-6">
      <div className="text-xs uppercase tracking-[0.35em] text-white/45">
        {eyebrow}
      </div>

      <h2 className="mt-2 text-2xl font-semibold text-white">
        {title}
      </h2>

      <div className="mt-5">
        {children}
      </div>
    </section>
  );
}

function StatCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[1.4rem] border border-white/10 bg-white/5 px-4 py-4">
      <div className="text-xs uppercase tracking-[0.25em] text-slate-400">
        {label}
      </div>

      <div className="mt-2 text-2xl font-semibold text-white">
        {value}
      </div>
    </div>
  );
}

function SummaryMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-white/60 bg-slate-950/60 px-4 py-4">
      <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
        {label}
      </div>

      <div className="mt-3 break-words [overflow-wrap:anywhere] text-sm font-medium leading-6 text-white">
        {value}
      </div>
    </div>
  );
}

function Tag({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <span className="inline-flex max-w-full items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs leading-5 text-slate-300 break-words">
      {children}
    </span>
  );
}

function EmptyPanel({
  message,
}: {
  message: string;
}) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/5 px-4 py-5 text-sm text-slate-300">
      {message}
    </div>
  );
}

function compareBoards(
  left: BasicRivalryBoard,
  right: BasicRivalryBoard
) {
  const recencyDifference =
    timestamp(right.entry.lastPlayedAt) -
    timestamp(left.entry.lastPlayedAt);

  if (recencyDifference !== 0) {
    return recencyDifference;
  }

  return (
    right.entry.totalMatches -
    left.entry.totalMatches
  );
}

function timestamp(
  value: string | null
) {
  if (!value) {
    return 0;
  }

  const parsed =
    new Date(value).getTime();

  return Number.isFinite(parsed)
    ? parsed
    : 0;
}

function formatDate(
  value: string | null
) {
  return value
    ? new Date(value).toLocaleString(
        [],
        {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        }
      )
    : "Waiting for first match";
}
