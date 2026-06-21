"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { Check, Copy, ExternalLink } from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";

import WoloFaucetCard from "@/components/wolo/WoloFaucetCard";
import { useChainId } from "@/hooks/useChainId";
import { useKeplr } from "@/hooks/use-keplr";
import { useWoloBalance } from "@/hooks/useWoloBalance";

const KEPLR_DOWNLOAD_URL = "https://www.keplr.app/get";
const HERO_VIEW_KEY = "wolo-hero-view";
const WOLO_EXPLORER_BASE_URL = "https://aoe2war.com";
const OSMOSIS_POOL_ID = "3461";
const OSMOSIS_POOL_URL = `https://app.osmosis.zone/pool/${OSMOSIS_POOL_ID}`;
const WOLO_EMBLEM_SRC = "/legacy/wolo-logo-transparent.webp";
const WOLO_LAUNCH_PRICE = "$0.0001";
const WOLO_LAUNCH_PAIR = "WOLO/USDC";
const WOLO_INITIAL_LIQUIDITY = "200,000 WOLO / 20 USDC";
const WOLO_FIXED_SUPPLY = "100,000,000 WOLO";
const WOLO_LAUNCH_FDV = "$10,000";
const OSMOSIS_WOLO_IBC_DENOM =
  "ibc/D09120C7085DFA412DF77608DAD3A4797F5F097A038DA0C2E1D1426FC9CD836D";
const OSMOSIS_USDC_DENOM =
  "ibc/498A0751C798A0D9A389AA3691123DADA57DAA4FE165D5C75894505B876BA6E4";
const WOLO_PROD_ACTION_CLASSNAME =
  "inline-flex items-center justify-center whitespace-nowrap rounded-full px-4 py-2.5 text-[13px] transition";
const WOLO_PROD_PRIMARY_ACTION_CLASSNAME = `${WOLO_PROD_ACTION_CLASSNAME} bg-amber-300 font-semibold text-slate-950 hover:bg-amber-200`;
const WOLO_PROD_SECONDARY_ACTION_CLASSNAME = `${WOLO_PROD_ACTION_CLASSNAME} border border-white/12 bg-white/5 text-white/90 hover:border-white/25 hover:bg-white/10 hover:text-white`;
const WOLO_PROD_TERTIARY_ACTION_CLASSNAME = `${WOLO_PROD_ACTION_CLASSNAME} border border-emerald-400/25 bg-emerald-500/10 text-emerald-100 hover:border-emerald-300/40 hover:bg-emerald-500/15`;
const WOLO_PREMIUM_ACTION_CLASSNAME =
  "inline-flex min-h-11 w-full items-center justify-center whitespace-nowrap rounded-full px-4 py-2.5 text-[13px] transition";
const WOLO_PREMIUM_PRIMARY_ACTION_CLASSNAME = `${WOLO_PREMIUM_ACTION_CLASSNAME} bg-amber-300 font-semibold text-slate-950 hover:bg-amber-200`;
const WOLO_PREMIUM_SECONDARY_ACTION_CLASSNAME = `${WOLO_PREMIUM_ACTION_CLASSNAME} bg-white/6 text-white/90 hover:bg-white/10 hover:text-white`;
const WOLO_PREMIUM_TERTIARY_ACTION_CLASSNAME = `${WOLO_PREMIUM_ACTION_CLASSNAME} bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/15`;
const WOLO_PREMIUM_PING_ACTION_CLASSNAME = `${WOLO_PREMIUM_ACTION_CLASSNAME} bg-amber-400/10 text-amber-100 hover:bg-amber-400/14`;

const WoloChainTerminalTile = dynamic(
  () => import("@/components/wolo/WoloChainTerminalTile"),
  {
    ssr: false,
    loading: () => <WoloChainTerminalSkeleton />,
  }
);

