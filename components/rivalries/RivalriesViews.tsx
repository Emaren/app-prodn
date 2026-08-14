import Link from "next/link";
import type {
  ReactNode,
} from "react";

import SteamLinkedBadge from "@/components/SteamLinkedBadge";
import type {
  PublicLatestRivalry,
  PublicRivalryEntry,
  PublicTeamRivalryEntry,
} from "@/lib/publicMatchups";
import { teamRivalryFormatLabel } from "@/lib/replaySides";
import { normalizePublicReplayText } from "@/lib/unresolvedWatcherResult";

export type RivalriesViewsProps = {
  duels: PublicRivalryEntry[];
  teams: PublicTeamRivalryEntry[];
  latestRivalry:
    | PublicLatestRivalry
    | null;
  totalTeamBattles: number;
  totals: RivalryCollectionTotals;
};

export type RivalryCollectionTotals = {
  boards: number;
  duels: number;
  teams: number;
  established: number;
  fresh: number;
  tagTeams: number;
  triTeams: number;
  warTeams: number;
};

type ViewMode =
  | "basic"
  | "advanced"
  | "extreme";

type RivalryPlayer =
  PublicRivalryEntry["left"];

type RawRivalryBoard =
  | {
      kind: "duel";
      key: string;
      playedAt: string | null;
      entry: PublicRivalryEntry;
    }
  | {
      kind: "team";
      key: string;
      playedAt: string | null;
      entry: PublicTeamRivalryEntry;
    };

const BASIC_DUEL_LIMIT = 24;
const BASIC_FRESH_LIMIT = 12;
const BASIC_TEAM_LIMIT = 18;

const ADVANCED_DUEL_LIMIT = 12;
const ADVANCED_TEAM_LIMIT = 12;

export function BasicRivalriesView({
  duels,
  teams,
  latestRivalry,
  totalTeamBattles,
  totals,
}: RivalriesViewsProps) {
  const establishedDuels = duels
    .filter(
      (entry) =>
        entry.totalMatches >= 2
    )
    .slice(
      0,
      BASIC_DUEL_LIMIT
    );

  const freshDuels = duels
    .filter(
      (entry) =>
        entry.totalMatches < 2
    )
    .slice(
      0,
      BASIC_FRESH_LIMIT
    );

  const groups = groupTeams(teams);

  return (
    <div
      className="space-y-6 text-white"
      data-rivalries-basic-style="og"
    >
      <OverviewStrip
        mode="basic"
        totalTeamBattles={
          totalTeamBattles
        }
        totals={totals}
      />

      <Panel
        title="Latest Rivalry"
        eyebrow="Updated By The Latest Battle"
      >
        <LatestRivalryFeature
          latest={latestRivalry}
          mode="basic"
        />
      </Panel>

      <Panel
        title="Featured Duels"
        eyebrow="One Warrior Against One"
        corner={`${establishedDuels.length} shown`}
      >
        <DuelGrid
          entries={establishedDuels}
          mode="basic"
        />
      </Panel>

      <TeamSection
        title="Tag Team Rivalries"
        eyebrow="Two Against Two"
        entries={groups.tag}
        limit={BASIC_TEAM_LIMIT}
        mode="basic"
      />

      <TeamSection
        title="Tri-Team Rivalries"
        eyebrow="Three Against Three"
        entries={groups.tri}
        limit={BASIC_TEAM_LIMIT}
        mode="basic"
      />

      <TeamSection
        title="War Team Rivalries"
        eyebrow="Four Against Four"
        entries={groups.war}
        limit={BASIC_TEAM_LIMIT}
        mode="basic"
      />

      {freshDuels.length > 0 ? (
        <Panel
          title="Fresh Duels"
          eyebrow="New Blood"
          corner={`${freshDuels.length} shown`}
        >
          <DuelGrid
            entries={freshDuels}
            mode="basic"
          />
        </Panel>
      ) : null}
    </div>
  );
}

