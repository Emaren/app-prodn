"use client";

import Link from "next/link";
import { useMemo } from "react";

import { usePublicPresenceContext } from "@/components/presence/PublicPresenceProvider";

export type PlayerDirectoryOnlineEntry = {
  href: string;
  key: string;
  name: string;
  steamRmRating: number | null;
  steamDmRating: number | null;
  totalMatches: number;
  uid: string;
  verified: boolean;
  verificationLevel: number;
  wins: number;
  losses: number;
};

export default function PlayerDirectoryOnlineNow({
  entries,
}: {
  entries: PlayerDirectoryOnlineEntry[];
}) {
  const { onlineUidSet, ready } = usePublicPresenceContext();
  const onlineEntries = useMemo(
    () => entries.filter((entry) => onlineUidSet.has(entry.uid)),
    [entries, onlineUidSet],
  );

  if (!ready) {
    return (
      <div className="rounded-2xl border border-white/8 bg-white/5 px-4 py-5 text-sm text-slate-300">
        Checking who is live right now…
      </div>
    );
  }

  if (onlineEntries.length === 0) {
    return (
      <div className="rounded-2xl border border-white/8 bg-white/5 px-4 py-5 text-sm text-slate-300">
        No claimed players are live right now.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {onlineEntries.map((entry) => (
        <Link
          key={entry.key}
          href={entry.href}
          prefetch={false}
          className="block w-full min-w-0 rounded-2xl border border-white/8 bg-white/5 p-5 transition hover:border-emerald-300/30 hover:bg-white/10"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-lg font-semibold text-white">
                {entry.name}
              </div>
              <div className="mt-1 text-xs uppercase tracking-[0.25em] text-slate-400">
                {entry.verified
                  ? `claimed profile · level ${entry.verificationLevel}`
                  : `steam linked · level ${entry.verificationLevel}`}
              </div>
            </div>
            <div className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-100">
              Online
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            <OnlineStat
              label="Steam RM"
              value={formatRating(entry.steamRmRating)}
            />
            <OnlineStat
              label="Steam DM"
              value={formatRating(entry.steamDmRating)}
            />
            <OnlineStat label="Matches" value={String(entry.totalMatches)} />
            <OnlineStat
              label="Record"
              value={`${entry.wins}-${entry.losses}`}
            />
          </div>
        </Link>
      ))}
    </div>
  );
}

function OnlineStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/8 bg-slate-950/60 px-3 py-3">
      <div className="text-[11px] uppercase tracking-[0.25em] text-slate-500">
        {label}
      </div>
      <div className="mt-2 text-sm font-medium text-slate-200">{value}</div>
    </div>
  );
}

function formatRating(value: number | null) {
  return typeof value === "number" && Number.isFinite(value)
    ? String(Math.round(value))
    : "Unranked";
}
