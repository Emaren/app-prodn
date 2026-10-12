"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowUpRight, Banknote, Check, ChevronDown,
  ChevronRight, Coins, Crown, ExternalLink, Landmark,
  Layers3, LockKeyhole, Radar, RefreshCw, Search, ShieldCheck,
  Wallet, Waves, Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import SpeedReadyMarker from "@/components/speed/SpeedReadyMarker";
import {
  REPORTED_TREASURY_COSTS,
  isPublicTreasuryHolders, isTreasuryNetwork, isTreasuryPool,
  isTreasuryTransfers, observedKingdomOutflows, publicSystemAccounts,
  disclosedKingdomReserveBalance, legacyIdentityMembership,
  reportedMonthlyOutlay,
  type TreasuryHolders, type TreasuryNetwork,
  type TreasuryPool, type TreasuryTransfers,
} from "@/lib/kingdomTreasury";
import type { ReactNode } from "react";

type Feed<T> = { data: T | null; error: boolean; checkedAt: number | null };
const empty = <T,>(): Feed<T> => ({ data: null, error: false, checkedAt: null });
const money = (n: number, d = 2) => Number.isFinite(n) ? n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }) : "—";
const amount = (n: number) => n.toLocaleString("en-US");
const date = (value: string | null | undefined) =>
  value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit"
  }) : "Unobserved";

function Led({ ok = true }: { ok?: boolean }) {
  return <span className={`kt-led ${ok ? "" : "kt-led-dim"}`} aria-hidden />;
}
function Eyelet({ children }: { children: ReactNode }) {
  return <span className="kt-eyelet">{children}</span>;
}
function PanelHeading({ index, title, marker }: { index: string; title: string; marker: string }) {
  return <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
    <div className="flex items-center gap-3"><Eyelet>{index}</Eyelet><h2 className="text-lg font-semibold tracking-tight text-[#f7ebd5] sm:text-xl">{title}</h2></div>
    <span className="kt-label text-[#8f9b9a]">{marker}</span>
  </div>;
}
function Value({ label, value, sub, accent = "gold" }: {
  label: string; value: string; sub: string; accent?: "gold" | "mint" | "blue" | "rose";
}) {
  return <div className="kt-value-tile">
    <div className="kt-label text-[#a69d90]">{label}</div>
    <div className={`kt-big-number kt-number-${accent}`}>{value}</div>
    <div className="mt-2 text-[11px] leading-5 text-[#8d9a9b]">{sub}</div>
  </div>;
}

