"use client";

import { useEffect, useMemo, useState } from "react";

type PromptSource =
  | "lobby_public"
  | "contact_thread"
  | "council"
  | "bounty_page"
  | "clan_hall";

type PromptContextMode = "always" | "keyword-gated" | "bounded" | "excluded";

type PromptPreview = {
  source: PromptSource;
  systemPrompt: string;
  redactedUserPrompt: string;
  contextManifest: Array<{
    key: string;
    label: string;
    mode: PromptContextMode;
  }>;
};

type ProviderPrompt = {
  provider: string;
  label: string;
  promptId: string;
  promptVersion: string;
  platformUrl: string;
  source: string;
  readOnly: true;
};

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
  version: number;
  createdAt: string;
  updatedAt: string;
  providerPrompt: ProviderPrompt | null;
  promptPreviews: Record<PromptSource, PromptPreview>;
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

const PROMPT_SOURCE_LABELS: Record<PromptSource, string> = {
  lobby_public: "Lobby public",
  contact_thread: "Contact thread",
  council: "Council",
  bounty_page: "Bounty advisor",
  clan_hall: "Clan Hall",
};

const PROMPT_SOURCE_DESCRIPTIONS: Record<PromptSource, string> = {
  lobby_public: "Public-room reply with the strictest context boundary.",
  contact_thread: "Participant-only AI contact reply with bounded thread history.",
  council: "Council answer grounded in the requesting member's authorized context.",
  bounty_page: "Page-grounded bounty advice for the signed-in viewer.",
  clan_hall: "Shared Hall reply with audience-filtered history and all private viewer context excluded.",
};

