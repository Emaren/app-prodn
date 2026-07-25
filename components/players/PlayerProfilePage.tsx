import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";

import CommunityBadgePill from "@/components/contact/CommunityBadgePill";
import PlayerMatchFeedClient from "@/components/players/PlayerMatchFeedClient";
import { PlayerAiDevelopmentConsole, PlayerHeroAiDomBinder } from "@/components/players/PlayerAiFeature";
import SteamLinkedBadge from "@/components/SteamLinkedBadge";
import { formatDurationLabel } from "@/lib/gameStatsView";
import { buildMatchupHref } from "@/lib/publicMatchups";
import { getPrisma } from "@/lib/prisma";
import type {
  PlayerBreakdownRow,
  PlayerBestGame,
  PlayerFormPoint,
  PlayerProfile,
  PlayerProfileViewMode,
  PlayerResourceStats,
} from "@/lib/playerProfile";
import type {
  PlayerNormalizedMetricSummary,
  PlayerNormalizedStats,
} from "@/lib/playerNormalizedStats";

type PlayerProfilePageProps = {
  profile: PlayerProfile;
  viewMode: PlayerProfileViewMode;
};

type PlayerTitleHonor = {
  id: number;
  trophyId: string;
  displayName: string;
  kind: string;
  family: string;
  tier: string;
  status: string;
  imageUrl: string | null;
  holderSince: string | null;
  routeHref: string;
};

function normalizedTitleHolder(value: string | null | undefined) {
  return (value || "").trim().toLowerCase();
}

function trophyRouteHref(trophyId: string) {
  const normalized = trophyId.trim().toLowerCase();
  const map: Record<string, string> = {
    canada_champion_belt: "/champions/nations/canada",
    usa_champion_belt: "/champions/nations/usa",
    mexico_champion_belt: "/champions/nations/mexico",
    uk_champion_belt: "/champions/nations/uk",
    world_champion: "/champions/world",
    chaos_champion: "/champions/chaos",
    womens_champion: "/champions/womens",
    elite_champion_belt: "/champions/elo/elite",
  };
  return map[normalized] || "/champions";
}

async function loadPlayerTitleHonors(profile: PlayerProfile): Promise<PlayerTitleHonor[]> {
  const holderName = normalizedTitleHolder(profile.displayName);
  if (!holderName) return [];

  try {
    const trophies = await getPrisma().trophy.findMany({
      where: {
        status: { in: ["held", "active", "guardian_held"] },
      },
      select: {
        id: true,
        trophyId: true,
        displayName: true,
        kind: true,
        family: true,
        tier: true,
        status: true,
        currentHolderDisplayName: true,
        guardianHolderDisplayName: true,
        nftImageUri: true,
        holderSince: true,
      },
      orderBy: [
        { family: "asc" },
        { tier: "asc" },
        { displayName: "asc" },
      ],
    });

    return trophies
      .filter((trophy) => {
        const currentHolder = normalizedTitleHolder(trophy.currentHolderDisplayName);
        const guardianHolder = normalizedTitleHolder(trophy.guardianHolderDisplayName);
        return currentHolder === holderName || guardianHolder === holderName;
      })
      .map((trophy) => ({
        id: trophy.id,
        trophyId: trophy.trophyId,
        displayName: trophy.displayName,
        kind: trophy.kind,
        family: trophy.family,
        tier: trophy.tier || "title",
        status: trophy.status,
        imageUrl: trophy.nftImageUri || null,
        holderSince: trophy.holderSince?.toISOString() ?? null,
        routeHref: trophyRouteHref(trophy.trophyId),
      }));
  } catch (error) {
    console.error("Failed to load player title honors", error);
    return [];
  }
}

const RESOURCE_LABELS: Array<keyof PlayerResourceStats["totals"]> = ["wood", "food", "gold", "stone"];
const WOLO_LOGO_SRC = "/legacy/wolo-logo-transparent.webp";

function formatWoloClaimAmount(value: number) {
  if (!Number.isFinite(value)) return "0";
  if (Number.isInteger(value)) return String(value);

  return value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}
const RESOURCE_META: Record<keyof PlayerResourceStats["totals"], { label: string; icon: string; accent: string }> = {
  wood: { label: "Wood", icon: "🪵", accent: "from-emerald-400 to-lime-200" },
  food: { label: "Food", icon: "🥩", accent: "from-red-400 to-amber-200" },
  gold: { label: "Gold", icon: "🥇", accent: "from-amber-300 to-yellow-100" },
  stone: { label: "Stone", icon: "🪨", accent: "from-slate-300 to-sky-200" },
};

function PlayerRecordBadge({ profile }: { profile: PlayerProfile }) {
  const recordLabel = `${profile.command.wins} - ${profile.command.losses}`;
  const recordTitle = "Resolved wins - losses";

  return (
    <span
      aria-label={`Player record ${recordLabel}`}
      title={recordTitle}
      className="mb-1 ml-6 inline-flex shrink-0 items-baseline text-xl font-semibold leading-none tracking-[0.056em] text-white/58 sm:mb-1.5 sm:ml-[5%] sm:text-2xl"
    >
      {recordLabel}
    </span>
  );
}

export default async function PlayerProfilePage({ profile, viewMode }: PlayerProfilePageProps) {
  const titleHonors = await loadPlayerTitleHonors(profile);

  if (viewMode === "basic") {
    return <PlayerProfileBasic profile={profile} />;
  }

  if (viewMode === "extreme") {
    return <PlayerProfileExtreme profile={profile} titleHonors={titleHonors} />;
  }

  return <PlayerProfileAdvanced profile={profile} />;
}

