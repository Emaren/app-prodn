"use client";

import {
  getLobbyPresentationTone,
  type LobbyThemeKey,
  type LobbyViewMode,
} from "@/components/lobby/lobbyPresentation";
import type { LobbySnapshot } from "@/lib/lobby";

type LiveTickerStripProps = {
  ticker: LobbySnapshot["liveTicker"] | null;
  themeKey: LobbyThemeKey;
  viewMode: LobbyViewMode;
  surface?: "standard" | "extreme";
};

export function LiveTickerStrip({ ticker, themeKey, viewMode, surface = "standard" }: LiveTickerStripProps) {
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
  const loopItems = [...items, ...items];

  return (
    <section
      className={`overflow-hidden rounded-full border px-4 py-2.5 shadow-[0_18px_50px_rgba(2,6,23,0.25)] ${
        isExtreme ? "border-amber-200/10 bg-black/26" : tone.panelShell
      }`}
      aria-label="Live ticker"
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
          animation: lobbyTickerScroll 34s linear infinite;
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
          Live
        </span>
        <div className="relative min-w-0 flex-1 overflow-hidden text-slate-100">
          <div className="lobby-ticker-track flex w-max items-center gap-8 pr-8" aria-hidden="true">
            {loopItems.map((item, index) => (
              <span key={`${item.key}-${index}`} className="inline-flex items-center gap-3">
                <span className="font-semibold text-white">{item.text}</span>
                <span className="h-1 w-1 rounded-full bg-white/28" />
              </span>
            ))}
          </div>
          <span className="sr-only">{items.map((item) => item.text).join(" · ")}</span>
        </div>
      </div>
    </section>
  );
}
