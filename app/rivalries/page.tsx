import BasicRivalriesView from "@/components/rivalries/BasicRivalriesView";
import RivalriesViewShell from "@/components/rivalries/RivalriesViewShell";
import {
  AdvancedRivalriesView,
  ExtremeRivalriesView,
} from "@/components/rivalries/RivalriesViews";
import { getPrisma } from "@/lib/prisma";
import {
  loadPublicRivalryBoards,
} from "@/lib/publicMatchups";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function RivalriesPage() {
  const prisma = getPrisma();

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

  const viewProps = {
    duels,
    teams,
    latestRivalry,
    totalTeamBattles,
  };

  return (
    <RivalriesViewShell
      basicView={
        <BasicRivalriesView
          {...viewProps}
        />
      }
      advancedView={
        <AdvancedRivalriesView
          {...viewProps}
        />
      }
      extremeView={
        <ExtremeRivalriesView
          {...viewProps}
        />
      }
    />
  );
}
