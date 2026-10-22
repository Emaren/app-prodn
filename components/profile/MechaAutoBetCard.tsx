import {BET_MAX_STAKE_WOLO,AUTO_BET_MAX_DAILY_WOLO} from "@/lib/betMoneyLimits";
"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, Coins, Crosshair, LockKeyhole, Radar, Settings2, ShieldCheck, X, Wallet, ArrowDownToLine } from "lucide-react";
import { useKeplr } from "@/hooks/use-keplr";
import WarSatchelWalletProof from "@/components/profile/WarSatchelWalletProof";
import WarSatchelFundingAction from "@/components/profile/WarSatchelFundingAction";
import WarSatchelSpendAuthorization from "@/components/profile/WarSatchelSpendAuthorization";
import WarSatchelWithdrawAction from "@/components/profile/WarSatchelWithdrawAction";
import { useWoloBalance } from "@/hooks/useWoloBalance";
import { deriveWoloBalanceReadState, formatMinimalDenomAmount } from "@/lib/woloBalanceRead";
import { parseCertifiedWarSatchelRead, type CertifiedWarSatchelRead } from "@/lib/warSatchelBalanceRead";

type DS = "none" | "yes" | "no";
type Preset = { enabled: boolean; winnerStakeWolo: number; desyncSide: DS; desyncStakeWolo: number; untilOut: boolean; gamesRemaining: number | null; version: number };
type Payload = {
  preset: Preset;
  effectiveEnabled: boolean;
  limits: { maxEstimatedReserveWolo: number; maxGames: number };
  runtime: { previewOnly: boolean; executionReady: boolean; mode: "disabled" | "shadow" | "live" };
  readiness: { identityReady: boolean; watcherKeyReady: boolean; durableMarketEvaluatorReady: boolean };
  detail?: string;
};
type Execution = { id: number; status: string; winnerMarket: { title: string } };
const MAX_AUTO_GAME_WOLO = BET_MAX_STAKE_WOLO;
const number = (raw: string) => /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : NaN;

