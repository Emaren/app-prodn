"use client";

import { useEffect, useMemo, useState } from "react";

type NetworkAccount = {
  label: string;
  address: string;
  use: string;
  role: string;
  amountWolo: string;
  amountWoloFormatted?: string;
  isModule: boolean;
  isRetired: boolean;
  isUserFacing: boolean;
};

type NetworkPayload = {
  updatedAt?: string;
  count: number;
  totalWoloFormatted: string;
  accounts: NetworkAccount[];
};

type Holder = {
  rank: number;
  alias: string;
  address: string;
  role: string;
  use: string | null;
  balanceWoloFormatted: string | null;
  exactBalanceWolo: string;
  balanceHidden: boolean;
  isKnownUser: boolean;
  isInfrastructure: boolean;
  avatarUrl?: string | null;
};

type HoldersPayload = {
  updatedAt: string;
  count: number;
  totalWoloFormatted: string;
  holders: Holder[];
};

const protocolPurposeByLabel: Record<string, string> = {
  "Founder Cold": "Long-hold reserve. Hard-anchor scarcity.",
  "Founder Operating / Emaren": "Build speed. Shipping budget. Public receive wallet.",
  "Community Treasury": "Public treasury and betting-fee home.",
  "DEX Liquidity Reserve": "Market depth, listings, and tradable liquidity.",
  "Faucet Growth Reserve": "Onboarding reserve for new bettors.",
  "Validator Ops": "Validator-side ops and chain running costs.",
  "Ecosystem Bounties": "Missions, tooling, and sharp contributors.",
  "Faucet Hot Wallet": "Operational faucet fuel.",
  "Founder Rewards": "Featured-player and founder rewards signer.",
  "Staking Wallet": "User staking custody wallet.",
  "Bet Escrow Signer": "Manual and app bet escrow address.",
  "Bet Payout Signer": "App payout signer.",
  "IBC Escrow: transfer/channel-0 to Osmosis": "IBC escrow for Osmosis channel.",
  "Emaren #2": "Secondary Emaren wallet.",
};

function compactWolo(value: string | null | undefined) {
  if (!value) return "";
  const parsed = Number(value.replace(/,/g, ""));
  if (!Number.isFinite(parsed)) return `${value} WOLO`;
  if (parsed >= 1_000_000) return `${(parsed / 1_000_000).toFixed(3).replace(/\.?0+$/, "")}M WOLO`;
  if (parsed >= 1_000) return `${(parsed / 1_000).toFixed(2).replace(/\.?0+$/, "")}K WOLO`;
  return `${parsed.toLocaleString(undefined, { maximumFractionDigits: 6 })} WOLO`;
}

function wholeWolo(value: string | null | undefined) {
  const raw = value || "100,000,000.000000";
  return raw.replace(/\.0+$/, "");
}

function roleLabel(role: string, use?: string | null) {
  if (use === "USER" || role === "user" || role === "player") return "Holder";
  if (role === "module") return "Module";
  if (role === "staking") return "Staking";
  if (role === "escrow") return "Escrow";
  if (role === "payout") return "Signer";
  if (role === "reserve") return "Reserve";
  return role.replace(/_/g, " ");
}

function protocolAccounts(accounts: NetworkAccount[]) {
  return accounts.filter(
    (account) => !account.isRetired && !account.isModule && account.use !== "USER"
  );
}

function WalletAddress({
  address,
  onCopy,
}: {
  address: string;
  onCopy: (address: string) => void;
}) {
  return (
    <button
      type="button"
      title={`Copy ${address}`}
      onClick={(event) => {
        onCopy(address);
        event.currentTarget.blur();
      }}
      className="block w-full whitespace-nowrap rounded-md py-1 text-center font-mono text-[9px] leading-5 tracking-[-0.055em] text-slate-500 transition hover:text-slate-200 focus:outline-none"
    >
      {address}
    </button>
  );
}

function holderInitials(alias: string) {
  const cleaned = alias.replace(/\\[[^\\]]+\\]/g, "").trim();
  const parts = cleaned.split(/\\s+/).filter(Boolean);

  if (!parts.length) return "W";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();

  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function HolderAvatar({ holder }: { holder: Holder }) {
  if (holder.avatarUrl) {
    return (
      <img
        src={holder.avatarUrl}
        alt=""
        className="h-10 w-10 rounded-full border border-white/10 object-cover shadow-[0_10px_28px_rgba(2,6,23,0.35)]"
      />
    );
  }

  if (holder.isInfrastructure) {
    return (
      <div className="flex h-10 w-10 items-center justify-center rounded-full border border-amber-200/18 bg-amber-300/5 shadow-[0_10px_28px_rgba(251,191,36,0.08)]">
        <img
          src="/legacy/wolo-logo-transparent.png"
          alt=""
          className="h-8 w-8 object-contain opacity-90"
        />
      </div>
    );
  }

  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-full border border-cyan-200/14 bg-cyan-300/7 text-[11px] font-black tracking-[0.08em] text-cyan-100/80 shadow-[0_10px_28px_rgba(34,211,238,0.08)]">
      {holderInitials(holder.alias)}
    </div>
  );
}

