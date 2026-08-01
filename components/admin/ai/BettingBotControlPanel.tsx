"use client";

import { useEffect, useMemo, useState } from "react";

type Mode = "disabled" | "shadow" | "live";

type Runtime = {
  configuredMode: Mode;
  serverMode: Mode;
  effectiveMode: Mode;
  previewOnly: true;
  canPropose: boolean;
  canExecuteMoney: false;
  custodyAdvertised: boolean;
  custodyVerified: boolean;
  executorImplemented: false;
  code: string;
  detail: string;
};

type BettingBot = {
  id: number;
  slug: string;
  reservedUid: string;
  displayName: string;
  avatarUrl: string | null;
  mode: Mode;
  commentaryEnabled: boolean;
  commentaryPrompt: string;
  oppositeOnly: true;
  defaultCounterstakeWolo: number;
  maxCounterstakeWolo: number;
  perMarketExposureWolo: number;
  dailyExposureWolo: number;
  balanceFloorWolo: number;
  policyId: string;
  policyVersion: number;
  version: number;
  createdAt: string;
  updatedAt: string;
  runtime: Runtime;
  commentaryPromptPreview: string;
};

type Snapshot = {
  generatedAt: string;
  policy: {
    oppositeOnly: true;
    perActionHardCapWolo: number;
    llmAuthority: "flavour_only";
    executionInstalled: false;
  };
  limits: {
    perActionHardCapWolo: number;
    maxPerMarketExposureWolo: number;
    maxDailyExposureWolo: number;
    maxBalanceFloorWolo: number;
  };
  bots: BettingBot[];
  recentActions: Array<{
    id: number;
    botConfigId: number;
    botSlugSnapshot: string;
    eventType: string;
    configuredModeSnapshot: string;
    effectiveModeSnapshot: string;
    proposedCounterstakeWolo: number | null;
    committedCounterstakeWolo: number | null;
    reasonCode: string;
    reasonDetail: string | null;
    custodyVerified: boolean;
    stakeTxHash: string | null;
    actorUid: string | null;
    createdAt: string;
  }>;
};

const MODE_STYLES: Record<Mode, string> = {
  disabled: "border-slate-500/25 bg-slate-800/70 text-slate-300",
  shadow: "border-amber-200/25 bg-amber-300/10 text-amber-100",
  live: "border-rose-200/25 bg-rose-300/10 text-rose-100",
};

function modeLabel(mode: Mode) {
  return mode === "disabled" ? "Disabled" : mode === "shadow" ? "Shadow" : "Live";
}

function shortDate(value: string) {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleString() : value;
}

