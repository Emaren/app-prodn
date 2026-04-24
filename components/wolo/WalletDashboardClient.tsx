"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { useKeplr } from "@/hooks/use-keplr";
import { useWoloBalance } from "@/hooks/useWoloBalance";
import { WOLO_KEPLR_DOWNLOAD_URL } from "@/lib/woloChain";

const WALLET_ACTIONS = [
  {
    label: "Open WoloChain",
    href: "/wolo",
    description: "View supply, node status, faucet, and chain context.",
    className: "border-amber-300/20 bg-amber-400/10 text-amber-100 hover:bg-amber-400/15",
  },
  {
    label: "Download Watcher",
    href: "/download",
    description: "Install the replay watcher before live games.",
    className: "border-sky-300/20 bg-sky-400/10 text-sky-100 hover:bg-sky-400/15",
  },
  {
    label: "Open Bets",
    href: "/bets",
    description: "See active markets and match activity.",
    className: "border-emerald-300/20 bg-emerald-400/10 text-emerald-100 hover:bg-emerald-400/15",
  },
];

function formatWalletBalance(rawBalance?: string) {
  const amount = Number(rawBalance ?? "0");
  if (!Number.isFinite(amount)) return "0.00";
  return (amount / 1_000_000).toFixed(2);
}

function formatAddress(address?: string) {
  if (!address) return "Not connected";
  return `${address.slice(0, 12)}…${address.slice(-8)}`;
}