export function AdvancedRivalriesView({
  duels,
  teams,
  latestRivalry,
  totalTeamBattles,
  totals,
}: RivalriesViewsProps) {
  const establishedDuels = duels
    .filter(
      (entry) =>
        entry.totalMatches >= 2
    )
    .slice(
      0,
      ADVANCED_DUEL_LIMIT
    );

  const groups = groupTeams(teams);

  return (
    <div
      className="space-y-10 text-white"
      data-rivalries-advanced-style="updated-loose"
    >
      <OverviewStrip
        mode="advanced"
        totalTeamBattles={
          totalTeamBattles
        }
        totals={totals}
      />

      <LooseSection
        title="Latest Rivalry"
        eyebrow="The Series Updated By The Latest Battle"
      >
        <LatestRivalryFeature
          latest={latestRivalry}
          mode="advanced"
        />
      </LooseSection>

      <LooseSection
        title="Established Player Rivalries"
        eyebrow="True Duel Histories"
        corner={`${establishedDuels.length} strongest shown`}
      >
        <DuelGrid
          entries={establishedDuels}
          mode="advanced"
        />
      </LooseSection>

      <LooseTeamSection
        title="Tag Team Rivalries"
        eyebrow="Two Against Two"
        entries={groups.tag}
        limit={ADVANCED_TEAM_LIMIT}
        mode="advanced"
      />

      <LooseTeamSection
        title="Tri-Team Rivalries"
        eyebrow="Three Against Three"
        entries={groups.tri}
        limit={ADVANCED_TEAM_LIMIT}
        mode="advanced"
      />

      <LooseTeamSection
        title="War Team Rivalries"
        eyebrow="Four Against Four"
        entries={groups.war}
        limit={ADVANCED_TEAM_LIMIT}
        mode="advanced"
      />
    </div>
  );
}

export function ExtremeRivalriesView({
  duels,
  teams,
  latestRivalry,
  totalTeamBattles,
  totals,
}: RivalriesViewsProps) {
  const rawBoards: RawRivalryBoard[] = [
    ...duels.map(
      (entry): RawRivalryBoard => ({
        kind: "duel",
        key: `duel:${entry.key}`,
        playedAt: entry.lastPlayedAt,
        entry,
      })
    ),
    ...teams.map(
      (entry): RawRivalryBoard => ({
        kind: "team",
        key: `team:${entry.key}`,
        playedAt: entry.lastPlayedAt,
        entry,
      })
    ),
  ].sort(
    (left, right) =>
      rivalryTime(right.playedAt) -
      rivalryTime(left.playedAt)
  );

  return (
    <div
      className="space-y-10 text-white"
      data-rivalries-extreme-style="raw-four-up-loose"
    >
      <OverviewStrip
        mode="extreme"
        totalTeamBattles={
          totalTeamBattles
        }
        totals={totals}
      />

      <LatestRivalryFeature
        latest={latestRivalry}
        mode="extreme"
      />

      <LooseSection
        title="Rivalry Hall"
        eyebrow="Raw Rivalry Index"
        corner={`${rawBoards.length} histories`}
        spacious
        dataMode="raw-four-up-loose"
      >
        {rawBoards.length === 0 ? (
          <EmptyPanel message="No rivalry histories have been filed yet." />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {rawBoards.map((board) =>
              board.kind === "duel" ? (
                <RawDuelCard
                  key={board.key}
                  entry={board.entry}
                />
              ) : (
                <RawTeamCard
                  key={board.key}
                  entry={board.entry}
                />
              )
            )}
          </div>
        )}
      </LooseSection>
    </div>
  );
}