export default function BettingBotControlPanel() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState<BettingBot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    const response = await fetch("/api/admin/betting-bots", { cache: "no-store" });
    const payload = (await response.json().catch(() => ({}))) as Snapshot & {
      detail?: string;
    };
    if (!response.ok) {
      throw new Error(payload.detail || "Could not load counter-bettors.");
    }
    setSnapshot(payload);
    setSelectedId((current) =>
      payload.bots.some((bot) => bot.id === current)
        ? current
        : payload.bots[0]?.id ?? null
    );
  }

  useEffect(() => {
    void load().catch((loadError) =>
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load counter-bettors."
      )
    );
  }, []);

  const selected = useMemo(
    () => snapshot?.bots.find((bot) => bot.id === selectedId) ?? null,
    [selectedId, snapshot]
  );

  useEffect(() => {
    setDraft(selected ? { ...selected } : null);
  }, [selected]);

  const dirty = useMemo(() => {
    if (!draft || !selected) return false;
    const keys = [
      "displayName",
      "avatarUrl",
      "mode",
      "commentaryEnabled",
      "commentaryPrompt",
      "defaultCounterstakeWolo",
      "maxCounterstakeWolo",
      "perMarketExposureWolo",
      "dailyExposureWolo",
      "balanceFloorWolo",
    ] as const;
    return keys.some((key) => draft[key] !== selected[key]);
  }, [draft, selected]);

  async function save() {
    if (!draft) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/betting-bots", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: draft.id,
          expectedVersion: draft.version,
          requestId: crypto.randomUUID(),
          displayName: draft.displayName,
          avatarUrl: draft.avatarUrl,
          mode: draft.mode,
          commentaryEnabled: draft.commentaryEnabled,
          commentaryPrompt: draft.commentaryPrompt,
          oppositeOnly: true,
          defaultCounterstakeWolo: draft.defaultCounterstakeWolo,
          maxCounterstakeWolo: draft.maxCounterstakeWolo,
          perMarketExposureWolo: draft.perMarketExposureWolo,
          dailyExposureWolo: draft.dailyExposureWolo,
          balanceFloorWolo: draft.balanceFloorWolo,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        detail?: string;
        duplicate?: boolean;
      };
      if (!response.ok) {
        throw new Error(payload.detail || "Could not save counter-bettor.");
      }
      await load();
      setNotice(
        payload.duplicate
          ? "That save was already recorded; no policy was applied twice."
          : `${draft.displayName} saved. No wager or signer was invoked.`
      );
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Could not save counter-bettor."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mx-auto max-w-7xl space-y-6 pb-12 text-white">
      <div className="rounded-[2rem] border border-amber-200/15 bg-[radial-gradient(circle_at_85%_0%,rgba(251,191,36,0.12),transparent_34%),linear-gradient(145deg,#100e0a,#07090f)] p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.35em] text-amber-100/55">Counter-Action Lab</div>
            <h2 className="mt-3 font-serif text-3xl">Tony &amp; Paulie</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">Deterministic, opposite-side counter-bettor policy with a hard 10 WOLO ceiling per action. Both identities ship disabled. This release can preview policy only; it cannot reserve funds, sign, or create wagers.</p>
          </div>
          <div className="rounded-2xl border border-rose-200/20 bg-rose-300/8 px-4 py-3 text-right">
            <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-rose-100/60">Money authority</div>
            <div className="mt-1 text-sm font-semibold text-rose-100">No executor installed</div>
          </div>
        </div>
        <div className="mt-5 rounded-2xl border border-cyan-200/12 bg-cyan-300/[0.035] p-4 text-sm leading-6 text-cyan-50/85"><strong>LLM boundary:</strong> a future model may write one flavour line only after deterministic policy. It cannot choose the market, side, amount, exposure, custody operation, transaction, or wager.</div>
      </div>

      {error ? <div className="rounded-2xl border border-rose-300/25 bg-rose-500/10 p-4 text-rose-100">{error}</div> : null}
      {notice ? <div className="rounded-2xl border border-emerald-300/20 bg-emerald-500/10 p-4 text-emerald-100">{notice}</div> : null}

      <div className="grid gap-6 lg:grid-cols-[19rem_minmax(0,1fr)]">
        <aside className="space-y-3 rounded-[1.6rem] border border-white/10 bg-slate-950/70 p-4">
          {(snapshot?.bots ?? []).map((bot) => (
            <button key={bot.id} type="button" onClick={() => setSelectedId(bot.id)} className={`w-full rounded-2xl border p-4 text-left transition ${selectedId === bot.id ? "border-amber-200/30 bg-amber-300/10" : "border-white/8 bg-white/[0.03] hover:bg-white/[0.06]"}`}>
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-slate-800 font-serif text-lg text-amber-100">{bot.displayName.slice(0, 1).toUpperCase()}</span>
                <span className="min-w-0 flex-1"><span className="block font-semibold">{bot.displayName}</span><span className="block truncate text-xs text-slate-500">{bot.reservedUid}</span></span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2"><ModeBadge label={`Config ${modeLabel(bot.mode)}`} mode={bot.mode} /><ModeBadge label={`Effective ${modeLabel(bot.runtime.effectiveMode)}`} mode={bot.runtime.effectiveMode} /></div>
            </button>
          ))}
        </aside>

        {draft ? (
          <div className="space-y-6 rounded-[1.6rem] border border-white/10 bg-slate-950/70 p-5 sm:p-7">
            <div className="grid gap-3 sm:grid-cols-3">
              <Readiness label="Configured" mode={draft.mode} />
              <Readiness label="Server ceiling" mode={draft.runtime.serverMode} />
              <Readiness label="Effective" mode={draft.runtime.effectiveMode} />
            </div>
            {dirty ? <div className="text-xs text-amber-100/70">Server ceiling and effective readiness reflect the last saved configuration. Save to recompute them.</div> : null}
            <div className={`rounded-2xl border p-4 text-sm leading-6 ${draft.runtime.effectiveMode === "shadow" ? "border-amber-200/20 bg-amber-300/8 text-amber-50" : "border-slate-500/20 bg-slate-800/45 text-slate-300"}`}><div className="font-mono text-[11px] uppercase tracking-[0.15em] opacity-60">{draft.runtime.code}</div><div className="mt-1">{draft.runtime.detail}</div></div>

            <div className="grid gap-4 sm:grid-cols-2">
              <TextInput label="Display name" value={draft.displayName} onChange={(displayName) => setDraft({ ...draft, displayName })} />
              <TextInput label="Avatar URL (optional; neutral placeholder otherwise)" value={draft.avatarUrl || ""} onChange={(avatarUrl) => setDraft({ ...draft, avatarUrl: avatarUrl || null })} />
              <TextInput label="Reserved system UID" value={draft.reservedUid} disabled onChange={() => {}} />
              <SelectInput label="Requested readiness" value={draft.mode} onChange={(mode) => setDraft({ ...draft, mode })} />
            </div>

            <div className="rounded-2xl border border-white/8 bg-white/[0.025] p-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-500">Immutable policy rail</div>
              <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3"><PolicyFact label="Side rule" value="Opposite only" /><PolicyFact label="Hard action cap" value={`${snapshot?.policy.perActionHardCapWolo ?? 10} WOLO`} /><PolicyFact label="Policy" value={`${draft.policyId} v${draft.policyVersion}`} /></div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <NumberInput label="Default counter" value={draft.defaultCounterstakeWolo} min={1} max={10} onChange={(defaultCounterstakeWolo) => setDraft({ ...draft, defaultCounterstakeWolo })} />
              <NumberInput label="Max per action" value={draft.maxCounterstakeWolo} min={1} max={10} onChange={(maxCounterstakeWolo) => setDraft({ ...draft, maxCounterstakeWolo })} />
              <NumberInput label="Per-market exposure" value={draft.perMarketExposureWolo} min={1} max={snapshot?.limits.maxPerMarketExposureWolo ?? 10000} onChange={(perMarketExposureWolo) => setDraft({ ...draft, perMarketExposureWolo })} />
              <NumberInput label="Daily exposure" value={draft.dailyExposureWolo} min={1} max={snapshot?.limits.maxDailyExposureWolo ?? 100000} onChange={(dailyExposureWolo) => setDraft({ ...draft, dailyExposureWolo })} />
              <NumberInput label="Balance floor" value={draft.balanceFloorWolo} min={0} max={snapshot?.limits.maxBalanceFloorWolo ?? 100000000} onChange={(balanceFloorWolo) => setDraft({ ...draft, balanceFloorWolo })} />
            </div>

            <div className="space-y-3 rounded-2xl border border-violet-200/12 bg-violet-300/[0.025] p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold text-violet-50">Commentary flavour, staged only</h3><p className="mt-1 text-xs leading-5 text-slate-400">No model call is wired in this pass. Even when enabled later, this prompt can shape words only.</p></div><button type="button" aria-pressed={draft.commentaryEnabled} onClick={() => setDraft({ ...draft, commentaryEnabled: !draft.commentaryEnabled })} className={`rounded-full border px-4 py-2 text-xs font-semibold ${draft.commentaryEnabled ? "border-violet-200/25 bg-violet-300/12 text-violet-50" : "border-white/10 bg-white/[0.03] text-slate-400"}`}>Commentary: {draft.commentaryEnabled ? "Staged" : "Off"}</button></div>
              <label className="block space-y-2 text-sm text-slate-300"><span>Site-side commentary prompt</span><textarea value={draft.commentaryPrompt} rows={5} onChange={(event) => setDraft({ ...draft, commentaryPrompt: event.target.value })} className="w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-white outline-none focus:border-violet-200/35" /></label>
              <div><div className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-500">Saved effective commentary boundary</div><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-xl border border-white/8 bg-black/35 p-4 font-mono text-[11px] leading-5 text-slate-300">{draft.commentaryPromptPreview}</pre></div>
            </div>

            <div className="flex flex-wrap items-center gap-3"><button type="button" onClick={() => void save()} disabled={saving || !dirty} className="rounded-full bg-amber-300 px-6 py-3 text-sm font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-45">{saving ? "Saving…" : "Save Counter-Bettor"}</button>{dirty ? <span className="text-xs text-amber-100/70">Unsaved policy changes</span> : <span className="text-xs text-slate-500">Saved configuration</span>}</div>
          </div>
        ) : <div className="rounded-[1.6rem] border border-white/10 bg-slate-950/70 p-8 text-slate-400">Loading counter-bettors…</div>}
      </div>

      <div className="rounded-[1.6rem] border border-white/10 bg-slate-950/70 p-5 sm:p-7">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><h3 className="text-xl font-semibold">Append-only counter-action audit</h3><p className="mt-1 text-xs leading-5 text-slate-500">Config saves and future deterministic decisions append evidence. Existing rows cannot be edited, deleted, or truncated.</p></div><span className="text-xs text-slate-500">{snapshot?.recentActions.length ?? 0} recent</span></div>
        <div className="mt-4 space-y-2">{snapshot?.recentActions.length ? snapshot.recentActions.map((action) => <div key={action.id} className="grid gap-2 rounded-xl border border-white/8 bg-white/[0.025] px-4 py-3 text-xs sm:grid-cols-[6rem_8rem_9rem_1fr_auto]"><span className="font-semibold text-amber-100">{action.botSlugSnapshot}</span><span className="text-slate-400">{action.eventType}</span><span className="text-slate-400">{action.configuredModeSnapshot} → {action.effectiveModeSnapshot}</span><span className="text-slate-300">{action.reasonDetail || action.reasonCode}</span><span className="text-slate-500">{shortDate(action.createdAt)}</span></div>) : <div className="rounded-xl border border-white/8 bg-white/[0.025] p-4 text-sm text-slate-500">No counter-actions recorded. Tony and Paulie remain disabled.</div>}</div>
      </div>
    </section>
  );
}

