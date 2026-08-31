import Link from "next/link";
import type { ReactNode } from "react";

import CommunityBadgePill from "@/components/contact/CommunityBadgePill";
import {
  PlayerPresenceCount,
  PlayerPresenceEmpty,
  PlayerPresenceOnly,
  PlayerPresenceStatus,
} from "@/components/players/PlayerDirectoryPresence";
import PlayerDirectoryRealtimeRefresh from "@/components/players/PlayerDirectoryRealtimeRefresh";
import { PublicPresenceProvider } from "@/components/presence/PublicPresenceProvider";
import SteamLinkedBadge from "@/components/SteamLinkedBadge";
import SpeedReadyMarker from "@/components/speed/SpeedReadyMarker";
import { getPrisma } from "@/lib/prisma";
import {
  loadPublicPlayerDirectoryFresh,
  type PublicPlayerDirectoryEntry,
} from "@/lib/publicPlayerDirectory";
import { loadPublicPresenceSnapshot } from "@/lib/publicPresence";
import { loadPublicReplayGeneration } from "@/lib/publicReplayGeneration";

export const dynamic = "force-dynamic";

export default async function PlayersDirectoryPage() {
  const prisma = getPrisma();
  // Read the watermark before the directory query. If replay truth lands
  // between these reads, the client observes a later generation and refreshes;
  // reading both concurrently can stamp an older directory with a newer
  // generation and suppress that corrective refresh.
  const [initialGeneration, presence] = await Promise.all([
    loadPublicReplayGeneration(prisma),
    loadPublicPresenceSnapshot(prisma),
  ]);
  // A client refresh only happens after the lightweight generation changes,
  // so this request must bypass the older shared directory snapshot.
  const directory = await loadPublicPlayerDirectoryFresh(prisma);
  const boardCount = directory.allEntries.length;
  const claimedUids = directory.claimedEntries.flatMap((entry) =>
    entry.uid ? [entry.uid] : [],
  );
  const claimableCount = Math.max(
    directory.replayEntries.length,
    boardCount - directory.claimedEntries.length
  );

  return (
    <PublicPresenceProvider initialOnlineUsers={presence.onlineUsers}>
      <main className="space-y-5 py-5 text-white sm:space-y-6 sm:py-6">
      <PlayerDirectoryRealtimeRefresh initialGeneration={initialGeneration} />
      <SpeedReadyMarker route="/players" />
      <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(34,197,94,0.16),_transparent_30%),linear-gradient(135deg,_#0f172a,_#111827_55%,_#020617)] p-6 sm:p-8">
        <div className="grid gap-7 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
          <div className="space-y-5">
            <div className="text-sm uppercase tracking-[0.4em] text-emerald-200/70">
              Player Board
            </div>
            <h1 className="max-w-3xl text-4xl font-semibold leading-[1.02] text-white sm:text-5xl">
              {boardCount} warriors on board.
            </h1>

            <div className="flex flex-wrap gap-2">
              <HeroPill>{directory.claimedEntries.length} Claimed Profiles</HeroPill>
              <HeroPill live>
                <PlayerPresenceCount directoryUids={claimedUids} /> Live Now
              </HeroPill>
              <HeroPill>{claimableCount} Claimable</HeroPill>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/"
                className="rounded-full bg-emerald-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-200"
              >
                Back To Lobby
              </Link>
              <Link
                href="/game-stats"
                className="rounded-full border border-white/15 px-5 py-3 text-sm text-white/85 transition hover:border-white/30 hover:text-white"
              >
                Open Battle Intelligence
              </Link>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <StatCard label="On Board" value={String(boardCount)} />
            <StatCard label="Claimed" value={String(directory.claimedEntries.length)} />
            <StatCard
              label="Live Now"
              value={<PlayerPresenceCount directoryUids={claimedUids} />}
              live
              helper="Realtime site activity"
            />
            <StatCard label="Claimable" value={String(claimableCount)} />
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.88fr_1.12fr]">
        <Panel
          title="Online Now"
          eyebrow="Live Lobby"
          count={<PlayerPresenceCount directoryUids={claimedUids} />}
          status={<LiveSignal label="Calculating live" />}
        >
          <div className="space-y-3">
            <PlayerPresenceEmpty directoryUids={claimedUids}>
              <EmptyPanel message="No claimed players are live right now." />
            </PlayerPresenceEmpty>
            {directory.claimedEntries.map((entry) => (
              <PlayerPresenceOnly key={entry.key} uid={entry.uid}>
                <PlayerCard entry={entry} accent="emerald" />
              </PlayerPresenceOnly>
            ))}
          </div>
        </Panel>

        <Panel
          title="Claimed Profiles"
          eyebrow="Persistent Identity"
          count={directory.claimedEntries.length}
        >
          <div className="space-y-3">
            {directory.claimedEntries.length === 0 ? (
              <EmptyPanel message="No claimed profiles yet." />
            ) : (
              directory.claimedEntries.map((entry) => (
                <PlayerCard key={entry.key} entry={entry} accent="amber" />
              ))
            )}
          </div>
        </Panel>
      </section>

      <Panel
        title="Replay-Backed Identities"
        eyebrow="Steam and Name-Only Evidence"
        count={directory.replayEntries.length}
      >
        <div className="mb-4 text-sm leading-6 text-slate-300">
          Exact Steam accounts fold historical names into one row. Name-only
          evidence stays separate until stronger identity proof exists.
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {directory.replayEntries.length === 0 ? (
            <EmptyPanel message="No replay-only opponents yet." />
          ) : (
            directory.replayEntries.slice(0, 24).map((entry) => (
              <PlayerCard key={entry.key} entry={entry} accent="rose" />
            ))
          )}
        </div>
      </Panel>
      </main>
    </PublicPresenceProvider>
  );
}