function formatTokenAmount(raw?: string) {
  const amount = Number(raw ?? "0");
  if (!Number.isFinite(amount)) return "0.00";
  return (amount / 1_000_000).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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

function shouldToggleFromTarget(target: EventTarget | null) {
  return !(
    target instanceof Element &&
    target.closest("a, button, input, textarea, select, label, [data-no-toggle='true']")
  );
}

function buildPingPubUrl(chainId: string) {
  const normalized = chainId.trim() || "wolo-1";
  return `${WOLO_EXPLORER_BASE_URL}/${normalized}`;
}

function formatAddressForDisplay(address?: string) {
  const cleanAddress = address?.trim() || "";
  if (!cleanAddress) return "Not connected";
  return cleanAddress;
}

function readStoredPremiumPreference(storageKey: string, fallback: boolean) {
  if (typeof window === "undefined") return fallback;
  const stored = window.localStorage.getItem(storageKey);
  if (stored === "premium") return true;
  if (stored === "prod") return false;
  return fallback;
}

export default function WoloPage() {
  const { data: chainData, isLoading: chainLoading } = useChainId();
  const { address, status, connect } = useKeplr();
  const { data: rawBalance, isLoading: balanceLoading } = useWoloBalance(address);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [balanceOverride, setBalanceOverride] = useState<string | null>(null);
  const [premiumHeroView, setPremiumHeroView] = useState(false);
  const [premiumPreferenceLoaded, setPremiumPreferenceLoaded] = useState(false);

  useEffect(() => {
    setPremiumHeroView(readStoredPremiumPreference(HERO_VIEW_KEY, false));
    setPremiumPreferenceLoaded(true);
  }, []);

  useEffect(() => {
    if (!premiumPreferenceLoaded || typeof window === "undefined") return;
    window.localStorage.setItem(HERO_VIEW_KEY, premiumHeroView ? "premium" : "prod");
  }, [premiumHeroView, premiumPreferenceLoaded]);

  const chainId =
    typeof chainData === "string" && chainData.trim().length > 0
      ? chainData.trim()
      : "wolo-1";

  useEffect(() => {
    setBalanceOverride(null);
  }, [address]);

  const displayedBalance = balanceOverride ?? rawBalance;
  const formattedBalance = useMemo(
    () => formatTokenAmount(displayedBalance),
    [displayedBalance]
  );
  const pingPubUrl = useMemo(() => buildPingPubUrl(chainId), [chainId]);

  const walletStatus =
    status === "connected"
      ? "Connected"
      : status === "not_installed"
        ? "Keplr missing"
        : "Disconnected";

  const walletHeadline =
    status === "connected" ? "Live" : status === "not_installed" ? "Install" : "Offline";
  const walletConnectLabel =
    status === "connected"
      ? "Wallet Live"
      : status === "not_installed"
        ? "Install Keplr"
        : "Connect Keplr";

  async function handleConnect() {
    try {
      setWalletError(null);
      await connect();
    } catch (error) {
      setWalletError(error instanceof Error ? error.message : "Could not connect wallet.");
    }
  }

  function handleFaucetClaimed(payload: { balanceAfterUwoLo?: string | null }) {
    if (payload.balanceAfterUwoLo) {
      setBalanceOverride(payload.balanceAfterUwoLo);
    }
  }

  function handleHeroToggle(event: ReactMouseEvent<HTMLElement>) {
    if (!shouldToggleFromTarget(event.target)) return;
    setPremiumHeroView((current) => !current);
  }

  if (!premiumHeroView) {
    return (
      <main className="space-y-4 py-2 text-white sm:space-y-6 sm:py-3">
        <section
          onClick={handleHeroToggle}
          className="overflow-hidden rounded-[1.85rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.16),_transparent_26%),radial-gradient(circle_at_bottom_right,_rgba(56,189,248,0.10),_transparent_28%),linear-gradient(135deg,_#0f172a,_#111827_56%,_#050816)] p-4 sm:rounded-[2rem] sm:p-6 lg:p-8"
        >
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(27rem,29rem)] lg:items-start lg:gap-8">
            <div className="space-y-6">
              <div className="flex flex-wrap items-center gap-2">
                <Link href="/wolochain" data-no-toggle="true" className="inline-flex">
                  <SignalChip label="WOLO" tone="amber" title="Open the WoloChain brief" />
                </Link>
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
                      className="text-[2.5rem] font-semibold leading-[0.9] tracking-[-0.04em] text-white sm:text-[3.05rem] lg:text-[4.05rem]"
                      style={{
                        fontFamily:
                          '"Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif',
                      }}
                    >
                      100,000,000
                    </div>
                    <div className="pb-2 text-lg uppercase tracking-[0.42em] text-amber-100/80 sm:text-2xl">
                      WOLO
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <SignalChip label="Denom uwolo" />
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

              <div className="grid gap-2 rounded-[1.45rem] bg-white/[0.03] p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:grid-cols-2 sm:p-3">
                <Link href="/wallet" className={WOLO_PROD_PRIMARY_ACTION_CLASSNAME} data-no-toggle="true">
                  Open Wallet
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    void handleConnect();
                  }}
                  className={WOLO_PROD_SECONDARY_ACTION_CLASSNAME}
                  data-no-toggle="true"
                >
                  {walletConnectLabel}
                </button>
                <Link href="/wolochain" className={WOLO_PROD_SECONDARY_ACTION_CLASSNAME} data-no-toggle="true">
                  WoloChain
                </Link>
                <Link href="/download" className={WOLO_PROD_SECONDARY_ACTION_CLASSNAME} data-no-toggle="true">
                  Download Watcher
                </Link>
                <a
                  href={KEPLR_DOWNLOAD_URL}
                  target="_blank"
                  rel="noreferrer"
                  className={WOLO_PROD_TERTIARY_ACTION_CLASSNAME}
                  data-no-toggle="true"
                >
                  Get Keplr
                </a>
                <a
                  href={pingPubUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={WOLO_PROD_SECONDARY_ACTION_CLASSNAME}
                  data-no-toggle="true"
                >
                  Open Explorer
                </a>
              </div>

              {walletError ? (
                <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                  {walletError}
                </div>
              ) : null}
            </div>

            <div className="w-full space-y-3.5 lg:max-w-[29rem] lg:justify-self-end">
              <div className="rounded-[1.8rem] border border-white/10 bg-[linear-gradient(180deg,rgba(11,17,30,0.96),rgba(7,11,19,0.96))] p-5 shadow-[0_28px_80px_rgba(2,6,23,0.34)] sm:p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="text-[11px] uppercase tracking-[0.35em] text-amber-200/70">
                    Wallet Snapshot
                  </div>

                  <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200">
                    {walletStatus}
                  </div>
                </div>

                <div className="mt-5 grid gap-4">
                  <PremiumWalletAddressPanel address={address} />
                  <PremiumWalletPanel
                    label="Balance"
                    value={balanceLoading ? "Loading..." : `${formattedBalance} WOLO`}
                    emphasis
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <PremiumWalletPanel label="Network" value={chainId} />
                    <PremiumWalletPanel label="Prefix" value="wolo1..." mono />
                  </div>
                </div>

                <div className="mt-5 grid gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      void handleConnect();
                    }}
                    className="w-full rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-200"
                  >
                    {walletConnectLabel}
                  </button>

                  {status !== "connected" ? (
                    <a
                      href={KEPLR_DOWNLOAD_URL}
                      target="_blank"
                      rel="noreferrer"
                      className="block w-full rounded-full border border-white/12 bg-white/5 px-5 py-3 text-center text-sm text-white/90 transition hover:border-white/25 hover:text-white"
                    >
                      Get Keplr Wallet
                    </a>
                  ) : null}
                </div>

                {walletError ? (
                  <div className="mt-4 rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                    {walletError}
                  </div>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <MarketContextTile href={OSMOSIS_POOL_URL} variant="prod" />
                <WoloFaucetCard
                  address={address}
                  status={status}
                  chainId={chainId}
                  onClaimed={handleFaucetClaimed}
                  variant="prod"
                />
              </div>
            </div>
          </div>
        </section>

        <WoloLaunchBanner />
        <WoloTechnicalDetails />
        <WoloChainTerminalTile />
      </main>
    );
  }

  return (
    <main className="space-y-4 py-2 text-white sm:space-y-6 sm:py-3">
      <section
        onClick={handleHeroToggle}
        className="overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.16),_transparent_24%),radial-gradient(circle_at_82%_18%,_rgba(56,189,248,0.12),_transparent_20%),linear-gradient(135deg,_#08111f,_#0b1324_44%,_#050814)] px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8"
      >
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(27rem,29rem)] lg:items-start lg:gap-8">
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/wolochain" data-no-toggle="true" className="inline-flex">
                <PremiumStatusPill label="WOLO" tone="amber" />
              </Link>
              <PremiumStatusPill
                label={chainLoading ? "Syncing chain" : chainId}
                tone="emerald"
              />
              <PremiumStatusPill label={`Balance ${formattedBalance} WOLO`} tone="emerald" />
              <PremiumStatusPill label={walletStatus} />
              <PremiumStatusPill label="Rail standby" />
            </div>

            <div className="relative isolate overflow-hidden rounded-[1.85rem] border border-white/10 bg-[linear-gradient(135deg,rgba(251,191,36,0.10),rgba(9,15,27,0.94)_34%,rgba(5,8,20,0.98)_100%)] px-5 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:px-6 sm:py-6">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.14),transparent_26%),radial-gradient(circle_at_84%_22%,rgba(59,130,246,0.12),transparent_20%)]" />
              <WoloSupplyWatermark />
              <div className="relative z-10 max-w-[40rem] space-y-4">
                <div className="text-[11px] uppercase tracking-[0.38em] text-amber-200/70">
                  WoloChain
                </div>

                <div className="space-y-2">
                  <div className="text-[11px] uppercase tracking-[0.32em] text-white/45">
                    Max Supply
                  </div>

                  <div className="flex flex-wrap items-end gap-x-4 gap-y-1 md:flex-nowrap">
                    <div
                      className="text-[2.5rem] font-semibold leading-[0.9] tracking-[-0.04em] text-white sm:text-[3.05rem] lg:text-[4.05rem]"
                      style={{
                        fontFamily:
                          '"Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif',
                      }}
                    >
                      100,000,000
                    </div>
                    <div className="whitespace-nowrap pb-2 text-xl uppercase tracking-[0.38em] text-amber-100/85 sm:text-2xl">
                      WOLO
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid max-w-[46rem] gap-3 sm:grid-cols-2">
              <PremiumHeroCard label="Chain ID" value={chainLoading ? "..." : chainId} />
              <PremiumHeroCard label="Denom" value="uwolo" />
              <PremiumHeroCard label="Wallet" value={walletHeadline} />
              <PremiumHeroCard label="Balance" value={`${formattedBalance} WOLO`} compact />
            </div>

            <WoloHeroActionDock
              connectLabel={
                status === "connected"
                  ? "Wallet Live"
                  : status === "not_installed"
                    ? "Install Keplr"
                    : "Connect Keplr"
              }
              onConnect={handleConnect}
              pingPubUrl={pingPubUrl}
              showPingPub
            />

          </div>

          <div className="w-full space-y-3.5 lg:max-w-[29rem] lg:justify-self-end">
            <div className="rounded-[1.8rem] border border-white/10 bg-[linear-gradient(180deg,rgba(11,17,30,0.96),rgba(7,11,19,0.96))] p-5 shadow-[0_28px_80px_rgba(2,6,23,0.34)] sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="text-[11px] uppercase tracking-[0.35em] text-amber-200/70">
                  Wallet Snapshot
                </div>

                <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200">
                  {walletStatus}
                </div>
              </div>

              <div className="mt-5 grid gap-4">
                <PremiumWalletAddressPanel address={address} />
                <PremiumWalletPanel
                  label="Balance"
                  value={balanceLoading ? "Loading..." : `${formattedBalance} WOLO`}
                  emphasis
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <PremiumWalletPanel label="Network" value={chainId} />
                  <PremiumWalletPanel label="Prefix" value="wolo1..." mono />
                </div>
              </div>

              <div className="mt-5 grid gap-3">
                <button
                  type="button"
                  onClick={() => {
                    void handleConnect();
                  }}
                  className="w-full rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-200"
                >
                  {walletConnectLabel}
                </button>

                {status !== "connected" ? (
                  <a
                    href={KEPLR_DOWNLOAD_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="block w-full rounded-full border border-white/12 bg-white/5 px-5 py-3 text-center text-sm text-white/90 transition hover:border-white/25 hover:text-white"
                  >
                    Get Keplr Wallet
                  </a>
                ) : null}
              </div>

              {walletError ? (
                <div className="mt-4 rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                  {walletError}
                </div>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <MarketContextTile href={OSMOSIS_POOL_URL} variant="premium" />
              <WoloFaucetCard
                address={address}
                status={status}
                chainId={chainId}
                onClaimed={handleFaucetClaimed}
                variant="premium"
              />
            </div>
          </div>
        </div>
      </section>

      <WoloLaunchBanner />
      <WoloTechnicalDetails />
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

function PremiumStatusPill({
  label,
  tone = "slate",
}: {
  label: string;
  tone?: "slate" | "amber" | "emerald";
}) {
  const toneClassName =
    tone === "amber"
      ? "border-amber-300/20 bg-amber-400/12 text-amber-100"
      : tone === "emerald"
        ? "border-emerald-400/20 bg-emerald-500/12 text-emerald-100"
        : "border-white/10 bg-white/5 text-slate-200";

  return (
    <div className={`rounded-full border px-3 py-1.5 text-xs font-medium ${toneClassName}`}>
      {label}
    </div>
  );
}

function PremiumHeroCard({
  label,
  value,
  compact = false,
}: {
  label: string;
  value: string;
  compact?: boolean;
}) {
  return (
    <div className="rounded-[1.45rem] border border-white/10 bg-white/5 px-5 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
      <div className="text-[11px] uppercase tracking-[0.3em] text-slate-400">{label}</div>
      <div
        className={
          compact
            ? "mt-3 text-[2rem] font-semibold tracking-tight text-white"
            : "mt-3 text-[2.1rem] font-semibold tracking-tight text-white"
        }
      >
        {value}
      </div>
    </div>
  );
}

function WoloSupplyWatermark() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-y-0 right-[-1.5rem] flex items-center justify-center opacity-[0.085] sm:right-[-2.25rem]"
    >
      <Image
        src={WOLO_EMBLEM_SRC}
        alt=""
        width={420}
        height={420}
        className="h-[13.5rem] w-[13.5rem] object-contain sm:h-[18rem] sm:w-[18rem] lg:h-[22rem] lg:w-[22rem]"
        priority={false}
      />
    </div>
  );
}

function PremiumWalletAddressPanel({ address }: { address?: string }) {
  const [copied, setCopied] = useState(false);
  const cleanAddress = address?.trim() || "";
  const displayAddress = formatAddressForDisplay(cleanAddress);

  async function handleCopy() {
    if (!cleanAddress) return;

    await copyTextToClipboard(cleanAddress);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <div
      data-no-toggle="true"
      className="rounded-[1.45rem] border border-white/8 bg-[#0d1420] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="text-[11px] uppercase tracking-[0.26em] text-slate-400">
          Address
        </div>

        {cleanAddress ? (
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
                : "border-white/12 bg-white/5 text-slate-300 hover:border-cyan-300/35 hover:bg-cyan-400/10 hover:text-white"
            }`}
          >
            {copied ? <Check aria-hidden="true" className="h-3.5 w-3.5" /> : <Copy aria-hidden="true" className="h-3.5 w-3.5" />}
          </button>
        ) : null}
      </div>

      <button
        type="button"
        onClick={() => {
          void handleCopy();
        }}
        disabled={!cleanAddress}
        aria-label={cleanAddress ? "Copy wallet address" : "Wallet address not connected"}
        title={cleanAddress || "Wallet address not connected"}
        className={`mt-3 flex min-h-[3.35rem] w-full min-w-0 rounded-[1.1rem] border border-white/10 bg-black/20 px-4 py-3.5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.025)] ${
          cleanAddress
            ? "cursor-pointer transition hover:border-cyan-300/30 hover:bg-cyan-400/[0.08]"
            : "cursor-not-allowed"
        }`}
      >
        <span className="min-w-0 break-all font-mono text-[11px] font-semibold leading-5 text-white sm:text-[11.5px] lg:text-[12px]">
          {displayAddress}
        </span>
      </button>
    </div>
  );
}

function PremiumWalletPanel({
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
    <div className="rounded-[1.45rem] border border-white/8 bg-[#0d1420] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
      <div className="text-[11px] uppercase tracking-[0.26em] text-slate-400">{label}</div>
      <div
        className={`mt-2 break-all ${
          emphasis
            ? "text-3xl font-semibold tracking-tight text-white"
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

function MarketContextTile({
  href,
  variant,
}: {
  href: string;
  variant: "prod" | "premium";
}) {
  const compact = variant === "prod";

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      data-no-toggle="true"
      title={`Open WOLO/USDC Osmosis Pool #${OSMOSIS_POOL_ID}`}
      className={`group flex w-full items-center justify-between gap-3 ${
        compact
          ? "rounded-[1.15rem] border border-cyan-300/15 bg-[linear-gradient(135deg,rgba(255,255,255,0.05),rgba(9,15,28,0.95)_52%,rgba(8,35,46,0.78))] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
          : "rounded-[1.35rem] border border-cyan-300/18 bg-[linear-gradient(135deg,rgba(255,255,255,0.05),rgba(8,14,27,0.96)_48%,rgba(8,35,46,0.82))] px-5 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
      }`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div
          className={`flex shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 ${
            compact ? "h-10 w-10" : "h-11 w-11"
          }`}
        >
          <DexOrbitMark />
        </div>

        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.28em] text-cyan-200/68">
            WOLO Market
          </div>
          <div className="mt-1 flex flex-wrap items-end gap-x-1.5 gap-y-0.5">
            <div className={compact ? "text-lg font-semibold text-white" : "text-xl font-semibold text-white"}>
              {WOLO_LAUNCH_PRICE}
            </div>
            <div className="pb-0.5 text-[10px] uppercase tracking-[0.24em] text-white/55">
              / WOLO
            </div>
          </div>
          <div className="mt-2 text-xs text-slate-300/78">
            Pool #{OSMOSIS_POOL_ID} · {WOLO_LAUNCH_PAIR}
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <MarketTileGraph compact={compact} />
        <div className="inline-flex items-center gap-1 rounded-full border border-cyan-300/18 bg-cyan-400/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-cyan-100">
          DEX
          <ExternalLink aria-hidden="true" className="h-3 w-3" />
        </div>
      </div>
    </a>
  );
}

function WoloLaunchBanner() {
  const stats = [
    ["Launch price", WOLO_LAUNCH_PRICE],
    ["Pool", `#${OSMOSIS_POOL_ID}`],
    ["Pair", WOLO_LAUNCH_PAIR],
    ["Initial liquidity", WOLO_INITIAL_LIQUIDITY],
    ["Fixed supply", WOLO_FIXED_SUPPLY],
    ["Launch FDV", WOLO_LAUNCH_FDV],
  ] as const;

  return (
    <div
      data-no-toggle="true"
      className="relative z-10 overflow-hidden rounded-[1.75rem] border border-amber-300/18 bg-[radial-gradient(circle_at_12%_18%,rgba(251,191,36,0.17),transparent_28%),linear-gradient(135deg,rgba(251,191,36,0.11),rgba(8,13,26,0.97)_38%,rgba(5,10,20,0.99))] p-5 shadow-[0_24px_70px_rgba(2,6,23,0.32),inset_0_1px_0_rgba(255,255,255,0.04)] sm:p-6 lg:p-7"
    >
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="inline-flex rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-amber-100">
            Mainnet launch
          </div>
          <div className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            WOLO is live on Osmosis
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
            Launch price: {WOLO_LAUNCH_PRICE}. Trade {WOLO_LAUNCH_PAIR} on Pool #
            {OSMOSIS_POOL_ID}. 100M fixed supply. Built for AoE2WAR.
          </p>
        </div>

        <a
          href={OSMOSIS_POOL_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
        >
          Open Osmosis Pool
          <ExternalLink aria-hidden="true" className="h-4 w-4" />
        </a>
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {stats.map(([label, value]) => (
          <div
            key={label}
            className="rounded-[1.1rem] border border-white/8 bg-white/[0.045] px-3.5 py-3"
          >
            <div className="text-[10px] uppercase tracking-[0.22em] text-slate-400">
              {label}
            </div>
            <div className="mt-1.5 text-sm font-semibold text-white">{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function WoloTechnicalDetails() {
  return (
    <section className="rounded-[1.75rem] border border-white/10 bg-[#050b15] p-5 sm:p-6">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.32em] text-cyan-100/65">
              Osmosis Details
            </div>
            <div className="mt-2 text-sm text-slate-300">
              Compact denom notes for wallets and explorers.
            </div>
          </div>
          <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200 transition group-open:bg-white/10">
            View
          </div>
        </summary>

        <div className="mt-5 space-y-4 border-t border-white/8 pt-5 text-sm leading-6 text-slate-300">
          <p>
            Osmosis currently may display WOLO as <span className="font-mono text-cyan-100">ibc/D091...</span> until asset metadata propagates.
          </p>

          <div className="grid gap-3 lg:grid-cols-2">
            <TechnicalDenomCard label="WOLO denom on Osmosis" value={OSMOSIS_WOLO_IBC_DENOM} />
            <TechnicalDenomCard label="USDC denom" value={OSMOSIS_USDC_DENOM} />
          </div>
        </div>
      </details>
    </section>
  );
}

function TechnicalDenomCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.035] p-4">
      <div className="text-[10px] uppercase tracking-[0.24em] text-slate-400">{label}</div>
      <div className="mt-2 break-all font-mono text-xs leading-5 text-slate-100">{value}</div>
    </div>
  );
}

function WoloHeroActionDock({
  connectLabel,
  onConnect,
  pingPubUrl,
  showPingPub,
}: {
  connectLabel: string;
  onConnect: () => Promise<void>;
  pingPubUrl?: string;
  showPingPub: boolean;
}) {
  return (
    <div className="grid max-w-[46rem] gap-2 rounded-[1.45rem] bg-white/[0.03] p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <Link href="/wallet" className={WOLO_PREMIUM_PRIMARY_ACTION_CLASSNAME}>
          Open Wallet
        </Link>
        <button
          type="button"
          onClick={() => {
            void onConnect();
          }}
          className={WOLO_PREMIUM_SECONDARY_ACTION_CLASSNAME}
        >
          {connectLabel}
        </button>
      </div>

      <div className={`grid gap-2 ${showPingPub ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
        <Link href="/wolochain" className={WOLO_PREMIUM_SECONDARY_ACTION_CLASSNAME}>
          WoloChain
        </Link>
        <Link href="/download" className={WOLO_PREMIUM_SECONDARY_ACTION_CLASSNAME}>
          Download Watcher
        </Link>
        <a
          href={KEPLR_DOWNLOAD_URL}
          target="_blank"
          rel="noreferrer"
          className={WOLO_PREMIUM_TERTIARY_ACTION_CLASSNAME}
        >
          Get Keplr
        </a>
        {showPingPub && pingPubUrl ? (
          <a
            href={pingPubUrl}
            target="_blank"
            rel="noreferrer"
            className={WOLO_PREMIUM_PING_ACTION_CLASSNAME}
          >
            Open Explorer
          </a>
        ) : null}
      </div>
    </div>
  );
}

function DexOrbitMark() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 40 40"
      className="h-5 w-5 text-cyan-200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="20" cy="20" r="4.5" fill="currentColor" fillOpacity="0.88" />
      <path
        d="M8 20c0-6.1 4.8-11 12-11s12 4.9 12 11-4.8 11-12 11S8 26.1 8 20Z"
        stroke="currentColor"
        strokeOpacity="0.9"
        strokeWidth="1.7"
      />
      <path
        d="M12 12.5c5.1-3 10.7-2.8 15.7 0.7 5 3.6 7 8.8 5.9 15.5"
        stroke="currentColor"
        strokeOpacity="0.62"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="29.8" cy="13.3" r="2.1" fill="currentColor" fillOpacity="0.76" />
      <circle cx="11.2" cy="27.8" r="1.8" fill="currentColor" fillOpacity="0.45" />
    </svg>
  );
}

function MarketTileGraph({ compact }: { compact: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 64 28"
      className={compact ? "h-7 w-14" : "h-8 w-16"}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M2 22.5H62"
        stroke="rgba(148,163,184,0.3)"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M4 20.5C10.8 20.4 13 14.8 18.5 15.2C24.3 15.7 24.8 22 31.2 21.7C38.2 21.4 38.4 9.2 46.1 8.6C52 8.1 55.1 12.4 60 6.8"
        stroke="rgba(255,255,255,0.58)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M4 22.5C11.6 22.4 15 18 20.8 18.2C26.6 18.4 28.1 23.6 34.1 23.2C41 22.8 42.3 12.2 49 11.6C54.2 11.2 57.2 14.2 60 12.5"
        stroke="rgba(34,211,238,0.9)"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <circle cx="60" cy="12.5" r="2.6" fill="rgba(34,211,238,0.95)" />
    </svg>
  );
}

function WoloChainTerminalSkeleton() {
  return (
    <section className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#080f1d] p-5 text-white shadow-[0_24px_80px_rgba(2,6,23,0.35)]">
      <div className="text-[11px] uppercase tracking-[0.35em] text-emerald-200/70">
        Chain Terminal
      </div>
      <div className="mt-4 h-40 animate-pulse rounded-3xl border border-white/10 bg-white/5" />
    </section>
  );
}
