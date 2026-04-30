"use client";

import { type ReactNode, useMemo, useState, type UIEvent } from "react";
import Link from "next/link";

import WatchPreviewScreen from "@/components/watch/WatchPreviewScreen";

type WatchArchiveMatch = {
  id: number;
  sessionKey: string;
  href: string;
  title: string;
  mapName: string;
  durationLabel: string;
  winner: string;
  parseIteration: number;
  createdLabel: string;
  hasFeed: boolean;
  streamCount: number;
  recordingUrl: string | null;
  previewUrl: string | null;
  thumbnailUrl: string | null;
  bestOfUrl: string | null;
};

const INITIAL_VISIBLE_COUNT = 9;
const LOAD_STEP = 9;

export default function RecentBroadcastArchive({
  matches,
}: {
  matches: WatchArchiveMatch[];
}) {
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_COUNT);
  const visibleMatches = useMemo(
    () => matches.slice(0, Math.min(visibleCount, matches.length)),
    [matches, visibleCount]
  );

  function handleScroll(event: UIEvent<HTMLDivElement>) {
    const element = event.currentTarget;
    const nearBottom =
      element.scrollHeight - element.scrollTop - element.clientHeight < 220;
    if (!nearBottom) return;

    setVisibleCount((current) => Math.min(matches.length, current + LOAD_STEP));
  }

  if (!matches.length) {
    return (
      <div className="mt-5 rounded-3xl border border-white/10 bg-white/[0.035] p-6 text-sm leading-6 text-slate-300">
        Archive empty.
      </div>
    );
  }

  return (
    <div className="mt-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-slate-300">
          {visibleMatches.length} of {matches.length}
        </span>
        {visibleMatches.length < matches.length ? (
          <span className="text-xs uppercase tracking-[0.22em] text-slate-500">
            Scroll for more
          </span>
        ) : null}
      </div>

      <div
        data-testid="recent-broadcasts-scroll"
        onScroll={handleScroll}
        className="max-h-[72vh] overflow-y-auto pr-2 [scrollbar-color:rgba(125,211,252,0.32)_rgba(15,23,42,0.55)]"
      >
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {visibleMatches.map((match) => (
            <ArchiveCard key={`${match.sessionKey}-${match.id}`} match={match} />
          ))}
        </div>

        {visibleMatches.length < matches.length ? (
          <div className="mt-4 rounded-3xl border border-white/10 bg-white/[0.035] p-4 text-center text-xs uppercase tracking-[0.24em] text-slate-400">
            Loading more as you scroll
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ArchiveCard({ match }: { match: WatchArchiveMatch }) {
  return (
    <Link
      href={match.href}
      className="group block overflow-hidden rounded-[1.6rem] border border-white/10 bg-white/[0.035] transition hover:-translate-y-0.5 hover:border-sky-300/35 hover:bg-sky-400/[0.06]"
    >
      <div className="relative aspect-video overflow-hidden bg-black">
        <ArchivePreview match={match} />
        <div className="absolute left-3 top-3 flex flex-wrap gap-2">
          <Pill tone="emerald">Archive</Pill>
          <Pill tone={match.hasFeed ? "sky" : "amber"}>{match.hasFeed ? "Feed" : "No feed"}</Pill>
        </div>
        <div className="absolute right-3 top-3 rounded-full border border-white/10 bg-black/35 px-3 py-1 text-xs text-white">
          #{match.parseIteration}
        </div>
      </div>

      <div className="p-5">
        <h3 className="text-2xl font-semibold tracking-tight text-white group-hover:text-sky-100">
          {match.title}
        </h3>
        <p className="mt-2 text-sm text-slate-400">
          {match.mapName} · {match.createdLabel}
        </p>

        <div className="mt-5 grid grid-cols-3 gap-3">
          <MiniStat label="Winner" value={match.winner} />
          <MiniStat label="Time" value={match.durationLabel} />
          <MiniStat label="Feeds" value={String(match.streamCount)} />
        </div>
      </div>
    </Link>
  );
}

function ArchivePreview({ match }: { match: WatchArchiveMatch }) {
  const videoUrl = match.bestOfUrl || match.previewUrl || match.recordingUrl || null;

  return (
    <WatchPreviewScreen
      title={match.title}
      mediaKey={match.sessionKey}
      videoUrl={videoUrl}
      posterUrl={videoUrl ? match.thumbnailUrl : null}
      badge={videoUrl ? "AUTO" : "READY"}
    />
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="text-[11px] uppercase tracking-[0.24em] text-slate-400">{label}</div>
      <div className="mt-2 break-words text-lg font-semibold text-white">{value}</div>
    </div>
  );
}

function Pill({
  children,
  tone = "slate",
}: {
  children: ReactNode;
  tone?: "slate" | "sky" | "amber" | "emerald";
}) {
  const toneClassName =
    tone === "sky"
      ? "border-sky-300/25 bg-sky-400/10 text-sky-100"
      : tone === "amber"
        ? "border-amber-300/25 bg-amber-300/10 text-amber-100"
        : tone === "emerald"
          ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-100"
          : "border-white/10 bg-white/5 text-slate-200";

  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${toneClassName}`}>
      {children}
    </span>
  );
}
