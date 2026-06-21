"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeftRight, ArrowUpRight } from "lucide-react";
import { useMemo, useState } from "react";

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
  surface?: "standard" | "extreme";
};

const WOLO_LOGO_SRC = "/api/media-assets/logo/footer-wolo?fallback=%2Flegacy%2Fwolo-logo-transparent.webp";

function formatUsdPrice(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "Pool syncing";
  if (value < 0.001) return `$${value.toFixed(7)}`;
  if (value < 1) return `$${value.toFixed(6)}`;
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 4 })}`;
}

function formatSwapAmount(value: number) {
  if (!Number.isFinite(value)) return "0";
  if (value >= 1_000_000) return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (value >= 1) return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return value.toLocaleString(undefined, { minimumFractionDigits: 6, maximumFractionDigits: 6 });
}

export function WoloMarketTile({ market, themeKey, viewMode, surface = "standard" }: WoloMarketTileProps) {
  const tone = getLobbyPresentationTone(themeKey, viewMode);
  const isExtreme = surface === "extreme";
  const poolId = market?.poolId ?? "3461";
  const poolUrl = market?.poolUrl ?? "https://app.osmosis.zone/pool/3461";
  const priceUsd = market?.priceUsd ?? null;
  const [amount, setAmount] = useState("1000");
  const [swapMode, setSwapMode] = useState<"woloToUsdc" | "usdcToWolo">("woloToUsdc");
  const numericAmount = Number(amount);
  const quote = useMemo(() => {
    if (priceUsd == null || !Number.isFinite(numericAmount) || numericAmount <= 0) return null;
    return swapMode === "woloToUsdc" ? numericAmount * priceUsd : numericAmount / priceUsd;
  }, [numericAmount, priceUsd, swapMode]);
  const fromSymbol = swapMode === "woloToUsdc" ? "WOLO" : "USDC";
  const toSymbol = swapMode === "woloToUsdc" ? "USDC" : "WOLO";

  return (
    <section
      className={`overflow-hidden rounded-[2rem] border p-5 sm:p-6 ${
        isExtreme
          ? "border-amber-200/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.045),rgba(255,255,255,0.018))] shadow-[0_28px_96px_rgba(0,0,0,0.3)]"
          : tone.panelShell
      }`}
    >
      <div className="mx-auto max-w-4xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className={`text-xs uppercase tracking-[0.35em] ${tone.accentText}`}>
            WOLO Market
          </div>
          <span className={`rounded-full border px-3 py-1 text-[11px] ${tone.neutralPill}`}>
            Pool #{poolId}
          </span>
        </div>

        <div className="mt-5 flex min-w-0 flex-wrap items-center justify-center gap-4 sm:gap-7">
          <div className="flex h-20 w-20 items-center justify-center rounded-full border border-amber-200/22 bg-[radial-gradient(circle_at_32%_24%,rgba(253,224,71,0.18),transparent_38%),rgba(251,191,36,0.08)] shadow-[0_0_48px_rgba(251,191,36,0.14)] sm:h-24 sm:w-24">
            <Image
              src={WOLO_LOGO_SRC}
              alt="WOLO"
              width={62}
              height={62}
              unoptimized
              className="h-16 w-16 object-contain"
            />
          </div>

          <div className="flex min-w-[10rem] flex-col items-center">
            <div className="text-4xl font-semibold text-white">=</div>
            <h2 className="mt-2 whitespace-nowrap text-center text-2xl font-semibold tracking-tight text-white sm:text-4xl">
              {formatUsdPrice(priceUsd)}
            </h2>
            <div className="mt-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-slate-300">
              {market?.priceStatus === "pool" ? "Pool live" : "1 WOLO"}
            </div>
          </div>

          <div className="flex h-20 w-20 items-center justify-center rounded-full border border-sky-200/25 bg-[radial-gradient(circle_at_32%_24%,rgba(125,211,252,0.22),transparent_38%),rgba(37,99,235,0.18)] shadow-[0_0_48px_rgba(56,189,248,0.12)] sm:h-24 sm:w-24">
            <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white/28 bg-[#2775ca] text-sm font-black text-white shadow-[inset_0_0_0_3px_rgba(255,255,255,0.08)]">
              USDC
            </div>
          </div>
        </div>

        <div className={`mx-auto mt-5 max-w-2xl rounded-[1.45rem] border p-3 ${tone.insetPanel}`}>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/35 px-3 py-2.5">
              <input
                aria-label={`Amount of ${fromSymbol} to swap`}
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ""))}
                className="min-w-0 bg-transparent text-xl font-semibold text-white outline-none placeholder:text-slate-500"
                placeholder="0"
              />
              <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs font-semibold text-slate-100">
                {fromSymbol}
              </span>
            </div>

            <button
              type="button"
              onClick={() =>
                setSwapMode((current) => (current === "woloToUsdc" ? "usdcToWolo" : "woloToUsdc"))
              }
              aria-label="Flip WOLO and USDC"
              title="Flip WOLO and USDC"
              className="mx-auto inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/12 bg-white/[0.05] text-slate-100 transition hover:border-white/28 hover:bg-white/[0.1]"
            >
              <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />
            </button>

            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2.5">
              <div className="min-w-0 truncate text-xl font-semibold text-white">
                {quote == null ? "--" : formatSwapAmount(quote)}
              </div>
              <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs font-semibold text-slate-100">
                {toSymbol}
              </span>
            </div>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
            <Link
              href={poolUrl}
              target="_blank"
              rel="noreferrer"
              className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold transition ${tone.primaryButton}`}
            >
              Swap
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link
              href="/wolo"
              className={`inline-flex min-h-11 items-center justify-center rounded-full border px-4 text-sm transition ${tone.secondaryButton}`}
            >
              $WOLO
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