export default function WalletDashboardClient() {
  const { address, status, connect, disconnect } = useKeplr();
  const { data: rawBalance, isLoading, refetch } = useWoloBalance(address);
  const [walletNotice, setWalletNotice] = useState<string | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const formattedBalance = useMemo(() => formatWalletBalance(rawBalance), [rawBalance]);

  const keplrMissing = status === "not_installed";
  const connected = status === "connected";
  const connecting = status === "connecting" || isBusy;

  const statusLabel =
    connected
      ? "Connected"
      : status === "connecting"
        ? "Connecting"
        : keplrMissing
          ? "Keplr not installed"
          : "Not connected";

  const primaryLabel = keplrMissing
    ? "Install Keplr"
    : connected
      ? "Refresh Balance"
      : connecting
        ? "Connecting..."
        : "Connect Keplr";

  async function handlePrimaryWalletAction() {
    setWalletError(null);
    setWalletNotice(null);

    if (keplrMissing) {
      window.open(WOLO_KEPLR_DOWNLOAD_URL, "_blank", "noopener,noreferrer");
      setWalletNotice("Install Keplr, unlock it, then refresh this page.");
      return;
    }

    try {
      setIsBusy(true);

      if (!connected) {
        await connect();
        setWalletNotice("Wallet connected. Balance should appear once Keplr returns your Wolo address.");
        return;
      }

      await refetch();
      setWalletNotice("Balance refreshed.");
    } catch (error) {
      setWalletError(
        error instanceof Error
          ? error.message
          : "Could not connect Keplr. Check that the extension is installed and unlocked."
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function handleSecondaryRefresh() {
    setWalletError(null);
    setWalletNotice(null);

    if (keplrMissing) {
      window.open(WOLO_KEPLR_DOWNLOAD_URL, "_blank", "noopener,noreferrer");
      setWalletNotice("Install Keplr first, then connect your WoloChain wallet.");
      return;
    }

    try {
      setIsBusy(true);

      if (!connected) {
        await connect();
        setWalletNotice("Wallet connected. Your balance will load automatically.");
        return;
      }

      await refetch();
      setWalletNotice("Balance refreshed.");
    } catch (error) {
      setWalletError(
        error instanceof Error ? error.message : "Could not refresh WOLO balance."
      );
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.13),transparent_30%),linear-gradient(135deg,rgba(15,23,42,0.98),rgba(8,13,26,0.98))] p-5 shadow-[0_24px_80px_rgba(2,6,23,0.35)] sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.35em] text-amber-200/70">
              Wallet Status
            </p>

            <div className="space-y-2 text-sm text-slate-300">
              <p>
                <strong className="text-white">Status:</strong> {statusLabel}
              </p>
              <p className="break-all">
                <strong className="text-white">Address:</strong>{" "}
                {connected ? formatAddress(address) : "Not connected"}
              </p>
            </div>

            {keplrMissing ? (
              <p className="max-w-2xl text-sm leading-6 text-slate-300">
                Keplr is the wallet AoE2HDBets uses for WoloChain. Install it,
                unlock it, refresh this page, then connect.
              </p>
            ) : !connected ? (
              <p className="max-w-2xl text-sm leading-6 text-slate-300">
                Keplr is available. Connect once and AoE2HDBets will show your
                WoloChain address and WOLO balance.
              </p>
            ) : (
              <p className="max-w-2xl text-sm leading-6 text-emerald-100">
                Wallet connected. Your WOLO balance is live.
              </p>
            )}
          </div>

          <div className="grid min-w-full gap-3 sm:min-w-[18rem]">
            <button
              type="button"
              onClick={() => {
                void handlePrimaryWalletAction();
              }}
              className="rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-70"
              disabled={connecting}
            >
              {primaryLabel}
            </button>

            {connected ? (
              <button
                type="button"
                onClick={() => {
                  setWalletError(null);
                  setWalletNotice(null);
                  disconnect();
                }}
                className="rounded-full border border-white/12 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:border-white/25 hover:bg-white/10"
              >
                Disconnect
              </button>
            ) : null}
          </div>
        </div>

        {walletNotice ? (
          <div className="mt-5 rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            {walletNotice}
          </div>
        ) : null}

        {walletError ? (
          <div className="mt-5 rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {walletError}
          </div>
        ) : null}
      </section>

      <section className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-[0_24px_80px_rgba(2,6,23,0.35)]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-emerald-200/70">
              Balance
            </p>
            <p className="mt-3 text-3xl font-semibold tracking-tight text-white">
              {isLoading ? "Loading..." : `${formattedBalance} WOLO`}
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              void handleSecondaryRefresh();
            }}
            className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-5 py-3 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-400/15 disabled:cursor-not-allowed disabled:opacity-70"
            disabled={connecting}
          >
            {connected ? "Refresh Balance" : keplrMissing ? "Install Keplr" : "Connect + Load Balance"}
          </button>
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
        <p className="text-xs uppercase tracking-[0.35em] text-amber-200/70">
          Start Here
        </p>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <OnboardingStep
            number="1"
            title="Install Keplr"
            body="Add the wallet extension and unlock it in your browser."
            active={keplrMissing}
          />
          <OnboardingStep
            number="2"
            title="Connect Wallet"
            body="Approve WoloChain when Keplr asks for permission."
            active={!keplrMissing && !connected}
          />
          <OnboardingStep
            number="3"
            title="See Balance"
            body="Your WoloChain address and WOLO balance confirm success."
            active={connected}
          />
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {WALLET_ACTIONS.map((action) => (
          <Link
            key={action.label}
            href={action.href}
            className={`rounded-3xl border px-5 py-5 transition ${action.className}`}
          >
            <div className="text-sm font-semibold">{action.label}</div>
            <p className="mt-2 text-sm leading-6 text-slate-300">{action.description}</p>
          </Link>
        ))}
      </section>
    </div>
  );
}

function OnboardingStep({
  number,
  title,
  body,
  active,
}: {
  number: string;
  title: string;
  body: string;
  active: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 ${
        active
          ? "border-amber-300/30 bg-amber-300/10"
          : "border-white/10 bg-white/[0.035]"
      }`}
    >
      <div className="flex items-center gap-3">
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${
            active ? "bg-amber-300 text-slate-950" : "bg-white/10 text-white"
          }`}
        >
          {number}
        </div>
        <div className="font-semibold text-white">{title}</div>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-300">{body}</p>
    </div>
  );
}