function PlayerProfileExtreme({
  profile,
  titleHonors,
}: {
  profile: PlayerProfile;
  titleHonors: PlayerTitleHonor[];
}) {
  const currentStreakTone = profile.command.currentStreakLabel.includes("loss")
    ? "red"
    : profile.command.currentStreakLabel.includes("win")
      ? "emerald"
      : "amber";

  return (
    <main className="w-full overflow-x-hidden py-3 text-white sm:py-5">
      <div className="mx-auto w-full max-w-none space-y-6">
        <ExtremeHero profile={profile} titleHonors={titleHonors} />
        <PlayerProfileTicker items={profile.tickerItems} />

        <section className="grid gap-6 2xl:grid-cols-[minmax(0,1.22fr)_minmax(28rem,0.78fr)]">
          <div className="space-y-6">
            <Panel eyebrow="Command Deck" title="Performance radar" count={`${profile.command.totalMatches} games`}>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <CommandTile label="Win Rate" value={formatPercent(profile.command.winRate)} detail={`${profile.command.wins}W / ${profile.command.losses}L`} tone="emerald" />
                <CommandTile label="Current Streak" value={profile.command.currentStreakLabel} detail={`${profile.command.matchesLast30Days} games in 30d`} tone={currentStreakTone} />
                <CommandTile label={profile.command.bestScore !== null ? "Peak Score" : "Battle Archive"} value={profile.command.bestScore !== null ? formatPeakNumber(profile.command.bestScore) : `${profile.command.totalMatches} games`} detail={profile.command.averageScore !== null ? formatAverageNumber(profile.command.averageScore) : `${profile.command.activeDays} active days`} tone="sky" />
                <CommandTile label={profile.command.bestEapm !== null ? "Peak EAPM" : "Watcher Proof"} value={profile.command.bestEapm !== null ? formatPeakDecimal(profile.command.bestEapm) : `${profile.watcher.watcherBackedMatches} games`} detail={profile.command.averageEapm !== null ? formatAverageDecimal(profile.command.averageEapm) : `${profile.watcher.proofScore}/100 proof`} tone="red" />
              </div>

              <div className="mt-5 grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
                <FormChart points={profile.charts.form} />
                <div className="grid gap-3 sm:grid-cols-3">
                  <MiniStat label="Steam RM" value={formatNumber(profile.steam.rmRating)} />
                  <MiniStat label="Steam DM" value={formatNumber(profile.steam.dmRating)} />
                  <MiniStat label="Active Days" value={String(profile.command.activeDays)} />
                  <MiniStat label="Last 10" value={formatPercent(profile.command.last10WinRate)} />
                  <MiniStat label="Last 30" value={formatPercent(profile.command.last30WinRate)} />
                  <MiniStat label="Unique Rivals" value={String(profile.performance.uniqueOpponents)} />
                </div>
              </div>
            </Panel>

            <section className="grid gap-6">
              <Panel eyebrow="Economy Vault" title="Resource command" count={profile.resources.visibleGames > 0 ? `${profile.resources.visibleGames} tables` : "HD archive"}>
                <ResourceVault resources={profile.resources} />
              </Panel>

              <NormalizedStatsPanel stats={profile.normalizedStats} />

              <Panel eyebrow="Best Games" title="Personal highlight reel" count={String(profile.bestGames.length)}>
                <BestGamesGrid games={profile.bestGames} />
              </Panel>
            </section>

            <section className="grid gap-6 xl:grid-cols-2">
              <Panel eyebrow="Civilizations" title="Civ matrix" count={String(profile.charts.civs.length)}>
                <BreakdownBars rows={profile.charts.civs.slice(0, 7)} accent="amber" />
              </Panel>
              <Panel eyebrow="Maps" title="Battlefield read" count={String(profile.charts.maps.length)}>
                <BreakdownBars rows={profile.charts.maps.slice(0, 7)} accent="sky" />
              </Panel>
            </section>
          </div>

          <div className="space-y-6">
            <Panel eyebrow="Match Feed" title="Replay archive" count={`${profile.matchFeed.totalMatches} total`}>
              <PlayerMatchFeedClient
                identity={profile.identity}
                initialItems={profile.matchFeed.items}
                initialNextCursor={profile.matchFeed.nextCursor}
                totalMatches={profile.matchFeed.totalMatches}
                accent={profile.identity.kind === "replay" ? "rose" : "amber"}
              />
            </Panel>

            <Panel eyebrow="Watcher Proof" title="Coverage stack" count={`${profile.watcher.proofScore}/100`}>
              <WatcherRail profile={profile} />
            </Panel>

            <Panel eyebrow="AI War Room" title="Scribe / Grimer readout" count="coach">
              <AiRail profile={profile} />
            </Panel>

            <Panel eyebrow="$WOLO" title="Earnings rail" count={`${profile.wolo.totalFlexWolo} WOLO`}>
              <WoloRail profile={profile} />
            </Panel>

            <Panel eyebrow="Rivalries" title="Pressure list" count={String(profile.rivalries.length)}>
              <RivalryList profile={profile} />
            </Panel>
          </div>
        </section>
      </div>
    </main>
  );
}

function PlayerProfileAdvanced({ profile }: { profile: PlayerProfile }) {
  const currentStreakTone = profile.command.currentStreakLabel.includes("loss")
    ? "red"
    : profile.command.currentStreakLabel.includes("win")
      ? "emerald"
      : "amber";

  return (
    <main className="space-y-5 py-5 text-white sm:space-y-6 sm:py-6">
      <AdvancedHero profile={profile} />
      <PlayerProfileTicker items={profile.tickerItems} />

      <section className="grid gap-5 xl:grid-cols-[1.12fr_0.88fr]">
        <div className="space-y-5">
          <Panel eyebrow="Command Deck" title="Performance radar" count={`${profile.command.totalMatches} games`}>
            <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
              <CommandTile label="Win Rate" value={formatPercent(profile.command.winRate)} detail={`${profile.command.wins}W / ${profile.command.losses}L`} tone="emerald" />
              <CommandTile label="Current Streak" value={profile.command.currentStreakLabel} detail={`${profile.command.matchesLast30Days} games in 30d`} tone={currentStreakTone} />
              <CommandTile label={profile.command.bestScore !== null ? "Peak Score" : "Battle Archive"} value={profile.command.bestScore !== null ? formatPeakNumber(profile.command.bestScore) : `${profile.command.totalMatches} games`} detail={profile.command.averageScore !== null ? formatAverageNumber(profile.command.averageScore) : `${profile.command.activeDays} active days`} tone="sky" />
              <CommandTile label={profile.command.bestEapm !== null ? "Peak EAPM" : "Watcher Proof"} value={profile.command.bestEapm !== null ? formatPeakDecimal(profile.command.bestEapm) : `${profile.watcher.watcherBackedMatches} games`} detail={profile.command.averageEapm !== null ? formatAverageDecimal(profile.command.averageEapm) : `${profile.watcher.proofScore}/100 proof`} tone="red" />
            </div>

            <div className="mt-5 grid gap-4 2xl:grid-cols-[0.95fr_1.05fr]">
              <FormChart points={profile.charts.form} />
              <div className="grid gap-3 sm:grid-cols-3">
                <MiniStat label="Steam RM" value={formatNumber(profile.steam.rmRating)} />
                <MiniStat label="Steam DM" value={formatNumber(profile.steam.dmRating)} />
                <MiniStat label="Active Days" value={String(profile.command.activeDays)} />
                <MiniStat label="Last 10" value={formatPercent(profile.command.last10WinRate)} />
                <MiniStat label="Last 30" value={formatPercent(profile.command.last30WinRate)} />
                <MiniStat label="Unique Rivals" value={String(profile.performance.uniqueOpponents)} />
              </div>
            </div>
          </Panel>

          <Panel eyebrow="Economy Vault" title="Resource command" count={profile.resources.visibleGames > 0 ? `${profile.resources.visibleGames} tables` : "HD archive"}>
            <ResourceVault resources={profile.resources} />
          </Panel>

          <NormalizedStatsPanel stats={profile.normalizedStats} />

          <section className="grid gap-5 lg:grid-cols-2">
            <Panel eyebrow="Civilizations" title="Civ matrix" count={String(profile.charts.civs.length)}>
              <BreakdownBars rows={profile.charts.civs.slice(0, 7)} accent="amber" />
            </Panel>

            <Panel eyebrow="Maps" title="Battlefield read" count={String(profile.charts.maps.length)}>
              <BreakdownBars rows={profile.charts.maps.slice(0, 7)} accent="sky" />
            </Panel>
          </section>

          <Panel eyebrow="Best Games" title="Personal highlight reel" count={String(profile.bestGames.length)}>
            <BestGamesGrid games={profile.bestGames} />
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel eyebrow="Match Feed" title="Replay archive" count={`${profile.matchFeed.totalMatches} total`}>
            <PlayerMatchFeedClient
              identity={profile.identity}
              initialItems={profile.matchFeed.items}
              initialNextCursor={profile.matchFeed.nextCursor}
              totalMatches={profile.matchFeed.totalMatches}
              accent={profile.identity.kind === "replay" ? "rose" : "amber"}
            />
          </Panel>

          <Panel eyebrow="Watcher Proof" title="Coverage stack" count={`${profile.watcher.proofScore}/100`}>
            <WatcherRail profile={profile} />
          </Panel>

          <Panel eyebrow="AI War Room" title="Scribe / Grimer readout" count="coach">
            <AiRail profile={profile} />
          </Panel>

          <Panel eyebrow="$WOLO" title="Earnings rail" count={`${profile.wolo.totalFlexWolo} WOLO`}>
            <WoloRail profile={profile} />
          </Panel>

          <Panel eyebrow="Rivalries" title="Pressure list" count={String(profile.rivalries.length)}>
            <RivalryList profile={profile} />
          </Panel>

          <Panel eyebrow="Stream" title="Broadcast signal" count={profile.stream.twitchUrl ? "linked" : "open"}>
            <StreamRail profile={profile} />
          </Panel>
        </div>
      </section>
    </main>
  );
}

