import Link from "next/link";
import type { ReactNode } from "react";

import SteamLinkedBadge from "@/components/SteamLinkedBadge";
import { getPrisma } from "@/lib/prisma";
import { loadPublicRivalries, type PublicRivalryEntry } from "@/lib/publicMatchups";

export const dynamic = "force-dynamic";

export default async function RivalriesPage() {
  const prisma = getPrisma();
  const rivalries = await loadPublicRivalries(prisma);
  const featuredRivalries = rivalries.filter((entry) => entry.totalMatches >= 2);
  const freshFeuds = rivalries.filter((entry) => entry.totalMatches < 2);

  return (
    <main className="space-y-6 py-6 text-white">
      <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(96,165,250,0.22),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(245,158,11,0.14),_transparent_30%),linear-gradient(135deg,_#0f172a,_#111827_56%,_#020617)] p-8 shadow-[0_30px_90px_rgba(2,6,23,0.35)]">
        <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-5">
            <div className="text-sm uppercase tracking-[0.4em] text-sky-200/70">Rivalries</div>
            <h1 className="sr-only">AoE2HDBets rivalries</h1>

            <div className="flex flex-wrap gap-2">
              <Tag>{rivalries.length} boards live</Tag>
              <Tag>{featuredRivalries.length} featured</Tag>
              <Tag>{freshFeuds.length} fresh</Tag>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/"
                className="rounded-full bg-sky-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-200"
              >
                Back To Lobby
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
            <StatCard label="All Rivalries" value={String(rivalries.length)} />
            <StatCard label="Featured Rivalries" value={String(featuredRivalries.length)} />
            <StatCard label="Fresh Feuds" value={String(freshFeuds.length)} />
          </div>
        </div>
      </section>

      <Panel title="Featured" eyebrow="Replay-backed Battles">
        {featuredRivalries.length === 0 ? (
          <EmptyPanel message="No featured rivalries yet." />
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {featuredRivalries.map((entry) => (
              <RivalryCard key={entry.key} entry={entry} />
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Fresh" eyebrow="New Blood">
        {freshFeuds.length === 0 ? (
          <EmptyPanel message="No fresh feuds yet." />
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {freshFeuds.map((entry) => (
              <RivalryCard key={entry.key} entry={entry} />
            ))}
          </div>
        )}
      </Panel>
    </main>
  );
}

function RivalryCard({ entry }: { entry: PublicRivalryEntry }) {
  const lastPlayedLabel = entry.lastPlayedAt
    ? new Date(entry.lastPlayedAt).toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "Waiting for first match";

  return (
    <Link
      href={entry.href}
      className="block rounded-[1.8rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 transition hover:border-sky-300/30 hover:bg-white/10"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="text-xs uppercase tracking-[0.32em] text-white/45">Head-To-Head</div>
        <Tag>{entry.totalMatches === 1 ? "1 meeting" : `${entry.totalMatches} meetings`}</Tag>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-center">
        <RivalryPlayer player={entry.left} align="left" />
        <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 px-5 py-5 text-center">
          <div className="text-[11px] uppercase tracking-[0.28em] text-slate-500">Series</div>
          <div className="mt-2 text-5xl font-semibold tracking-tight text-white sm:text-6xl">
            {entry.leftWins}
            <span className="px-3 text-slate-500">-</span>
            {entry.rightWins}
          </div>
        </div>
        <RivalryPlayer player={entry.right} align="right" />
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <SummaryMetric label="Unknown Results" value={String(entry.unknowns)} />
        <SummaryMetric label="Last Meeting" value={lastPlayedLabel} />
        <SummaryMetric label="Action" value="Open Rivalry" />
      </div>
    </Link>
  );
}

function RivalryPlayer({
  player,
  align,
}: {
  player: PublicRivalryEntry["left"];
  align: "left" | "right";
}) {
  return (
    <div className={`min-w-0 rounded-[1.4rem] border border-white/8 bg-white/5 px-4 py-4 ${align === "right" ? "lg:text-right" : ""}`}>
      <div className="text-[11px] uppercase tracking-[0.25em] text-slate-500">
        {player.claimed ? "Claimed Warrior" : "Replay-built Warrior"}
      </div>
      <div className="mt-3 break-words text-2xl font-semibold leading-tight text-white">
        {player.name}
      </div>
      <div className={`mt-3 flex flex-wrap gap-2 ${align === "right" ? "lg:justify-end" : ""}`}>
        {player.claimed ? <SteamLinkedBadge compact /> : <Tag>Claimable identity</Tag>}
        {player.pendingWoloClaimCount > 0 ? <Tag>{player.pendingWoloClaimAmount} WOLO unclaimed</Tag> : null}
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

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-slate-950/60 px-4 py-4">
      <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">{label}</div>
      <div className="mt-3 break-words text-sm font-medium leading-6 text-white">{value}</div>
    </div>
  );
}

function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex max-w-full items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs leading-5 text-slate-300 break-words">
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
