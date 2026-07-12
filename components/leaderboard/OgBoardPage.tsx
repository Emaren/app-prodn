"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { LeaderboardViewLink } from "@/components/leaderboard/LeaderboardViewLink";
import { OgBattleCard } from "@/components/leaderboard/OgBattleCard";
import type { OgBoardPage as OgBoardPageData } from "@/lib/ogBoard";

const PAGE_SIZE = 24;

export function OgBoardPage({ initialPage }: { initialPage: OgBoardPageData | null }) {
  const [entries, setEntries] = useState(initialPage?.entries ?? []);
  const [nextOffset, setNextOffset] = useState(initialPage?.nextOffset ?? 0);
  const [hasMore, setHasMore] = useState(initialPage?.hasMore ?? false);
  const [loading, setLoading] = useState(!initialPage);
  const [error, setError] = useState(initialPage ? null : "The battle board is temporarily unavailable.");
  const loadingRef = useRef(false);
  const sentinelRef = useRef<HTMLButtonElement | null>(null);

  const loadMore = useCallback(async (reset = false) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError(null);
    const offset = reset ? 0 : nextOffset;

    try {
      const response = await fetch(`/api/leaderboard/og?offset=${offset}&limit=${PAGE_SIZE}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as Partial<OgBoardPageData>;
      if (!response.ok || !Array.isArray(payload.entries)) throw new Error("OG board unavailable");
      setEntries((current) => {
        const next = reset ? [] : [...current];
        const ids = new Set(next.map((entry) => entry.id));
        for (const entry of payload.entries!) if (!ids.has(entry.id)) next.push(entry);
        return next;
      });
      setNextOffset(typeof payload.nextOffset === "number" ? payload.nextOffset : offset + PAGE_SIZE);
      setHasMore(Boolean(payload.hasMore));
    } catch {
      setError(reset ? "The battle board is temporarily unavailable." : "Older battles could not be loaded. Try again.");
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [nextOffset]);

  useEffect(() => {
    if (!hasMore || loading) return;
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (items) => {
        if (items.some((item) => item.isIntersecting)) void loadMore();
      },
      { rootMargin: "700px 0px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loadMore, loading]);

  return (
    <main className="py-3 text-white sm:py-6">
      <div className="mx-auto w-full max-w-[54rem]">
        <header className="mb-6 border-b border-amber-200/22 pb-5">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.34em] text-amber-200/55">AoE2WAR battle archive</div>
              <h1 className="mt-2 font-serif text-4xl font-semibold text-amber-100 sm:text-5xl">OG Board</h1>
              <p className="mt-2 text-sm text-slate-400">The first board. Every battle remembered.</p>
            </div>
            <LeaderboardViewLink from="og" to="modern" href="/leaderboard">Modern Board</LeaderboardViewLink>
          </div>
        </header>

        {entries.length === 0 && loading ? (
          <div className="space-y-5" aria-label="Loading battles">
            {Array.from({ length: 3 }, (_, index) => <div key={index} className="h-80 animate-pulse border border-white/[0.06] bg-white/[0.035]" />)}
          </div>
        ) : entries.length === 0 ? (
          <div className="border border-amber-200/14 bg-amber-300/[0.04] px-5 py-10 text-center text-slate-300">No recorded battles yet. Final HD replays will appear here newest first.</div>
        ) : (
          <div className="space-y-5" aria-busy={loading}>
            {entries.map((entry, index) => <OgBattleCard key={entry.id} entry={entry} latest={index === 0} />)}
          </div>
        )}

        {error ? (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border border-orange-300/20 bg-orange-400/[0.06] px-4 py-3 text-sm text-orange-100">
            <span>{error}</span>
            <button type="button" onClick={() => void loadMore(entries.length === 0)} className="font-semibold underline underline-offset-4">Try again</button>
          </div>
        ) : null}

        {hasMore && entries.length > 0 ? (
          <button
            ref={sentinelRef}
            type="button"
            disabled={loading}
            onClick={() => void loadMore()}
            className="mt-6 w-full border border-amber-200/18 bg-amber-300/[0.045] px-4 py-4 text-xs font-bold uppercase tracking-[0.24em] text-amber-100 transition hover:border-amber-200/40 hover:bg-amber-300/[0.08] disabled:cursor-wait disabled:opacity-65"
          >
            {loading ? "Opening the archive…" : "Load older battles"}
          </button>
        ) : null}
      </div>
    </main>
  );
}