function PlayerProfileBasic({ profile }: { profile: PlayerProfile }) {
  if (!profile.isClaimed) {
    return <ReplayClassicBasicProfile profile={profile} />;
  }

  return <ClaimedBasicProfile profile={profile} />;
}

function ClaimedBasicProfile({ profile }: { profile: PlayerProfile }) {
  return (
    <main className="space-y-6 py-6 text-white">
      <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.18),_transparent_32%),linear-gradient(135deg,_#0f172a,_#111827_58%,_#020617)] p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-4">
            <div className="text-xs uppercase tracking-[0.35em] text-amber-200/70">
              {profile.isClaimed ? "Public Warrior Page" : "Replay-Built Warrior Page"}
            </div>
            <div className="flex min-w-0 flex-wrap items-end gap-x-3 gap-y-2">
              <h1 className="text-4xl font-semibold text-white sm:text-5xl">
                {profile.displayName}
              </h1>
              <PlayerRecordBadge profile={profile} />
            </div>
            <div className="flex flex-wrap gap-2">
              {profile.verificationLevel > 0 ? <SteamLinkedBadge compact /> : null}
              <Tag>{profile.isVerified ? "Replay verified" : profile.isClaimed ? "Claimed profile" : "Unclaimed identity"}</Tag>
              <Tag>{profile.command.totalMatches} parsed matches</Tag>
              {profile.isLive ? <Tag>online now</Tag> : null}
              {profile.wolo.pendingClaimCount > 0 ? <Tag>{formatWoloClaimAmount(profile.wolo.pendingClaimWolo)} WOLO unclaimed</Tag> : null}
              {profile.community.badges.map((badge) => (
                <CommunityBadgePill key={badge.id} label={badge.label} />
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <ViewToggle profile={profile} active="basic" />
            {profile.claimHref ? (
              <Link href={profile.claimHref} className="rounded-full bg-rose-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-rose-200">
                Claim This Identity
              </Link>
            ) : null}
            <Link href="/players" className="rounded-full border border-white/15 px-5 py-3 text-sm text-white/85 transition hover:border-white/30 hover:text-white">
              Browse Players
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.88fr_1.12fr]">
        <div className="space-y-6">
          <Panel eyebrow="Stats" title="Performance snapshot">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <MetricCard label="Steam RM" value={formatNumber(profile.steam.rmRating)} />
              <MetricCard label="Steam DM" value={formatNumber(profile.steam.dmRating)} />
              <MetricCard label="Win Rate" value={formatPercent(profile.command.winRate)} />
              <MetricCard label="Rated Matches" value={String(profile.performance.ratedMatches)} />
              {profile.performance.averageDurationSeconds ? <MetricCard label="Avg Game Length" value={formatDurationLabel(profile.performance.averageDurationSeconds)} /> : null}
              {profile.performance.longestDurationSeconds ? <MetricCard label="Longest Game" value={formatDurationLabel(profile.performance.longestDurationSeconds)} /> : null}
              <MetricCard label="Unique Opponents" value={String(profile.performance.uniqueOpponents)} />
              <MetricCard label="Civilizations" value={String(profile.performance.civilizationsPlayed)} />
              {profile.performance.mostPlayedMap ? (
                <MetricCard label="Most Played Map" value={profile.performance.mostPlayedMap} />
              ) : null}
            </div>
          </Panel>

          <NormalizedStatsPanel stats={profile.normalizedStats} />

          <Panel eyebrow="Profile" title="Identity">
            <dl className="grid gap-4">
              <StatRow label="Public Name" value={profile.displayName} />
              <StatRow label="Steam Persona" value={profile.steam.personaName || "Not linked"} />
              <StatRow label="Steam ID" value={profile.steam.steamId || "Not linked"} />
              <StatRow label="Verification" value={`level ${profile.verificationLevel} · ${profile.verificationMethod}`} />
              <StatRow
                label="Known Aliases"
                value={
                  profile.aliases.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {profile.aliases.map((alias) => (
                        <Tag key={alias}>{alias}</Tag>
                      ))}
                    </div>
                  ) : (
                    "None yet"
                  )
                }
              />
            </dl>
          </Panel>

          <Panel eyebrow="Rivalries" title="Top head-to-heads">
            <RivalryList profile={profile} compact />
          </Panel>
        </div>

        <Panel eyebrow="Match Feed" title="Recent replay-backed matches" count={`${profile.matchFeed.totalMatches} total`}>
          <PlayerMatchFeedClient
            identity={profile.identity}
            initialItems={profile.matchFeed.items}
            initialNextCursor={profile.matchFeed.nextCursor}
            totalMatches={profile.matchFeed.totalMatches}
            accent={profile.identity.kind === "replay" ? "rose" : "amber"}
          />
        </Panel>
      </section>
    </main>
  );
}

