"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight, CircuitBoard, WalletCards } from "lucide-react";

import type { MarketRailSummary } from "@/components/admin/WoloMarketRail";
import type { SettlementRailSummary } from "@/components/admin/WoloSettlementRail";
import type { WalletFrictionRailSummary } from "@/lib/adminWalletFriction";
import type { WoloChainAdminPayload } from "@/lib/adminWoloChainTypes";

type Props = {
  marketSummary: MarketRailSummary;
  settlementSummary: SettlementRailSummary;
  walletFrictionSummary: WalletFrictionRailSummary;
};

function formatWolo(value: number) {
  return value.toLocaleString();
}

function statusTone(kind: "good" | "warn" | "bad" | "muted") {
  switch (kind) {
    case "good":
      return "border-emerald-300/25 bg-emerald-400/10 text-emerald-100";
    case "warn":
      return "border-amber-300/25 bg-amber-400/10 text-amber-100";
    case "bad":
      return "border-rose-300/25 bg-rose-400/10 text-rose-100";
    default:
      return "border-white/10 bg-white/5 text-slate-300";
  }
}

function compactCapability(value: string) {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

export default function WoloChainEntryTile({
  marketSummary,
  settlementSummary,
  walletFrictionSummary,
}: Props) {
  const [snapshot, setSnapshot] = useState<WoloChainAdminPayload | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      const response = await fetch("/api/admin/wolochain", { cache: "no-store" }).catch(() => null);
      if (!response?.ok) return;
      const payload = (await response.json().catch(() => null)) as WoloChainAdminPayload | null;
      if (active && payload) {
        setSnapshot(payload);
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, []);

  const chainTone = snapshot?.chain.healthy
    ? snapshot.chain.consensusStatus === "advancing"
      ? "good"
      : "warn"
    : snapshot
      ? "bad"
      : "muted";
  const settlementTone = marketSummary.settlementPayoutReady
    ? "good"
    : marketSummary.settlementServiceConfigured
      ? "warn"
      : "bad";
  const warningCount =
    (snapshot?.warnings.length ?? 0) +
    marketSummary.failedSettlementCount +
    settlementSummary.failedCount +
    walletFrictionSummary.last24Hours;

  return (
    <section className="overflow-hidden rounded-[1.7rem] border border-cyan-200/15 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.14),_transparent_26%),linear-gradient(135deg,_rgba(15,23,42,0.94),_rgba(2,6,23,0.96))] p-5 shadow-[0_20px_55px_rgba(0,0,0,0.28)]">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-cyan-100/70">
            <CircuitBoard className="h-4 w-4" />
            WoloChain
          </div>
          <h2 className="mt-2 text-2xl font-semibold text-white">Settlement cockpit moved out of user ops</h2>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className={`rounded-full border px-3 py-1 ${statusTone(chainTone)}`}>
              Chain {snapshot?.chain.statusLabel ?? "loading"}
            </span>
            <span className={`rounded-full border px-3 py-1 ${statusTone(settlementTone)}`}>
              Settlement{" "}
              {marketSummary.settlementPayoutReady
                ? compactCapability(marketSummary.settlementExecutionMode)
                : compactCapability(
                    marketSummary.settlementHealthFailureCode ||
                      marketSummary.settlementExecutionMode
                  )}
            </span>
            <span className={`rounded-full border px-3 py-1 ${statusTone(warningCount > 0 ? "warn" : "good")}`}>
              {warningCount} warning{warningCount === 1 ? "" : "s"}
            </span>
          </div>
        </div>

        <div className="grid gap-2 text-xs sm:grid-cols-4 lg:min-w-[34rem]">
          <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
            <div className="text-slate-500">Escrow</div>
            <div className="mt-1 font-semibold text-white">
              {snapshot?.balances.escrow.amountWolo || "—"}
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
            <div className="text-slate-500">Pending payouts</div>
            <div className="mt-1 font-semibold text-white">
              {settlementSummary.pendingCount} · {formatWolo(settlementSummary.pendingAmountWolo)}
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
            <div className="flex items-center gap-1 text-slate-500">
              <WalletCards className="h-3.5 w-3.5" />
              Pot watch
            </div>
            <div className="mt-1 font-semibold text-white">
              {formatWolo(marketSummary.totalPotWolo)} WOLO
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
            <div className="text-slate-500">Wallet friction</div>
            <div className="mt-1 font-semibold text-white">
              {walletFrictionSummary.last24Hours} / 24h
            </div>
          </div>
        </div>

        <Link
          href="/admin/wolochain"
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full border border-cyan-200/30 bg-cyan-300/10 px-5 py-3 text-sm font-semibold text-cyan-50 transition hover:border-cyan-100/50 hover:bg-cyan-300/18"
        >
          Open WoloChain Admin
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}
