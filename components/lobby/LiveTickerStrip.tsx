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
};

export function LiveTickerStrip({ ticker, themeKey, viewMode }: LiveTickerStripProps) {
  const tone = getLobbyPresentationTone(themeKey, viewMode);
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
  const primaryItem = items[0];
  const trailingText = items
    .slice(1, 4)
    .map((item) => item.text)
    .join(" · ");

  return (
    <section
      className={`overflow-hidden rounded-full border px-4 py-2.5 shadow-[0_18px_50px_rgba(2,6,23,0.25)] ${tone.panelShell}`}
      aria-label="Live ticker"
    >
      <div className="flex min-w-0 items-center gap-3 whitespace-nowrap text-[12px] leading-none">
        <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-300 shadow-[0_0_16px_rgba(110,231,183,0.7)]" />
        <span className={`shrink-0 text-[10px] font-semibold uppercase tracking-[0.28em] ${tone.accentText}`}>
          Live
        </span>
        <span className="min-w-0 flex-1 truncate text-slate-100">
          <span className="font-semibold text-white">{primaryItem.text}</span>
          {trailingText ? <span className="text-slate-300/85"> · {trailingText}</span> : null}
        </span>
      </div>
    </section>
  );
}