function ModeBadge({ label, mode }: { label: string; mode: Mode }) { return <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${MODE_STYLES[mode]}`}>{label}</span>; }
function Readiness({ label, mode }: { label: string; mode: Mode }) { return <div className="rounded-2xl border border-white/8 bg-white/[0.025] p-4"><div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">{label}</div><div className="mt-2"><ModeBadge label={modeLabel(mode)} mode={mode} /></div></div>; }
function PolicyFact({ label, value }: { label: string; value: string }) { return <div><div className="text-xs text-slate-500">{label}</div><div className="mt-1 font-semibold text-slate-200">{value}</div></div>; }
function TextInput({ label, value, onChange, disabled = false }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean }) { return <label className="space-y-2 text-sm text-slate-300"><span>{label}</span><input value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className="w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-white outline-none focus:border-amber-200/35 disabled:opacity-50" /></label>; }
function SelectInput({ label, value, onChange }: { label: string; value: Mode; onChange: (value: Mode) => void }) { return <label className="space-y-2 text-sm text-slate-300"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value as Mode)} className="w-full rounded-xl border border-white/10 bg-[#0b0d12] px-4 py-3 text-white outline-none focus:border-amber-200/35"><option value="disabled">Disabled</option><option value="shadow">Shadow preview</option><option value="live">Live requested, fail closed</option></select></label>; }
function NumberInput({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) { return <label className="space-y-2 text-sm text-slate-300"><span>{label}</span><input type="number" value={value} min={min} max={max} step={1} onChange={(event) => onChange(Number(event.target.value))} className="w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-white outline-none focus:border-amber-200/35" /></label>; }
