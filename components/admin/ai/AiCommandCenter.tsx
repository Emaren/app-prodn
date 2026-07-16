"use client";

import { useEffect, useMemo, useState } from "react";

type Agent = {
  id: number;
  slug: string;
  runtimePersonaId: string;
  name: string;
  avatarUrl: string | null;
  enabled: boolean;
  public: boolean;
  description: string;
  role: string;
  specialty: string;
  introduction: string;
  personalityPrompt: string;
  aoe2Prompt: string;
  knowledgeScopes: unknown;
  allowedTools: unknown;
  requestedModel: string;
  fallbackModel: string | null;
  temperature: number | null;
  maxContextChars: number;
  timeoutMs: number;
  maxCouncilTurns: number;
  createdAt: string;
  updatedAt: string;
  telemetry: {
    requests: number;
    succeeded: number;
    failed: number;
    successRateBps: number | null;
    medianMs: number | null;
    p95Ms: number | null;
    medianModelMs: number | null;
    medianFirstTokenMs: number | null;
  };
};

type Snapshot = {
  generatedAt: string;
  agents: Agent[];
  recentErrors: Array<{
    id: number;
    agentSlugSnapshot: string;
    source: string;
    status: string;
    requestedModel: string;
    totalMs: number;
    errorCode: string | null;
    createdAt: string;
  }>;
};

function listText(value: unknown) {
  return Array.isArray(value) ? value.map(String).join(", ") : "";
}

function formatDuration(value: number | null) {
  if (value === null) return "No sample";
  return value < 1000 ? `${value}ms` : `${(value / 1000).toFixed(1)}s`;
}

