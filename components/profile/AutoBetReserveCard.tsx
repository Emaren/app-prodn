"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CircleGauge,
  Coins,
  Eye,
  Pause,
  Play,
  RefreshCw,
  ShieldCheck,
  Swords,
} from "lucide-react";

type DesyncSide = "none" | "no" | "yes";

type AutomationPayload = {
  runtime: {
    configuredMode: "disabled" | "shadow" | "live";
    mode: "disabled" | "shadow" | "live";
    previewOnly: boolean;
    executionReady: boolean;
    custodyCapabilityPresent: boolean;
    code: string;
    detail: string;
  };
  limits: {
    maxEstimatedReserveWolo: number;
    maxGames: number;
    selfOnly: true;
  };
  readiness: {
    presetStored: boolean;
    identityReady: boolean;
    watcherKeyReady: boolean;
    durableMarketEvaluatorReady: boolean;
    executionReady: boolean;
    detail: string;
  };
  preset: {
    id: number | null;
    enabled: boolean;
    winnerStakeWolo: number;
    desyncSide: DesyncSide;
    desyncStakeWolo: number;
    untilOut: boolean;
    gamesRemaining: number | null;
    selfOnly: true;
    estimatedReserveWolo: number;
    version: number;
    pausedReason: string | null;
    createdAt: string | null;
    updatedAt: string | null;
  };
  effectiveEnabled: boolean;
};

type AutomationExecution = {
  id: number;
  gameIdentityKey: string;
  selectedSide: "left" | "right" | null;
  winnerStakeWolo: number;
  desyncSide: DesyncSide;
  desyncStakeWolo: number;
  status: string;
  reason: string | null;
  createdAt: string;
  winnerMarket: {
    id: number;
    title: string;
    eventLabel: string;
    leftLabel: string;
    rightLabel: string;
  };
};

const FALLBACK_MAX_RESERVE_WOLO = 10_000;

function readWholeNumber(value: string) {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return Number.NaN;
  return Number.parseInt(trimmed, 10);
}

function statusTone(ready: boolean) {
  return ready
    ? "border-emerald-200/20 bg-emerald-300/[0.08] text-emerald-100"
    : "border-white/10 bg-white/[0.045] text-slate-400";
}