function ReplayClassicBasicProfile({ profile }: { profile: PlayerProfile }) {
  const wins = profile.command.wins;
  const losses = profile.command.losses;
  const pendingClaimAmount = profile.currentPlayer.pendingWoloClaimAmount || profile.wolo.pendingClaimWolo;
  const pendingClaimCount = profile.currentPlayer.pendingWoloClaimCount || profile.wolo.pendingClaimCount;

  return (
    <main className="space-y-6 py-6 text-white">
      <ViewToggleRail profile={profile} active="basic" />

      <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(248,113,113,0.18),_transparent_32%),linear-gradient(135deg,_#0f172a,_#111827_58%,_#020617)] p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-4">
            <div className="text-xs uppercase tracking-[0.35em] text-rose-200/70">Replay-Built Warrior Page</div>
            <div className="flex min-w-0 flex-wrap items-end gap-x-3 gap-y-2">
              <h1 className="text-4xl font-semibold text-white sm:text-5xl">
                {profile.displayName}
              </h1>
              <PlayerRecordBadge profile={profile} />
            </div>
            <p className="max-w-3xl text-base leading-7 text-slate-300 sm:text-lg">
              This public page was created automatically from parsed AoE2HD replays. If this is
              you, sign in with Steam, claim the name, and start building a verified tournament and
              betting identity.
            </p>
            <div className="flex flex-wrap gap-2">
              <Tag>unclaimed identity</Tag>
              <Tag>{profile.command.totalMatches} parsed matches</Tag>
              {pendingClaimCount > 0 ? <Tag>{formatWoloClaimAmount(pendingClaimAmount)} WOLO unclaimed</Tag> : null}
              {wins > 0 ? <Tag>{wins} wins</Tag> : null}
              {losses > 0 ? <Tag>{losses} losses</Tag> : null}
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            {profile.claimHref ? (
              <Link
                href={profile.claimHref}
                className="rounded-full bg-rose-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-rose-200"
              >
                Claim This Identity
              </Link>
            ) : null}
            <Link
              href="/players"
              className="rounded-full border border-white/15 px-5 py-3 text-sm text-white/85 transition hover:border-white/30 hover:text-white"
            >
              Browse Players
            </Link>
            <Link
              href="/game-stats"
              className="rounded-full border border-white/15 px-5 py-3 text-sm text-white/85 transition hover:border-white/30 hover:text-white"
            >
              Back To Parser Lab
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <section className="space-y-6">
          <section className="rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-6">
            {pendingClaimCount > 0 ? (
              <div className="mb-5 rounded-2xl border border-amber-300/20 bg-amber-400/10 px-4 py-4 text-sm leading-6 text-amber-100">
                {formatWoloClaimAmount(pendingClaimAmount)} WOLO is still waiting in the claim ledger for this replay-built warrior page.
              </div>
            ) : null}
            <div className="text-xs uppercase tracking-[0.35em] text-white/45">Stats</div>
            <h2 className="mt-2 text-2xl font-semibold text-white">Performance Snapshot</h2>

            <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <MetricCard label="Steam RM" value={formatRatingMetric(profile.performance.steamRating)} />
              <MetricCard label="Steam DM" value={formatRatingMetric(profile.performance.ladderRating)} />
              <MetricCard label="Win Rate" value={formatPercent(profile.performance.winRate)} />
              <MetricCard label="Rated Matches" value={String(profile.performance.ratedMatches)} />
              {profile.performance.averageDurationSeconds ? <MetricCard label="Avg Game Length" value={formatDurationLabel(profile.performance.averageDurationSeconds)} /> : null}
              {profile.performance.longestDurationSeconds ? <MetricCard label="Longest Game" value={formatDurationLabel(profile.performance.longestDurationSeconds)} /> : null}
              {profile.performance.shortestDurationSeconds ? <MetricCard label="Shortest Game" value={formatDurationLabel(profile.performance.shortestDurationSeconds)} /> : null}
              <MetricCard label="Unique Opponents" value={String(profile.performance.uniqueOpponents)} />
              <MetricCard label="Civilizations Played" value={String(profile.performance.civilizationsPlayed)} />
              {profile.performance.mostPlayedMap ? (
                <MetricCard label="Most Played Map" value={profile.performance.mostPlayedMap} />
              ) : null}
            </div>
            {profile.performance.ratingLastSeenAt ? (
              <div className="mt-4 text-xs text-slate-400">
                Official rating last seen {new Date(profile.performance.ratingLastSeenAt).toLocaleString()}
              </div>
            ) : null}
          </section>

          <NormalizedStatsPanel stats={profile.normalizedStats} />

          <section className="rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-6">
            <div className="text-xs uppercase tracking-[0.35em] text-white/45">Why Claim It</div>
            <h2 className="mt-2 text-2xl font-semibold text-white">Turn replay sightings into a real profile</h2>

            <div className="mt-5 space-y-4 text-sm leading-6 text-slate-300">
              <p>
                Right now this page only knows what the parser saw in replay files. Claiming it lets
                you link Steam, join tournaments, chat in the lobby, mint a watcher key, and turn this
                into a verified player identity.
              </p>
              <div className="rounded-2xl border border-white/8 bg-white/5 px-4 py-4">
                <div className="text-sm font-medium text-white">Claim flow</div>
                <ol className="mt-3 space-y-2 text-slate-300">
                  <li>1. Sign in with Steam.</li>
                  <li>2. Save this in-game name on your profile.</li>
                  <li>3. Upload one replay with your watcher key to verify it.</li>
                </ol>
              </div>
            </div>
          </section>

          <section className="rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.35em] text-white/45">Rivalries</div>
                <h2 className="mt-2 text-2xl font-semibold text-white">Top Head-To-Heads</h2>
              </div>
              <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
                {profile.rivalries.length} rivals
              </div>
            </div>

            <ClassicRivalries profile={profile} />
          </section>
        </section>

        <section className="rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.35em] text-white/45">Match Feed</div>
              <h2 className="mt-2 text-2xl font-semibold text-white">Recent Parsed Matches</h2>
            </div>
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
              {profile.matchFeed.totalMatches} total
            </div>
          </div>

          <div className="mt-5">
            <PlayerMatchFeedClient
              identity={profile.identity}
              initialItems={profile.matchFeed.items}
              initialNextCursor={profile.matchFeed.nextCursor}
              totalMatches={profile.matchFeed.totalMatches}
              accent="rose"
              variant="classic"
            />
          </div>
        </section>
      </section>
    </main>
  );
}

function ExtremeHero({
  profile,
  titleHonors,
}: {
  profile: PlayerProfile;
  titleHonors: PlayerTitleHonor[];
}) {
  const profileLabel = profile.isClaimed ? "Verified player command center" : "Claimable player command center";

  return (
    <section className="relative overflow-hidden rounded-[2.25rem] bg-[radial-gradient(circle_at_20%_0%,rgba(250,204,21,0.16),transparent_30%),radial-gradient(circle_at_82%_12%,rgba(56,189,248,0.13),transparent_30%),linear-gradient(135deg,rgba(15,23,42,0.98),rgba(7,17,31,0.96)_55%,rgba(2,6,23,0.98))] p-5 shadow-[0_30px_90px_rgba(2,6,23,0.30)] ring-1 ring-white/[0.04] sm:p-6 lg:p-7">
      <div className="grid gap-7 xl:grid-cols-[minmax(0,1.18fr)_minmax(28rem,0.82fr)] xl:items-stretch">
        <div className="relative z-10 flex min-h-[18rem] flex-col justify-between gap-6">
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-amber-300/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-100/90 ring-1 ring-amber-200/12">
                Extreme
              </span>
              <span className="rounded-full bg-white/[0.02] px-3 py-1 text-xs text-slate-300/88 ring-1 ring-white/6 backdrop-blur-sm">
                {profileLabel}
              </span>

              {profile.isLive ? (
                <span className="rounded-full bg-emerald-400/8 px-3 py-1 text-xs text-emerald-100/90 ring-1 ring-emerald-200/12">
                  Online now
                </span>
              ) : null}
            </div>

            <div>
              <div className="text-xs uppercase tracking-[0.42em] text-amber-200/70">AoE2HD Gamer Profile</div>
              <div className="mt-3 flex min-w-0 flex-wrap items-end gap-x-3 gap-y-2">
                <h1 className="max-w-5xl text-5xl font-semibold leading-[0.92] tracking-[-0.045em] text-white sm:text-6xl lg:text-7xl">
                  {profile.displayName}
                </h1>
                <PlayerRecordBadge profile={profile} />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <HeroStat label="Games" value={String(profile.command.totalMatches)} />
              <HeroStat label="Win Rate" value={formatPercent(profile.command.winRate)} />
              <HeroStat
                label={profile.wolo.pendingClaimWolo > 0 ? "Claimable WOLO" : "WOLO Flex"}
                value={formatWolo(profile.wolo.pendingClaimWolo > 0 ? profile.wolo.pendingClaimWolo : profile.wolo.totalFlexWolo)}
              />
              <HeroStat label="Proof" value={`${profile.watcher.proofScore}/100`} />
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <ViewToggle profile={profile} active="extreme" />
              {profile.claimHref ? (
                <Link href={profile.claimHref} className="rounded-full bg-rose-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-rose-200">
                  Claim This Page
                </Link>
              ) : (
                <Link href="/profile" className="rounded-full border border-amber-100/18 bg-[linear-gradient(135deg,rgba(248,214,84,0.98)_0%,rgba(232,181,49,0.98)_100%)] px-5 py-3 text-sm font-semibold text-slate-950 shadow-none transition duration-200 hover:bg-amber-300/95 hover:brightness-[1.01]">Open My Profile</Link>
              )}
              <Link href="/players" className="rounded-full border border-white/12 bg-white/[0.025] px-5 py-3 text-sm text-white/82 transition hover:border-white/24 hover:text-white">
                Browse Players
              </Link>
            </div>

            <TitleHonorRail honors={titleHonors} />
          </div>
        </div>

        <div className="relative z-0 grid gap-3 sm:grid-cols-2 xl:pt-8">
          <HeroSignal
            label="Watcher Proof"
            value={`${profile.watcher.watcherBackedMatches} games`}
            detail={
              profile.watcher.multiWatcherProofGames > 0
                ? `${profile.watcher.multiWatcherProofGames} dual proof${profile.watcher.multiWatcherProofGames === 1 ? "" : "s"} · ${profile.watcher.bestMultiWatcherProofLabel ?? "2+ watchers"}`
                : `${profile.watcher.uniqueWatchers || profile.watcher.watcherKeys} account source${(profile.watcher.uniqueWatchers || profile.watcher.watcherKeys) === 1 ? "" : "s"}`
            }
            tone="emerald"
          />
          <HeroSignal label="Steam" value={profile.steam.rmRating ? String(profile.steam.rmRating) : "Linked"} detail={profile.steam.personaName || "rating feed"} tone="sky" />
          <HeroSignal label="Favorite Map" value={profile.command.favoriteMap || "HD Battlefield"} detail={profile.command.mostPlayedCivilization || "Civilization archive"} tone="amber" />
          <HeroSignal label="Stream" value={profile.stream.twitchChannel || "Ready"} detail={profile.stream.twitchUrl ? "Twitch rail linked" : "Add Twitch in profile"} tone="rose" />
        </div>
      </div>
    </section>
  );
}