/** E2 presentation operates exclusively on existing *shadow-only* user endpoints. */
export default function MechaAutoBetCard({ displayName }: { displayName: string }) {
  const [server, setServer] = useState<Payload | null>(null);
  const [history, setHistory] = useState<Execution[]>([]);
  const [satchelBalance, setSatchelBalance] = useState<CertifiedWarSatchelRead | null>(null);
  const [winner, setWinner] = useState("10");
  const [dsSide, setDsSide] = useState<DS>("none");
  const [dsStake, setDsStake] = useState("0");
  const [games, setGames] = useState("1");
  const [untilOut, setUntilOut] = useState(false);
  const { status: walletStatus, address: walletAddress, connect: connectWallet } = useKeplr();
  const verifiedWalletBalance = useWoloBalance(walletStatus === "connected" ? walletAddress : undefined);
  const balanceState = deriveWoloBalanceReadState({
    connected: walletStatus === "connected" && Boolean(walletAddress),
    amount: verifiedWalletBalance.data,
    isLoading: verifiedWalletBalance.isLoading,
    isFetching: verifiedWalletBalance.isFetching,
    isError: verifiedWalletBalance.isError,
  });
  const walletAmount = balanceState === "success-zero" || balanceState === "success-funded" ||
    balanceState === "refreshing"
    ? formatMinimalDenomAmount(verifiedWalletBalance.data) : null;
  const [satchelOpen, setSatchelOpen] = useState(false);
  const [depositAmount, setDepositAmount] = useState("100");
  const [walletConnectError, setWalletConnectError] = useState("");
  const [settings, setSettings] = useState(false);
  const [dsPanel, setDsPanel] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const hydrate = useCallback((p: Payload) => {
    setServer(p);
    setWinner(String(p.preset.winnerStakeWolo));
    setDsSide(p.preset.desyncSide);
    setDsStake(String(p.preset.desyncStakeWolo));
    setGames(String(p.preset.gamesRemaining ?? 1));
    setUntilOut(p.preset.untilOut);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [current, executions] = await Promise.all([
          fetch("/api/user/bet-automation", { cache: "no-store" }),
          fetch("/api/user/bet-automation/executions", { cache: "no-store" }),
        ]);
        const p = (await current.json()) as Payload;
        if (!current.ok || !p?.preset) throw new Error("Command unavailable");
        if (!cancelled) hydrate(p);
        if (executions.ok) {
          const log = (await executions.json()) as { rows?: Execution[] };
          if (!cancelled) setHistory(Array.isArray(log.rows) ? log.rows : []);
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Command unavailable");
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [hydrate]);

  // The backend never exposes owner ledger data while the financial source
  // HOLD is active. Never derive Satchel credit from the connected Keplr
  // wallet, a proposed deposit, an unverified proof or saved profile state.
  useEffect(() => {
    let active = true;
    setSatchelBalance(null);
    if (!server?.preset.version) return () => { active = false; };
    void fetch("/api/user/war-satchel/balance", {
      cache: "no-store", credentials: "same-origin",
    }).then(async response => {
      if (!response.ok) return null;
      const value: unknown = await response.json();
      return parseCertifiedWarSatchelRead(value);
    }).then(value => {
      if (active) setSatchelBalance(value);
    }).catch(() => {
      if (active) setSatchelBalance(null);
    });
    return () => { active = false; };
  }, [server?.preset.version, satchelOpen]);

  const stake = number(winner);
  const ds = dsSide === "none" ? 0 : number(dsStake);
  const perGame = stake + ds;
  const count = number(games);
  const planLimit = Math.min(server?.limits.maxEstimatedReserveWolo ?? AUTO_BET_MAX_DAILY_WOLO,AUTO_BET_MAX_DAILY_WOLO);
  const plan = untilOut ? planLimit : perGame * count;
  const valid = Number.isSafeInteger(stake) && stake >= 1 &&
    Number.isSafeInteger(ds) && ds >= (dsSide === "none" ? 0 : 1) &&
    Number.isSafeInteger(perGame) && perGame <= MAX_AUTO_GAME_WOLO &&
    (untilOut || (Number.isSafeInteger(count) && count >= 1 && count <= (server?.limits.maxGames ?? 10_000))) &&
    Number.isSafeInteger(plan) && plan <= planLimit;
  const armed = Boolean(server?.preset.enabled);
  const readiness = Boolean(server?.readiness.identityReady && server?.readiness.watcherKeyReady &&
    server?.readiness.durableMarketEvaluatorReady);
  const previewOnly = server?.runtime.previewOnly !== false || !server.runtime.executionReady;
  const dirty = Boolean(server && (
    server.preset.winnerStakeWolo !== stake || server.preset.desyncSide !== dsSide ||
    server.preset.desyncStakeWolo !== ds || server.preset.untilOut !== untilOut ||
    (!untilOut && server.preset.gamesRemaining !== count)
  ));

  const save = useCallback(async (nextEnabled: boolean) => {
    if (!server || !valid || saving) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/user/bet-automation", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: nextEnabled, winnerStakeWolo: stake, desyncSide: dsSide,
          desyncStakeWolo: ds, untilOut, gamesRemaining: untilOut ? null : count,
          selfOnly: true, expectedVersion: server.preset.version,
        }),
      });
      const next = (await response.json().catch(() => null)) as Payload | null;
      if (!response.ok || !next?.preset) throw new Error(next?.detail || "Command rejected");
      hydrate(next);
      setNotice(nextEnabled
        ? next.runtime.mode === "live" && next.runtime.executionReady
          ? "Mecha plan saved · signed Satchel spending mandate required"
          : "Preview active"
        : "Preview paused");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Command rejected");
    } finally { setSaving(false); }
  }, [server, valid, saving, stake, dsSide, ds, untilOut, count, hydrate]);

  // Pause is always available, even if the user has unfinished/invalid edits.
  // The server's pause-only path preserves the last committed plan unchanged.
  const pause = useCallback(async () => {
    if (!server || saving) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/user/bet-automation", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "pause", expectedVersion: server.preset.version }),
      });
      const next = (await response.json().catch(() => null)) as Payload | null;
      if (!response.ok || !next?.preset) throw new Error(next?.detail || "Pause rejected");
      hydrate(next);
      setNotice(server.runtime.mode === "live" && server.runtime.executionReady
        ? "Mecha plan paused · new bets are disabled"
        : "Preview paused");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Pause rejected");
    } finally { setSaving(false); }
  }, [server, saving, hydrate]);

  const status = !server ? "UNLINKED" : !armed ? "STANDBY" :
    server.runtime.mode === "disabled" ? "AUTOMATION OFFLINE" :
    !readiness ? "WAITING FOR WATCHER" : previewOnly ? "SHADOW READY" : "FUNDED CONFIGURED";
  const mecha = "Mecha " + (displayName.trim().slice(0, 38) || "Warrior");
  const satchelVerifiedBalanceWolo = satchelBalance ?
    formatMinimalDenomAmount(satchelBalance.availableUwolo) : null;
  const depositAmountValue = number(depositAmount);
  const depositAmountValid = Number.isSafeInteger(depositAmountValue) && depositAmountValue > 0;
  const walletAction = async () => {
    setWalletConnectError("");
    try {
      await connectWallet();
    } catch (cause) {
      setWalletConnectError(cause instanceof Error ? cause.message : "Unable to connect Keplr");
    }
  };
  const dsSelected = dsSide !== "none";

  return (
    <section aria-label="Mecha next-match auto command" className="relative isolate overflow-hidden rounded-[2.3rem] border border-amber-200/20 bg-[#060a12] p-5 text-white shadow-[0_34px_110px_rgba(0,0,0,.5)] sm:p-7">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_91%_10%,rgba(251,191,36,.17),transparent_36%),radial-gradient(ellipse_at_5%_90%,rgba(6,100,120,.22),transparent_40%),linear-gradient(135deg,#111722,#05070c)]" />
      <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-amber-100/70 to-transparent" />
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-amber-200/35 bg-amber-100/[.07]">
            <Radar aria-hidden="true" className={"h-6 w-6 text-amber-200 " + (armed && readiness ? "motion-safe:animate-pulse" : "")} />
            <span className={"absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full ring-2 ring-[#060a12] " + (armed ? "bg-emerald-400" : "bg-slate-500")} />
          </div>
          <div className="min-w-0">
            <div className="text-[9px] font-black uppercase tracking-[.24em] text-amber-200/75">AUTO BETTING // NEXT MATCH</div>
            <h2 className="truncate font-serif text-2xl font-bold text-white sm:text-3xl">{mecha}</h2>
          </div>
        </div>
        <button
          type="button" role="switch" aria-checked={armed} aria-label="Enable or pause Mecha preview"
          onClick={() => { if (armed) void pause(); else void save(true); }}
          disabled={loading || saving || !server || (!armed && (!valid || dirty))}
          className={"relative h-12 w-[5.5rem] shrink-0 rounded-full border p-1 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300 disabled:opacity-40 " +
            (armed ? "border-amber-200/60 bg-amber-300/20" : "border-white/15 bg-white/[.05]")}
        >
          <span className={"absolute top-1/2 -translate-y-1/2 text-[9px] font-black " + (armed ? "left-2 text-amber-200" : "right-2 text-slate-400")}>{armed ? "ON" : "OFF"}</span>
          <span className={"block h-10 w-10 rounded-full shadow-lg transition-transform " + (armed ? "translate-x-10 bg-amber-300" : "bg-slate-400")} />
        </button>
      </header>
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.18em] text-slate-400">
            <Wallet className="h-4 w-4 text-sky-200" aria-hidden /> WALLET
          </div>
          <div className="mt-3 truncate text-2xl font-black tabular-nums text-white" aria-label="Verified connected wallet balance">
            {walletAmount ?? "—"} <span className="text-xs font-bold text-slate-400">WOLO</span>
          </div>
          {walletStatus !== "connected" ? (
            <button type="button" onClick={() => void walletAction()}
              className="mt-2 text-xs font-bold text-sky-200 hover:text-sky-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-200">
              Connect Keplr ↗
            </button>
          ) : (
            <span className="mt-2 block text-[10px] font-semibold text-slate-400">
              {balanceState === "success-zero" || balanceState === "success-funded" ? "Chain verified" :
                balanceState === "refreshing" ? "Refreshing chain balance" :
                balanceState === "loading" ? "Checking chain balance" : "Balance unavailable"}
            </span>
          )}
          {walletConnectError && <p role="alert" className="mt-2 text-xs text-rose-200">{walletConnectError}</p>}
        </div>
        <div className="rounded-2xl border border-amber-200/25 bg-amber-200/[.055] p-4">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.18em] text-amber-200">
            <LockKeyhole className="h-4 w-4" aria-hidden /> WAR SATCHEL
          </div>
          <div className="mt-3 text-2xl font-black tabular-nums text-white" aria-label="War Satchel verified balance">
            {satchelVerifiedBalanceWolo ?? "—"} <span className="text-xs font-bold text-slate-400">WOLO</span>
          </div>
          <span className="mt-2 block text-[10px] font-semibold text-slate-400">
            {satchelBalance ? "Available · owner ledger (not vault solvency)" : "Uncertified · no verified Satchel credit"}
          </span>
          <button type="button" onClick={() => setSatchelOpen((value) => !value)}
            aria-expanded={satchelOpen}
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-amber-200/30 bg-amber-300/10 px-3 py-1.5 text-xs font-black text-amber-100 transition hover:bg-amber-300/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300">
            <ArrowDownToLine className="h-3.5 w-3.5" aria-hidden /> LOAD SATCHEL
          </button>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
          <div className="text-[10px] font-black uppercase tracking-[.18em] text-slate-400">NEXT MATCH BET</div>
          <div className="mt-3 truncate text-3xl font-black tabular-nums text-white">
            {Number.isSafeInteger(perGame) ? perGame.toLocaleString() : "—"} <span className="text-xs font-bold text-amber-200">WOLO</span>
          </div>
          <button type="button" aria-expanded={settings} aria-label="Open bet plan"
            onClick={() => setSettings((value) => !value)}
            className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-slate-200 hover:text-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300">
            <Settings2 className="h-3.5 w-3.5" aria-hidden /> BET PLAN <ChevronDown className="h-3 w-3" aria-hidden />
          </button>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4 text-[10px] font-black uppercase tracking-[.17em]">
        <div className="inline-flex items-center gap-2 text-amber-100">
          <span className={"h-2.5 w-2.5 rounded-full " + (armed && readiness ? "bg-emerald-300 motion-safe:animate-pulse" : "bg-amber-300/60")} />
          {status === "SHADOW READY" ? "PREVIEW ACTIVE" : status}
        </div>
        <div className="text-slate-400">{untilOut ? "UNTIL OUT" : (Number.isFinite(count) ? count : "—") + " GAMES"} · {previewOnly ? "PREVIEW ONLY" : "FUNDED EXECUTOR CONFIGURED"}</div>
        <button type="button" aria-expanded={dsPanel} aria-label="Desync bet settings"
          onClick={() => { setDsPanel((value) => !value); setSettings(true); }}
          className={"rounded-lg border px-3 py-2 text-xs font-black tracking-[.12em] " +
            (dsSelected ? "border-sky-300/45 bg-sky-200/15 text-sky-200" : "border-white/15 bg-white/[.05] text-slate-300 hover:bg-white/10")}>
          DESYNC
        </button>
      </div>
      {satchelOpen && (
        <div className="mt-4 rounded-2xl border border-amber-200/25 bg-[#0b111b] p-4 sm:p-5" aria-label="Load War Satchel">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-serif text-xl font-bold text-amber-100">Load War Satchel</h3>
            <button type="button" aria-label="Close War Satchel" onClick={() => setSatchelOpen(false)}
              className="rounded-lg p-2 text-slate-300 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300">
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
          {satchelBalance && (
            <p className="mt-3 text-xs text-slate-300">
              Reserved: {formatMinimalDenomAmount(satchelBalance.reservedUwolo)} WOLO ·
              Withdrawal pending: {formatMinimalDenomAmount(satchelBalance.withdrawalPendingUwolo)} WOLO
            </p>
          )}
          <WarSatchelWalletProof walletAddress={walletStatus === "connected" ? walletAddress : ""} />
          {server?.preset && server.preset.version > 0 && (
            <WarSatchelSpendAuthorization
              walletAddress={walletStatus === "connected" ? walletAddress : ""}
              presetVersion={server.preset.version}
              plannedStakeWolo={server.preset.winnerStakeWolo + server.preset.desyncStakeWolo}
            />
          )}
          <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <label className="text-[10px] font-black uppercase tracking-[.16em] text-slate-400">
              WOLO FROM YOUR WALLET
              <input inputMode="numeric" aria-label="Amount of WOLO to load into War Satchel"
                value={depositAmount} onChange={(event) => setDepositAmount(event.target.value)}
                className="mt-2 block w-full rounded-xl border border-white/15 bg-slate-950 px-4 py-3 text-lg font-black text-white outline-none focus:border-amber-300" />
            </label>
            <div className="flex flex-wrap gap-2">
              {[50, 100, 250, 500, 1000].map((amount) => (
                <button type="button" key={amount} onClick={() => setDepositAmount(String(amount))}
                  aria-pressed={depositAmountValue === amount}
                  className={"rounded-lg border px-3 py-2.5 text-xs font-black " +
                    (depositAmountValue === amount
                      ? "border-amber-300 bg-amber-300 text-slate-950"
                      : "border-white/15 bg-white/[.04] text-slate-300 hover:bg-white/10")}>
                  {amount.toLocaleString()}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-4">
            {!depositAmountValid && (
              <p className="mb-2 text-xs text-amber-200">Enter a positive whole-number WOLO amount</p>
            )}
            <WarSatchelFundingAction
              walletAddress={walletStatus === "connected" ? walletAddress : ""}
              depositAmount={depositAmount}
            />
            <WarSatchelWithdrawAction
              walletAddress={walletStatus === "connected" ? walletAddress : ""}
            />
          </div>
        </div>
      )}
      {settings && (
        <div className="mt-4 rounded-2xl border border-amber-200/20 bg-black/45 p-4 sm:p-5">
          <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-[.2em] text-amber-200">
            BET PLAN
            <button type="button" aria-label="Close bet plan" onClick={() => setSettings(false)} className="rounded-lg p-1 text-slate-400 hover:text-white"><X className="h-4 w-4" /></button>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="text-[10px] font-bold uppercase tracking-[.13em] text-slate-400">WINNER WOLO
              <input aria-label="Winner stake in WOLO" inputMode="numeric" value={winner}
                onChange={(event) => setWinner(event.target.value)}
                className="mt-2 block w-full rounded-xl border border-white/15 bg-slate-950 px-3 py-3 text-lg font-black text-white outline-none focus:border-amber-300" />
            </label>
            <label className="text-[10px] font-bold uppercase tracking-[.13em] text-slate-400">GAMES
              <input aria-label="Number of games" inputMode="numeric" disabled={untilOut} value={games}
                onChange={(event) => setGames(event.target.value)}
                className="mt-2 block w-full rounded-xl border border-white/15 bg-slate-950 px-3 py-3 text-lg font-black text-white outline-none focus:border-amber-300 disabled:opacity-40" />
            </label>
          </div>
          <label className="mt-3 flex items-center gap-2 text-xs text-slate-300">
            <input type="checkbox" checked={untilOut} onChange={(event) => setUntilOut(event.target.checked)} className="accent-amber-300" /> Until Out
          </label>
          {dsPanel ? (
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/10 pt-4">
              <Crosshair aria-hidden className="h-4 w-4 text-sky-200" />
              {(["none", "no", "yes"] as const).map((side) => (
                <button type="button" key={side} aria-pressed={dsSide === side}
                  onClick={() => { setDsSide(side); if (side !== "none" && number(dsStake) < 1) setDsStake("2"); }}
                  className={"rounded-lg border px-3 py-2 text-[10px] font-black " + (dsSide === side ? "border-sky-200 bg-sky-300 text-slate-950" : "border-white/15 text-slate-300 hover:bg-white/10")}>
                  {side === "none" ? "OFF" : side.toUpperCase()}
                </button>
              ))}
              {dsSelected && <input aria-label="Desync stake in WOLO" inputMode="numeric" value={dsStake}
                onChange={(event) => setDsStake(event.target.value)}
                className="ml-auto w-24 rounded-lg border border-sky-300/35 bg-slate-950 px-2 py-2 text-right text-sm font-bold text-white outline-none" />}
            </div>
          ) : <button type="button" onClick={() => setDsPanel(true)} className="mt-4 text-[10px] font-black uppercase tracking-[.12em] text-sky-200">DESYNC OPTIONS ↗</button>}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <span className={"text-xs " + (valid ? "text-slate-400" : "text-rose-300")}>
              {valid ? perGame.toLocaleString() + " / " + MAX_AUTO_GAME_WOLO.toLocaleString() + " MATCH · " + plan.toLocaleString() + " / " + planLimit.toLocaleString() + " PLAN" :
                "1–" + MAX_AUTO_GAME_WOLO.toLocaleString() + " WOLO PER MATCH · " + planLimit.toLocaleString() + " PLAN MAX"}
            </span>
            <button type="button" onClick={() => void save(Boolean(server?.preset.enabled))} disabled={!valid || !server || saving}
              className="rounded-xl bg-amber-300 px-5 py-3 text-[10px] font-black uppercase tracking-[.15em] text-slate-950 hover:bg-amber-200 disabled:opacity-40">
              {saving ? "SAVING..." : armed ? "SAVE BET PLAN" :
                previewOnly ? "ARM PREVIEW" : "SAVE MECHA PLAN"}
            </button>
          </div>
        </div>
      )}
      {history.length > 0 && (
        <div className="mt-4 truncate rounded-xl border border-white/10 bg-white/[.035] px-3 py-2 text-xs text-slate-400">
          <ShieldCheck className="mr-2 inline h-3.5 w-3.5" />{history[0].winnerMarket.title} · {history[0].status.replaceAll("_", " ")}
        </div>
      )}
      <div aria-live="polite" className="mt-3 min-h-4 text-[11px]">
        {error ? <span className="text-rose-300">{error}</span> :
          notice ? <span className="text-emerald-300">{notice}</span> :
          <span className="inline-flex items-center gap-1.5 text-slate-500">
            <Coins className="h-3 w-3" />{previewOnly
              ? "PREVIEW ONLY · NO WOLO MOVED · NO BET PLACED"
              : "FUNDED MODE CONFIGURED · MATCH AND WALLET MANDATE REQUIRED"}
          </span>}
      </div>
    </section>
  );
}
