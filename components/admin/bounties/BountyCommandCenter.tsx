"use client";

import { useEffect, useState } from "react";

type Opportunity = {
  id: number;
  title: string;
  description: string;
  eligibility: string | null;
  verification: string | null;
  actionLabel: string;
  actionHref: string;
  rewardWolo: number | null;
  status: string;
  featured: boolean;
  priority: number;
  category: string;
  updatedAt: string;
};

type Snapshot = { opportunities: Opportunity[]; totals: { available: number; inProgress: number; locked: number; paid: number; paidWolo: number } };
const STATUSES = ["available", "in_progress", "locked", "paid", "historical"];

export default function BountyCommandCenter() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [drafts, setDrafts] = useState<Record<number, Opportunity & { eventMemo: string }>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const response = await fetch("/api/admin/bounties", { cache: "no-store" });
    const payload = (await response.json().catch(() => ({}))) as Snapshot & { detail?: string };
    if (!response.ok) throw new Error(payload.detail || "Could not load bounty operations.");
    setSnapshot(payload);
    setDrafts(Object.fromEntries(payload.opportunities.map((item) => [item.id, { ...item, eventMemo: "" }])));
  }

  useEffect(() => { void load().catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load bounty operations.")); }, []);

  async function save(id: number) {
    const draft = drafts[id];
    if (!draft) return;
    setSavingId(id); setError(null); setNotice(null);
    try {
      const response = await fetch("/api/admin/bounties", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(draft) });
      const payload = (await response.json().catch(() => ({}))) as { detail?: string };
      if (!response.ok) throw new Error(payload.detail || "Could not save bounty.");
      setNotice(`${draft.title} saved. Ledger events remain append-only.`);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save bounty."); }
    finally { setSavingId(null); }
  }

  function update(id: number, change: Partial<Opportunity & { eventMemo: string }>) {
    setDrafts((current) => ({ ...current, [id]: { ...current[id], ...change } }));
  }

  return <main className="mx-auto max-w-7xl space-y-6 py-8 text-white">
    <section className="rounded-[2rem] border border-amber-200/15 bg-[radial-gradient(circle_at_10%_0%,rgba(251,191,36,0.14),transparent_34%),linear-gradient(145deg,#171107,#070a11)] p-7 sm:p-9"><div className="text-xs font-bold uppercase tracking-[0.35em] text-amber-100/60">Operator Settlement Desk</div><h1 className="mt-3 font-serif text-4xl">Bounty Command Center</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">Publish opportunity truth, record status changes, and preserve the full memo trail. A paid label is operational metadata; a tx hash or indexed chain transfer remains the payout proof.</p>{snapshot ? <div className="mt-6 flex flex-wrap gap-3 text-xs text-slate-300"><span>{snapshot.totals.available} available</span><span>·</span><span>{snapshot.totals.inProgress} in progress</span><span>·</span><span>{snapshot.totals.locked} awaiting payout</span><span>·</span><span>{snapshot.totals.paidWolo.toLocaleString()} recorded WOLO paid</span></div> : null}</section>
    {error ? <div className="rounded-2xl border border-rose-300/25 bg-rose-500/10 p-4 text-rose-100">{error}</div> : null}
    {notice ? <div className="rounded-2xl border border-emerald-300/20 bg-emerald-500/10 p-4 text-emerald-100">{notice}</div> : null}
    <section className="grid gap-5 lg:grid-cols-2">{Object.values(drafts).map((draft) => <article key={draft.id} className="rounded-[1.5rem] border border-white/10 bg-slate-950/75 p-5">
      <div className="flex items-center justify-between gap-3"><span className="text-xs uppercase tracking-[0.22em] text-amber-100/55">{draft.category}</span><label className="text-xs text-slate-400"><input type="checkbox" checked={draft.featured} onChange={(event) => update(draft.id, { featured: event.target.checked })} className="mr-2" />Featured</label></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2"><Field label="Title" value={draft.title} onChange={(title) => update(draft.id, { title })} /><label className="space-y-2 text-sm text-slate-300"><span>Status</span><select value={draft.status} onChange={(event) => update(draft.id, { status: event.target.value })} className="w-full rounded-xl border border-white/10 bg-[#07111f] px-3 py-2.5">{STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label><Field label="Reward WOLO (blank = unpublished)" value={draft.rewardWolo === null ? "" : String(draft.rewardWolo)} onChange={(value) => update(draft.id, { rewardWolo: value === "" ? null : Math.max(0, Number(value) || 0) })} /><Field label="Priority" value={String(draft.priority)} onChange={(value) => update(draft.id, { priority: Number(value) || 0 })} /><Field label="Action label" value={draft.actionLabel} onChange={(actionLabel) => update(draft.id, { actionLabel })} /><Field label="Action href" value={draft.actionHref} onChange={(actionHref) => update(draft.id, { actionHref })} /></div>
      <TextField label="Description" value={draft.description} onChange={(description) => update(draft.id, { description })} /><TextField label="Eligibility" value={draft.eligibility || ""} onChange={(eligibility) => update(draft.id, { eligibility })} /><TextField label="Verification" value={draft.verification || ""} onChange={(verification) => update(draft.id, { verification })} /><TextField label="Append-only event memo (optional)" value={draft.eventMemo} onChange={(eventMemo) => update(draft.id, { eventMemo })} />
      <button onClick={() => void save(draft.id)} disabled={savingId !== null} className="mt-4 rounded-full bg-amber-300 px-5 py-2.5 text-sm font-bold text-slate-950 disabled:opacity-50">{savingId === draft.id ? "Saving…" : "Save & Record"}</button>
    </article>)}</section>
  </main>;
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="space-y-2 text-sm text-slate-300"><span>{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 outline-none focus:border-amber-200/30" /></label>; }
function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="mt-3 block space-y-2 text-sm text-slate-300"><span>{label}</span><textarea rows={3} value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 outline-none focus:border-amber-200/30" /></label>; }
