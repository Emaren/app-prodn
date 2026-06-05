import Link from "next/link";
import type { ReactNode } from "react";

import CommunityBadgePill from "@/components/contact/CommunityBadgePill";
import PlayerMatchFeedClient from "@/components/players/PlayerMatchFeedClient";
import SteamLinkedBadge from "@/components/SteamLinkedBadge";
import { formatDurationLabel } from "@/lib/gameStatsView";
import { buildMatchupHref } from "@/lib/publicMatchups";
import type {
  PlayerBreakdownRow,
  PlayerBestGame,
  PlayerFormPoint,
  PlayerProfile,
  PlayerProfileViewMode,
  PlayerResourceStats,
} from "@/lib/playerProfile";

type PlayerProfilePageProps = {
  profile: PlayerProfile;
  viewMode: PlayerProfileViewMode;
};

const RESOURCE_LABELS: Array<keyof PlayerResourceStats["totals"]> = ["wood", "food", "gold", "stone"];

export default function PlayerProfilePage({ profile, viewMode }: PlayerProfilePageProps) {
  return viewMode === "basic" ? (
    <PlayerProfileBasic profile={profile} />
  ) : (
    <PlayerProfileAdvanced profile={profile} />
  );
}

function PlayerProfileAdvanced({ profile }: { profile: PlayerProfile }) {
  return (
    <main className="space-y-5 py-5 text-white sm:space-y-6 sm:py-6">
      <AdvancedHero profile={profile} />
      <PlayerProfileTicker items={profile.tickerItems} />

      <section className="grid gap-5 xl:grid-cols-[1.12fr_0.88fr]">
        <div className="space-y-5">
          <Panel eyebrow="Command Deck" title="Performance radar" count={`${profile.command.totalMatches} games`}>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <CommandTile label="Win Rate" value={formatPercent(profile.command.winRate)} detail={`${profile.command.wins}W / ${profile.command.losses}L`} tone="emerald" />
              <CommandTile label="Current Streak" value={profile.command.currentStreakLabel} detail={`${profile.command.matchesLast30Days} games in 30d`} tone="amber" />
              <CommandTile label="Peak Score" value={formatNumber(profile.command.bestScore)} detail={`avg ${formatNumber(profile.command.averageScore)}`} tone="sky" />
              <CommandTile label="Peak EAPM" value={formatDecimal(profile.command.bestEapm)} detail={`avg ${formatDecimal(profile.command.averageEapm)}`} tone="rose" />
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
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

          <Panel eyebrow="Economy Vault" title="Resource command" count={profile.resources.visibleGames > 0 ? `${profile.resources.visibleGames} visible` : "gated"}>
            <ResourceVault resources={profile.resources} />
          </Panel>

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
  return (
    <main className="space-y-6 py-6 text-white">
      <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.18),_transparent_32%),linear-gradient(135deg,_#0f172a,_#111827_58%,_#020617)] p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-4">
            <div className="text-xs uppercase tracking-[0.35em] text-amber-200/70">
              {profile.isClaimed ? "Public Warrior Page" : "Replay-Built Warrior Page"}
            </div>
            <h1 className="text-4xl font-semibold text-white sm:text-5xl">{profile.displayName}</h1>
            <div className="flex flex-wrap gap-2">
              {profile.verificationLevel > 0 ? <SteamLinkedBadge compact /> : null}
              <Tag>{profile.isVerified ? "Replay verified" : profile.isClaimed ? "Claimed profile" : "Unclaimed identity"}</Tag>
              <Tag>{profile.command.totalMatches} parsed matches</Tag>
              {profile.isLive ? <Tag>online now</Tag> : null}
              {profile.wolo.pendingClaimCount > 0 ? <Tag>{profile.wolo.pendingClaimWolo} WOLO unclaimed</Tag> : null}
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
              <MetricCard label="Avg Game Length" value={formatDurationLabel(profile.performance.averageDurationSeconds)} />
              <MetricCard label="Longest Game" value={formatDurationLabel(profile.performance.longestDurationSeconds)} />
              <MetricCard label="Unique Opponents" value={String(profile.performance.uniqueOpponents)} />
              <MetricCard label="Civilizations" value={String(profile.performance.civilizationsPlayed)} />
              <MetricCard label="Most Played Map" value={profile.performance.mostPlayedMap || "Unknown"} />
            </div>
          </Panel>

          <Panel eyebrow="Profile" title="Identity">
            <dl className="grid gap-4">
              <StatRow label="Public Name" value={profile.displayName} />
              <StatRow label="Steam Persona" value={profile.steam.personaName || "Unknown"} />
              <StatRow label="Steam ID" value={profile.steam.steamId || "Unknown"} />
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
            <h1 className="mt-3 max-w-4xl text-4xl font-semibold leading-[0.96] text-white sm:text-6xl">
              {profile.displayName}
            </h1>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <HeroStat label="Games" value={String(profile.command.totalMatches)} />
            <HeroStat label="Win Rate" value={formatPercent(profile.command.winRate)} />
            <HeroStat label="WOLO Flex" value={formatWolo(profile.wolo.totalFlexWolo)} />
            <HeroStat label="Proof" value={`${profile.watcher.proofScore}/100`} />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <ViewToggle profile={profile} active="advanced" />
            {profile.claimHref ? (
              <Link href={profile.claimHref} className="rounded-full bg-rose-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-rose-200">
                Claim This Page
              </Link>
            ) : (
              <Link href="/profile" className="rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200">
                Open My Profile
              </Link>
            )}
            <Link href="/players" className="rounded-full border border-white/15 px-5 py-3 text-sm text-white/85 transition hover:border-white/30 hover:text-white">
              Browse Players
            </Link>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <HeroSignal label="Watcher Proof" value={`${profile.watcher.watcherBackedMatches} games`} detail={`${profile.watcher.uniqueWatchers || profile.watcher.watcherKeys} watcher source${(profile.watcher.uniqueWatchers || profile.watcher.watcherKeys) === 1 ? "" : "s"}`} tone="emerald" />
          <HeroSignal label="Steam" value={profile.steam.rmRating ? String(profile.steam.rmRating) : "Linked"} detail={profile.steam.personaName || "rating feed"} tone="sky" />
          <HeroSignal label="Favorite Map" value={profile.command.favoriteMap || "Calibrating"} detail={profile.command.mostPlayedCivilization || "civ mix building"} tone="amber" />
          <HeroSignal label="Stream" value={profile.stream.twitchChannel || "Ready"} detail={profile.stream.twitchUrl ? "Twitch rail linked" : "Add Twitch in profile"} tone="rose" />
        </div>
      </div>
    </section>
  );
}