function TitleHonorRail({ honors }: { honors: PlayerTitleHonor[] }) {
  if (honors.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-amber-100/38">Title honors</div>
      {honors.map((honor) => (
        <Link
          key={honor.id}
          href={honor.routeHref}
          className="group inline-flex min-w-0 items-center gap-3 rounded-full bg-white/[0.018] px-3 py-1.5 text-xs text-slate-200/82 ring-1 ring-white/[0.045] transition hover:bg-white/[0.035] hover:ring-amber-100/12"
        >
          {honor.imageUrl ? (
            <span className="relative h-6 w-11 shrink-0">
              <Image
                src={honor.imageUrl}
                alt=""
                fill
                sizes="44px"
                className="object-contain opacity-90 transition group-hover:opacity-100"
              />
            </span>
          ) : (
            <span className="h-1.5 w-1.5 rounded-full bg-amber-200/70 shadow-[0_0_14px_rgba(251,191,36,0.45)]" />
          )}
          <span className="truncate font-semibold text-white/72">{honor.displayName}</span>
          <span className="hidden text-[10px] uppercase tracking-[0.2em] text-amber-100/30 sm:inline">{honor.tier}</span>
        </Link>
      ))}
    </div>
  );
}

function AdvancedHero({ profile }: { profile: PlayerProfile }) {
  const profileLabel = profile.isClaimed ? "Verified player command center" : "Claimable player command center";

  return (
    <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_18%_0%,rgba(250,204,21,0.22),transparent_30%),radial-gradient(circle_at_90%_18%,rgba(56,189,248,0.14),transparent_28%),linear-gradient(135deg,#0f172a,#07111f_56%,#020617)] p-5 shadow-[0_32px_90px_rgba(2,6,23,0.34)] sm:p-7">
      <div className="grid gap-6 lg:grid-cols-[1.08fr_0.92fr] lg:items-stretch">
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-amber-200/20 bg-amber-300/10 px-3 py-1 text-xs uppercase tracking-[0.24em] text-amber-100">
              Advanced
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
              {profileLabel}
            </span>
            {profile.isLive ? (
              <span className="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-100">
                Online now
              </span>
            ) : null}
          </div>

          <div>
            <div className="text-xs uppercase tracking-[0.42em] text-amber-200/70">AoE2HD Gamer Profile</div>
            <div className="mt-3 flex min-w-0 flex-wrap items-end gap-x-3 gap-y-2">
            <h1 className="max-w-4xl text-4xl font-semibold leading-[0.96] text-white sm:text-6xl">
              {profile.displayName}
            </h1>
            <PlayerRecordBadge profile={profile} />
          </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <HeroStat label="Games" value={String(profile.command.totalMatches)} />
            <HeroStat label="Win Rate" value={formatPercent(profile.command.winRate)} />
            <HeroStat
                label={profile.wolo.pendingClaimWolo > 0 ? "Claimable WOLO" : "WOLO Flex"}
                value={formatWolo(profile.wolo.pendingClaimWolo > 0 ? profile.wolo.pendingClaimWolo : profile.wolo.totalFlexWolo)}
              />
            <HeroStat label="Proof" value={`${profile.watcher.proofScore}/100`} />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <ViewToggle profile={profile} active="advanced" />
            {profile.claimHref ? (
              <Link href={profile.claimHref} className="rounded-full bg-rose-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-rose-200">
                Claim This Page
              </Link>
            ) : (
              <Link href="/profile" className="rounded-full border border-amber-100/18 bg-[linear-gradient(135deg,rgba(248,214,84,0.98)_0%,rgba(232,181,49,0.98)_100%)] px-5 py-3 text-sm font-semibold text-slate-950 shadow-none transition duration-200 hover:bg-amber-300/95 hover:brightness-[1.01]">Open My Profile</Link>
            )}
            <Link href="/players" className="rounded-full border border-white/15 px-5 py-3 text-sm text-white/85 transition hover:border-white/30 hover:text-white">
              Browse Players
            </Link>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <HeroSignal
            label="Watcher Proof"
            value={`${profile.watcher.watcherBackedMatches} games`}
            detail={
              profile.watcher.multiWatcherProofGames > 0
                ? `${profile.watcher.multiWatcherProofGames} dual proof${profile.watcher.multiWatcherProofGames === 1 ? "" : "s"} · ${profile.watcher.bestMultiWatcherProofLabel ?? "2+ watchers"}`
                : `${profile.watcher.uniqueWatchers || profile.watcher.watcherKeys} account source${(profile.watcher.uniqueWatchers || profile.watcher.watcherKeys) === 1 ? "" : "s"}`
            }
            tone="emerald"
          />
          <HeroSignal label="Steam" value={profile.steam.rmRating ? String(profile.steam.rmRating) : "Linked"} detail={profile.steam.personaName || "rating feed"} tone="sky" />
          <HeroSignal label="Favorite Map" value={profile.command.favoriteMap || "HD Battlefield"} detail={profile.command.mostPlayedCivilization || "Civilization archive"} tone="amber" />
          <HeroSignal label="Stream" value={profile.stream.twitchChannel || "Ready"} detail={profile.stream.twitchUrl ? "Twitch rail linked" : "Add Twitch in profile"} tone="rose" />
        </div>
      </div>
    </section>
  );
}

function PlayerProfileTicker({ items }: { items: string[] }) {
  const loopItems = items.length > 0 ? [...items, ...items] : ["Player command center online", "Replay archive ready"];

  return (
    <section className="overflow-hidden rounded-full border border-white/10 bg-slate-950/70 px-4 py-2.5 shadow-[0_18px_50px_rgba(2,6,23,0.22)]" aria-label="Player ticker">
      <style>{`
        @keyframes playerProfileTickerScroll {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        .player-profile-ticker-track {
          animation: playerProfileTickerScroll 36s linear infinite;
        }
        .player-profile-ticker-track:hover {
          animation-play-state: paused;
        }
        @media (prefers-reduced-motion: reduce) {
          .player-profile-ticker-track {
            animation: none;
          }
        }
      `}</style>
      <div className="flex min-w-0 items-center gap-3 whitespace-nowrap text-[12px] leading-none">
        <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-300 shadow-[0_0_16px_rgba(110,231,183,0.7)]" />
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.28em] text-amber-200">Live Profile</span>
        <div className="relative min-w-0 flex-1 overflow-hidden text-slate-100">
          <div className="player-profile-ticker-track flex w-max items-center gap-8 pr-8" aria-hidden="true">
            {loopItems.map((item, index) => (
              <span key={`${item}-${index}`} className="inline-flex items-center gap-3">
                <span className="font-semibold text-white">{item}</span>
                <span className="h-1 w-1 rounded-full bg-white/28" />
              </span>
            ))}
          </div>
          <span className="sr-only">{items.join(" · ")}</span>
        </div>
      </div>
    </section>
  );
}

function defaultViewMode(profile: PlayerProfile): PlayerProfileViewMode {
  return profile.isClaimed ? "extreme" : "basic";
}

function playerProfileViewHref(profile: PlayerProfile, mode: PlayerProfileViewMode) {
  if (mode === defaultViewMode(profile)) return profile.href;
  return `${profile.href}?view=${mode}`;
}

function ViewToggleRail({ profile, active }: { profile: PlayerProfile; active: PlayerProfileViewMode }) {
  return (
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-[1.35rem] border border-white/10 bg-slate-950/58 px-4 py-3 shadow-[0_18px_50px_rgba(2,6,23,0.18)]">
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-[0.3em] text-white/45">Profile Display</div>
        <div className="mt-1 text-sm text-slate-300">
          {profile.isClaimed ? "Claimed profiles open on Extreme." : "Replay-built profiles open on Basic."}
        </div>
      </div>
      <ViewToggle profile={profile} active={active} />
    </section>
  );
}