function PlayerCard({
  entry,
  accent,
}: {
  entry: PublicPlayerDirectoryEntry;
  accent: "amber" | "emerald" | "rose";
}) {
  const accentStyles =
    accent === "emerald"
      ? "hover:border-emerald-300/30"
      : accent === "rose"
        ? "hover:border-rose-300/30"
        : "hover:border-amber-300/30";

  const badgeStyles =
    accent === "emerald"
      ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-100"
      : accent === "rose"
        ? "border-rose-300/20 bg-rose-400/10 text-rose-100"
        : "border-amber-300/20 bg-amber-400/10 text-amber-100";

  return (
    <Link
      href={entry.href}
      prefetch={false}
      className={`block w-full min-w-0 rounded-2xl border border-white/8 bg-white/5 p-5 transition hover:bg-white/10 ${accentStyles}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-lg font-semibold text-white">{entry.name}</div>
          <div className="mt-1 text-xs uppercase tracking-[0.25em] text-slate-400">
            {entry.claimed
              ? entry.verified
                ? `claimed profile · level ${entry.verificationLevel}`
                : `steam linked · level ${entry.verificationLevel}`
              : entry.identityKind === "steam"
                ? "replay-backed Steam account"
                : "name-only replay identity"}
          </div>
        </div>
        <div className={`rounded-full border px-3 py-1 text-xs ${badgeStyles}`}>
          {entry.claimed ? <PlayerPresenceStatus uid={entry.uid} /> : "Claimable"}
        </div>
      </div>

      {entry.claimed ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <SteamLinkedBadge compact />
          {entry.verified ? <Tag>Replay verified</Tag> : null}
          {entry.pendingWoloClaimCount > 0 ? (
            <Tag>Unclaimed WOLO · {entry.pendingWoloClaimAmount}</Tag>
          ) : null}
          {entry.badges.map((badge) => (
            <CommunityBadgePill key={badge.id} label={badge.label} />
          ))}
        </div>
      ) : entry.badges.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {entry.pendingWoloClaimCount > 0 ? (
            <Tag>Unclaimed WOLO · {entry.pendingWoloClaimAmount}</Tag>
          ) : null}
          {entry.badges.map((badge) => (
            <CommunityBadgePill key={badge.id} label={badge.label} />
          ))}
        </div>
      ) : entry.pendingWoloClaimCount > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Tag>Unclaimed WOLO · {entry.pendingWoloClaimAmount}</Tag>
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <Stat label="Steam RM" value={formatRating(entry.steamRmRating)} />
        <Stat label="Steam DM" value={formatRating(entry.steamDmRating)} />
        <Stat label="Matches" value={String(entry.totalMatches)} />
        <Stat label="Record" value={formatRecord(entry)} />
      </div>

      {visibleAliases(entry).length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {visibleAliases(entry).map((alias) => (
            <Tag key={alias}>{alias}</Tag>
          ))}
          {hiddenAliasCount(entry) > 0 ? <Tag>+{hiddenAliasCount(entry)} more</Tag> : null}
        </div>
      ) : null}

      <div className="mt-4 text-xs text-slate-400">
        {entry.lastPlayedAt
          ? `Last game ${new Date(entry.lastPlayedAt).toLocaleString()}`
          : "Profile ready for its first filed battle."}
      </div>
    </Link>
  );
}

function Panel({
  title,
  eyebrow,
  count,
  status,
  children,
}: {
  title: string;
  eyebrow: string;
  count?: ReactNode;
  status?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.35em] text-white/45">{eyebrow}</div>
          <h2 className="mt-2 text-2xl font-semibold text-white">{title}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {status}
          {count !== undefined ? (
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
              {count}
            </div>
          ) : null}
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function StatCard({
  label,
  value,
  live = false,
  helper,
}: {
  label: string;
  value: ReactNode;
  live?: boolean;
  helper?: string;
}) {
  return (
    <div className="rounded-[1.4rem] border border-white/10 bg-white/5 px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs uppercase tracking-[0.25em] text-slate-400">{label}</div>
        {live ? <LiveSignal label="Now" compact /> : null}
      </div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
      {helper ? <div className="mt-2 text-xs text-slate-400">{helper}</div> : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/8 bg-slate-950/60 px-3 py-3">
      <div className="text-[11px] uppercase tracking-[0.25em] text-slate-500">{label}</div>
      <div className="mt-2 text-sm font-medium text-slate-200">{value}</div>
    </div>
  );
}

function formatRating(value: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? String(Math.round(value)) : "Unranked";
}

function formatRecord(entry: PublicPlayerDirectoryEntry) {
  return `${entry.wins}-${entry.losses}`;
}

function visibleAliases(entry: PublicPlayerDirectoryEntry) {
  return entry.aliases
    .filter((alias) => alias.trim().toLowerCase() !== entry.name.trim().toLowerCase())
    .slice(0, 2);
}

function hiddenAliasCount(entry: PublicPlayerDirectoryEntry) {
  const visibleCount = visibleAliases(entry).length;
  const uniqueAliases = entry.aliases.filter(
    (alias) => alias.trim().toLowerCase() !== entry.name.trim().toLowerCase()
  );
  return Math.max(0, uniqueAliases.length - visibleCount);
}

function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
      {children}
    </span>
  );
}

function EmptyPanel({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/5 px-4 py-5 text-sm text-slate-300">
      {message}
    </div>
  );
}

function LiveSignal({
  label,
  compact = false,
}: {
  label: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-500/10 text-emerald-100 ${
        compact ? "px-2 py-0.5 text-[10px]" : "px-3 py-1 text-xs"
      }`}
    >
      <span className="relative flex h-2.5 w-2.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300/75" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-300" />
      </span>
      <span>{label}</span>
    </div>
  );
}

function HeroPill({
  children,
  live = false,
}: {
  children: ReactNode;
  live?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${
        live
          ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-100"
          : "border-white/10 bg-white/5 text-slate-300"
      }`}
    >
      {live ? (
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300/75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-300" />
        </span>
      ) : null}
      {children}
    </span>
  );
}
