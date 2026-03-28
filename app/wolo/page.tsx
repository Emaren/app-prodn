"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import WoloChainTerminalTile from "@/components/wolo/WoloChainTerminalTile";
import { useChainId } from "@/hooks/useChainId";
import { useKeplr } from "@/hooks/use-keplr";
import { useWoloBalance } from "@/hooks/useWoloBalance";

const KEPLR_DOWNLOAD_URL = "https://www.keplr.app/get";

function formatAddress(address?: string) {
  if (!address) return "Not connected";
  return `${address.slice(0, 12)}…${address.slice(-8)}`;
}

function formatTokenAmount(raw?: string) {
  const amount = Number(raw ?? "0");
  if (!Number.isFinite(amount)) return "0.00";
  return (amount / 1_000_000).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function WoloPage() {
  const { data: chainData, isLoading: chainLoading } = useChainId();
  const { address, status, connect } = useKeplr();
  const { data: rawBalance, isLoading: balanceLoading } = useWoloBalance(address);
  const [walletError, setWalletError] = useState<string | null>(null);

  const chainId =
    chainData && typeof chainData === "object" && "chainId" in chainData
      ? String(chainData.chainId)
      : "wolo";

  const formattedBalance = useMemo(() => formatTokenAmount(rawBalance), [rawBalance]);
  const walletStatus =
    status === "connected"
      ? "Connected"
      : status === "not_installed"
        ? "Keplr missing"
        : "Disconnected";
  const walletHeadline =
    status === "connected" ? "Live" : status === "not_installed" ? "Install" : "Offline";

  async function handleConnect() {
    try {
      setWalletError(null);
      await connect();
    } catch (error) {
      setWalletError(error instanceof Error ? error.message : "Could not connect wallet.");
    }
  }

  return (
    <main className="space-y-4 py-2 text-white sm:space-y-6 sm:py-3">
      <section className="overflow-hidden rounded-[1.85rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.16),_transparent_26%),radial-gradient(circle_at_bottom_right,_rgba(56,189,248,0.10),_transparent_28%),linear-gradient(135deg,_#0f172a,_#111827_56%,_#050816)] p-4 sm:rounded-[2rem] sm:p-6 lg:p-8">
        <div className="grid gap-5 lg:grid-cols-[1.12fr_0.88fr] lg:items-start lg:gap-8">
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-2">
              <SignalChip label="$WOLO" tone="amber" />
              <SignalChip
                label={chainLoading ? "Syncing chain" : chainId}
                tone="emerald"
                title="Active chain id"
              />
              <SignalChip label={walletStatus} title="Wallet status" />
            </div>

            <div className="space-y-5">
              <div className="text-[11px] uppercase tracking-[0.35em] text-amber-200/70">
                WoloChain
              </div>
              <div className="space-y-3">
                <div className="text-[11px] uppercase tracking-[0.32em] text-white/45">
                  Max Supply
                </div>
                <div className="flex flex-wrap items-end gap-3">
                  <div
                    className="text-6xl font-semibold leading-[0.9] tracking-[-0.04em] text-white sm:text-7xl lg:text-[5.75rem]"
                    style={{
                      fontFamily:
                        '"Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif',
                    }}
                  >
                    1,000,000
                  </div>
                  <div className="pb-2 text-lg uppercase tracking-[0.42em] text-amber-100/80 sm:text-2xl">
                    WOLO
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <SignalChip label={`Denom uwolo`} />
                <SignalChip
                  label={balanceLoading ? "Balance syncing" : `Balance ${formattedBalance} WOLO`}
                  tone="emerald"
                />
                <SignalChip label={`Wallet ${walletHeadline}`} />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <WoloMiniStatCard label="Chain ID" value={chainLoading ? "..." : chainId} />
              <WoloMiniStatCard label="Denom" value="uwolo" />
              <WoloMiniStatCard label="Wallet" value={walletHeadline} />
              <WoloMiniStatCard
                label="Balance"
                value={balanceLoading ? "..." : formattedBalance}
                valueSuffix={balanceLoading ? undefined : "WOLO"}
              />
            </div>

            <div className="flex flex-wrap gap-3 pt-1">
              <Link
                href="/wallet"
                className="rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
              >
                Open Wallet
              </Link>
              <button
                type="button"
                onClick={() => {
                  void handleConnect();
                }}
                className="rounded-full border border-white/12 bg-white/5 px-5 py-3 text-sm text-white/85 transition hover:border-white/25 hover:bg-white/10 hover:text-white"
              >
                {status === "connected" ? "Wallet Live" : "Connect Keplr"}
              </button>
              <Link
                href="/download"
                className="rounded-full border border-white/12 bg-white/5 px-5 py-3 text-sm text-white/85 transition hover:border-white/25 hover:bg-white/10 hover:text-white"
              >
                Download Watcher
              </Link>
              <a
                href={KEPLR_DOWNLOAD_URL}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-5 py-3 text-sm text-emerald-100 transition hover:border-emerald-300/40 hover:bg-emerald-500/15"
              >
                Get Keplr
              </a>
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-white/10 bg-[#131b2a] p-5 shadow-[0_30px_80px_rgba(2,6,23,0.36)] sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="text-[11px] uppercase tracking-[0.35em] text-amber-200/70">
                Wallet Snapshot
              </div>
              <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
                {walletStatus}
              </div>
            </div>

            <div className="mt-5 grid gap-4">
              <WalletPanel label="Address" value={formatAddress(address)} mono />
              <WalletPanel
                label="Balance"
                value={balanceLoading ? "Loading..." : `${formattedBalance} WOLO`}
                emphasis
              />
              <WalletPanel label="Network" value={chainId} />
            </div>

            {walletError ? (
              <div className="mt-4 rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                {walletError}
              </div>
            ) : null}

            {status !== "connected" ? (
              <div className="mt-5 grid gap-3">
                <button
                  type="button"
                  onClick={() => {
                    void handleConnect();
                  }}
                  className="w-full rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-200"
                >
                  {status === "not_installed" ? "Try Connect After Install" : "Connect Keplr"}
                </button>
                <a
                  href={KEPLR_DOWNLOAD_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="block w-full rounded-full border border-white/12 bg-white/5 px-5 py-3 text-center text-sm text-white/85 transition hover:border-white/25 hover:text-white"
                >
                  Get Keplr Wallet
                </a>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <WoloChainTerminalTile />
    </main>
  );
}

function SignalChip({
  label,
  tone = "slate",
  title,
}: {
  label: string;
  tone?: "slate" | "amber" | "emerald";
  title?: string;
}) {
  const toneClassName =
    tone === "amber"
      ? "border-amber-300/20 bg-amber-400/12 text-amber-100"
      : tone === "emerald"
        ? "border-emerald-400/20 bg-emerald-500/12 text-emerald-100"
        : "border-white/10 bg-white/5 text-slate-200";

  return (
    <div
      title={title}
      className={`rounded-full border px-3 py-1.5 text-xs font-medium ${toneClassName}`}
    >
      {label}
    </div>
  );
}

function WoloMiniStatCard({
  label,
  value,
  valueSuffix,
}: {
  label: string;
  value: string;
  valueSuffix?: string;
}) {
  return (
    <div className="rounded-[1.45rem] border border-white/10 bg-white/5 px-5 py-5">
      <div className="text-[11px] uppercase tracking-[0.32em] text-slate-400">{label}</div>
      <div className="mt-4 flex flex-wrap items-end gap-2">
        <div className="break-words text-[2rem] font-semibold leading-none tracking-tight text-white sm:text-[2.2rem]">
          {value}
        </div>
        {valueSuffix ? (
          <div className="pb-1 text-[11px] uppercase tracking-[0.32em] text-slate-400">
            {valueSuffix}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function WalletPanel({
  label,
  value,
  mono = false,
  emphasis = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  emphasis?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-white/8 bg-[#0f1624] p-4">
      <div className="text-[11px] uppercase tracking-[0.25em] text-slate-400">{label}</div>
      <div
        className={`mt-2 break-all ${
          emphasis
            ? "text-3xl font-semibold text-white"
            : mono
              ? "font-mono text-sm text-white"
              : "text-lg font-semibold text-white"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