export default function AutoBetReserveCard() {
  const [payload, setPayload] = useState<AutomationPayload | null>(null);
  const [executions, setExecutions] = useState<AutomationExecution[]>([]);
  const [winnerStakeDraft, setWinnerStakeDraft] = useState("10");
  const [desyncSide, setDesyncSide] = useState<DesyncSide>("none");
  const [desyncStakeDraft, setDesyncStakeDraft] = useState("0");
  const [untilOut, setUntilOut] = useState(false);
  const [gamesDraft, setGamesDraft] = useState("1");
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const applyPayload = useCallback((next: AutomationPayload) => {
    setPayload(next);
    setWinnerStakeDraft(String(next.preset.winnerStakeWolo));
    setDesyncSide(next.preset.desyncSide);
    setDesyncStakeDraft(String(next.preset.desyncStakeWolo));
    setUntilOut(next.preset.untilOut);
    setGamesDraft(String(next.preset.gamesRemaining ?? 1));
    setEnabled(next.preset.enabled);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [settingsResponse, executionsResponse] = await Promise.all([
        fetch("/api/user/bet-automation", { cache: "no-store" }),
        fetch("/api/user/bet-automation/executions", { cache: "no-store" }),
      ]);

      const settings = (await settingsResponse.json().catch(() => null)) as
        | (AutomationPayload & { detail?: string })
        | null;
      if (!settingsResponse.ok || !settings) {
        throw new Error(settings?.detail || "Auto-bet preview could not be loaded.");
      }
      applyPayload(settings);

      if (executionsResponse.ok) {
        const history = (await executionsResponse.json().catch(() => null)) as {
          rows?: AutomationExecution[];
        } | null;
        setExecutions(Array.isArray(history?.rows) ? history.rows : []);
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Auto-bet preview could not be loaded."
      );
    } finally {
      setLoading(false);
    }
  }, [applyPayload]);

  useEffect(() => {
    void load();
  }, [load]);

  const winnerStakeWolo = readWholeNumber(winnerStakeDraft);
  const desyncStakeWolo =
    desyncSide === "none" ? 0 : readWholeNumber(desyncStakeDraft);
  const gamesRemaining = readWholeNumber(gamesDraft);
  const perGameWolo =
    (Number.isFinite(winnerStakeWolo) ? winnerStakeWolo : 0) +
    (Number.isFinite(desyncStakeWolo) ? desyncStakeWolo : 0);
  const maxReserveWolo =
    payload?.limits.maxEstimatedReserveWolo ?? FALLBACK_MAX_RESERVE_WOLO;
  const estimatedPlanWolo = untilOut
    ? maxReserveWolo
    : perGameWolo * (Number.isFinite(gamesRemaining) ? gamesRemaining : 0);
  const planOverLimit = estimatedPlanWolo > maxReserveWolo;

  const planSummary = useMemo(() => {
    const winner = `${Number.isFinite(winnerStakeWolo) ? winnerStakeWolo : "—"} WOLO on your team`;
    const desync =
      desyncSide === "none"
        ? "no desync leg"
        : `${Number.isFinite(desyncStakeWolo) ? desyncStakeWolo : "—"} WOLO on Desync ${desyncSide.toUpperCase()}`;
    const games = untilOut
      ? "until the future funded balance runs out"
      : `${Number.isFinite(gamesRemaining) ? gamesRemaining : "—"} game${gamesRemaining === 1 ? "" : "s"}`;
    return `${winner} · ${desync} · ${games}`;
  }, [desyncSide, desyncStakeWolo, gamesRemaining, untilOut, winnerStakeWolo]);

  const save = useCallback(
    async (nextEnabled = enabled) => {
      setSaving(true);
      setError("");
      setNotice("");
      try {
        const response = await fetch("/api/user/bet-automation", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            enabled: nextEnabled,
            winnerStakeWolo: readWholeNumber(winnerStakeDraft),
            desyncSide,
            desyncStakeWolo:
              desyncSide === "none" ? 0 : readWholeNumber(desyncStakeDraft),
            untilOut,
            gamesRemaining: untilOut ? null : readWholeNumber(gamesDraft),
            selfOnly: true,
            expectedVersion: payload?.preset.version ?? 0,
          }),
        });
        const next = (await response.json().catch(() => null)) as
          | (AutomationPayload & { detail?: string })
          | null;
        if (!response.ok || !next) {
          throw new Error(next?.detail || "Auto-bet preview could not be saved.");
        }

        applyPayload(next);
        setNotice(
          nextEnabled
            ? "Preview plan enabled. It stores rules only; no WOLO moved and no wager was placed."
            : "Preview plan paused."
        );
      } catch (saveError) {
        setError(
          saveError instanceof Error
            ? saveError.message
            : "Auto-bet preview could not be saved."
        );
      } finally {
        setSaving(false);
      }
    }, [
      applyPayload,
      desyncSide,
      desyncStakeDraft,
      enabled,
      gamesDraft,
      payload?.preset.version,
      untilOut,
      winnerStakeDraft,
    ]
  );

  const chooseDesync = (next: DesyncSide) => {
    setDesyncSide(next);
    if (next === "none") {
      setDesyncStakeDraft("0");
    } else if (readWholeNumber(desyncStakeDraft) < 1) {
      setDesyncStakeDraft("2");
    }
  };

  return (
    <section
      aria-labelledby="auto-bet-reserve-title"
      className="relative isolate overflow-hidden rounded-[2.45rem] border border-amber-100/16 bg-slate-950/82 p-5 text-white shadow-[0_34px_120px_rgba(0,0,0,0.38)] sm:p-7 lg:p-8"
    >
      <div className="absolute inset-0 -z-20 bg-[radial-gradient(circle_at_0%_0%,rgba(251,191,36,0.16),transparent_34%),radial-gradient(circle_at_100%_8%,rgba(14,165,233,0.14),transparent_31%),linear-gradient(145deg,rgba(13,18,30,0.98),rgba(3,8,18,0.99))]" />
      <div className="absolute inset-x-16 top-0 -z-10 h-px bg-gradient-to-r from-transparent via-amber-100/60 to-transparent" />

      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="max-w-3xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.34em] text-amber-100/68">
              <Swords className="h-4 w-4" />
              Next-game command
            </span>
            <span className="rounded-full border border-sky-200/18 bg-sky-300/[0.08] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-sky-100">
              Preview only
            </span>
          </div>
          <h2
            id="auto-bet-reserve-title"
            className="mt-3 font-serif text-3xl text-white sm:text-4xl"
          >
            Auto Bet Reserve
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
            Draft a self-bet for the next game detected through your Watcher. Your team is
            selected from verified replay identity; player order never decides the side.
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/24 px-4 py-3 text-right">
          <div className="text-[9px] font-black uppercase tracking-[0.24em] text-slate-500">
            Held right now
          </div>
          <div className="mt-1 text-2xl font-black text-white">0 WOLO</div>
          <div className="mt-1 text-[11px] text-slate-500">No funding control is active</div>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-amber-200/18 bg-amber-300/[0.065] px-4 py-3 text-sm leading-6 text-amber-50">
        <strong>No WOLO moves and no wager is placed in Preview mode.</strong>{" "}
        This card saves rules only. Deposit and signing controls stay hidden until the Wolo
        custody service and durable app worker are verified together.
      </div>

      {loading ? (
        <div className="mt-6 flex min-h-48 items-center justify-center rounded-[1.8rem] border border-white/8 bg-black/20 text-sm text-slate-400">
          <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
          Loading preview plan…
        </div>
      ) : (
        <div className="mt-6 grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(20rem,0.8fr)]">
          <div className="min-w-0 rounded-[1.8rem] border border-white/9 bg-black/22 p-4 sm:p-5">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">
                  Your-team stake
                </span>
                <div className="mt-2 flex items-center rounded-2xl border border-white/10 bg-slate-950/74 focus-within:border-amber-200/40">
                  <input
                    aria-label="Winner stake in WOLO"
                    inputMode="numeric"
                    value={winnerStakeDraft}
                    onChange={(event) => setWinnerStakeDraft(event.target.value)}
                    className="min-w-0 flex-1 bg-transparent px-4 py-3 text-lg font-bold text-white outline-none"
                  />
                  <span className="border-l border-white/8 px-4 py-3 text-xs font-bold text-amber-100">
                    WOLO
                  </span>
                </div>
              </label>

              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">
                  Desync leg
                </div>
                <div className="mt-2 grid grid-cols-3 gap-1 rounded-2xl border border-white/10 bg-slate-950/74 p-1">
                  {(["none", "no", "yes"] as const).map((side) => (
                    <button
                      key={side}
                      type="button"
                      onClick={() => chooseDesync(side)}
                      className={`rounded-xl px-3 py-2.5 text-xs font-black uppercase tracking-[0.12em] transition ${
                        desyncSide === side
                          ? side === "none"
                            ? "bg-white/12 text-white"
                            : "bg-sky-300 text-slate-950"
                          : "text-slate-500 hover:bg-white/[0.05] hover:text-slate-200"
                      }`}
                    >
                      {side}
                    </button>
                  ))}
                </div>
              </div>

              <label className={`block ${desyncSide === "none" ? "opacity-45" : ""}`}>
                <span className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">
                  Desync stake
                </span>
                <div className="mt-2 flex items-center rounded-2xl border border-white/10 bg-slate-950/74 focus-within:border-sky-200/40">
                  <input
                    aria-label="Desync stake in WOLO"
                    inputMode="numeric"
                    disabled={desyncSide === "none"}
                    value={desyncStakeDraft}
                    onChange={(event) => setDesyncStakeDraft(event.target.value)}
                    className="min-w-0 flex-1 bg-transparent px-4 py-3 text-lg font-bold text-white outline-none disabled:cursor-not-allowed"
                  />
                  <span className="border-l border-white/8 px-4 py-3 text-xs font-bold text-sky-100">
                    WOLO
                  </span>
                </div>
              </label>

              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">
                  Run length
                </div>
                <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                  <input
                    aria-label="Number of games"
                    inputMode="numeric"
                    disabled={untilOut}
                    value={gamesDraft}
                    onChange={(event) => setGamesDraft(event.target.value)}
                    className="min-w-0 rounded-2xl border border-white/10 bg-slate-950/74 px-4 py-3 text-lg font-bold text-white outline-none transition focus:border-amber-200/40 disabled:cursor-not-allowed disabled:opacity-45"
                  />
                  <button
                    type="button"
                    onClick={() => setUntilOut((current) => !current)}
                    className={`rounded-2xl border px-4 py-3 text-xs font-bold transition ${
                      untilOut
                        ? "border-amber-200/35 bg-amber-300/14 text-amber-100"
                        : "border-white/10 bg-white/[0.04] text-slate-400 hover:text-white"
                    }`}
                  >
                    Until Out
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/8 bg-white/[0.035] p-3">
                <div className="text-[9px] uppercase tracking-[0.22em] text-slate-600">
                  Per game
                </div>
                <div className="mt-1 text-lg font-bold text-white">{perGameWolo || "—"} WOLO</div>
              </div>
              <div
                className={`rounded-2xl border p-3 ${
                  planOverLimit
                    ? "border-red-300/24 bg-red-400/[0.08]"
                    : "border-white/8 bg-white/[0.035]"
                }`}
              >
                <div className="text-[9px] uppercase tracking-[0.22em] text-slate-600">
                  Plan envelope
                </div>
                <div className={`mt-1 text-lg font-bold ${planOverLimit ? "text-red-200" : "text-white"}`}>
                  {estimatedPlanWolo.toLocaleString()} WOLO
                </div>
              </div>
              <div className="rounded-2xl border border-white/8 bg-white/[0.035] p-3">
                <div className="text-[9px] uppercase tracking-[0.22em] text-slate-600">
                  Maximum
                </div>
                <div className="mt-1 text-lg font-bold text-amber-100">
                  {maxReserveWolo.toLocaleString()} WOLO
                </div>
              </div>
            </div>

            <p className="mt-4 text-xs leading-5 text-slate-500">{planSummary}</p>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void save(enabled)}
                disabled={saving || planOverLimit}
                className="rounded-full bg-amber-300 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save Preview"}
              </button>
              <button
                type="button"
                onClick={() => void save(!enabled)}
                disabled={saving || planOverLimit}
                className="inline-flex items-center gap-2 rounded-full border border-white/14 bg-white/[0.04] px-5 py-3 text-sm font-bold text-white transition hover:border-white/28 hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {enabled ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                {enabled ? "Pause Preview" : "Enable Preview"}
              </button>
            </div>

            {notice ? (
              <div className="mt-4 rounded-2xl border border-emerald-200/18 bg-emerald-300/[0.07] px-4 py-3 text-sm text-emerald-100">
                {notice}
              </div>
            ) : null}
            {error ? (
              <div className="mt-4 rounded-2xl border border-red-300/20 bg-red-400/[0.08] px-4 py-3 text-sm text-red-100">
                {error}
              </div>
            ) : null}
          </div>

          <aside className="min-w-0 space-y-4">
            <div className="rounded-[1.8rem] border border-sky-100/12 bg-sky-300/[0.045] p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.25em] text-sky-100/68">
                  <CircleGauge className="h-4 w-4" />
                  Readiness
                </div>
                <span className="rounded-full border border-white/10 bg-black/24 px-3 py-1 text-[9px] font-bold uppercase tracking-[0.15em] text-slate-300">
                  {payload?.runtime.mode ?? "shadow"}
                </span>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                <div className={`rounded-xl border px-3 py-2 text-xs ${statusTone(Boolean(payload?.readiness.identityReady))}`}>
                  <ShieldCheck className="mr-2 inline h-3.5 w-3.5" />
                  Steam identity {payload?.readiness.identityReady ? "ready" : "needed"}
                </div>
                <div className={`rounded-xl border px-3 py-2 text-xs ${statusTone(Boolean(payload?.readiness.watcherKeyReady))}`}>
                  <Eye className="mr-2 inline h-3.5 w-3.5" />
                  Watcher key {payload?.readiness.watcherKeyReady ? "ready" : "needed"}
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-white/8 bg-black/22 p-4">
                <div className="text-[9px] font-black uppercase tracking-[0.22em] text-slate-600">
                  Server rail
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-400">
                  {payload?.runtime.detail ||
                    "Preview mode stores your self-bet rules only. No WOLO moves and no wager is placed."}
                </p>
              </div>

              <div className="mt-3 flex items-center justify-between rounded-2xl border border-white/8 bg-black/22 px-4 py-3">
                <div>
                  <div className="text-[9px] uppercase tracking-[0.2em] text-slate-600">
                    Saved state
                  </div>
                  <div className="mt-1 text-sm font-bold text-white">
                    {enabled ? "Preview armed" : "Paused"}
                  </div>
                </div>
                <Coins className="h-5 w-5 text-amber-100/70" />
              </div>
            </div>

            <div className="rounded-[1.8rem] border border-white/9 bg-black/22 p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500">
                    Preview log
                  </div>
                  <h3 className="mt-1 text-lg font-bold text-white">Recent results</h3>
                </div>
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-400">
                  {executions.length}
                </span>
              </div>

              <div className="mt-4 space-y-2">
                {executions.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/12 bg-white/[0.025] px-4 py-4 text-xs leading-5 text-slate-400">
                    No market previews have been evaluated. Your rules are saved, but the durable
                    market worker is intentionally not connected yet.
                  </div>
                ) : (
                  executions.slice(0, 5).map((row) => (
                    <div key={row.id} className="rounded-2xl border border-white/8 bg-white/[0.035] p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-bold text-white">
                            {row.winnerMarket.title}
                          </div>
                          <div className="mt-1 text-[11px] text-slate-500">
                            {row.winnerStakeWolo} WOLO · {row.status}
                          </div>
                        </div>
                        <span className="rounded-full border border-white/10 px-2 py-1 text-[9px] uppercase tracking-[0.12em] text-slate-400">
                          {row.selectedSide || "none"}
                        </span>
                      </div>
                      {row.reason ? (
                        <div className="mt-2 text-[11px] leading-5 text-slate-400">{row.reason}</div>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}
