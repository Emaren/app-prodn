import Link from "next/link";
import type { ReactNode } from "react";

import SteamLinkedBadge from "@/components/SteamLinkedBadge";
import { getPrisma } from "@/lib/prisma";
import {
  loadPublicPlayerDirectory,
  type PublicPlayerDirectoryEntry,
} from "@/lib/publicPlayerDirectory";

export const dynamic = "force-dynamic";

export default async function PlayersDirectoryPage() {
  const prisma = getPrisma();
  const directory = await loadPublicPlayerDirectory(prisma);

  return (
    <main className="space-y-6 py-6 text-white">
      <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(34,197,94,0.16),_transparent_30%),linear-gradient(135deg,_#0f172a,_#111827_55%,_#020617)] p-8">
        <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-4">
            <div className="text-sm uppercase tracking-[0.4em] text-emerald-200/70">
              Player Graph
            </div>
            <h1 className="max-w-3xl text-4xl font-semibold leading-tight text-white sm:text-5xl">
              Claimed profiles, live warriors, and replay-built identities all in one directory.
            </h1>
            <p className="max-w-3xl text-base leading-7 text-slate-300 sm:text-lg">
              This is where AoE2HDBets starts to feel like a real network. Claimed players build
              public profiles, replay-only opponents get discoverable warrior pages, and every new
              match makes the graph denser.
            </p>

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
                Open Parser Lab
              </Link>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <StatCard label="Public Profiles" value={String(directory.allEntries.length)} />
            <StatCard label="Claimed Players" value={String(directory.claimedEntries.length)} />
            <StatCard label="Replay-Built Warriors" value={String(directory.replayEntries.length)} />
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.88fr_1.12fr]">
        <Panel title="Online Now" eyebrow="Live Lobby">
          <div className="space-y-3">
            {directory.activeClaimed.length === 0 ? (
              <EmptyPanel message="No claimed players are live right now. As soon as signed-in players browse the site, they show up here." />
            ) : (
              directory.activeClaimed.slice(0, 12).map((entry) => (
                <PlayerCard key={entry.key} entry={entry} accent="emerald" />
              ))
            )}
          </div>
        </Panel>

        <Panel title="Claimed Profiles" eyebrow="Persistent Identity">
          <div className="space-y-3">
            {directory.claimedEntries.length === 0 ? (
              <EmptyPanel message="No claimed profiles yet. Steam sign-in plus one verified replay is enough to start the public graph." />
            ) : (
              directory.claimedEntries.slice(0, 18).map((entry) => (
                <PlayerCard key={entry.key} entry={entry} accent="amber" />
              ))
            )}
          </div>
        </Panel>
      </section>

      <Panel title="Replay-Built Warriors" eyebrow="Claimable Identities">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-3xl text-sm leading-6 text-slate-300">
            These pages were generated from parsed replays. They are meant to pull real AoE2HD
            opponents into the network: each one already has a public link, match history, and a
            claim path.
          </p>
          <div className="rounded-full border border-rose-300/20 bg-rose-400/10 px-3 py-1 text-xs text-rose-100">
            {directory.replayEntries.length} claimable warriors
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {directory.replayEntries.length === 0 ? (
            <EmptyPanel message="No replay-only opponents yet. As soon as a new unclaimed name shows up in a final replay, it lands here." />
          ) : (
            directory.replayEntries.slice(0, 24).map((entry) => (
              <PlayerCard key={entry.key} entry={entry} accent="rose" />
            ))
          )}
        </div>
      </Panel>
    </main>
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
      className={`block rounded-2xl border border-white/8 bg-white/5 p-5 transition hover:bg-white/10 ${accentStyles}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-lg font-semibold text-white">{entry.name}</div>
          <div className="mt-1 text-xs uppercase tracking-[0.25em] text-slate-400">
            {entry.claimed
              ? entry.verified
                ? `claimed profile · level ${entry.verificationLevel}`
                : `steam linked · level ${entry.verificationLevel}`
              : "replay-built warrior"}
          </div>
          {entry.claimed ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <SteamLinkedBadge compact />
              {entry.verified ? <Tag>Replay verified</Tag> : null}
            </div>
          ) : null}
        </div>
        <div className={`rounded-full border px-3 py-1 text-xs ${badgeStyles}`}>
          {entry.claimed ? (entry.isOnline ? "Online" : "Profile") : "Claimable"}
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-4">
        <Stat label="Matches" value={String(entry.totalMatches)} />
        <Stat label="Wins" value={String(entry.wins)} />
        <Stat label="Losses" value={String(entry.losses)} />
        <Stat label="Unknown" value={String(entry.unknowns)} />
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {entry.aliases.slice(0, 4).map((alias) => (
          <Tag key={alias}>{alias}</Tag>
        ))}
        {entry.aliases.length > 4 ? <Tag>+{entry.aliases.length - 4} aliases</Tag> : null}
      </div>

      <div className="mt-4 text-xs text-slate-400">
        {entry.lastPlayedAt
          ? `Last replay sighting ${new Date(entry.lastPlayedAt).toLocaleString()}`
          : "No replay sightings yet."}
      </div>
    </Link>
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

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.4rem] border border-white/10 bg-white/5 px-4 py-4">
      <div className="text-xs uppercase tracking-[0.25em] text-slate-400">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-slate-950/60 px-3 py-3">
      <div className="text-[11px] uppercase tracking-[0.25em] text-slate-500">{label}</div>
      <div className="mt-2 text-sm font-medium text-slate-200">{value}</div>
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

function EmptyPanel({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/5 px-4 py-5 text-sm text-slate-300">
      {message}
    </div>
  );
}