export default function WoloChainLiveTransparency() {
  const [network, setNetwork] = useState<NetworkPayload | null>(null);
  const [holders, setHolders] = useState<HoldersPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);

  async function refresh() {
    try {
      setError(null);

      const [networkResponse, holdersResponse] = await Promise.all([
        fetch("/api/wolo/network", { cache: "no-store" }),
        fetch("/api/wolo/holders", { cache: "no-store" }),
      ]);

      if (!networkResponse.ok) throw new Error("Wolo network map unavailable.");
      if (!holdersResponse.ok) throw new Error("Wolo holders unavailable.");

      setNetwork((await networkResponse.json()) as NetworkPayload);
      setHolders((await holdersResponse.json()) as HoldersPayload);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Live WoloChain data unavailable.");
    }
  }

  async function copyAddress(address: string) {
    try {
      await navigator.clipboard.writeText(address);
      setCopiedAddress(address);
      window.setTimeout(() => setCopiedAddress(null), 1400);
    } catch {
      setCopiedAddress(null);
    }
  }

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  const protocolRows = useMemo(
    () => protocolAccounts(network?.accounts ?? []),
    [network?.accounts]
  );

  const holderRows = holders?.holders ?? [];

  return (
    <section className="relative space-y-6">
      {copiedAddress ? (
        <div className="fixed bottom-5 right-5 z-[90] rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1.5 text-[11px] font-medium text-emerald-100 shadow-[0_14px_34px_rgba(2,6,23,0.36)] backdrop-blur-sm">
          Wallet copied
        </div>
      ) : null}
      <section className="rounded-[1.9rem] border border-white/10 bg-slate-950/75 p-6 shadow-[0_28px_80px_rgba(2,6,23,0.28)] sm:p-7">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.34em] text-white/45">Supply map</div>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.025em] text-white sm:text-3xl">
              Protocol split
            </h2>
          </div>
          <div className="rounded-full border border-white/10 bg-white/[0.035] px-3 py-1.5 font-mono text-xs text-slate-400">
            {wholeWolo(network?.totalWoloFormatted)} WOLO
          </div>
        </div>

        {error ? (
          <div className="mt-5 rounded-[1.25rem] border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">
            {error}
          </div>
        ) : null}

        <div className="mt-7 grid gap-7 xl:grid-cols-[20rem_minmax(0,1fr)] xl:items-center">
          <div className="flex h-full items-center justify-center">
            <div className="relative flex h-72 w-72 items-center justify-center sm:h-80 sm:w-80">
              <div
                className="absolute inset-0 rounded-full blur-2xl"
                style={{
                  background:
                    "radial-gradient(circle, rgba(251,191,36,0.2) 0%, rgba(56,189,248,0.12) 38%, rgba(5,8,20,0) 72%)",
                }}
              />
              <div
                className="absolute inset-0 rounded-full border border-white/10 shadow-[inset_0_10px_30px_rgba(255,255,255,0.08),0_25px_80px_rgba(2,6,23,0.55)]"
                style={{
                  background:
                    "conic-gradient(from 220deg, rgba(251,191,36,0.96) 0deg 216deg, rgba(56,189,248,0.88) 216deg 234deg, rgba(16,185,129,0.9) 234deg 270deg, rgba(168,85,247,0.88) 270deg 306deg, rgba(244,63,94,0.86) 306deg 331deg, rgba(71,85,105,0.88) 331deg 342deg, rgba(14,165,233,0.9) 342deg 360deg)",
                }}
              />
              <div className="absolute inset-[14%] rounded-full border border-white/10 bg-[linear-gradient(180deg,rgba(9,14,26,0.98),rgba(5,8,20,0.98))] shadow-[inset_0_6px_24px_rgba(255,255,255,0.05)]" />
              <div className="relative z-10 text-center">
                <div className="text-[11px] uppercase tracking-[0.34em] text-white/45">Supply</div>
                <div className="mt-2 text-5xl font-semibold tracking-[-0.045em] text-white">100M</div>
                <div className="mt-2 text-[11px] uppercase tracking-[0.34em] text-amber-100/76">WOLO</div>
                <div className="mt-3 font-mono text-xs text-slate-500">
                  {wholeWolo(network?.totalWoloFormatted)}
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            {protocolRows.map((account) => (
              <article
                key={account.address}
                className="rounded-[1.2rem] border border-white/10 bg-white/[0.035] p-4 shadow-[0_18px_48px_rgba(2,6,23,0.18)] transition hover:border-white/18 hover:bg-white/[0.055]"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-base font-semibold tracking-[-0.015em] text-white">
                      {account.label}
                    </div>
                    <div className="mt-1 min-h-10 text-sm leading-5 text-slate-400">
                      {protocolPurposeByLabel[account.label] || roleLabel(account.role, account.use)}
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <div className="text-lg font-semibold tracking-[-0.025em] text-white">
                      {compactWolo(account.amountWoloFormatted || account.amountWolo)}
                    </div>
                    <div className="mt-1 font-mono text-[11px] text-slate-500">
                      {account.amountWoloFormatted || account.amountWolo}
                    </div>
                  </div>
                </div>

                <div className="mt-3 overflow-hidden">
                  <WalletAddress address={account.address} onCopy={copyAddress} />
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden rounded-[1.9rem] border border-white/10 bg-[linear-gradient(135deg,rgba(8,13,25,0.96),rgba(3,6,15,0.99))] p-6 shadow-[0_28px_80px_rgba(2,6,23,0.32)] sm:p-7">
        <img
          src="/legacy/wolo-logo-transparent.png"
          alt=""
          className="pointer-events-none absolute -left-16 -top-24 h-[46rem] w-[46rem] object-contain opacity-[0.135] blur-[0.08px]"
        />

        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.34em] text-white/45">WOLO holders</div>
            <div className="mt-2 text-sm text-slate-500">{holders ? `${holders.count} Live chain addresses on the WoloChain network.` : "Live chain addresses on the WoloChain network."}</div>
          </div>

          <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200">
            {holders ? `${holders.count} wallets` : "Loading"}
          </div>
        </div>

        <div className="relative z-10 mt-5 rounded-[1.35rem] border border-white/10 bg-slate-950/35 p-2 backdrop-blur-[1px]">
          <div className="grid grid-cols-[3rem_minmax(13rem,0.82fr)_minmax(24rem,1fr)_minmax(10rem,0.62fr)] gap-4 px-3 py-2 text-[10px] uppercase tracking-[0.24em] text-slate-500">
            <div className="text-center">Rank</div>
            <div className="text-center">Holder</div>
            <div className="text-center">Address</div>
            <div className="text-center">Balance</div>
          </div>

          <div className="max-h-[38rem] space-y-2 overflow-y-auto overscroll-contain pr-1">
            {holderRows.map((holder) => (
              <article
                key={holder.address}
                className="grid grid-cols-[3rem_minmax(13rem,0.82fr)_minmax(24rem,1fr)_minmax(10rem,0.62fr)] items-center gap-4 rounded-[1.05rem] border border-white/[0.045] bg-white/[0.026] px-3 py-3 text-sm shadow-[0_14px_38px_rgba(2,6,23,0.18)] transition hover:border-white/[0.10] hover:bg-white/[0.04]"
              >
                <div className="text-center font-mono text-xs text-slate-500">#{holder.rank}</div>

                <div className="flex min-w-0 items-center gap-3">
                  <HolderAvatar holder={holder} />

                  <div className="min-w-0">
                    <div className="truncate font-semibold tracking-[-0.015em] text-white">{holder.alias}</div>
                    <div className="mt-1 text-[10px] uppercase tracking-[0.24em] text-slate-500">
                      {roleLabel(holder.role, holder.use)}
                    </div>
                  </div>
                </div>

                <WalletAddress address={holder.address} onCopy={copyAddress} />

                <div className="text-center">
                  {holder.balanceHidden ? null : (
                    <>
                      <div className="whitespace-nowrap font-semibold text-white">{compactWolo(holder.balanceWoloFormatted)}</div>
                      <div className="mt-1 whitespace-nowrap font-mono text-[10px] text-slate-500">{holder.balanceWoloFormatted}</div>
                    </>
                  )}
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="relative z-10 mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
          <div>Total indexed: {wholeWolo(holders?.totalWoloFormatted)} WOLO</div>
          <div>Updated: {holders?.updatedAt ? new Date(holders.updatedAt).toLocaleTimeString() : "loading"}</div>
        </div>
      </section>    </section>
  );
}