function OverviewStrip({
  mode,
  totalTeamBattles,
  totals,
}: {
  mode: ViewMode;
  totalTeamBattles: number;
  totals: RivalryCollectionTotals;
}) {
  const extreme = mode === "extreme";

  return (
    <section
      className={
        extreme
          ? "relative overflow-hidden rounded-[2.35rem] border border-white/[0.09] bg-[radial-gradient(circle_at_8%_0%,rgba(56,189,248,0.11),transparent_25%),radial-gradient(circle_at_92%_100%,rgba(245,158,11,0.09),transparent_27%),linear-gradient(125deg,#09111f,#070c17_52%,#0d0c0b)] px-7 py-8 shadow-[0_30px_110px_rgba(0,0,0,0.4)] sm:px-10 xl:px-12"
          : "overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(96,165,250,0.20),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(245,158,11,0.12),transparent_30%),linear-gradient(135deg,#0f172a,#111827_56%,#020617)] p-7 shadow-[0_30px_90px_rgba(2,6,23,0.35)] sm:p-8"
      }
    >
      <div
        className={
          extreme
            ? "grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(34rem,0.8fr)] xl:items-center"
            : "grid gap-7 lg:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)] lg:items-center"
        }
      >
        <div>
          <div
            className={
              extreme
                ? "text-xs uppercase tracking-[0.48em] text-amber-100/55"
                : "text-xs uppercase tracking-[0.42em] text-sky-200/65"
            }
          >
            Rivalries
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            <CountTag>
              {totals.duels} player histories
            </CountTag>

            <CountTag>
              {totals.teams} exact team histories
            </CountTag>

            <CountTag>
              {totalTeamBattles} team battles
            </CountTag>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/battle-archive"
              className={
                extreme
                  ? "rounded-full border border-amber-100/20 bg-amber-100/[0.045] px-5 py-2.5 text-sm font-semibold text-amber-50/85 transition hover:border-amber-100/40 hover:bg-amber-100/[0.08]"
                  : "rounded-full border border-white/14 bg-white/[0.035] px-5 py-2.5 text-sm font-semibold text-white transition hover:border-sky-200/25 hover:bg-white/[0.07]"
              }
            >
              Battle Archive
            </Link>

            <Link
              href="/players"
              className="rounded-full border border-white/10 bg-black/10 px-5 py-2.5 text-sm text-slate-300 transition hover:border-white/24 hover:text-white"
            >
              Browse Players
            </Link>
          </div>
        </div>

        <div
          className={
            extreme
              ? "grid gap-3 sm:grid-cols-2"
              : "grid gap-3 sm:grid-cols-2"
          }
        >
          <StatCard
            label="Player Rivalries"
            value={String(totals.duels)}
            premium={extreme}
          />

          <StatCard
            label="Exact Team Rivalries"
            value={String(totals.teams)}
            premium={extreme}
          />

          <StatCard
            label="Team Battles"
            value={String(totalTeamBattles)}
            premium={extreme}
          />

          <StatCard
            label="Tag / Tri / War"
            value={`${totals.tagTeams} / ${totals.triTeams} / ${totals.warTeams}`}
            premium={extreme}
          />
        </div>
      </div>
    </section>
  );
}

