"use client";

import Link from "next/link";
import { ArrowUpRight, Coins } from "lucide-react";

import {
  getLobbyPresentationTone,
  type LobbyThemeKey,
  type LobbyViewMode,
} from "@/components/lobby/lobbyPresentation";
import type { LobbySnapshot } from "@/lib/lobby";

type WoloMarketTileProps = {
  market: LobbySnapshot["woloMarket"] | null;
  themeKey: LobbyThemeKey;
  viewMode: LobbyViewMode;
};

export function WoloMarketTile({ market, themeKey, viewMode }: WoloMarketTileProps) {
  const tone = getLobbyPresentationTone(themeKey, viewMode);
  const poolId = market?.poolId ?? "3461";
  const pairLabel = market?.pairLabel ?? "WOLO / USDC";

  return (
    <section className={`rounded-[2rem] border p-5 sm:p-6 ${tone.panelShell}`}>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="min-w-0">
          <div className={`flex items-center gap-2 text-xs uppercase tracking-[0.35em] ${tone.accentText}`}>
            <Coins className="h-4 w-4" aria-hidden="true" />
            WOLO Market
          </div>
          <h2 className="mt-3 break-words text-2xl font-semibold text-white sm:text-3xl">
            {pairLabel} pool live on Osmosis {poolId}
          </h2>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-300">
            <span className={`rounded-full border px-3 py-1.5 ${tone.neutralPill}`}>
              {market?.priceUsd === null || market?.priceUsd === undefined
                ? "Price unavailable"
                : `$${market.priceUsd.toFixed(6)}`}
            </span>
            <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1.5 text-amber-100">
              Registry metadata pending
            </span>
            <span className={`rounded-full border px-3 py-1.5 ${tone.neutralPill}`}>
              Osmosis may show WOLO as an IBC denom
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 lg:justify-end">
          {market?.poolUrl ? (
            <Link
              href={market.poolUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-amber-300 px-5 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
            >
              Buy / Sell on Osmosis
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          ) : (
            <button
              type="button"
              disabled
              className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/10 px-5 text-sm font-semibold text-slate-500"
            >
              Osmosis Link Pending
            </button>
          )}
          <Link
            href="/wolo"
            className={`inline-flex min-h-12 items-center justify-center rounded-full border px-5 text-sm transition ${tone.secondaryButton}`}
          >
            Open $WOLO
          </Link>
        </div>
      </div>
    </section>
  );
}