function PlayerProfileTicker({ items }: { items: string[] }) {
  const loopItems = items.length > 0 ? [...items, ...items] : ["Profile telemetry warming", "Replay archive ready"];

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

function ViewToggle({ profile, active }: { profile: PlayerProfile; active: PlayerProfileViewMode }) {
  return (
    <div className="flex rounded-full border border-white/10 bg-slate-950/55 p-1 text-xs">
      {(["advanced", "basic"] as PlayerProfileViewMode[]).map((mode) => (
        <Link
          key={mode}
          href={mode === "advanced" ? profile.href : `${profile.href}?view=basic`}
          className={`rounded-full px-3 py-2 font-medium uppercase tracking-[0.2em] transition ${
            active === mode
              ? mode === "advanced"
                ? "bg-white text-slate-950"
                : "bg-amber-300 text-slate-950"
              : "text-slate-400 hover:text-white"
          }`}
        >
          {mode}
        </Link>
      ))}
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
  tone: "emerald" | "amber" | "sky" | "rose";
}) {
  const border =
    tone === "emerald"
      ? "border-emerald-300/18"
      : tone === "sky"
        ? "border-sky-300/18"
        : tone === "rose"
          ? "border-rose-300/18"
          : "border-amber-300/18";

  return (
    <div className={`rounded-[1.25rem] border bg-white/5 px-4 py-4 ${border}`}>
      <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">{label}</div>
      <div className="mt-3 text-xl font-semibold text-white">{value}</div>
      <div className="mt-1 text-xs text-slate-400">{detail}</div>
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
    <div className="rounded-[1.25rem] border border-white/8 bg-white/5 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Last 12 form</div>
        <div className="text-xs text-slate-400">oldest to newest</div>
      </div>
      <div className="mt-5 flex h-24 items-end gap-2">
        {points.length === 0 ? (
          <div className="text-sm text-slate-400">Form chart wakes up after the first parsed match.</div>
        ) : (
          points.map((point) => {
            const height = point.result === "win" ? "h-24" : point.result === "loss" ? "h-12" : "h-7";
            const color =
              point.result === "win"
                ? "bg-emerald-300"
                : point.result === "loss"
                  ? "bg-rose-300"
                  : "bg-slate-500";
            return (
              <Link
                key={point.gameId}
                href={`/game-stats/${point.gameId}`}
                className="group flex min-w-0 flex-1 flex-col items-center gap-2"
                title={point.result}
              >
                <div className={`w-full rounded-t-lg ${height} ${color} opacity-80 transition group-hover:opacity-100`} />
                <div className="text-[10px] text-slate-500">{point.label}</div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}

function ResourceVault({ resources }: { resources: PlayerResourceStats }) {
  const maxTotal = Math.max(
    1,
    ...RESOURCE_LABELS.map((resource) => resources.totals[resource] ?? 0)
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {RESOURCE_LABELS.map((resource) => {
          const total = resources.totals[resource];
          const best = resources.best[resource];
          const width = total ? Math.max(8, Math.round((total / maxTotal) * 100)) : 0;
          return (
            <div key={resource} className="rounded-[1.25rem] border border-white/8 bg-white/5 px-4 py-4">
              <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">{resource}</div>
              <div className="mt-3 text-2xl font-semibold capitalize text-white">
                {total !== null ? total.toLocaleString() : "Fog"}
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/8">
                <div className="h-full rounded-full bg-gradient-to-r from-amber-300 to-sky-300" style={{ width: `${width}%` }} />
              </div>
              <div className="mt-3 text-xs text-slate-400">
                {best ? `Best ${best.value.toLocaleString()} on ${best.mapName}` : "Awaiting postgame table"}
              </div>
            </div>
          );
        })}
      </div>
      <div className="rounded-[1rem] border border-white/8 bg-slate-900/45 px-4 py-3 text-xs leading-5 text-slate-400">
        {resources.visibleGames > 0
          ? `${resources.visibleGames} stored game${resources.visibleGames === 1 ? "" : "s"} include visible economy table values.`
          : resources.unavailableReason}
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
            {row.wins}W / {row.losses}L{row.unknowns > 0 ? ` / ${row.unknowns}U` : ""}
          </div>
        </div>
      ))}
    </div>
  );
}

function BestGamesGrid({ games }: { games: PlayerBestGame[] }) {
  if (games.length === 0) {
    return <EmptyPanel message="Highlight reel unlocks when score, EAPM, and duration stats appear." />;
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {games.map((game) => (
        <Link key={game.key} href={game.href} className="rounded-[1.2rem] border border-white/8 bg-white/5 px-4 py-4 transition hover:border-amber-300/35 hover:bg-white/10">
          <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">{game.label}</div>
          <div className="mt-3 text-2xl font-semibold text-white">{game.value}</div>
          <div className="mt-2 text-sm text-slate-300">{game.mapName}</div>
          <div className="mt-3 text-xs text-slate-500">{formatDate(game.playedAt)}</div>
        </Link>
      ))}
    </div>
  );
}

function WatcherRail({ profile }: { profile: PlayerProfile }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <MiniStat label="Watcher Games" value={String(profile.watcher.watcherBackedMatches)} />
        <MiniStat label="Watcher Sources" value={String(profile.watcher.uniqueWatchers || profile.watcher.watcherKeys)} />
        <MiniStat label="Stored Parses" value={String(profile.watcher.parserStoredAttempts)} />
        <MiniStat label="Parse Misses" value={String(profile.watcher.parserFailedAttempts)} />
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

function WoloRail({ profile }: { profile: PlayerProfile }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <MiniStat label="Pending Claims" value={formatWolo(profile.wolo.pendingClaimWolo)} />
      <MiniStat label="Claimed Claims" value={formatWolo(profile.wolo.claimedClaimWolo)} />
      <MiniStat label="Wagered" value={formatWolo(profile.wolo.wageredWolo)} />
      <MiniStat label="Payout Tx" value={String(profile.wolo.payoutTxCount)} />
      <MiniStat label="Staked" value={formatWolo(profile.wolo.activeStakeWolo)} />
      <MiniStat label="Rewards" value={formatWolo(profile.wolo.stakingRewardsWolo)} />
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
          className="inline-flex rounded-full border border-sky-300/25 bg-sky-400/10 px-4 py-2 text-sm font-medium text-sky-100 transition hover:bg-sky-400/15"
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

function formatNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value).toLocaleString() : "Unknown";
}

function formatDecimal(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "Unknown";
}

function formatPercent(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `${value}%` : "Unknown";
}

function formatWolo(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `${Math.round(value).toLocaleString()} WOLO` : "0 WOLO";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Date hidden";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date hidden";
  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
