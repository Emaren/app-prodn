"use client";

import { useEffect, useRef, useState } from "react";
import {
  getLobbyPresentationTone,
  type LobbyThemeKey,
  type LobbyViewMode,
} from "@/components/lobby/lobbyPresentation";
import type { LobbySnapshot } from "@/lib/lobby";
import { tickerTravelSeconds } from "@/lib/lobbyTickerMotion";
import { useHomeCopy } from "@/components/i18n/useHomeCopy";

type LiveTickerStripProps = {
  ticker: LobbySnapshot["liveTicker"] | null;
  themeKey: LobbyThemeKey;
  viewMode: LobbyViewMode;
  surface?: "standard" | "extreme";
};

export function LiveTickerStrip({ ticker, themeKey, viewMode, surface = "standard" }: LiveTickerStripProps) {
  const h = useHomeCopy();
  const tone = getLobbyPresentationTone(themeKey, viewMode);
  const isExtreme = surface === "extreme";
  const items =
    ticker?.items && ticker.items.length > 0
      ? ticker.items
      : [
          {
            key: "fallback",
            text: "LIVE · AoE2HD lobby open · Join the next Founders Cup",
            source: "system" as const,
            priority: 0,
            expiresAt: null,
          },
        ];
  // Two equally-sized copies guarantee that -50% is precisely one full
  // cycle, including the end separator. One uneven outer padding caused a
  // visible hole at the join. Speed is based on measured travel distance.
  const trackRef = useRef<HTMLDivElement>(null);
  const [travelSeconds, setTravelSeconds] = useState(26);
  const contentKey = items.map((item) => item.key + ":" + item.text).join("|");

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const measure = () => {
      const pixelsPerCycle = track.scrollWidth / 2;
      if (!pixelsPerCycle) return;
      const seconds = tickerTravelSeconds(pixelsPerCycle);
      setTravelSeconds((current) => Math.abs(current - seconds) > 0.2 ? seconds : current);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    return () => observer.disconnect();
  }, [contentKey]);

  return (
    <section
      className={`overflow-hidden rounded-full border px-4 py-2.5 shadow-[0_18px_50px_rgba(2,6,23,0.25)] ${
        isExtreme ? "border-amber-200/10 bg-black/26" : tone.panelShell
      }`}
      aria-label={h("Live ticker")}
    >
      <style>{`
        @keyframes lobbyTickerScroll {
          from {
            transform: translateX(0);
          }
          to {
            transform: translateX(-50%);
          }
        }

        .lobby-ticker-track {
          animation: lobbyTickerScroll 26s linear infinite;
          will-change: transform;
        }

        .lobby-ticker-track:hover {
          animation-play-state: paused;
        }

        @media (prefers-reduced-motion: reduce) {
          .lobby-ticker-track {
            animation: none;
          }
        }
      `}</style>
      <div className="flex min-w-0 items-center gap-3 whitespace-nowrap text-[12px] leading-none">
        <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-300 shadow-[0_0_16px_rgba(110,231,183,0.7)]" />
        <span className={`shrink-0 text-[10px] font-semibold uppercase tracking-[0.28em] ${tone.accentText}`}>
          {h("Live")}
        </span>
        <div className="relative min-w-0 flex-1 overflow-hidden text-slate-100">
          <div
            ref={trackRef}
            className="lobby-ticker-track flex w-max items-center gap-0"
            style={{ animationDuration: travelSeconds + "s" }}
            aria-hidden="true"
          >
            {[0, 1].map((copy) => (
              <div key={copy} className="flex shrink-0 items-center gap-8 pr-8">
                {items.map((item, index) => (
                  <span key={item.key + "-" + copy + "-" + index} className="inline-flex items-center gap-3">
                    <span className="font-semibold text-white">{h(item.text)}</span>
                    <span className="h-1 w-1 rounded-full bg-white/28" />
                  </span>
                ))}
              </div>
            ))}
          </div>
          <span className="sr-only">{items.map((item) => h(item.text)).join(" · ")}</span>
        </div>
      </div>
    </section>
  );
}