function ViewToggle({ profile, active }: { profile: PlayerProfile; active: PlayerProfileViewMode }) {
  const modes: PlayerProfileViewMode[] = profile.isClaimed
    ? ["basic", "advanced", "extreme"]
    : ["basic", "advanced"];

  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-white/8 bg-slate-950/28 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
      {modes.map((mode) => {
        const selected = active === mode;
        return (
          <Link
            key={mode}
            href={playerProfileViewHref(profile, mode)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold capitalize transition ${
              selected
                ? "bg-amber-200/12 text-amber-100 shadow-[inset_0_0_0_1px_rgba(253,230,138,0.14)]"
                : "text-slate-400 hover:bg-white/[0.045] hover:text-slate-100"
            }`}
          >
            {mode}
          </Link>
        );
      })}
    </div>
  );
}


function Panel({
  eyebrow,
  title,
  count,
  children,
}: {
  eyebrow: string;
  title: string;
  count?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[1.55rem] border border-white/10 bg-slate-950/72 p-5 shadow-[0_24px_70px_rgba(2,6,23,0.22)] sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.35em] text-white/45">{eyebrow}</div>
          <h2 className="mt-2 text-2xl font-semibold text-white">{title}</h2>
        </div>
        {count ? (
          <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
            {count}
          </div>
        ) : null}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.25rem] border border-white/10 bg-white/6 px-4 py-4">
      <div className="text-[11px] uppercase tracking-[0.24em] text-slate-400">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
    </div>
  );
}

function HeroSignal({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: "emerald" | "sky" | "amber" | "rose";
}) {
  const toneClass =
    tone === "emerald"
      ? "border-emerald-300/18 bg-emerald-400/10"
      : tone === "sky"
        ? "border-sky-300/18 bg-sky-400/10"
        : tone === "rose"
          ? "border-rose-300/18 bg-rose-400/10"
          : "border-amber-300/18 bg-amber-400/10";

  return (
    <div className={`rounded-[1.35rem] border px-4 py-4 ${toneClass}`}>
      <div className="text-[11px] uppercase tracking-[0.24em] text-slate-300/75">{label}</div>
      <div className="mt-3 break-words text-2xl font-semibold text-white">{value}</div>
      <div className="mt-2 text-sm text-slate-300">{detail}</div>
    </div>
  );
}

function CommandTile({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: "emerald" | "amber" | "sky" | "red";
}) {
  const toneClass =
    tone === "emerald"
      ? "border-emerald-500/34 bg-[radial-gradient(circle_at_25%_0%,rgba(16,185,129,0.24),transparent_42%),linear-gradient(180deg,rgba(6,78,59,0.42),rgba(15,23,42,0.6))] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
      : tone === "sky"
        ? "border-sky-400/24 bg-[radial-gradient(circle_at_25%_0%,rgba(14,165,233,0.18),transparent_42%),linear-gradient(180deg,rgba(12,74,110,0.26),rgba(15,23,42,0.6))]"
        : tone === "red"
          ? "border-red-500/34 bg-[radial-gradient(circle_at_25%_0%,rgba(220,38,38,0.24),transparent_42%),linear-gradient(180deg,rgba(127,29,29,0.42),rgba(15,23,42,0.64))] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
          : "border-amber-400/26 bg-[radial-gradient(circle_at_25%_0%,rgba(245,158,11,0.18),transparent_42%),linear-gradient(180deg,rgba(120,53,15,0.28),rgba(15,23,42,0.6))]";

  return (
    <div className={`min-h-[9.5rem] min-w-0 rounded-[1.35rem] border px-5 py-5 ${toneClass}`}>
      <div className="text-[11px] uppercase tracking-[0.24em] text-slate-400">{label}</div>
      <div className="mt-4 text-2xl font-semibold leading-tight text-white">{value}</div>
      <div className="mt-2 text-sm text-slate-300">{detail}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1rem] border border-white/8 bg-white/5 px-4 py-3">
      <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">{label}</div>
      <div className="mt-2 text-lg font-semibold text-white">{value}</div>
    </div>
  );
}

function FormChart({ points }: { points: PlayerFormPoint[] }) {
  return (
    <div className="rounded-[1.35rem] border border-white/8 bg-white/5 p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Last 12 form</div>
        <div className="text-xs text-slate-400">oldest to newest</div>
      </div>
      <div className="mt-5">
        {points.length === 0 ? (
          <div className="rounded-2xl border border-white/8 bg-slate-950/35 px-4 py-8 text-sm text-slate-400">
            Form chart wakes up after the first parsed match.
          </div>
        ) : (
          <div className="grid h-36 grid-cols-12 items-end gap-1 sm:gap-2">
            {points.map((point) => {
              const height = point.result === "win" ? "h-28" : point.result === "loss" ? "h-14" : "h-8";
              const color =
                point.result === "win"
                  ? "bg-emerald-500 shadow-[0_0_18px_rgba(16,185,129,0.24)]"
                  : point.result === "loss"
                    ? "bg-red-500 shadow-[0_0_18px_rgba(239,68,68,0.22)]"
                    : "bg-slate-500";
              return (
                <Link
                  key={point.gameId}
                  href={`/game-stats/${point.gameId}`}
                  className="group flex h-full min-w-0 flex-col justify-end gap-2 rounded-lg px-0.5 pb-1 transition hover:bg-white/5"
                  aria-label={`${point.label} ${point.result}`}
                >
                  <div className="flex h-28 w-full items-end">
                    <div className={`mx-auto w-full max-w-7 rounded-t-[0.6rem] ${height} ${color} opacity-85 transition group-hover:opacity-100 sm:max-w-8`} />
                  </div>
                  <div className="w-full text-center text-[9px] leading-none text-slate-500 sm:text-[10px]">{point.label}</div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function normalizedMetricLabel(metric: PlayerNormalizedMetricSummary) {
  const withoutGroup = metric.metricKey.startsWith(
    `${metric.metricGroup}.`
  )
    ? metric.metricKey.slice(metric.metricGroup.length + 1)
    : metric.metricKey;
  return withoutGroup
    .replaceAll(".", " · ")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatNormalizedMetricValue(
  value: number,
  unit: string
) {
  if (!Number.isFinite(value)) return "—";
  if (unit === "seconds") {
    return formatDurationLabel(Math.max(0, Math.round(value)));
  }
  if (unit === "milliseconds") {
    return formatDurationLabel(Math.max(0, Math.round(value / 1000)));
  }
  if (unit === "percent") {
    return `${value.toLocaleString(undefined, {
      maximumFractionDigits: 1,
    })}%`;
  }
  return value.toLocaleString(undefined, {
    maximumFractionDigits:
      Number.isInteger(value) ? 0 : 1,
  });
}

function normalizedMetricHeadline(metric: PlayerNormalizedMetricSummary) {
  if (metric.aggregationMethod === "average") {
    return formatNormalizedMetricValue(
      metric.numericAverage,
      metric.unit
    );
  }
  if (metric.aggregationMethod === "maximum") {
    return formatNormalizedMetricValue(
      metric.numericMaximum,
      metric.unit
    );
  }
  if (metric.aggregationMethod === "minimum") {
    return formatNormalizedMetricValue(
      metric.numericMinimum,
      metric.unit
    );
  }
  return formatNormalizedMetricValue(metric.numericSum, metric.unit);
}

function NormalizedStatsPanel({
  stats,
}: {
  stats: PlayerNormalizedStats;
}) {
  if (stats.visibleGames === 0 || stats.metrics.length === 0) {
    return null;
  }
  const groups = [...new Set(stats.metrics.map((metric) => metric.metricGroup))];

  return (
    <Panel
      eyebrow="Deep Replay Vault"
      title="Exact normalized statistics"
      count={`${stats.metricCount} metrics · ${stats.visibleGames} games`}
    >
      <div className="space-y-5">
        <div className="rounded-[1rem] border border-emerald-300/12 bg-emerald-400/[0.045] px-4 py-3 text-xs leading-5 text-emerald-50/80">
          Accepted replay facts only. Unknown winners remain unknown; their exact
          economy, military, technology, society, and action evidence can still
          count here. Missing values are never converted to zero.
        </div>
        {groups.map((group) => {
          const metrics = stats.metrics.filter(
            (metric) => metric.metricGroup === group
          );
          return (
            <section key={group}>
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-xs font-bold uppercase tracking-[0.24em] text-slate-400">
                  {group}
                </h3>
                <span className="text-[10px] text-slate-600">
                  {metrics.length} metric{metrics.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {metrics.map((metric) => (
                  <div
                    key={metric.metricKey}
                    className="rounded-[1.15rem] border border-white/[0.075] bg-white/[0.035] px-4 py-4"
                  >
                    <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                      {normalizedMetricLabel(metric)}
                    </div>
                    <div className="mt-2 text-2xl font-semibold text-white">
                      {normalizedMetricHeadline(metric)}
                    </div>
                    <div className="mt-2 text-[11px] leading-5 text-slate-400">
                      {metric.metricGameCount} game
                      {metric.metricGameCount === 1 ? "" : "s"} ·{" "}
                      {(metric.coverageBps / 100).toFixed(0)}% coverage
                    </div>
                    <div className="mt-1 text-[10px] text-slate-600">
                      avg{" "}
                      {formatNormalizedMetricValue(
                        metric.numericAverage,
                        metric.unit
                      )}{" "}
                      · range{" "}
                      {formatNormalizedMetricValue(
                        metric.numericMinimum,
                        metric.unit
                      )}{" "}
                      –{" "}
                      {formatNormalizedMetricValue(
                        metric.numericMaximum,
                        metric.unit
                      )}
                    </div>
                    {metric.bestGameStatsId ? (
                      <Link
                        href={`/game-stats/${metric.bestGameStatsId}`}
                        className="mt-3 inline-flex text-[11px] font-semibold text-sky-200 transition hover:text-sky-100"
                      >
                        Open best replay →
                      </Link>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          );
        })}
        <div className="text-[10px] leading-5 text-slate-600">
          Schema {stats.schemaVersion ?? "versioned"} · dictionary{" "}
          {stats.metricDictionaryVersion ?? "versioned"}
          {stats.truncated ? " · recent 5,000 replay snapshots shown" : ""}
        </div>
      </div>
    </Panel>
  );
}

function ResourceVault({ resources }: { resources: PlayerResourceStats }) {
  const visibleResources = RESOURCE_LABELS.filter(
    (resource) => typeof resources.totals[resource] === "number"
  );

  if (visibleResources.length === 0) {
    return (
      <div className="rounded-[1.1rem] border border-white/8 bg-white/5 px-5 py-6 text-sm leading-6 text-slate-300">
        Economy vault ready for captured AoE2HD postgame tables.
      </div>
    );
  }

  const maxTotal = Math.max(
    1,
    ...visibleResources.map((resource) => resources.totals[resource] ?? 0)
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {visibleResources.map((resource) => {
          const meta = RESOURCE_META[resource];
          const total = resources.totals[resource];
          const best = resources.best[resource];
          const width = total ? Math.max(8, Math.round((total / maxTotal) * 100)) : 0;
          return (
            <div key={resource} className="rounded-[1.35rem] border border-white/8 bg-white/5 px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">{meta.label}</div>
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-slate-950/45 text-2xl leading-none">
                  {meta.icon}
                </div>
              </div>
              <div className="mt-3 text-2xl font-semibold capitalize text-white">
                {total?.toLocaleString()}
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/8">
                <div className={`h-full rounded-full bg-gradient-to-r ${meta.accent}`} style={{ width: `${width}%` }} />
              </div>
              <div className="mt-3 text-xs text-slate-400">
                {best ? `Best ${best.value.toLocaleString()} on ${best.mapName}` : `${resources.visibleGames} economy table${resources.visibleGames === 1 ? "" : "s"} indexed`}
              </div>
            </div>
          );
        })}
      </div>
      <div className="rounded-[1rem] border border-white/8 bg-slate-900/45 px-4 py-3 text-xs leading-5 text-slate-400">
        {resources.visibleGames > 0
          ? `${resources.visibleGames} stored game${resources.visibleGames === 1 ? "" : "s"} include visible economy table values.`
          : "Economy vault ready for every captured postgame table."}
      </div>
    </div>
  );
}

function BreakdownBars({ rows, accent }: { rows: PlayerBreakdownRow[]; accent: "amber" | "sky" }) {
  const barClass = accent === "sky" ? "bg-sky-300" : "bg-amber-300";

  if (rows.length === 0) {
    return <EmptyPanel message="This breakdown wakes up as replay rows accumulate." />;
  }

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.label} className="rounded-[1.1rem] border border-white/8 bg-white/5 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 truncate font-medium text-white">{row.label}</div>
            <div className="shrink-0 text-xs text-slate-400">
              {row.matches} · {formatPercent(row.winRate)}
            </div>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/8">
            <div className={`h-full rounded-full ${barClass}`} style={{ width: `${Math.max(8, row.share)}%` }} />
          </div>
          <div className="mt-2 text-xs text-slate-500">
            {row.wins}W / {row.losses}L
          </div>
        </div>
      ))}
    </div>
  );
}

function BestGamesGrid({ games }: { games: PlayerBestGame[] }) {
  if (games.length === 0) {
    return <EmptyPanel message="Highlight reel unlocks when score and duration stats appear." />;
  }

  return (
    <div className="grid gap-3 md:grid-cols-3">
      {games.map((game) => (
        <Link
          key={game.key}
          href={game.href}
          className="group relative flex min-h-[11rem] flex-col overflow-hidden rounded-[1.45rem] border border-white/[0.055] bg-[radial-gradient(circle_at_20%_0%,rgba(250,204,21,0.055),transparent_34%),linear-gradient(145deg,rgba(15,23,42,0.54),rgba(7,15,29,0.76))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] transition duration-200 hover:border-amber-100/14 hover:bg-white/[0.032]"
        >
          <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-amber-100/18 to-transparent" />
          <div className="flex items-start justify-between gap-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.26em] text-slate-400/88">
              {game.label}
            </div>
            <div className="shrink-0 text-[10px] text-slate-500/80">
              {formatDate(game.playedAt)}
            </div>
          </div>

          <div className="mt-5 text-3xl font-semibold leading-[0.98] tracking-[-0.035em] text-white/94">
            {game.value}
          </div>

          <div className="mt-auto pt-7">
            <div className="truncate text-sm font-semibold text-white/82 transition group-hover:text-amber-100/90">
              {game.mapName}
            </div>
            <div className="mt-3 h-px w-full bg-gradient-to-r from-white/[0.10] via-white/[0.035] to-transparent" />
          </div>
        </Link>
      ))}
    </div>
  );
}


function WatcherRail({ profile }: { profile: PlayerProfile }) {
  const watcherSourceCount = profile.watcher.uniqueWatchers || profile.watcher.watcherKeys;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <MiniStat label="Watcher Games" value={String(profile.watcher.watcherBackedMatches)} />
        <MiniStat label="Account Sources" value={String(watcherSourceCount)} />
        <MiniStat label="Dual Proofs" value={String(profile.watcher.multiWatcherProofGames)} />
        <MiniStat label="Best Proof" value={profile.watcher.bestMultiWatcherProofLabel || "—"} />
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-white/8">
        <div
          className="h-full rounded-full bg-gradient-to-r from-emerald-300 via-amber-300 to-sky-300"
          style={{ width: `${Math.max(5, profile.watcher.proofScore)}%` }}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Tag>{profile.isVerified ? "verified identity" : "claimable identity"}</Tag>
        {profile.watcher.watcherKeys > 0 ? <Tag>{profile.watcher.watcherKeys} watcher key{profile.watcher.watcherKeys === 1 ? "" : "s"}</Tag> : null}
        {profile.watcher.lastWatcherSeenAt ? <Tag>last watcher {formatDate(profile.watcher.lastWatcherSeenAt)}</Tag> : null}
      </div>
    </div>
  );
}

function AiRail({ profile }: { profile: PlayerProfile }) {
  const weaknessLabel =
    profile.command.losses > 0
      ? `${profile.command.losses} loss${profile.command.losses === 1 ? "" : "es"} to review`
      : "No clear leak yet";

  const props = {
    totalMatches: profile.command.totalMatches,
    winRateLabel: formatPercent(profile.command.winRate),
    mapLabel: profile.command.favoriteMap || "HD battlefield archive",
    civLabel: profile.command.mostPlayedCivilization || "HD civilization archive",
    weaknessLabel,
    profileUid: profile.identity.kind === "claimed" ? profile.identity.uid : profile.identity.name,
    profileDisplayName: profile.displayName,
    profileIdentityKind: profile.identity.kind,
  };

  return (
    <>
      <PlayerHeroAiDomBinder {...props} />
      <PlayerAiDevelopmentConsole {...props} variant="rail" />
    </>
  );
}

function WoloRail({ profile }: { profile: PlayerProfile }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 rounded-[1.25rem] border border-amber-300/20 bg-[radial-gradient(circle_at_top_left,rgba(250,204,21,0.2),transparent_34%),linear-gradient(135deg,rgba(120,53,15,0.28),rgba(15,23,42,0.7))] px-4 py-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-amber-200/20 bg-slate-950/48">
          <Image src={WOLO_LOGO_SRC} alt="WOLO" width={42} height={42} className="h-10 w-10 object-contain" />
        </div>
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.28em] text-amber-100/70">WOLO Economy</div>
          <div className="mt-1 text-xl font-semibold text-white">{formatWolo(profile.wolo.totalFlexWolo)}</div>
          <div className="mt-1 text-xs text-slate-300">claims, wagers, staking, and reward flex in one rail</div>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <MiniStat label="Pending Claims" value={formatWolo(profile.wolo.pendingClaimWolo)} />
        <MiniStat label="Claimed Claims" value={formatWolo(profile.wolo.claimedClaimWolo)} />
        <MiniStat label="Wagered" value={formatWolo(profile.wolo.wageredWolo)} />
        <MiniStat label="Payout Tx" value={String(profile.wolo.payoutTxCount)} />
        <MiniStat label="Staked" value={formatWolo(profile.wolo.activeStakeWolo)} />
        <MiniStat label="Rewards" value={formatWolo(profile.wolo.stakingRewardsWolo)} />
      </div>
    </div>
  );
}

function RivalryList({ profile, compact = false }: { profile: PlayerProfile; compact?: boolean }) {
  if (profile.rivalries.length === 0) {
    return <EmptyPanel message="Repeat opponents will light up this rail." />;
  }

  return (
    <div className="space-y-3">
      {profile.rivalries.slice(0, compact ? 5 : 7).map((rivalry) => (
        <Link
          key={rivalry.ref.token}
          href={buildMatchupHref(profile.currentPlayer, rivalry.ref)}
          className="block rounded-[1.15rem] border border-white/8 bg-white/5 px-4 py-4 transition hover:border-amber-300/35 hover:bg-white/10"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="truncate font-medium text-white">{rivalry.ref.name}</div>
              <div className="mt-1 text-xs uppercase tracking-[0.22em] text-slate-500">
                {rivalry.ref.claimed ? "claimed rival" : "replay-built rival"}
              </div>
            </div>
            <div className="shrink-0 text-right text-sm font-semibold text-white">
              {rivalry.wins}-{rivalry.losses}
            </div>
          </div>
          {rivalry.lastPlayedAt ? (
            <div className="mt-3 text-xs text-slate-500">Last met {formatDate(rivalry.lastPlayedAt)}</div>
          ) : null}
        </Link>
      ))}
    </div>
  );
}

function ClassicRivalries({ profile }: { profile: PlayerProfile }) {
  return (
    <div className="mt-5 space-y-3">
      {profile.rivalries.length === 0 ? (
        <div className="rounded-2xl border border-white/8 bg-white/5 px-4 py-5 text-sm text-slate-300">
          No rivalries yet. The first repeat opponent will show up here.
        </div>
      ) : (
        profile.rivalries.slice(0, 6).map((rivalry) => (
          <Link
            key={rivalry.ref.token}
            href={buildMatchupHref(profile.currentPlayer, rivalry.ref)}
            className="block rounded-2xl border border-white/8 bg-white/5 px-4 py-4 transition hover:border-rose-300/30 hover:bg-white/10"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="font-medium text-white">{rivalry.ref.name}</div>
                <div className="mt-1 text-xs uppercase tracking-[0.25em] text-slate-400">
                  {rivalry.ref.claimed ? "claimed rival" : "replay-built rival"}
                </div>
              </div>
              <div className="text-right text-xs text-slate-300">
                {rivalry.wins}-{rivalry.losses}
              </div>
            </div>

            {rivalry.lastPlayedAt ? (
              <div className="mt-3 text-xs text-slate-400">
                Last met {new Date(rivalry.lastPlayedAt).toLocaleString()}
              </div>
            ) : null}
          </Link>
        ))
      )}
    </div>
  );
}

function StreamRail({ profile }: { profile: PlayerProfile }) {
  const streamHref = profile.stream.primarySessionKey
    ? `/watch/${encodeURIComponent(profile.stream.primarySessionKey)}`
    : profile.stream.twitchUrl;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <MiniStat label="Twitch" value={profile.stream.twitchChannel || (profile.stream.twitchUrl ? "Linked" : "Open")} />
        <MiniStat label="Recent Feeds" value={String(profile.stream.recentFeedCount)} />
      </div>
      {streamHref ? (
        <Link
          href={streamHref}
          className="inline-flex rounded-full border border-sky-300/25 bg-sky-400/10 px-4 py-2 text-sm font-medium text-slate-200/86 transition hover:bg-sky-400/15"
        >
          Open stream rail
        </Link>
      ) : (
        <div className="rounded-[1rem] border border-white/8 bg-white/5 px-4 py-3 text-sm text-slate-300">
          Twitch can be added from the player profile settings.
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.15rem] border border-white/8 bg-white/5 px-4 py-4">
      <div className="text-xs uppercase tracking-[0.25em] text-slate-500">{label}</div>
      <div className="mt-3 text-lg font-semibold text-white">{value}</div>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-[1.15rem] border border-white/8 bg-white/5 px-4 py-4">
      <dt className="text-xs uppercase tracking-[0.25em] text-slate-500">{label}</dt>
      <dd className="mt-2 text-sm text-slate-200">{value}</dd>
    </div>
  );
}

function EmptyPanel({ message }: { message: string }) {
  return (
    <div className="rounded-[1.1rem] border border-white/8 bg-white/5 px-4 py-5 text-sm text-slate-300">
      {message}
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

function formatRatingMetric(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? String(Math.round(value)) : "Not ranked";
}

function formatNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value).toLocaleString() : "Not ranked";
}

function formatPercent(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `${value}%` : "Record active";
}

function formatPeakNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.round(value).toLocaleString()
    : "Replay vault";
}

function formatAverageNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? `avg ${Math.round(value).toLocaleString()}`
    : "HD archive";
}

function formatPeakDecimal(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "Replay vault";
}

function formatAverageDecimal(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? `avg ${value}`
    : "HD archive";
}

function formatWolo(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `${Math.round(value).toLocaleString()} WOLO` : "0 WOLO";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Historic archive";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Historic archive";
  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