export default function KingdomTreasury() {
  const [holders, setHolders] = useState<Feed<TreasuryHolders>>(empty);
  const [network, setNetwork] = useState<Feed<TreasuryNetwork>>(empty);
  const [pool, setPool] = useState<Feed<TreasuryPool>>(empty);
  const [transfers, setTransfers] = useState<Feed<TreasuryTransfers>>(empty);
  const [working, setWorking] = useState(false);
  const [walletQuery, setWalletQuery] = useState("");
  const [accountsOpen, setAccountsOpen] = useState(false);
  const [holdersOpen, setHoldersOpen] = useState(false);
  const [costsOpen, setCostsOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    setWorking(true);
    const requests = [
      fetch("/api/wolo/holders", { cache: "no-store" }).then(async (r) => {
        if (!r.ok) throw new Error("Holders feed unavailable");
        const data: unknown = await r.json();
        if (!isPublicTreasuryHolders(data)) throw new Error("Invalid public holder evidence");
        setHolders({ data, error: false, checkedAt: Date.now() });
      }).catch(() => setHolders((s) => ({ ...s, error: true }))),
      fetch("/api/wolo/network", { cache: "no-store" }).then(async (r) => {
        if (!r.ok) throw new Error("Network feed unavailable");
        const data: unknown = await r.json();
        if (!isTreasuryNetwork(data)) throw new Error("Invalid network evidence");
        setNetwork({ data, error: false, checkedAt: Date.now() });
      }).catch(() => setNetwork((s) => ({ ...s, error: true }))),
      fetch("/api/wolo/osmosis-pulse", { cache: "no-store" }).then(async (r) => {
        if (!r.ok) throw new Error("Liquidity feed unavailable");
        const data: unknown = await r.json();
        if (!isTreasuryPool(data)) throw new Error("Invalid pool evidence");
        setPool({ data, error: false, checkedAt: Date.now() });
      }).catch(() => setPool((s) => ({ ...s, error: true }))),
      fetch("/api/wolo/mainnet-transfers?limit=25", { cache: "no-store" }).then(async (r) => {
        if (!r.ok) throw new Error("Transfer index unavailable");
        const data: unknown = await r.json();
        if (!isTreasuryTransfers(data)) throw new Error("Invalid transfer evidence");
        setTransfers({ data, error: false, checkedAt: Date.now() });
      }).catch(() => setTransfers((s) => ({ ...s, error: true }))),
    ];
    await Promise.all(requests);
    setWorking(false);
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 60_000);
    const onVisibility = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisibility); };
  }, [refresh]);

  // The dashboard stays useful when one independent upstream is down.
  // Require one observed source (or four explicit failures), not all four.
  const ready = Boolean(holders.data || network.data || pool.data || transfers.data) ||
    [holders, network, pool, transfers].every((source) => source.error);
  const accounts = useMemo(() =>
    network.data && holders.data ? publicSystemAccounts(network.data, holders.data) : [],
    [network.data, holders.data]);
  const holderRows = holders.data?.holders ?? [];
  const legacyIdentities = holders.data ? legacyIdentityMembership(holders.data) : [];
  const outflows = useMemo(() =>
    observedKingdomOutflows(transfers.data?.rows ?? [], accounts),
    [transfers.data, accounts]);
  const filteredAccounts = accounts.filter((a) =>
    (a.label + " " + a.role + " " + a.address).toLowerCase().includes(walletQuery.toLowerCase()));
  const reportedOutlay = reportedMonthlyOutlay();
  const reserveBalance = disclosedKingdomReserveBalance(accounts);
  const errors = [holders, network, pool, transfers].filter((s) => s.error).length;
  const liveCount = [holders, network, pool, transfers].filter((s) => s.data).length;

  async function copyAddress(address: string) {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return <main className="kt-shell" data-treasury-version="v1">
    <SpeedReadyMarker route="/kingdom-treasury" ready={ready} />
    <div className="kt-background" aria-hidden />
    <div className="relative mx-auto max-w-[1480px] space-y-4 px-3 py-5 sm:px-6 sm:py-7 xl:px-9">
      <header className="kt-hero">
        <div className="kt-hero-sheen" aria-hidden />
        <div className="relative z-10 grid items-center gap-7 lg:grid-cols-[1.12fr_.88fr]">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="kt-plate"><Landmark size={15}/> KINGDOM BANK · WOLO-1</span>
              <span className="kt-label inline-flex items-center gap-2 text-emerald-200/80"><Led ok={errors === 0 && liveCount > 0} /> {errors ? `${errors} FEED${errors === 1 ? "" : "S"} DEGRADED` : liveCount ? `${liveCount} / 4 SOURCES OBSERVED` : "CONNECTING TO TREASURY"}</span>
            </div>
            <div className="mt-8 text-[10px] tracking-[.28em] text-[#beaa88]">AOE2WAR / THE FINANCIAL HEART</div>
            <h1 className="kt-display mt-3 text-[clamp(3.1rem,7.3vw,6.8rem)] leading-[.92] tracking-[-.07em]">Kingdom<br/><span>Treasury.</span></h1>
            <div className="mt-6 flex flex-wrap items-center gap-4 text-xs text-[#b0ada3]">
              <span className="inline-flex items-center gap-2"><ShieldCheck size={14}/> Public finance, observed on-chain</span>
              <span className="inline-flex items-center gap-2"><LockKeyhole size={14}/> No signing. No payments from this page.</span>
            </div>
            <div className="mt-7 flex flex-wrap gap-3">
              <button className="kt-action" onClick={() => void refresh()} disabled={working} type="button"><RefreshCw size={14} className={working ? "animate-spin" : ""}/> {working ? "Reading ledgers…" : "Sync treasury"}</button>
              <Link href="/wolochain" className="kt-action kt-action-secondary">Wolo Chain <ArrowUpRight size={14}/></Link>
            </div>
          </div>
          <div className="kt-vault-assembly">
            <div className="kt-gear-outer" aria-hidden/>
            <div className="kt-gear-inner" aria-hidden/>
            <div className="kt-vault-core">
              <Image src="/legacy/wolo-logo-transparent.png" width={90} height={90} alt="WOLO" className="h-[90px] w-[90px] object-contain opacity-95 drop-shadow-[0_0_24px_rgba(223,172,55,.25)]" />
              <div className="kt-label mt-3 text-[#d4c6a9]">TREASURY ON CHAIN</div>
              <div className="font-mono text-3xl font-semibold text-[#f4e8bd]">{holders.data ? amount(holders.data.count) : "—"}</div>
              <div className="kt-label text-[#89988e]">CURRENT HOLDERS</div>
            </div>
          </div>
        </div>
        <div className="relative z-10 mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-[#c3a67f]/20 pt-4 font-mono text-[10px] tracking-widest text-[#81918c]">
          <span>WALLETS · LIQUIDITY · OUTGOING TRANSFERS · OPERATING COSTS</span>
          <span>PUBLIC / READ ONLY</span>
        </div>
      </header>
      {errors > 0 && <div role="status" className="rounded-xl border border-amber-400/25 bg-amber-950/25 p-3 text-xs text-amber-100">
        {errors} evidence feed{errors === 1 ? "" : "s"} unavailable. Last confirmed readings are retained and may be stale; unknown values do not become zero.
      </div>}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Value label="Wolo Chain Network" value={holders.data ? amount(holders.data.count) : "—"} sub="Current funded holders · live wallet + staking projection" />
        <Value label="Registered network accounts" value={network.data ? amount(network.data.registryAddressCount) : "—"} sub="Address registry · may include unfunded module accounts" accent="blue"/>
        <Value label="WOLO / USDC pool" value={pool.data ? `$${money(pool.data.liquidityUsd)}` : "—"} sub={pool.data ? `Pool #${pool.data.poolId} · derived USDC depth` : "Osmosis liquidity unavailable"} accent="mint" />
        <Value label="Monthly baseline" value={`$${money(reportedOutlay)}`} sub="Founder-reported costs · dollar currency unconfirmed" accent="rose"/>
      </section>

      <section className="kt-panel p-5 sm:p-7">
        <PanelHeading index="01" title="The kingdom vault" marker="BALANCE AUTHORITY · WOLO-1"/>
        <div className="grid items-stretch gap-5 lg:grid-cols-[.8fr_1.2fr]">
          <div className="kt-primary-tile">
            <span className="kt-label text-[#a8ab9a]">UNENCUMBERED KINGDOM WEALTH</span>
            <div className="kt-major-stat">{reserveBalance === null || !Number.isFinite(reserveBalance) ? "—" : money(reserveBalance, 2)}</div>
            <span className="font-mono text-xs text-[#cab083]">WOLO · eight governed community reserve accounts</span>
            <div className="mt-6 h-2 overflow-hidden rounded-full bg-black/45"><div className="kt-bar-live h-full rounded-full" style={{width: network.data && holders.data ? "100%" : "0%"}}/></div>
            <p className="mt-4 text-xs leading-5 text-[#99a4a5]">Canonical community reserve allowlist, matching the Kingdom Wealth definition. Excludes founder personal funds, escrow, staking custody, player wallets and the Osmosis pool. Not circulating supply.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="kt-inset"><Wallet size={19} className="text-amber-200"/><div className="kt-small-stat">{holders.data ? amount(holders.data.currentNonzeroOwnerCount) : "—"}</div><span>Liquid funded owners</span></div>
            <div className="kt-inset"><Layers3 size={19} className="text-[#9acece]"/><div className="kt-small-stat">{network.data ? amount(accounts.length) : "—"}</div><span>Active registered system accounts</span></div>
            <div className="kt-inset"><Radar size={19} className="text-[#9acece]"/><div className="kt-small-stat">{holders.data ? amount(holders.data.retainedTransferAddressCount) : "—"}</div><span>Historically indexed transfer addresses</span></div>
            <div className="kt-inset"><Crown size={19} className="text-[#ddc484]"/><div className="kt-small-stat">{holders.data ? amount(holderRows.filter((h) => h.classification === "player").length) : "—"}</div><span>Funded player-linked wallets</span></div>
          </div>
        </div>
        <button type="button" className="kt-expand mt-5" onClick={() => setAccountsOpen(!accountsOpen)} aria-expanded={accountsOpen}>
          <span className="flex items-center gap-2"><Wallet size={15}/> Browse system & module wallets</span><ChevronDown size={17} className={accountsOpen ? "rotate-180" : ""}/>
        </button>
        {accountsOpen && <div className="mt-4 space-y-3">
          <label className="kt-search"><Search size={15}/><input aria-label="Filter kingdom accounts" placeholder="Treasury, founder, escrow, validator, wallet address…" value={walletQuery} onChange={(e) => setWalletQuery(e.target.value)}/></label>
          <div className="kt-scroll max-h-[540px] space-y-2 overflow-y-auto pr-1">
            {filteredAccounts.map((a) => <article key={a.address} className="kt-account">
              <button type="button" onClick={() => setSelectedAccount(selectedAccount === a.address ? null : a.address)} aria-expanded={selectedAccount === a.address} className="flex w-full items-center justify-between gap-3 text-left">
                <span className="min-w-0"><span className="block truncate font-semibold text-[#eee4cd]">{a.label}</span><span className="mt-1 block text-[10px] uppercase tracking-wider text-[#88999b]">{a.role} · {a.isModule ? "module" : a.use}</span></span>
                <span className="flex shrink-0 items-center gap-3"><span className="font-mono text-xs text-[#cbb68e]">{a.publicBalance !== null ? `${a.publicBalance} WOLO` : "Balance unavailable"}</span><ChevronRight size={14}/></span>
              </button>
              {selectedAccount === a.address && <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3"><code className="break-all text-[11px] text-[#9aa8a9]">{a.address}</code><button type="button" onClick={() => void copyAddress(a.address)} className="kt-action !min-h-0 !px-2 !py-1 !text-[10px]">{copied ? <Check size={12}/> : <Wallet size={12}/>} Copy</button></div>}
            </article>)}
            {!filteredAccounts.length && <div className="kt-account text-sm text-[#8a9898]">{network.data ? "No matching system accounts." : "Awaiting network ledger…"}</div>}
          </div>
        </div>}
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.1fr_.9fr]">
        <div className="kt-panel p-5 sm:p-7">
          <PanelHeading index="02" title="Osmosis liquidity chamber" marker="WOLO / USDC · POOL PRICE"/>
          <div className="kt-liquidity-chamber">
            <div className="kt-liquid-orbit" aria-hidden/>
            <div className="relative z-10 flex flex-wrap items-end justify-between gap-4">
              <div><div className="kt-label text-[#9caeb3]">OBSERVED TOTAL POOL LIQUIDITY</div><strong className="kt-major-stat !text-[#a3d8ce]">{pool.data ? `$${money(pool.data.liquidityUsd)}` : "—"}</strong></div>
              <div className="text-right font-mono text-xs text-[#9bada9]">{pool.data ? `$ ${money(pool.data.priceUsd, 8)} / WOLO` : "Market price unavailable"}</div>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <div className="kt-liquid-slot"><span>Pool WOLO reserve</span><strong>{pool.data ? money(pool.data.reserveWolo, 2) : "—"}</strong></div>
              <div className="kt-liquid-slot"><span>Pool USDC reserve</span><strong>{pool.data ? money(pool.data.reserveUsdc, 2) : "—"}</strong></div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-[#9ca7a7]">
            <span className="inline-flex items-center gap-2"><Led ok={!!pool.data && !pool.error}/> {pool.data ? `Observed ${date(pool.data.updatedAt)}` : "Awaiting Osmosis"}</span>
            {pool.data && <a href={pool.data.poolUrl} target="_blank" rel="noreferrer" className="kt-inline-link">View pool <ExternalLink size={13}/></a>}
          </div>
          <p className="mt-3 text-[11px] leading-5 text-[#8b9796]">Pool TVL is derived from its USDC reserve (×2), not an independent audited valuation of all circulating WOLO or the kingdom treasury.</p>
        </div>

        <div className="kt-panel p-5 sm:p-7">
          <PanelHeading index="03" title="Founder operating ledger" marker="REPORTED COSTS · NO BANK LINK"/>
          <div className="kt-operating">
            <span className="kt-label text-[#bba99f]">REPORTED MONTHLY OUTLAY</span>
            <div className="kt-major-stat !text-[#f0b3a6]">$${money(reportedOutlay)}</div>
            <div className="mt-1 font-mono text-xs text-[#beafa6]">Monthly break-even floor · before other costs</div>
            <div className="mt-6 grid grid-cols-3 gap-1.5">
              {REPORTED_TREASURY_COSTS.filter((cost) => cost.status === "reported-active").map((cost) =>
                <div key={cost.id} className="kt-cost-stack" style={{flexGrow:cost.amount}} title={`${cost.name} $${money(cost.amount)} / month`}/>)}
            </div>
            <div className="mt-3 flex flex-wrap justify-between gap-2 text-[11px] text-[#9aabab]"><span>Revenue: not linked</span><span>Net profit/loss: unavailable</span></div>
          </div>
          <button type="button" className="kt-expand mt-4" onClick={() => setCostsOpen(!costsOpen)} aria-expanded={costsOpen}><span className="flex items-center gap-2"><Banknote size={15}/> Bills and upcoming commitments</span><ChevronDown size={17} className={costsOpen ? "rotate-180":""}/></button>
          {costsOpen && <div className="mt-3 space-y-2">{REPORTED_TREASURY_COSTS.map((cost) => <div key={cost.id} className="kt-account flex flex-wrap items-center justify-between gap-3"><div><strong className="block text-sm text-[#e9dfcf]">{cost.name}</strong><span className="text-[11px] text-[#8c9697]">{cost.status === "planned-unpaid" ? "Planned · not paid" : "Founder-reported · not invoice-verified"}</span></div><div className="text-right font-mono text-sm text-[#e0b6a8]">$${money(cost.amount)}<div className="text-[10px] text-[#859390]">{cost.billing === "monthly" ? "/ month" : "cadence TBD"}</div></div></div>)}
            <div className="text-[11px] leading-5 text-[#919d9c]">All figures are founder-reported in unspecified $ currency. No currency conversion, verified payment date, accounting revenue, or automatic expense deduction.</div>
          </div>}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[.87fr_1.13fr]">
        <div className="kt-panel p-5 sm:p-7">
          <PanelHeading index="04" title="Wolo Chain Network" marker="FUNDED ADDRESS CENSUS"/>
          <div className="kt-holder-plate"><div className="kt-label">CURRENT HOLDERS ON WOLO-1</div><div className="kt-major-stat">{holders.data ? amount(holders.data.count) : "—"}</div><div className="mt-3 text-xs leading-5 text-[#a3b0ae]">Live current funded/staking projection. A historical wallet does not increase this count without current funds.</div></div>
          <button type="button" className="kt-expand mt-4" onClick={() => setHoldersOpen(!holdersOpen)} aria-expanded={holdersOpen}><span className="flex items-center gap-2"><Coins size={15}/> All current holders · identity and privacy policy</span><ChevronDown size={17} className={holdersOpen?"rotate-180":""}/></button>
          {holdersOpen && <div className="kt-scroll mt-3 max-h-[480px] space-y-2 overflow-y-auto pr-1">{holderRows.map((h) => <div className="kt-account flex items-center justify-between gap-3" key={h.address}>
            <div className="min-w-0"><div className="truncate text-sm text-[#ece0ce]">{h.alias}</div><div className="mt-1 truncate font-mono text-[10px] text-[#8f9c9a]">{h.address}</div></div>
            <div className="shrink-0 text-right"><div className="font-mono text-xs text-[#c8b78c]">{h.classification === "protocol" ? `${h.balanceWoloFormatted} WOLO` : "—"}</div><div className="mt-1 text-[10px] uppercase text-[#8f9c9a]">{h.classification === "protocol" ? "Public protocol" : "Personal balance hidden"}</div></div>
          </div>)}
          {!holders.data && <p className="text-sm text-[#8f9c9a]">Current holder projection unavailable.</p>}</div>}
          <div className="mt-4 space-y-2">
            <div className="kt-label text-[#a9b6ac]">LEGACY REGISTERED PLAYER WALLETS · NOT EXTRA CURRENT HOLDERS</div>
            {legacyIdentities.map((identity) => <article key={identity.address} className="kt-account flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0"><strong className="block text-xs text-[#e6d7b6]">{identity.label}</strong><div className="mt-1 break-all font-mono text-[10px] text-[#91a29f]">{identity.address}</div></div>
              <span className={`kt-plate !text-[9px] ${identity.isCurrentHolder ? "!text-emerald-200" : ""}`}>{identity.isCurrentHolder ? "CURRENT FUNDED HOLDER" : "HISTORICAL / NOT CURRENT FUNDED"}</span>
            </article>)}
            {!holders.data && <div className="text-xs text-[#8e9898]">Awaiting holder census to check historic account membership.</div>}
            <p className="text-[11px] leading-5 text-[#8e9898]">[BDB] is Pigman’s recorded clan prefix, not a separately verified account. “Ra 𓁛𓇳” is the registered alias; “Raw” has no separate proven address. Historical accounts add zero to the current-funded count unless live chain evidence includes them.</p>
          </div>
        </div>

        <div className="kt-panel p-5 sm:p-7">
          <PanelHeading index="05" title="Kingdom payment rail" marker="INDEXED BANK SENDS · SOURCE PROOF"/>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div><div className="kt-major-stat !text-3xl">{transfers.data && network.data && holders.data ? amount(outflows.length) : "—"}</div><div className="mt-1 text-xs text-[#909f9d]">Kingdom-origin transfers in latest indexed batch</div></div>
            <span className="kt-plate"><Led ok={!!transfers.data && !transfers.error}/> READ ONLY · 25-ROW WINDOW</span>
          </div>
          <div className="kt-scroll max-h-[565px] space-y-2 overflow-y-auto pr-1">
            {outflows.map((tx) => <article key={tx.key} className="kt-transfer">
              <div className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2"><span className="kt-transfer-glyph"><ArrowUpRight size={14}/></span><span className="min-w-0"><strong className="block truncate text-xs font-semibold text-[#eee5d0]">{tx.senderLabel || tx.senderAddress.slice(0, 18)} → {tx.recipientLabel || tx.recipientAddress.slice(0, 12)+"…"}</strong><span className="mt-1 block text-[10px] text-[#8b9b9a]">{date(tx.timestamp)} · indexed bank send</span></span></span>
                <strong className="shrink-0 font-mono text-xs text-[#e5c28c]">− {tx.amountLabel}</strong>
              </div>
              <div className="mt-2 truncate font-mono text-[10px] text-[#82918c]">TX: {tx.txHash}</div>
            </article>)}
            {!outflows.length && <div className="rounded-xl border border-dashed border-[#b4a487]/20 p-8 text-center text-sm text-[#8c9b99]">{transfers.data && network.data && holders.data ? "No system-wallet sends in the latest indexed sample." : "Awaiting chain transfer evidence…"}</div>}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[11px] text-[#8d9d99]">
            <span>Indexed chain bank sends only. Not full history; not proof of payout purpose.</span><Link href="/wolochain" className="kt-inline-link">Network ledger <ArrowUpRight size={13}/></Link>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="kt-inset"><Crown size={18} className="text-[#dbc28b]"/><div className="mt-3 font-semibold text-[#ebd7a9]">Champion tributes</div><p className="mt-1 text-xs text-[#8c9c9a]">Awaiting verified payout-classification feed</p></div>
            <div className="kt-inset"><Zap size={18} className="text-[#dbc28b]"/><div className="mt-3 font-semibold text-[#ebd7a9]">Bounties & marketplace</div><p className="mt-1 text-xs text-[#8c9c9a]">Awaiting purpose-bound settlement receipts</p></div>
          </div>
        </div>
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-3 px-2 pb-5 pt-2 text-[10px] uppercase tracking-[.14em] text-[#7f918c]">
        <span className="flex items-center gap-2"><Landmark size={14}/> KINGDOM TREASURY · PUBLIC EVIDENCE, NOT AN ACCOUNTING ATTESTATION</span>
        <span className="flex items-center gap-2"><Waves size={13}/> MOTION IS AMBIENT · NO FUNDS MOVE FROM THIS PAGE</span>
      </footer>
    </div>
  </main>;
}
