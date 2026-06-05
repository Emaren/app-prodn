"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import type { PlayerProfileIdentity, PlayerProfileMatchItem } from "@/lib/playerProfile";

type PlayerMatchFeedClientProps = {
  identity: PlayerProfileIdentity;
  initialItems: PlayerProfileMatchItem[];
  initialNextCursor: number | null;
  totalMatches: number;
  accent?: "amber" | "rose" | "sky";
  variant?: "command" | "classic";
};

function formatDate(value: string | null) {
  if (!value) return "Date hidden";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date hidden";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function resultClass(result: PlayerProfileMatchItem["result"]) {
  if (result === "win") return "border-emerald-300/25 bg-emerald-400/10 text-emerald-100";
  if (result === "loss") return "border-rose-300/25 bg-rose-400/10 text-rose-100";
  return "border-white/10 bg-white/5 text-slate-300";
}

function accentHoverClass(accent: "amber" | "rose" | "sky") {
  if (accent === "rose") return "hover:border-rose-300/35";
  if (accent === "sky") return "hover:border-sky-300/35";
  return "hover:border-amber-300/35";
}

function buildFeedUrl(identity: PlayerProfileIdentity, cursor: number) {
  const params = new URLSearchParams({
    kind: identity.kind,
    cursor: String(cursor),
  });

  if (identity.kind === "claimed") {
    params.set("uid", identity.uid);
  } else {
    params.set("name", identity.name);
  }

  return `/api/player-profile/matches?${params.toString()}`;
}

export default function PlayerMatchFeedClient({
  identity,
  initialItems,
  initialNextCursor,
  totalMatches,
  accent = "amber",
  variant = "command",
}: PlayerMatchFeedClientProps) {
  const [items, setItems] = useState(initialItems);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const loadMore = useCallback(async () => {
    if (loading || nextCursor === null) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(buildFeedUrl(identity, nextCursor), {
        cache: "no-store",
      });
      const payload = (await response.json()) as {
        items?: PlayerProfileMatchItem[];
        nextCursor?: number | null;
        detail?: string;
      };

      if (!response.ok) {
        throw new Error(payload.detail || "Match feed could not load.");
      }

      setItems((current) => [...current, ...(payload.items || [])]);
      setNextCursor(payload.nextCursor ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Match feed could not load.");
    } finally {
      setLoading(false);
    }
  }, [identity, loading, nextCursor]);

  useEffect(() => {
    if (!sentinelRef.current || nextCursor === null) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadMore();
        }
      },
      {
        root: null,
        rootMargin: "240px",
      }
    );

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [loadMore, nextCursor]);

  return (
    <div className="min-h-0">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs uppercase tracking-[0.28em] text-slate-400">
          {items.length} / {totalMatches} loaded
        </div>
        {nextCursor !== null ? (
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={loading}
            className="rounded-full border border-white/12 bg-white/5 px-3 py-1.5 text-xs text-slate-200 transition hover:border-white/25 hover:text-white disabled:cursor-wait disabled:opacity-60"
          >
            {loading ? "Loading..." : "Load older wars"}
          </button>
        ) : (
          <div className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1.5 text-xs text-emerald-100">
            Full archive loaded
          </div>
        )}
      </div>

      <div className="max-h-[48rem] space-y-3 overflow-y-auto pr-1 [scrollbar-color:rgba(251,191,36,0.35)_rgba(15,23,42,0.55)]">
        {items.length === 0 ? (
          <div className="rounded-[1.25rem] border border-white/8 bg-white/5 px-4 py-5 text-sm text-slate-300">
            No replay-backed matches have landed here yet.
          </div>
        ) : (
          items.map((item) => {
            if (variant === "classic") {
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className={`block rounded-2xl border border-white/8 bg-white/5 px-4 py-4 transition hover:bg-white/10 ${accentHoverClass(accent)}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="font-medium text-white">{item.mapName}</div>
                      <div className="mt-1 text-sm text-slate-300">{item.playersLabel}</div>
                    </div>
                    <div className="text-right text-xs uppercase tracking-[0.25em] text-slate-400">
                      {item.winnerLabel}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {item.outcomeLabel ? <Tag>{item.outcomeLabel}</Tag> : null}
                    <Tag>{item.parseLabel}</Tag>
                    {item.disconnectDetected ? <Tag>disconnect suspected</Tag> : null}
                  </div>

                  {item.playedAt ? (
                    <div className="mt-3 text-xs text-slate-400">{formatDate(item.playedAt)}</div>
                  ) : null}
                </Link>
              );
            }

            return (
              <Link
                key={item.id}
                href={item.href}
                className={`block rounded-[1.25rem] border border-white/8 bg-white/5 px-4 py-4 transition hover:bg-white/10 ${accentHoverClass(accent)}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-semibold text-white">{item.mapName}</div>
                      <span className={`rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] ${resultClass(item.result)}`}>
                        {item.result}
                      </span>
                    </div>
                    <div className="mt-1 text-sm leading-6 text-slate-300">{item.playersLabel}</div>
                  </div>
                  <div className="text-right text-xs uppercase tracking-[0.22em] text-slate-400">
                    {item.winnerLabel}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Tag>{item.parseLabel}</Tag>
                  <Tag>{item.durationLabel}</Tag>
                  <Tag>{item.playerCivilization}</Tag>
                  {item.score !== null ? <Tag>{Math.round(item.score).toLocaleString()} score</Tag> : null}
                  {item.eapm !== null ? <Tag>{Math.round(item.eapm * 10) / 10} EAPM</Tag> : null}
                  {item.outcomeLabel ? <Tag>{item.outcomeLabel}</Tag> : null}
                  {item.disconnectDetected ? <Tag>disconnect suspected</Tag> : null}
                </div>

                <div className="mt-3 text-xs text-slate-400">{formatDate(item.playedAt)}</div>
              </Link>
            );
          })
        )}
        <div ref={sentinelRef} className="h-6" />
      </div>

      {error ? (
        <div className="mt-3 rounded-[1rem] border border-rose-300/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      ) : null}
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
      {children}
    </span>
  );
}
