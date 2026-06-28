"use client";

import { useEffect, useMemo, useState } from "react";
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

async function copyTextToClipboard(value: string) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";

  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

function WalletCopyIcon({ copied }: { copied: boolean }) {
  if (copied) {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="h-4 w-4"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M20 6 9 17l-5-5"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        x="8"
        y="8"
        width="10"
        height="10"
        rx="2"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M6 14H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function WalletAddressLine({ address }: { address?: string }) {
  const [copied, setCopied] = useState(false);
  const value = address?.trim() || "Not connected";

  async function handleCopy() {
    if (!address) return;

    await copyTextToClipboard(address);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3">
      <div className="text-[11px] uppercase tracking-[0.28em] text-slate-500">
        Address
      </div>

      <div className="mt-2 flex min-w-0 items-center gap-2 rounded-2xl border border-white/8 bg-black/20 px-3 py-2">
        <div
          title={address || value}
          className="min-w-0 flex-1 select-all break-all font-mono text-[12px] font-semibold leading-5 text-slate-100 sm:break-normal sm:text-[13px]"
        >
          {value}
        </div>

        {address ? (
          <button
            type="button"
            onClick={() => {
              void handleCopy();
            }}
            aria-label={copied ? "Address copied" : "Copy wallet address"}
            title={copied ? "Copied" : "Copy wallet address"}
            className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition ${
              copied
                ? "border-emerald-300/45 bg-emerald-400/12 text-emerald-100"
                : "border-white/12 bg-white/5 text-white/85 hover:border-emerald-300/35 hover:bg-emerald-400/10 hover:text-emerald-100"
            }`}
          >
            <WalletCopyIcon copied={copied} />
          </button>
        ) : null}
      </div>
    </div>
  );
}

type TxLookupState = {
  status: "idle" | "checking" | "found" | "not_found" | "unavailable" | "error";
  detail: string | null;
  height?: string | null;
  code?: number | null;
  success?: boolean | null;
  rawLogSummary?: string | null;
};

type TxLookupResponse = {
  detail?: string;
  chain?: {
    status?: "found" | "not_found" | "not_checked" | "unavailable";
    height?: string | null;
    code?: number | null;
    success?: boolean | null;
    rawLogSummary?: string | null;
    detail?: string | null;
  };
};

function TxRecoveryLookup() {
  const [txHash, setTxHash] = useState("");
  const [lookup, setLookup] = useState<TxLookupState>({
    status: "idle",
    detail: null,
  });

  async function handleLookup() {
    const normalized = txHash.trim().toUpperCase();
    if (!normalized) {
      setLookup({ status: "error", detail: "Paste a WOLO transaction hash first." });
      return;
    }

    try {
      setLookup({ status: "checking", detail: "Checking transaction..." });
      const response = await fetch(`/api/wolo/tx/${encodeURIComponent(normalized)}`, {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => ({}))) as TxLookupResponse;

      if (!response.ok) {
        throw new Error(payload.detail || "Transaction lookup failed.");
      }

      const chain = payload.chain;
      if (chain?.status === "found") {
        setLookup({
          status: "found",
          detail:
            chain.success === false
              ? "Chain found this transaction, but it returned a failure code."
              : "Chain found this transaction. If app state still shows pending, it needs reconciliation.",
          height: chain.height ?? null,
          code: chain.code ?? null,
          success: chain.success ?? null,
          rawLogSummary: chain.rawLogSummary ?? null,
        });
        return;
      }

      if (chain?.status === "not_found") {
        setLookup({
          status: "not_found",
          detail: "Chain lookup did not find this transaction hash yet.",
        });
        return;
      }

      setLookup({
        status: "unavailable",
        detail: chain?.detail || "Chain lookup is unavailable right now.",
      });
    } catch (error) {
      setLookup({
        status: "error",
        detail: error instanceof Error ? error.message : "Transaction lookup failed.",
      });
    }
  }

  const tone =
    lookup.status === "found" && lookup.success !== false
      ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-100"
      : lookup.status === "idle"
        ? "border-white/10 bg-white/[0.035] text-slate-300"
        : lookup.status === "checking"
          ? "border-cyan-300/20 bg-cyan-400/10 text-cyan-100"
          : "border-amber-300/20 bg-amber-400/10 text-amber-100";

  return (
    <section className="rounded-3xl border border-white/10 bg-slate-950/70 p-5">
      <div>
        <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Transaction Check</p>
        <h2 className="mt-2 text-xl font-semibold text-white">Check a WOLO tx hash</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-400">
          Chain success means the transaction landed. App balances, bets, or claims may still need
          operator reconciliation if they remain pending.
        </p>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto]">
        <input
          value={txHash}
          onChange={(event) => setTxHash(event.target.value)}
          placeholder="Paste WOLO transaction hash"
          className="w-full rounded-full border border-white/10 bg-slate-950/80 px-4 py-3 font-mono text-sm text-white outline-none transition placeholder:font-sans placeholder:text-slate-500 focus:border-cyan-200/40"
        />
        <button
          type="button"
          onClick={() => {
            void handleLookup();
          }}
          disabled={lookup.status === "checking"}
          className="rounded-full border border-cyan-200/30 bg-cyan-400/10 px-5 py-3 text-sm font-semibold text-cyan-50 transition hover:border-cyan-200/60 hover:bg-cyan-400/15 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {lookup.status === "checking" ? "Checking..." : "Check Transaction"}
        </button>
      </div>

      {lookup.detail ? (
        <div className={`mt-4 rounded-2xl border px-4 py-3 text-sm leading-6 ${tone}`}>
          <div>{lookup.detail}</div>
          {lookup.height || typeof lookup.code === "number" ? (
            <div className="mt-1 text-xs opacity-80">
              {lookup.height ? `height ${lookup.height}` : "height unknown"}
              {typeof lookup.code === "number" ? ` · code ${lookup.code}` : ""}
            </div>
          ) : null}
          {lookup.rawLogSummary ? (
            <div className="mt-1 break-words font-mono text-xs opacity-80">
              {lookup.rawLogSummary}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}


type WalletTransferRow = {
  id: number;
  txHash: string;
  height: string;
  timestamp: string;
  direction: "incoming" | "outgoing";
  senderAddress: string;
  senderLabel: string | null;
  recipientAddress: string;
  recipientLabel: string | null;
  amountWolo: number;
  memo: string | null;
  source: string;
};

type WalletTrophyRow = {
  id: number;
  trophyId: string;
  displayName: string;
  kind: string;
  family: string;
  tier: string | null;
  status: string;
  currentHolderDisplayName: string | null;
  currentHolderWoloAddress: string | null;
  tributeAmountWolo: number;
  currentBountyWolo: number;
  bountyGrowthWolo: number;
  nftClassId: string | null;
  nftId: string | null;
  metadataUri: string | null;
  imageUri: string | null;
  chainStatus: string;
  chainOwnerAddress: string | null;
  holderSince: string | null;
};

type WalletDashboardApiResponse = {
  ok?: boolean;
  detail?: string;
  transfers?: WalletTransferRow[];
  trophies?: WalletTrophyRow[];
};

function shortHash(value: string) {
  return value.length > 16 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;
}

function shortAddress(value: string | null | undefined) {
  if (!value) return "Unknown";
  return value.length > 18 ? `${value.slice(0, 10)}…${value.slice(-6)}` : value;
}

function formatWalletDate(value: string | null | undefined) {
  if (!value) return "Unknown time";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatWoloAmount(value: number) {
  return `${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: value >= 10_000 ? 1 : value >= 1 ? 2 : 6,
    minimumFractionDigits: 0,
    notation: value >= 100_000 ? "compact" : "standard",
  }).format(value)} WOLO`;
}

function WalletChainPortfolio({
  address,
  connected,
}: {
  address: string;
  connected: boolean;
}) {
  const [transfers, setTransfers] = useState<WalletTransferRow[]>([]);
  const [trophies, setTrophies] = useState<WalletTrophyRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);

  useEffect(() => {
    if (!connected || !address) {
      setTransfers([]);
      setTrophies([]);
      setDetail(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function loadWalletDashboard() {
      setLoading(true);
      setDetail(null);

      try {
        const response = await fetch(
          `/api/wolo/wallet-dashboard?address=${encodeURIComponent(address)}&limit=25`,
          { cache: "no-store" }
        );
        const payload = (await response.json().catch(() => ({}))) as WalletDashboardApiResponse;

        if (!response.ok || payload.ok === false) {
          throw new Error(payload.detail || "Wallet activity unavailable.");
        }

        if (!cancelled) {
          setTransfers(Array.isArray(payload.transfers) ? payload.transfers : []);
          setTrophies(Array.isArray(payload.trophies) ? payload.trophies : []);
        }
      } catch (error) {
        if (!cancelled) {
          setDetail(error instanceof Error ? error.message : "Wallet activity unavailable.");
          setTransfers([]);
          setTrophies([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadWalletDashboard();

    return () => {
      cancelled = true;
    };
  }, [address, connected]);

  return (
    <section className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(20rem,0.8fr)]">
      <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-slate-500">
              WoloChain Activity
            </p>
            <h2 className="mt-2 text-xl font-semibold text-white">Recent wallet history</h2>
            <p className="mt-1 text-sm leading-6 text-slate-400">
              This is AoE2WAR&apos;s indexed mainnet history for your connected address.
            </p>
          </div>
          {loading ? (
            <span className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-cyan-100">
              Loading
            </span>
          ) : null}
        </div>

        {!connected ? (
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-4 text-sm text-slate-400">
            Connect Keplr to see indexed WOLO transfers.
          </div>
        ) : detail ? (
          <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-400/10 px-4 py-4 text-sm text-amber-100">
            {detail}
          </div>
        ) : transfers.length === 0 && !loading ? (
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-4 text-sm text-slate-400">
            No indexed transfers found for this wallet yet.
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {transfers.map((row) => {
              const counterparty =
                row.direction === "incoming"
                  ? row.senderLabel || shortAddress(row.senderAddress)
                  : row.recipientLabel || shortAddress(row.recipientAddress);
              const txHref = `/api/wolo/tx/${encodeURIComponent(row.txHash)}`;

              return (
                <article
                  key={`${row.txHash}:${row.id}`}
                  className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${
                            row.direction === "incoming"
                              ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-100"
                              : "border-sky-300/25 bg-sky-400/10 text-sky-100"
                          }`}
                        >
                          {row.direction === "incoming" ? "Received" : "Sent"}
                        </span>
                        <span className="text-xs text-slate-500">
                          {formatWalletDate(row.timestamp)} · height {row.height}
                        </span>
                      </div>

                      <div className="mt-2 text-lg font-semibold text-white">
                        {row.direction === "incoming" ? "+" : "-"}
                        {formatWoloAmount(row.amountWolo)}
                      </div>

                      <div className="mt-1 text-sm text-slate-400">
                        {row.direction === "incoming" ? "From" : "To"}{" "}
                        <span className="text-slate-200">{counterparty}</span>
                      </div>

                      {row.memo ? (
                        <div className="mt-2 break-words rounded-xl border border-white/8 bg-black/20 px-3 py-2 font-mono text-xs leading-5 text-slate-300">
                          {row.memo}
                        </div>
                      ) : null}
                    </div>

                    <Link
                      href={txHref}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 rounded-full border border-amber-200/18 bg-amber-300/10 px-3 py-2 font-mono text-xs font-semibold text-amber-100 transition hover:border-amber-200/40 hover:bg-amber-300/15"
                    >
                      {shortHash(row.txHash)}
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-3xl border border-amber-200/14 bg-[radial-gradient(circle_at_50%_0%,rgba(251,191,36,0.13),transparent_34%),rgba(15,23,42,0.78)] p-5">
        <p className="text-xs uppercase tracking-[0.28em] text-amber-100/65">
          Championship Assets
        </p>
        <h2 className="mt-2 text-xl font-semibold text-white">Belts held by this wallet</h2>
        <p className="mt-1 text-sm leading-6 text-slate-400">
          App custody is authoritative until WoloChain trophy ownership is enabled.
        </p>

        {!connected ? (
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-4 text-sm text-slate-400">
            Connect Keplr to see championship assets.
          </div>
        ) : trophies.length === 0 && !loading ? (
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-4 text-sm text-slate-400">
            No belts or artifacts are assigned to this wallet yet.
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {trophies.map((trophy) => (
              <article
                key={trophy.id}
                className="overflow-hidden rounded-2xl border border-amber-200/14 bg-black/24"
              >
                {trophy.imageUri ? (
                  <div className="flex h-40 items-center justify-center border-b border-white/8 bg-[radial-gradient(circle_at_50%_10%,rgba(251,191,36,0.16),transparent_44%)] p-4">
                    <img
                      src={trophy.imageUri}
                      alt={trophy.displayName}
                      className="h-full w-full object-contain drop-shadow-[0_18px_38px_rgba(0,0,0,0.65)]"
                    />
                  </div>
                ) : null}

                <div className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-lg font-semibold text-white">{trophy.displayName}</div>
                      <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
                        {trophy.family} · {trophy.kind}
                      </div>
                    </div>
                    <span className="rounded-full border border-amber-200/20 bg-amber-300/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-100">
                      {trophy.chainStatus === "app_only" ? "App custody" : trophy.chainStatus}
                    </span>
                  </div>

                  <div className="mt-3 grid gap-2 text-sm text-slate-300">
                    <div>
                      <strong className="text-white">{trophy.tributeAmountWolo} WOLO/day</strong>{" "}
                      title tribute
                    </div>
                    <div>
                      <strong className="text-white">
                        {trophy.currentBountyWolo.toLocaleString()} WOLO
                      </strong>{" "}
                      estimated dethrone reward
                    </div>
                    {trophy.holderSince ? (
                      <div>Held since {formatWalletDate(trophy.holderSince)}</div>
                    ) : null}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {trophy.metadataUri ? (
                      <Link
                        href={trophy.metadataUri}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-full border border-white/12 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-amber-200/35 hover:text-amber-100"
                      >
                        Metadata
                      </Link>
                    ) : null}
                    <Link
                      href="/champions/nations/canada"
                      className="rounded-full border border-amber-200/18 bg-amber-300/10 px-3 py-2 text-xs font-semibold text-amber-100 transition hover:border-amber-200/40 hover:bg-amber-300/15"
                    >
                      View belt
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
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
  const checking = status === "checking";
  const connecting = status === "connecting" || checking || isBusy;

  const statusLabel =
    connected
      ? "Connected"
      : status === "checking"
        ? "Checking wallet"
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
              <WalletAddressLine address={connected ? address : ""} />
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

      <WalletChainPortfolio address={connected ? address : ""} connected={connected} />

      <TxRecoveryLookup />

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