const PROMPT_MODE_STYLES: Record<PromptContextMode, string> = {
  always: "border-cyan-200/20 bg-cyan-300/8 text-cyan-100",
  "keyword-gated": "border-violet-200/20 bg-violet-300/8 text-violet-100",
  bounded: "border-amber-200/20 bg-amber-300/8 text-amber-100",
  excluded: "border-slate-500/20 bg-slate-800/60 text-slate-400",
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
  const [previewSource, setPreviewSource] = useState<PromptSource>("lobby_public");

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

  const hallScribeExists = useMemo(
    () =>
      Boolean(
        snapshot?.agents.some(
          (agent) => agent.slug === "aoe2war-hall-scribe",
        ),
      ),
    [snapshot],
  );

  useEffect(() => {
    setDraft(selected ? { ...selected } : null);
  }, [selected]);

  const promptPreviewDirty = useMemo(() => {
    if (!selected || !draft) return false;
    return (
      selected.name !== draft.name ||
      selected.runtimePersonaId !== draft.runtimePersonaId ||
      selected.role !== draft.role ||
      selected.specialty !== draft.specialty ||
      selected.personalityPrompt !== draft.personalityPrompt ||
      selected.aoe2Prompt !== draft.aoe2Prompt ||
      selected.requestedModel !== draft.requestedModel
    );
  }, [draft, selected]);

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
          expectedVersion: draft.version,
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

  async function stageHallScribe() {
    setSaving(true);
    setNotice(null);
    setError(null);
    try {
      const response = await fetch("/api/admin/ai-agents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Hall Scribe",
          slug: "aoe2war-hall-scribe",
          runtimePersonaId: "scribe",
          enabled: true,
          public: false,
          description:
            "Resident intelligence and chronicler of the AoE2WAR Clan Hall.",
          role:
            "AoE2WAR Hall assistant",
          specialty:
            "Answering AoE2WAR questions using Kingdom knowledge and current Hall context",
          introduction:
            "Mention @Hall Scribe to ask about AoE2WAR or anything happening in this Hall.",
          personalityPrompt:
            "Direct, concise, natural, respectful, and helpful. Answer the question first. Default to one or two short sentences. Do not force lore, jokes, roleplay, or personality.",
          aoe2Prompt:
            "Use supplied Kingdom Knowledge Router evidence and current Hall context as the source of truth. Prefer exact site facts. If information is unavailable, say so briefly rather than guessing.",
          knowledgeScopes: [
            "kingdom_public_all",
            "clan_hall_history",
          ],
          allowedTools: [],
          requestedModel: "Agent4.1HallScribe",
          maxContextChars: 24000,
          timeoutMs: 45000,
          maxCouncilTurns: 1,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        detail?: string;
        agent?: { id: number };
      };
      if (!response.ok) {
        throw new Error(payload.detail || "Could not stage Hall Scribe.");
      }
      await load();
      if (payload.agent?.id) setSelectedId(payload.agent.id);
      setPreviewSource("clan_hall");
      setNotice("Hall Scribe staged and enabled for the AoE2WAR Hall.");
    } catch (stageError) {
      setError(
        stageError instanceof Error
          ? stageError.message
          : "Could not stage Hall Scribe.",
      );
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
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">Edit the site-side voice and AoE2 instructions, inspect the effective prompt and context contract, and review real request latency. Provider credentials never appear here.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!hallScribeExists ? (
              <button
                onClick={() => void stageHallScribe()}
                disabled={saving}
                className="rounded-full border border-violet-200/20 bg-violet-300/10 px-5 py-3 text-sm font-bold text-violet-50 disabled:opacity-50"
              >
                Stage Hall Scribe
              </button>
            ) : null}
            <button onClick={() => void createAgent()} disabled={saving} className="rounded-full bg-cyan-200 px-5 py-3 text-sm font-bold text-slate-950 disabled:opacity-50">Stage New Agent</button>
          </div>
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
              <SelectField label="Model" value={draft.requestedModel} options={["Agent4.1Scribe", "Agent4.1HallScribe", "Agent4.1Grimer", "Agent4.1Guy", "Agent4.1M", "LlamaAgent42"]} onChange={(requestedModel) => setDraft({ ...draft, requestedModel })} />
              <Field label="Role" value={draft.role} onChange={(role) => setDraft({ ...draft, role })} />
              <Field label="Specialty" value={draft.specialty} onChange={(specialty) => setDraft({ ...draft, specialty })} />
            </div>
            <TextField label="Public description" value={draft.description} onChange={(description) => setDraft({ ...draft, description })} />
            <TextField label="User-facing introduction" value={draft.introduction} onChange={(introduction) => setDraft({ ...draft, introduction })} />
            <TextField label="Site-side personality layer (editable)" value={draft.personalityPrompt} rows={5} onChange={(personalityPrompt) => setDraft({ ...draft, personalityPrompt })} />
            <TextField label="Site-side AoE2 expertise layer (editable)" value={draft.aoe2Prompt} rows={8} onChange={(aoe2Prompt) => setDraft({ ...draft, aoe2Prompt })} />
            <section className="space-y-5 rounded-2xl border border-cyan-200/12 bg-cyan-300/[0.025] p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-cyan-50">Effective prompt and context manifest</h2>
                  <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-400">This preview compiles the saved site-side instructions for each surface. Dynamic user, room, wallet, staking, and database values are redacted.</p>
                </div>
                {promptPreviewDirty ? <span className="rounded-full border border-amber-200/20 bg-amber-300/10 px-3 py-1 text-xs text-amber-100">Save to refresh compiled preview</span> : <span className="rounded-full border border-emerald-200/20 bg-emerald-300/10 px-3 py-1 text-xs text-emerald-100">Preview matches saved config</span>}
              </div>

              <div className="rounded-xl border border-white/8 bg-black/20 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-500">Provider prompt metadata, read only</div>
                    {draft.providerPrompt ? <div className="mt-2 text-sm text-slate-200">{draft.providerPrompt.label} · version {draft.providerPrompt.promptVersion}</div> : <div className="mt-2 text-sm text-slate-400">This model has no managed provider prompt object.</div>}
                  </div>
                  {draft.providerPrompt ? <a href={draft.providerPrompt.platformUrl} target="_blank" rel="noreferrer" className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-semibold text-cyan-100 hover:bg-white/[0.08]">Open provider prompt</a> : null}
                </div>
                {draft.providerPrompt ? <div className="mt-3 break-all font-mono text-[11px] leading-5 text-slate-500">ID {draft.providerPrompt.promptId}<br />Source {draft.providerPrompt.source}</div> : null}
                <p className="mt-3 text-xs leading-5 text-slate-500">This dashboard edits AoE2WAR&apos;s site-side layers only. Provider prompt content and versions remain controlled at the provider and are shown here as AoE2WAR provider-registry metadata. OpenAI-backed voices execute directly; local models may use the optional gateway.</p>
              </div>

              <div className="flex flex-wrap gap-2" aria-label="Prompt preview source">
                {(Object.keys(PROMPT_SOURCE_LABELS) as PromptSource[]).map((source) => (
                  <button key={source} type="button" aria-pressed={previewSource === source} onClick={() => setPreviewSource(source)} className={`rounded-full border px-3 py-2 text-xs transition ${previewSource === source ? "border-cyan-200/30 bg-cyan-300/12 text-cyan-50" : "border-white/8 bg-white/[0.025] text-slate-400 hover:text-slate-200"}`}>{PROMPT_SOURCE_LABELS[source]}</button>
                ))}
              </div>

              {draft.promptPreviews?.[previewSource] ? (
                <div className="space-y-4">
                  <p className="text-xs text-slate-400">{PROMPT_SOURCE_DESCRIPTIONS[previewSource]}</p>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-500">Context manifest</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {draft.promptPreviews[previewSource].contextManifest.map((item) => <span key={item.key} title={`${item.label}: ${item.mode}`} className={`rounded-full border px-3 py-1.5 text-[11px] ${PROMPT_MODE_STYLES[item.mode]}`}>{item.label} · {item.mode}</span>)}
                    </div>
                  </div>
                  <div className="grid gap-4 xl:grid-cols-2">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-500">Saved effective system prompt</div>
                      <pre className="mt-2 max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-xl border border-white/8 bg-black/35 p-4 font-mono text-[11px] leading-5 text-slate-300">{draft.promptPreviews[previewSource].systemPrompt}</pre>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-500">Redacted dynamic context shape</div>
                      <pre className="mt-2 max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-xl border border-white/8 bg-black/35 p-4 font-mono text-[11px] leading-5 text-slate-300">{draft.promptPreviews[previewSource].redactedUserPrompt}</pre>
                    </div>
                  </div>
                </div>
              ) : <div className="rounded-xl border border-amber-200/15 bg-amber-300/8 p-4 text-sm text-amber-100">Prompt preview is unavailable. Reload this operator surface after the API deploy.</div>}
            </section>
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
