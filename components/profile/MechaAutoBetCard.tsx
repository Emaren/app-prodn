"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, Coins, Crosshair, LockKeyhole, Radar, Settings2, ShieldCheck, X } from "lucide-react";

type DS = "none" | "yes" | "no";
type Preset = { enabled: boolean; winnerStakeWolo: number; desyncSide: DS; desyncStakeWolo: number; untilOut: boolean; gamesRemaining: number | null; version: number };
type Payload = {
  preset: Preset;
  effectiveEnabled: boolean;
  limits: { maxEstimatedReserveWolo: number; maxGames: number };
  runtime: { previewOnly: boolean; executionReady: boolean };
  readiness: { identityReady: boolean; watcherKeyReady: boolean; durableMarketEvaluatorReady: boolean };
  detail?: string;
};
type Execution = { id: number; status: string; winnerMarket: { title: string } };
const MAX_AUTO_GAME_WOLO = 1_000;
const number = (raw: string) => /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : NaN;

/** E2 presentation operates exclusively on existing *shadow-only* user endpoints. */
export default function MechaAutoBetCard({ displayName }: { displayName: string }) {
  const [server, setServer] = useState<Payload | null>(null);
  const [history, setHistory] = useState<Execution[]>([]);
  const [winner, setWinner] = useState("10");
  const [dsSide, setDsSide] = useState<DS>("none");
  const [dsStake, setDsStake] = useState("0");
  const [games, setGames] = useState("1");
  const [untilOut, setUntilOut] = useState(false);
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

  const stake = number(winner);
  const ds = dsSide === "none" ? 0 : number(dsStake);
  const perGame = stake + ds;
  const count = number(games);
  const planLimit = server?.limits.maxEstimatedReserveWolo ?? 10_000;
  const plan = untilOut ? planLimit : perGame * count;
  const valid = Number.isSafeInteger(stake) && stake >= 1 &&
    Number.isSafeInteger(ds) && ds >= (dsSide === "none" ? 0 : 1) &&
    Number.isSafeInteger(perGame) && perGame <= MAX_AUTO_GAME_WOLO &&
    (untilOut || (Number.isSafeInteger(count) && count >= 1 && count <= (server?.limits.maxGames ?? 10_000))) &&
    Number.isSafeInteger(plan) && plan <= planLimit;
  const armed = Boolean(server?.effectiveEnabled && server.preset.enabled);
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
      setNotice(nextEnabled ? "Preview armed" : "Preview paused");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Command rejected");
    } finally { setSaving(false); }
  }, [server, valid, saving, stake, dsSide, ds, untilOut, count, hydrate]);

  const status = !server ? "UNLINKED" : !armed ? "STANDBY" :
    !readiness ? "WAITING FOR WATCHER" : previewOnly ? "SHADOW READY" : "FUNDED READY";
  const mecha = "Mecha " + (displayName.trim().slice(0, 38) || "Warrior");
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
            <div className="text-[9px] font-black uppercase tracking-[.24em] text-amber-200/75">MECHA // NEXT MATCH</div>
            <h2 className="truncate font-serif text-2xl font-bold text-white sm:text-3xl">{mecha}</h2>
          </div>
        </div>
        <button
          type="button" role="switch" aria-checked={armed} aria-label="Enable or pause Mecha preview"
          onClick={() => void save(!Boolean(server?.preset.enabled))}
          disabled={loading || saving || !server || !valid || dirty}
          className={"relative h-12 w-[5.5rem] shrink-0 rounded-full border p-1 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300 disabled:opacity-40 " +
            (armed ? "border-amber-200/60 bg-amber-300/20" : "border-white/15 bg-white/[.05]")}
        >
          <span className={"absolute top-1/2 -translate-y-1/2 text-[9px] font-black " + (armed ? "left-2 text-amber-200" : "right-2 text-slate-400")}>{armed ? "ON" : "OFF"}</span>
          <span className={"block h-10 w-10 rounded-full shadow-lg transition-transform " + (armed ? "translate-x-10 bg-amber-300" : "bg-slate-400")} />
        </button>
      </header>
      <div className="mt-6 flex items-end justify-between gap-3 border-b border-white/10 pb-5">
        <div>
          <div className="text-[9px] font-black uppercase tracking-[.25em] text-slate-400">NEXT GAME</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-5xl font-black tracking-tight tabular-nums sm:text-6xl">{Number.isSafeInteger(stake) ? stake.toLocaleString() : "—"}</span>
            <span className="text-xs font-black tracking-[.14em] text-amber-200">WOLO</span>
          </div>
        </div>
        <button type="button" aria-expanded={settings} aria-label="Configure stake and future games"
          onClick={() => setSettings((x) => !x)}
          className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/[.05] px-3 py-3 text-[11px] font-black text-slate-200 hover:border-amber-200/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300">
          <Settings2 className="h-4 w-4" /><span className="hidden sm:inline">LOADOUT</span><ChevronDown className="h-3 w-3" />
        </button>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[10px] font-black uppercase tracking-[.17em]">
        <div className="inline-flex items-center gap-2 text-amber-100">
          <span className={"h-2.5 w-2.5 rounded-full " + (armed && readiness ? "bg-emerald-300 motion-safe:animate-pulse" : "bg-amber-300/60")} />
          {status}
        </div>
        <div className="text-slate-400">{untilOut ? "UNTIL OUT" : (Number.isFinite(count) ? count : "—") + " GAMES"} · {previewOnly ? "SHADOW" : "FUNDED"}</div>
      </div>
      <div className="mt-5 grid grid-cols-[1fr_auto] gap-3">
        <div className="flex min-w-0 items-center gap-2 rounded-xl border border-white/10 bg-black/25 px-3 py-3">
          <LockKeyhole className="h-4 w-4 shrink-0 text-amber-200" />
          <span className="truncate text-[10px] font-black uppercase tracking-[.13em] text-slate-300">WAR SATCHEL</span>
          <span className="ml-auto shrink-0 text-xs font-bold">0 LOCKED</span>
        </div>
        <button type="button" aria-expanded={dsPanel} aria-label="Desync options"
          onClick={() => { setDsPanel((x) => !x); setSettings(true); }}
          className={"rounded-xl border px-4 text-xs font-black tracking-[.14em] " +
            (dsSelected ? "border-sky-300/40 bg-sky-200/15 text-sky-200" : "border-white/15 bg-white/[.05] text-slate-300 hover:bg-white/10")}>
          DS
        </button>
      </div>
      {settings && (
        <div className="mt-4 rounded-2xl border border-amber-200/20 bg-black/45 p-4 sm:p-5">
          <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-[.2em] text-amber-200">
            LOADOUT
            <button type="button" aria-label="Close loadout" onClick={() => setSettings(false)} className="rounded-lg p-1 text-slate-400 hover:text-white"><X className="h-4 w-4" /></button>
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
          ) : <button type="button" onClick={() => setDsPanel(true)} className="mt-4 text-[10px] font-black uppercase tracking-[.12em] text-sky-200">D-SYNC OPTIONS ↗</button>}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <span className={"text-xs " + (valid ? "text-slate-400" : "text-rose-300")}>
              {valid ? perGame.toLocaleString() + " / 1,000 MATCH · " + plan.toLocaleString() + " / " + planLimit.toLocaleString() + " PLAN" :
                "1–1,000 WOLO PER MATCH · 10,000 PLAN MAX"}
            </span>
            <button type="button" onClick={() => void save(Boolean(server?.preset.enabled))} disabled={!valid || !server || saving}
              className="rounded-xl bg-amber-300 px-5 py-3 text-[10px] font-black uppercase tracking-[.15em] text-slate-950 hover:bg-amber-200 disabled:opacity-40">
              {saving ? "SAVING..." : "LOAD PREVIEW"}
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
            <Coins className="h-3 w-3" />{previewOnly ? "PREVIEW ONLY · NO WOLO MOVED · NO BET PLACED" : "FUNDED CUSTODY VERIFIED"}
          </span>}
      </div>
    </section>
  );
}