export default function AiCommandCenter() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Agent | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    const response = await fetch("/api/admin/ai-agents", { cache: "no-store" });
    const payload = (await response.json().catch(() => ({}))) as Snapshot & { detail?: string };
    if (!response.ok) throw new Error(payload.detail || "Could not load AI agents.");
    setSnapshot(payload);
    setSelectedId((current) => current ?? payload.agents[0]?.id ?? null);
  }

  useEffect(() => {
    void load().catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Could not load AI agents."));
  }, []);

  const selected = useMemo(
    () => snapshot?.agents.find((agent) => agent.id === selectedId) ?? null,
    [selectedId, snapshot]
  );

  useEffect(() => {
    setDraft(selected ? { ...selected } : null);
  }, [selected]);

  async function save() {
    if (!draft) return;
    setSaving(true);
    setNotice(null);
    setError(null);
    try {
      const response = await fetch("/api/admin/ai-agents", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...draft,
          knowledgeScopes: listText(draft.knowledgeScopes),
          allowedTools: listText(draft.allowedTools),
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { detail?: string };
      if (!response.ok) throw new Error(payload.detail || "Could not save agent.");
      setNotice(`${draft.name} saved.`);
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save agent.");
    } finally {
      setSaving(false);
    }
  }

  async function createAgent() {
    setSaving(true);
    setNotice(null);
    setError(null);
    try {
      const response = await fetch("/api/admin/ai-agents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "New Council Voice",
          slug: `council-voice-${Date.now()}`,
          runtimePersonaId: "scribe",
          enabled: false,
          public: false,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { detail?: string; agent?: { id: number } };
      if (!response.ok) throw new Error(payload.detail || "Could not create agent.");
      await load();
      if (payload.agent?.id) setSelectedId(payload.agent.id);
      setNotice("Staged a disabled private agent. Configure it before enabling it.");
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create agent.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto max-w-7xl space-y-6 py-8 text-white">
      <section className="rounded-[2rem] border border-cyan-200/14 bg-[radial-gradient(circle_at_15%_0%,rgba(34,211,238,0.13),transparent_34%),linear-gradient(145deg,#07111f,#050811)] p-7 sm:p-9">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.35em] text-cyan-100/60">Operator Control Plane</div>
            <h1 className="mt-3 font-serif text-4xl">AI Command Center</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">Tune the AoE2 expertise layer, stage new voices safely, and inspect real request latency. Provider credentials never appear here.</p>
          </div>
          <button onClick={() => void createAgent()} disabled={saving} className="rounded-full bg-cyan-200 px-5 py-3 text-sm font-bold text-slate-950 disabled:opacity-50">Stage New Agent</button>
        </div>
      </section>

      {error ? <div className="rounded-2xl border border-rose-300/25 bg-rose-500/10 p-4 text-rose-100">{error}</div> : null}
      {notice ? <div className="rounded-2xl border border-emerald-300/20 bg-emerald-500/10 p-4 text-emerald-100">{notice}</div> : null}

      <section className="grid gap-6 lg:grid-cols-[19rem_minmax(0,1fr)]">
        <aside className="space-y-3 rounded-[1.6rem] border border-white/10 bg-slate-950/70 p-4">
          {(snapshot?.agents ?? []).map((agent) => (
            <button key={agent.id} onClick={() => setSelectedId(agent.id)} className={`w-full rounded-2xl border p-4 text-left transition ${selectedId === agent.id ? "border-cyan-200/30 bg-cyan-300/10" : "border-white/8 bg-white/[0.03] hover:bg-white/[0.06]"}`}>
              <div className="flex items-center justify-between gap-3"><span className="font-semibold">{agent.name}</span><span className={`h-2.5 w-2.5 rounded-full ${agent.enabled ? "bg-emerald-300" : "bg-slate-600"}`} /></div>
              <div className="mt-1 text-xs text-slate-500">/{agent.slug} · {agent.runtimePersonaId}</div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-300"><span>{agent.telemetry.requests} requests</span><span>{formatDuration(agent.telemetry.medianMs)} median</span></div>
            </button>
          ))}
        </aside>

        {draft ? (
          <div className="space-y-5 rounded-[1.6rem] border border-white/10 bg-slate-950/70 p-5 sm:p-7">
            <div className="grid gap-4 sm:grid-cols-3">
              <Metric label="30d requests" value={String(draft.telemetry.requests)} />
              <Metric label="Median / p95" value={`${formatDuration(draft.telemetry.medianMs)} / ${formatDuration(draft.telemetry.p95Ms)}`} />
              <Metric label="Success" value={draft.telemetry.successRateBps === null ? "No sample" : `${(draft.telemetry.successRateBps / 100).toFixed(1)}%`} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name" value={draft.name} onChange={(name) => setDraft({ ...draft, name })} />
              <Field label="Slug" value={draft.slug} disabled onChange={() => {}} />
              <SelectField label="Runtime template" value={draft.runtimePersonaId} options={["scribe", "grimer", "guy"]} onChange={(runtimePersonaId) => setDraft({ ...draft, runtimePersonaId })} />
              <SelectField label="Model" value={draft.requestedModel} options={["Agent4.1Scribe", "Agent4.1Grimer", "Agent4.1Guy", "Agent4.1M", "LlamaAgent42"]} onChange={(requestedModel) => setDraft({ ...draft, requestedModel })} />
              <Field label="Role" value={draft.role} onChange={(role) => setDraft({ ...draft, role })} />
              <Field label="Specialty" value={draft.specialty} onChange={(specialty) => setDraft({ ...draft, specialty })} />
            </div>
            <TextField label="Public description" value={draft.description} onChange={(description) => setDraft({ ...draft, description })} />
            <TextField label="User-facing introduction" value={draft.introduction} onChange={(introduction) => setDraft({ ...draft, introduction })} />
            <TextField label="Personality layer" value={draft.personalityPrompt} rows={5} onChange={(personalityPrompt) => setDraft({ ...draft, personalityPrompt })} />
            <TextField label="AoE2 expertise layer" value={draft.aoe2Prompt} rows={8} onChange={(aoe2Prompt) => setDraft({ ...draft, aoe2Prompt })} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Knowledge scopes (comma separated)" value={listText(draft.knowledgeScopes)} onChange={(value) => setDraft({ ...draft, knowledgeScopes: value.split(",").map((part) => part.trim()).filter(Boolean) })} />
              <Field label="Allowed tools (comma separated)" value={listText(draft.allowedTools)} onChange={(value) => setDraft({ ...draft, allowedTools: value.split(",").map((part) => part.trim()).filter(Boolean) })} />
              <NumberField label="Context character cap" value={draft.maxContextChars} min={2000} max={100000} onChange={(maxContextChars) => setDraft({ ...draft, maxContextChars })} />
              <NumberField label="Timeout (ms)" value={draft.timeoutMs} min={5000} max={120000} onChange={(timeoutMs) => setDraft({ ...draft, timeoutMs })} />
            </div>
            <div className="flex flex-wrap gap-3">
              <Toggle label="Enabled" checked={draft.enabled} onChange={(enabled) => setDraft({ ...draft, enabled })} />
              <Toggle label="Public Council" checked={draft.public} onChange={(publicValue) => setDraft({ ...draft, public: publicValue })} />
            </div>
            <button onClick={() => void save()} disabled={saving} className="rounded-full bg-amber-300 px-6 py-3 text-sm font-bold text-slate-950 disabled:opacity-50">{saving ? "Saving…" : "Save Agent"}</button>
          </div>
        ) : <div className="rounded-[1.6rem] border border-white/10 bg-slate-950/70 p-8 text-slate-400">Loading agents…</div>}
      </section>

      <section className="rounded-[1.6rem] border border-white/10 bg-slate-950/70 p-5 sm:p-7">
        <h2 className="text-2xl font-semibold">Recent failures</h2>
        <div className="mt-4 space-y-2">
          {(snapshot?.recentErrors ?? []).length ? snapshot?.recentErrors.map((trace) => (
            <div key={trace.id} className="grid gap-2 rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm sm:grid-cols-[8rem_8rem_1fr_auto]">
              <span className="text-cyan-100">{trace.agentSlugSnapshot}</span><span className="text-slate-400">{trace.source}</span><span className="text-rose-100">{trace.errorCode || trace.status}</span><span className="text-slate-500">{formatDuration(trace.totalMs)}</span>
            </div>
          )) : <div className="text-sm text-slate-500">No recorded AI failures in the current telemetry window.</div>}
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4"><div className="text-[10px] uppercase tracking-[0.25em] text-slate-500">{label}</div><div className="mt-2 text-lg font-semibold">{value}</div></div>; }
function Field({ label, value, onChange, disabled = false }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean }) { return <label className="space-y-2 text-sm text-slate-300"><span>{label}</span><input value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className="w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-white outline-none focus:border-cyan-200/35 disabled:opacity-50" /></label>; }
function NumberField({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) { return <label className="space-y-2 text-sm text-slate-300"><span>{label}</span><input type="number" value={value} min={min} max={max} onChange={(event) => onChange(Number(event.target.value))} className="w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-white outline-none focus:border-cyan-200/35" /></label>; }
function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) { return <label className="space-y-2 text-sm text-slate-300"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-xl border border-white/10 bg-[#07111f] px-4 py-3 text-white outline-none focus:border-cyan-200/35">{options.map((option) => <option key={option}>{option}</option>)}</select></label>; }
function TextField({ label, value, rows = 3, onChange }: { label: string; value: string; rows?: number; onChange: (value: string) => void }) { return <label className="block space-y-2 text-sm text-slate-300"><span>{label}</span><textarea value={value} rows={rows} onChange={(event) => onChange(event.target.value)} className="w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-white outline-none focus:border-cyan-200/35" /></label>; }
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) { return <button type="button" aria-pressed={checked} onClick={() => onChange(!checked)} className={`rounded-full border px-4 py-2 text-sm ${checked ? "border-emerald-200/25 bg-emerald-300/10 text-emerald-100" : "border-white/10 bg-white/[0.03] text-slate-400"}`}>{label}: {checked ? "On" : "Off"}</button>; }