export function LatestRivalryFeature({
  latest,
  mode,
}: {
  latest:
    | PublicLatestRivalry
    | null;
  mode: ViewMode;
}) {
  if (!latest) {
    return (
      <EmptyPanel message="Waiting for the first rivalry-backed battle." />
    );
  }

  const game = latest.latestGame;
  const rivalry = latest.rivalry;

  const leftPlayers: RivalryPlayer[] =
    latest.kind === "duel"
      ? [latest.rivalry.left]
      : latest.rivalry.left;

  const rightPlayers: RivalryPlayer[] =
    latest.kind === "duel"
      ? [latest.rivalry.right]
      : latest.rivalry.right;

  const formatLabel =
    latest.kind === "duel"
      ? "Player Rivalry"
      : teamRivalryFormatLabel(
          latest.rivalry.format
        );

  const actionLabel =
    latest.kind === "duel"
      ? "Open Player Rivalry"
      : "Open Team Rivalry";

  const winnerLabel =
    game.winnerLabel
      ? `${game.winnerLabel} won`
      : "Battle preserved";

  const extreme = mode === "extreme";
  const advanced = mode === "advanced";

  return (
    <article
      className={
        extreme
          ? "relative overflow-hidden rounded-[2.6rem] border border-amber-100/16 bg-[radial-gradient(circle_at_50%_0%,rgba(251,191,36,0.09),transparent_25%),radial-gradient(circle_at_8%_55%,rgba(14,165,233,0.10),transparent_28%),linear-gradient(140deg,#0d1728,#060b14_58%,#17110b)] px-7 py-9 shadow-[0_38px_130px_rgba(0,0,0,0.48)] sm:px-10 xl:px-14 xl:py-12"
          : advanced
            ? "rounded-[2rem] border border-sky-200/12 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.10),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.052),rgba(255,255,255,0.018))] p-7"
            : "rounded-[1.6rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.025))] p-5"
      }
      data-latest-rivalry-series={`${rivalry.leftWins}-${rivalry.rightWins}`}
      data-latest-rivalry-winner={winnerLabel}
    >
      {extreme ? (
        <div className="pointer-events-none absolute inset-x-[12%] top-0 h-px bg-gradient-to-r from-transparent via-amber-100/55 to-transparent" />
      ) : null}

      <div className="relative">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <div
              className={
                extreme
                  ? "text-xs uppercase tracking-[0.46em] text-amber-100/48"
                  : "text-[11px] uppercase tracking-[0.32em] text-sky-200/55"
              }
            >
              Latest Rivalry Updated
            </div>

            <div
              className={
                extreme
                  ? "mt-4 text-xl font-medium text-white"
                  : "mt-3 text-lg font-semibold text-white"
              }
            >
              {formatLabel}
              <span className="px-3 text-slate-600">
                ·
              </span>
              {normalizePublicReplayText(game.mapName) ?? "HD Battlefield"}
            </div>

            <div className="mt-2 text-sm text-slate-500">
              {formatDate(game.playedAt)}
            </div>
          </div>

          <div
            className="shrink-0 pt-1 text-right text-[10px] font-medium uppercase tracking-[0.28em] text-emerald-100/32"
            data-latest-rivalry-winner-stamp={winnerLabel}
          >
            {winnerLabel}
          </div>
        </div>

        <div
          className={
            extreme
              ? "mt-10 grid min-w-0 gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,0.46fr)_minmax(0,1fr)] xl:items-center"
              : "mt-6 grid min-w-0 gap-4 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-center"
          }
        >
          <LatestRoster
            players={leftPlayers}
            align="left"
            extreme={extreme}
          />

          <div
            className={
              extreme
                ? "rounded-[2rem] border border-amber-100/16 bg-black/35 px-7 py-8 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.045),0_20px_55px_rgba(0,0,0,0.34)]"
                : "rounded-[1.35rem] border border-white/10 bg-slate-950/68 px-5 py-5 text-center"
            }
          >
            <div
              className={
                extreme
                  ? "text-xs uppercase tracking-[0.42em] text-amber-100/38"
                  : "text-[10px] uppercase tracking-[0.27em] text-slate-500"
              }
            >
              Series
            </div>

            <div
              className={
                extreme
                  ? "mt-4 whitespace-nowrap text-6xl font-semibold tracking-[-0.06em] text-white sm:text-7xl 2xl:text-8xl"
                  : "mt-2 whitespace-nowrap text-4xl font-semibold tracking-tight text-white"
              }
            >
              {rivalry.leftWins}
              <span
                className={
                  extreme
                    ? "px-4 text-amber-100/22"
                    : "px-3 text-slate-600"
                }
              >
                -
              </span>
              {rivalry.rightWins}
            </div>
          </div>

          <LatestRoster
            players={rightPlayers}
            align="right"
            extreme={extreme}
          />
        </div>

        <div className="mt-7 grid gap-3 sm:grid-cols-3">
          <Metric
            label={
              latest.kind === "duel"
                ? "Opposing Meetings"
                : "Team Battles"
            }
            value={String(
              rivalry.totalMatches
            )}
            premium={extreme}
          />

          <Metric
            label="Decided Battles"
            value={String(
              Math.max(0, rivalry.totalMatches - rivalry.unknowns)
            )}
            premium={extreme}
          />

          <Metric
            label="Last Updated"
            value={formatDate(
              rivalry.lastPlayedAt
            )}
            premium={extreme}
          />
        </div>

        <div
          className={
            extreme
              ? "mt-9 flex flex-wrap items-center gap-3 border-t border-white/[0.06] pt-7"
              : "mt-6 flex flex-wrap gap-3"
          }
        >
          <Link
            href={rivalry.href}
            className={
              extreme
                ? "inline-flex min-h-11 items-center rounded-full border border-amber-100/22 bg-amber-100/[0.045] px-6 py-3 text-sm font-semibold text-amber-50/85 transition hover:border-amber-100/45 hover:bg-amber-100/[0.085]"
                : "inline-flex min-h-10 items-center rounded-full border border-sky-200/18 bg-sky-200/[0.045] px-5 py-2.5 text-sm font-semibold text-sky-100/85 transition hover:border-sky-100/35 hover:bg-sky-200/[0.085]"
            }
          >
            {actionLabel}
          </Link>

          <Link
            href={game.replayHref}
            className="inline-flex min-h-10 items-center rounded-full border border-white/10 bg-white/[0.03] px-5 py-2.5 text-sm font-medium text-slate-300 transition hover:border-white/22 hover:text-white"
          >
            Open Replay
          </Link>

          {game.marketHref ? (
            <Link
              href={game.marketHref}
              className="inline-flex min-h-10 items-center rounded-full border border-amber-200/22 bg-amber-300/[0.065] px-5 py-2.5 text-sm font-semibold text-amber-100/90 transition hover:border-amber-100/45 hover:bg-amber-300/[0.11]"
            >
              Open Bet
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function DuelGrid({
  entries,
  mode,
}: {
  entries: PublicRivalryEntry[];
  mode: ViewMode;
}) {
  if (entries.length === 0) {
    return (
      <EmptyPanel message="No player rivalries yet." />
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {entries.map((entry) => (
        <DuelCard
          key={entry.key}
          entry={entry}
          mode={mode}
        />
      ))}
    </div>
  );
}

function DuelCard({
  entry,
  mode,
}: {
  entry: PublicRivalryEntry;
  mode: ViewMode;
}) {
  const basic = mode === "basic";

  return (
    <Link
      href={entry.href}
      className={
        basic
          ? "group block rounded-[1.7rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.025))] p-5 transition hover:border-sky-300/30 hover:bg-white/[0.075]"
          : "group block rounded-[1.6rem] border border-white/10 bg-white/[0.032] p-5 transition hover:border-sky-300/25 hover:bg-white/[0.06]"
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-[10px] uppercase tracking-[0.3em] text-sky-200/50">
          Player Rivalry
        </div>

        <CountTag>
          {entry.totalMatches} meetings
        </CountTag>
      </div>

      <div className="mt-5 grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4">
        <CompactPlayer
          player={entry.left}
          align="left"
        />

        <SmallScore
          left={entry.leftWins}
          right={entry.rightWins}
        />

        <CompactPlayer
          player={entry.right}
          align="right"
        />
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-4 text-xs">
        <span className="text-slate-500">
          {Math.max(0, entry.totalMatches - entry.unknowns)} decided
          {" · "}
          {formatDate(entry.lastPlayedAt)}
        </span>

        <span className="font-medium text-sky-100/75 transition group-hover:text-sky-50">
          Open Player Rivalry
        </span>
      </div>
    </Link>
  );
}

function LooseTeamSection({
  title,
  eyebrow,
  entries,
  limit,
  mode,
}: {
  title: string;
  eyebrow: string;
  entries: PublicTeamRivalryEntry[];
  limit: number;
  mode: ViewMode;
}) {
  const visible =
    entries.slice(0, limit);

  return (
    <LooseSection
      title={title}
      eyebrow={eyebrow}
      corner={`${visible.length} shown · ${entries.length} total`}
    >
      {visible.length === 0 ? (
        <EmptyPanel
          message={`No ${title.toLowerCase()} yet.`}
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {visible.map((entry) => (
            <TeamCard
              key={entry.key}
              entry={entry}
              mode={mode}
            />
          ))}
        </div>
      )}
    </LooseSection>
  );
}

function TeamSection({
  title,
  eyebrow,
  entries,
  limit,
  mode,
}: {
  title: string;
  eyebrow: string;
  entries: PublicTeamRivalryEntry[];
  limit: number;
  mode: ViewMode;
}) {
  const visible =
    entries.slice(0, limit);

  return (
    <Panel
      title={title}
      eyebrow={eyebrow}
      corner={`${visible.length} shown · ${entries.length} total`}
    >
      {visible.length === 0 ? (
        <EmptyPanel
          message={`No ${title.toLowerCase()} yet.`}
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {visible.map((entry) => (
            <TeamCard
              key={entry.key}
              entry={entry}
              mode={mode}
            />
          ))}
        </div>
      )}
    </Panel>
  );
}

function TeamCard({
  entry,
  mode,
}: {
  entry: PublicTeamRivalryEntry;
  mode: ViewMode;
}) {
  const basic = mode === "basic";

  return (
    <Link
      href={entry.href}
      className={
        basic
          ? "group block rounded-[1.7rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.10),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.025))] p-5 transition hover:border-amber-300/30 hover:bg-white/[0.075]"
          : "group block rounded-[1.6rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.055),transparent_28%),rgba(255,255,255,0.028)] p-5 transition hover:border-amber-300/25 hover:bg-white/[0.055]"
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-[10px] uppercase tracking-[0.3em] text-amber-200/55">
          {teamRivalryFormatLabel(
            entry.format
          )}
          {" · "}
          {entry.format}
        </div>

        <CountTag>
          {entry.totalMatches} battles
        </CountTag>
      </div>

      <div className="mt-5 grid min-w-0 gap-4 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-center">
        <CompactRoster
          players={entry.left}
          align="left"
        />

        <SmallScore
          left={entry.leftWins}
          right={entry.rightWins}
        />

        <CompactRoster
          players={entry.right}
          align="right"
        />
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-4 text-xs">
        <span className="text-slate-500">
          {Math.max(0, entry.totalMatches - entry.unknowns)} decided
          {" · "}
          {formatDate(entry.lastPlayedAt)}
        </span>

        <span className="font-medium text-amber-100/72 transition group-hover:text-amber-50">
          Open Team Rivalry
        </span>
      </div>
    </Link>
  );
}

function RawDuelCard({
  entry,
}: {
  entry: PublicRivalryEntry;
}) {
  return (
    <Link
      href={entry.href}
      className="group flex min-h-[15rem] flex-col rounded-[1.55rem] border border-white/[0.075] bg-[linear-gradient(145deg,rgba(255,255,255,0.042),rgba(255,255,255,0.015))] p-5 transition hover:border-sky-100/18 hover:bg-white/[0.05]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="text-[9px] uppercase tracking-[0.31em] text-sky-200/45">
          Player Rivalry
        </div>

        <span className="text-[10px] text-slate-500">
          {entry.totalMatches}
        </span>
      </div>

      <div className="mt-6 grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
        <RawPlayer
          player={entry.left}
          align="left"
        />

        <SmallScore
          left={entry.leftWins}
          right={entry.rightWins}
          compact
        />

        <RawPlayer
          player={entry.right}
          align="right"
        />
      </div>

      <div className="mt-auto flex items-end justify-between gap-3 border-t border-white/[0.055] pt-5 text-[10px]">
        <span className="leading-5 text-slate-600">
          {Math.max(0, entry.totalMatches - entry.unknowns)} decided
          <br />
          {formatDate(entry.lastPlayedAt)}
        </span>

        <span className="text-right font-medium text-sky-100/60 transition group-hover:text-sky-50">
          Open
        </span>
      </div>
    </Link>
  );
}

function RawTeamCard({
  entry,
}: {
  entry: PublicTeamRivalryEntry;
}) {
  return (
    <Link
      href={entry.href}
      className="group flex min-h-[15rem] flex-col rounded-[1.55rem] border border-amber-100/[0.075] bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.045),transparent_30%),rgba(255,255,255,0.018)] p-5 transition hover:border-amber-100/20 hover:bg-white/[0.045]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="text-[9px] uppercase tracking-[0.3em] text-amber-100/45">
          {teamRivalryFormatLabel(
            entry.format
          )}
          {" · "}
          {entry.format}
        </div>

        <span className="text-[10px] text-slate-500">
          {entry.totalMatches}
        </span>
      </div>

      <div className="mt-5 grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
        <RawRoster
          players={entry.left}
          align="left"
        />

        <SmallScore
          left={entry.leftWins}
          right={entry.rightWins}
          compact
        />

        <RawRoster
          players={entry.right}
          align="right"
        />
      </div>

      <div className="mt-auto flex items-end justify-between gap-3 border-t border-white/[0.055] pt-5 text-[10px]">
        <span className="leading-5 text-slate-600">
          {Math.max(0, entry.totalMatches - entry.unknowns)} decided
          <br />
          {formatDate(entry.lastPlayedAt)}
        </span>

        <span className="text-right font-medium text-amber-100/60 transition group-hover:text-amber-50">
          Open
        </span>
      </div>
    </Link>
  );
}

function LatestRoster({
  players,
  align,
  extreme,
}: {
  players: RivalryPlayer[];
  align: "left" | "right";
  extreme: boolean;
}) {
  return (
    <div
      className={`min-w-0 ${
        extreme
          ? "rounded-[2rem] border border-white/[0.075] bg-black/20 px-6 py-7 sm:px-8"
          : "rounded-[1.3rem] border border-white/[0.07] bg-slate-950/35 px-5 py-5"
      } ${
        align === "right"
          ? "xl:text-right"
          : ""
      }`}
    >
      <div
        className={
          extreme
            ? "text-[10px] uppercase tracking-[0.4em] text-amber-100/35"
            : "text-[10px] uppercase tracking-[0.25em] text-slate-500"
        }
      >
        {players.length === 1
          ? "Warrior"
          : "War Party"}
      </div>

      <div
        className={
          extreme
            ? "mt-5 space-y-4"
            : "mt-3 space-y-2"
        }
      >
        {players.map((player) => (
          <div
            key={player.token}
            className={`flex min-w-0 flex-wrap items-center gap-3 ${
              align === "right"
                ? "xl:justify-end"
                : ""
            }`}
          >
            <span
              className={
                extreme
                  ? "break-words text-2xl font-semibold leading-tight tracking-[-0.025em] text-white sm:text-3xl"
                  : "break-words text-lg font-semibold leading-tight text-white"
              }
            >
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

function CompactPlayer({
  player,
  align,
}: {
  player: RivalryPlayer;
  align: "left" | "right";
}) {
  return (
    <div
      className={`min-w-0 ${
        align === "right"
          ? "text-right"
          : ""
      }`}
    >
      <div className="break-words text-lg font-semibold leading-tight text-white">
        {player.name}
      </div>

      <div
        className={`mt-2 flex flex-wrap gap-2 ${
          align === "right"
            ? "justify-end"
            : ""
        }`}
      >
        {player.claimed ? (
          <SteamLinkedBadge compact />
        ) : (
          <CountTag>
            Replay-built
          </CountTag>
        )}
      </div>
    </div>
  );
}

function CompactRoster({
  players,
  align,
}: {
  players: RivalryPlayer[];
  align: "left" | "right";
}) {
  return (
    <div
      className={`min-w-0 space-y-2 ${
        align === "right"
          ? "md:text-right"
          : ""
      }`}
    >
      {players.map((player) => (
        <div
          key={player.token}
          className="break-words text-sm font-semibold leading-5 text-white"
        >
          {player.name}
        </div>
      ))}
    </div>
  );
}

function RawPlayer({
  player,
  align,
}: {
  player: RivalryPlayer;
  align: "left" | "right";
}) {
  return (
    <div
      className={`min-w-0 ${
        align === "right"
          ? "text-right"
          : ""
      }`}
    >
      <div className="break-words text-sm font-semibold leading-5 text-white">
        {player.name}
      </div>

      {player.claimed ? (
        <div
          className={`mt-2 flex ${
            align === "right"
              ? "justify-end"
              : ""
          }`}
        >
          <SteamLinkedBadge compact />
        </div>
      ) : null}
    </div>
  );
}

function RawRoster({
  players,
  align,
}: {
  players: RivalryPlayer[];
  align: "left" | "right";
}) {
  return (
    <div
      className={`min-w-0 space-y-1.5 ${
        align === "right"
          ? "text-right"
          : ""
      }`}
    >
      {players.map((player) => (
        <div
          key={player.token}
          className="break-words text-xs font-semibold leading-5 text-white"
        >
          {player.name}
        </div>
      ))}
    </div>
  );
}

function SmallScore({
  left,
  right,
  compact = false,
}: {
  left: number;
  right: number;
  compact?: boolean;
}) {
  return (
    <div
      className={
        compact
          ? "rounded-xl border border-white/[0.08] bg-black/25 px-3 py-3 text-center"
          : "rounded-[1.3rem] border border-white/10 bg-slate-950/65 px-4 py-4 text-center"
      }
    >
      <div className="text-[8px] uppercase tracking-[0.25em] text-slate-600">
        Series
      </div>

      <div
        className={
          compact
            ? "mt-2 whitespace-nowrap text-2xl font-semibold text-white"
            : "mt-2 whitespace-nowrap text-3xl font-semibold text-white"
        }
      >
        {left}
        <span className="px-1.5 text-slate-600">
          -
        </span>
        {right}
      </div>
    </div>
  );
}

function LooseSection({
  title,
  eyebrow,
  corner,
  spacious = false,
  dataMode,
  children,
}: {
  title: string;
  eyebrow: string;
  corner?: string;
  spacious?: boolean;
  dataMode?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={
        spacious
          ? "space-y-7 py-2"
          : "space-y-5 py-1"
      }
      data-rivalry-hall-mode={dataMode}
    >
      <div className="flex flex-wrap items-end justify-between gap-4 px-1">
        <div>
          <div className="text-xs uppercase tracking-[0.36em] text-white/38">
            {eyebrow}
          </div>

          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.02em] text-white sm:text-3xl">
            {title}
          </h2>
        </div>

        {corner ? (
          <CountTag>
            {corner}
          </CountTag>
        ) : null}
      </div>

      <div>
        {children}
      </div>
    </section>
  );
}

function Panel({
  title,
  eyebrow,
  corner,
  children,
}: {
  title: string;
  eyebrow: string;
  corner?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[1.8rem] border border-white/10 bg-slate-950/72 p-5 shadow-[0_20px_60px_rgba(2,6,23,0.25)] sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.34em] text-white/40">
            {eyebrow}
          </div>

          <h2 className="mt-2 text-2xl font-semibold text-white">
            {title}
          </h2>
        </div>

        {corner ? (
          <CountTag>
            {corner}
          </CountTag>
        ) : null}
      </div>

      <div className="mt-5">
        {children}
      </div>
    </section>
  );
}

function StatCard({
  label,
  value,
  premium = false,
}: {
  label: string;
  value: string;
  premium?: boolean;
}) {
  return (
    <div
      className={
        premium
          ? "rounded-[1.45rem] border border-white/[0.08] bg-black/20 px-5 py-5"
          : "rounded-[1.3rem] border border-white/10 bg-white/5 px-4 py-4"
      }
    >
      <div className="text-[10px] uppercase tracking-[0.25em] text-slate-500">
        {label}
      </div>

      <div
        className={
          premium
            ? "mt-3 text-3xl font-semibold tracking-[-0.025em] text-white"
            : "mt-2 text-2xl font-semibold text-white"
        }
      >
        {value}
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  premium = false,
}: {
  label: string;
  value: string;
  premium?: boolean;
}) {
  return (
    <div
      className={
        premium
          ? "rounded-[1.35rem] border border-white/[0.075] bg-black/20 px-5 py-4"
          : "rounded-xl border border-white/8 bg-slate-950/60 px-4 py-3"
      }
    >
      <div className="text-[10px] uppercase tracking-[0.23em] text-slate-500">
        {label}
      </div>

      <div
        className={
          premium
            ? "mt-3 break-words text-base font-medium leading-6 text-white"
            : "mt-2 break-words text-sm font-medium leading-6 text-white"
        }
      >
        {value}
      </div>
    </div>
  );
}

function CountTag({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <span className="inline-flex max-w-full items-center rounded-full border border-white/[0.08] bg-white/[0.035] px-3 py-1 text-xs leading-5 text-slate-400">
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
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-5 text-sm text-slate-300">
      {message}
    </div>
  );
}

function groupTeams(
  teams: PublicTeamRivalryEntry[]
) {
  return {
    tag: teams.filter(
      (entry) =>
        entry.format === "2v2"
    ),
    tri: teams.filter(
      (entry) =>
        entry.format === "3v3"
    ),
    war: teams.filter(
      (entry) =>
        entry.format === "4v4"
    ),
  };
}

function rivalryTime(
  value: string | null
) {
  if (!value) {
    return 0;
  }

  const time = new Date(value).getTime();

  return Number.isFinite(time)
    ? time
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
    : "Historic battle";
}
