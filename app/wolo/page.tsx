"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
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
        ? "Keplr not found"
        : "Disconnected";

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
      <section className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.16),_transparent_28%),linear-gradient(135deg,_#0f172a,_#111827_55%,_#0b1120)] p-4 sm:rounded-[2rem] sm:p-6 lg:p-8">
        <div className="grid gap-5 lg:grid-cols-[1.15fr_0.95fr] lg:gap-8">
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-3">
              <div className="text-sm uppercase tracking-[0.4em] text-amber-200/70">$WOLO</div>
              <div className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-100">
                Chain live
              </div>
            </div>

            <div className="max-w-3xl space-y-3">
              <h2 className="text-4xl font-semibold leading-tight text-white sm:text-5xl">
                WOLO is the token layer for AoE2HDBets.
              </h2>
              <p className="max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
                The lobby, replay proof, wallet connectivity, and tournament-facing token rail all
                point here. This page gives WOLO a real home instead of a dead tile.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <WoloMiniStatCard
                label="Chain ID"
                value={chainLoading ? "Loading..." : chainId}
                subtext="Active network"
              />
              <WoloMiniStatCard label="Denom" value="uwolo" subtext="6 decimals" />
              <WoloMiniStatCard label="Wallet" value={walletStatus} subtext="Keplr-ready" />
            </div>

            <WoloSupplyFeatureTile />

            <div className="flex flex-wrap gap-3">
              <Link
                href="/wallet"
                className="rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
              >
                Open Wallet
              </Link>
              <Link
                href="/game-stats"
                className="rounded-full border border-white/15 px-5 py-3 text-sm text-white/85 transition hover:border-white/30 hover:text-white"
              >
                View Match History
              </Link>
              <Link
                href="/download"
                className="rounded-full border border-white/15 px-5 py-3 text-sm text-white/85 transition hover:border-white/30 hover:text-white"
              >
                Download Watcher
              </Link>
              <a
                href={KEPLR_DOWNLOAD_URL}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-5 py-3 text-sm text-emerald-100 transition hover:border-emerald-300/40 hover:bg-emerald-500/15"
              >
                Get Keplr Wallet
              </a>
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-white/10 bg-white/5 p-5 shadow-2xl shadow-black/20 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="text-xs uppercase tracking-[0.35em] text-amber-200/70">
                Wallet Snapshot
              </div>
              <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
                {walletStatus}
              </div>
            </div>

            <div className="mt-5 space-y-4">
              <div className="rounded-2xl border border-white/8 bg-slate-950/40 p-4">
                <div className="text-xs uppercase tracking-[0.25em] text-slate-400">Address</div>
                <div className="mt-2 break-all text-sm text-white">{formatAddress(address)}</div>
              </div>

              <div className="rounded-2xl border border-white/8 bg-slate-950/40 p-4">
                <div className="text-xs uppercase tracking-[0.25em] text-slate-400">Balance</div>
                <div className="mt-2 text-3xl font-semibold text-white">
                  {balanceLoading ? "Loading..." : `${formattedBalance} WOLO`}
                </div>
              </div>

              <div className="rounded-2xl border border-white/8 bg-slate-950/40 p-4">
                <div className="text-xs uppercase tracking-[0.25em] text-slate-400">Network</div>
                <div className="mt-2 text-lg font-semibold text-white">{chainId}</div>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  This is the chain identity surfaced by the live AoE2HDBets API.
                </p>
              </div>

              {walletError ? (
                <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                  {walletError}
                </div>
              ) : null}

              {status !== "connected" && (
                <div className="space-y-3">
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
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:gap-6 lg:grid-cols-3">
        <UtilityCard
          title="Tournament rail"
          body="WOLO belongs next to brackets, match identity, and tournament entry. The page should make that obvious instead of hiding the token as a tiny stat tile."
        />
        <UtilityCard
          title="Replay-backed trust"
          body="AoE2HDBets already has replay ingestion and result inference. WOLO becomes much more believable when it sits beside actual match proof instead of vague token talk."
        />
        <UtilityCard
          title="Wallet surface"
          body="This gives players one clear place to understand the chain ID, the denom, the wallet path, and where balance visibility fits into the product."
        />
      </section>

      <section className="rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-5 sm:rounded-[2rem] sm:p-6 lg:p-8">
        <div className="max-w-3xl space-y-3">
          <div className="text-xs uppercase tracking-[0.35em] text-white/45">Next Up</div>
          <h3 className="text-3xl font-semibold text-white">What this page should eventually hold</h3>
          <p className="text-base leading-7 text-slate-300">
            Supply is the easy part. The real value is showing how WOLO fits into tournament entry,
            verified outcomes, wallet actions, and later settlement flows without pretending the
            whole betting stack is finished when it isn’t.
          </p>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <RoadmapCard
            title="Near term"
            body="Wallet connection, chain identity, balance visibility, and a clean explanation of what WOLO is."
          />
          <RoadmapCard
            title="Next layer"
            body="Tournament entry hooks, reward distribution, and sharper trust labels around inferred versus confirmed outcomes."
          />
          <RoadmapCard
            title="Later"
            body="Real settlement surfaces, stronger chain analytics, and a token page that feels like part of the product instead of an orphan route."
          />
        </div>
      </section>
    </main>
  );
}

function WoloMiniStatCard({
  label,
  value,
  subtext,
}: {
  label: string;
  value: string;
  subtext?: string;
}) {
  return (
    <div className="rounded-[1.4rem] border border-white/10 bg-white/5 px-5 py-5 min-h-[118px]">
      <div className="flex h-full flex-col justify-between gap-4">
        <div className="space-y-2">
          <div className="text-[11px] uppercase tracking-[0.32em] text-slate-400">{label}</div>
          <div className="max-w-[11ch] break-words text-3xl font-semibold leading-tight tracking-tight text-white sm:text-4xl">
            {value}
          </div>
        </div>
        <div className="min-h-[1rem] text-xs text-slate-400">{subtext ?? "\u00A0"}</div>
      </div>
    </div>
  );
}

function WoloSupplyFeatureTile() {
  return (
    <div className="rounded-[1.55rem] border border-amber-300/15 bg-[linear-gradient(135deg,rgba(251,191,36,0.08),rgba(15,23,42,0.72)_28%,rgba(17,24,39,0.92)_100%)] px-5 py-5">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-[11px] uppercase tracking-[0.32em] text-amber-200/80">
              Max Supply
            </div>
            <div className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-slate-200">
              WOLO
            </div>
          </div>

          <div className="text-4xl font-semibold leading-none tracking-tight text-white tabular-nums sm:text-5xl">
            1,000,000
          </div>

          <p className="max-w-2xl text-sm leading-6 text-slate-300 sm:text-[15px]">
            WOLO is the tournament-facing token rail for replay-backed trust, wallet visibility, and
            the next layer of verified match identity on AoE2HDBets.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 lg:max-w-[18rem] lg:justify-end">
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-slate-300">
            Tournament rail
          </span>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-slate-300">
            Replay-linked
          </span>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-slate-300">
            Wallet-ready
          </span>
        </div>
      </div>
    </div>
  );
}

function UtilityCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-6">
      <div className="text-lg font-semibold text-white">{title}</div>
      <p className="mt-3 text-sm leading-6 text-slate-300">{body}</p>
    </div>
  );
}

function RoadmapCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[1.5rem] border border-white/8 bg-white/5 p-5">
      <div className="text-sm font-semibold uppercase tracking-[0.25em] text-amber-200/70">
        {title}
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-300">{body}</p>
    </div>
  );
}
