import Link from "next/link";

import BasicRivalriesView from "@/components/rivalries/BasicRivalriesView";
import RivalriesViewShell from "@/components/rivalries/RivalriesViewShell";
import {
  AdvancedRivalriesView,
  ExtremeRivalriesView,
  type RivalryCollectionTotals,
} from "@/components/rivalries/RivalriesViews";
import { getPrisma } from "@/lib/prisma";
import {
  loadPublicRivalryBoards,
} from "@/lib/publicMatchups";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const RIVALRIES_PER_PAGE = 72;

type RivalriesPageProps = {
  searchParams?: Promise<{ page?: string | string[] }>;
};

function rivalryTime(value: string | null) {
  const parsed = value ? new Date(value).getTime() : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function requestedPageNumber(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(raw || "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function pageHref(page: number) {
  return page <= 1 ? "/rivalries" : `/rivalries?page=${page}`;
}

function RivalryPagination({
  page,
  totalPages,
  totalBoards,
}: {
  page: number;
  totalPages: number;
  totalBoards: number;
}) {
  if (totalPages <= 1) return null;

  const first = (page - 1) * RIVALRIES_PER_PAGE + 1;
  const last = Math.min(totalBoards, page * RIVALRIES_PER_PAGE);

  return (
    <nav
      aria-label="Rivalry pages"
      className="flex flex-wrap items-center justify-between gap-3 rounded-[1.35rem] border border-white/10 bg-slate-950/72 px-4 py-3 text-sm text-slate-300"
    >
      <span>
        Showing {first.toLocaleString()}–{last.toLocaleString()} of{" "}
        {totalBoards.toLocaleString()} rivalry boards
      </span>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Link
            href={pageHref(page - 1)}
            className="rounded-full border border-white/12 px-4 py-2 font-semibold text-white transition hover:border-amber-200/35 hover:text-amber-100"
          >
            Previous
          </Link>
        ) : null}
        <span className="px-2 text-xs uppercase tracking-[0.18em] text-slate-500">
          Page {page} of {totalPages}
        </span>
        {page < totalPages ? (
          <Link
            href={pageHref(page + 1)}
            className="rounded-full bg-amber-300 px-4 py-2 font-semibold text-slate-950 transition hover:bg-amber-200"
          >
            Next
          </Link>
        ) : null}
      </div>
    </nav>
  );
}

export default async function RivalriesPage({ searchParams }: RivalriesPageProps) {
  const prisma = getPrisma();
  const resolvedSearchParams = searchParams ? await searchParams : {};

  const {
    duels,
    teams,
    latestRivalry,
  } = await loadPublicRivalryBoards(
    prisma,
    {
      take: 5000,
      activityTake: 1,
    }
  );

  const totalTeamBattles =
    teams.reduce(
      (sum, entry) =>
        sum + entry.totalMatches,
      0
    );

  const totals: RivalryCollectionTotals = {
    boards: duels.length + teams.length,
    duels: duels.length,
    teams: teams.length,
    established:
      duels.filter((entry) => entry.totalMatches >= 2).length +
      teams.filter((entry) => entry.totalMatches >= 2).length,
    fresh:
      duels.filter((entry) => entry.totalMatches < 2).length +
      teams.filter((entry) => entry.totalMatches < 2).length,
    tagTeams: teams.filter((entry) => entry.format === "2v2").length,
    triTeams: teams.filter((entry) => entry.format === "3v3").length,
    warTeams: teams.filter((entry) => entry.format === "4v4").length,
  };

  const boards = [
    ...duels.map((entry) => ({ kind: "duel" as const, key: `duel:${entry.key}`, entry })),
    ...teams.map((entry) => ({ kind: "team" as const, key: `team:${entry.key}`, entry })),
  ].sort((left, right) => {
    const recency = rivalryTime(right.entry.lastPlayedAt) - rivalryTime(left.entry.lastPlayedAt);
    return recency || right.entry.totalMatches - left.entry.totalMatches || left.key.localeCompare(right.key);
  });

  const totalPages = Math.max(1, Math.ceil(boards.length / RIVALRIES_PER_PAGE));
  const page = Math.min(requestedPageNumber(resolvedSearchParams.page), totalPages);
  const visibleBoards = boards.slice(
    (page - 1) * RIVALRIES_PER_PAGE,
    page * RIVALRIES_PER_PAGE
  );
  const visibleDuels = visibleBoards
    .filter((board) => board.kind === "duel")
    .map((board) => board.entry);
  const visibleTeams = visibleBoards
    .filter((board) => board.kind === "team")
    .map((board) => board.entry);

  const viewProps = {
    duels: visibleDuels,
    teams: visibleTeams,
    latestRivalry,
    totalTeamBattles,
    totals,
  };

  return (
    <div className="space-y-4">
      <RivalryPagination
        page={page}
        totalPages={totalPages}
        totalBoards={totals.boards}
      />
      <RivalriesViewShell
        basicView={<BasicRivalriesView {...viewProps} />}
        advancedView={<AdvancedRivalriesView {...viewProps} />}
        extremeView={<ExtremeRivalriesView {...viewProps} />}
      />
      <RivalryPagination
        page={page}
        totalPages={totalPages}
        totalBoards={totals.boards}
      />
    </div>
  );
}
