"use client";

import { FormEvent, useEffect, useState } from "react";

type CouncilAgent = {
  slug: string;
  name: string;
  role: string;
  specialty: string;
};

type CouncilTurn = {
  agent: CouncilAgent;
  body: string;
  timing: { contextMs: number; modelMs: number; totalMs: number; firstTokenMs: number | null };
};

export default function AiCouncilClient({ agents }: { agents: CouncilAgent[] }) {
  const [selected, setSelected] = useState(() => agents.slice(0, 2).map((agent) => agent.slug));
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<"ask" | "convene">("ask");
  const [pending, setPending] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [turns, setTurns] = useState<CouncilTurn[]>([]);
  const [error, setError] = useState<string | null>(null);
  const canSubmit = message.trim().length > 0 && selected.length >= (mode === "convene" ? 2 : 1) && !pending;

  useEffect(() => {
    if (!pending || startedAt === null || typeof window === "undefined") return;
    const timer = window.setInterval(() => setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000))), 250);
    return () => window.clearInterval(timer);
  }, [pending, startedAt]);

  function toggle(slug: string) {
    setSelected((current) => current.includes(slug) ? current.filter((entry) => entry !== slug) : [...current, slug].slice(-2));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setPending(true);
    setError(null);
    setTurns([]);
    const start = Date.now();
    setStartedAt(start);
    setElapsed(0);
    try {
      const response = await fetch("/api/ai/council", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: message.trim(), mode, agentSlugs: selected, turns: mode === "convene" ? 1 : 1 }),
      });
      const payload = (await response.json().catch(() => ({}))) as { detail?: string; transcript?: CouncilTurn[] };
      if (!response.ok) throw new Error(payload.detail || "The Council could not answer.");
      setTurns(payload.transcript ?? []);
      setElapsed(Math.max(0, Math.round((Date.now() - start) / 1000)));
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "The Council could not answer.");
    } finally {
      setPending(false);
      setStartedAt(null);
    }
  }

  return (
    <section className="rounded-[2rem] border border-cyan-200/12 bg-slate-950/75 p-5 sm:p-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><div className="text-xs uppercase tracking-[0.3em] text-cyan-100/55">Live Council Table</div><h2 className="mt-2 text-3xl font-semibold">Bring a real question</h2></div>
        <div className="flex rounded-full border border-white/10 bg-black/20 p-1 text-sm"><button type="button" onClick={() => setMode("ask")} className={`rounded-full px-4 py-2 ${mode === "ask" ? "bg-white/10 text-white" : "text-slate-400"}`}>Ask one</button><button type="button" onClick={() => setMode("convene")} className={`rounded-full px-4 py-2 ${mode === "convene" ? "bg-amber-300 text-slate-950" : "text-slate-400"}`}>Convene</button></div>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">{agents.map((agent) => <button key={agent.slug} type="button" onClick={() => toggle(agent.slug)} aria-pressed={selected.includes(agent.slug)} className={`rounded-full border px-4 py-2 text-sm ${selected.includes(agent.slug) ? "border-cyan-200/30 bg-cyan-300/10 text-cyan-50" : "border-white/10 bg-white/[0.03] text-slate-400"}`}>{agent.name}</button>)}</div>
      <form onSubmit={(event) => void submit(event)} className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end"><label className="flex-1 space-y-2 text-sm text-slate-400"><span>Question</span><textarea value={message} onChange={(event) => setMessage(event.target.value.slice(0, 1200))} rows={3} disabled={pending} placeholder="Why do I keep losing map control after Castle Age?" className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-white outline-none focus:border-cyan-200/35 disabled:opacity-60" /></label><button disabled={!canSubmit} className="rounded-full bg-amber-300 px-6 py-3 text-sm font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-45">{pending ? `Council thinking · ${elapsed}s` : mode === "convene" ? "Convene the Council" : "Ask the Council"}</button></form>
      {error ? <div className="mt-4 rounded-2xl border border-rose-300/25 bg-rose-500/10 p-4 text-rose-100">{error}</div> : null}
      {turns.length ? <div className="mt-6 space-y-4">{turns.map((turn, index) => <article key={`${turn.agent.slug}-${index}`} className="rounded-2xl border border-white/9 bg-white/[0.035] p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="font-semibold text-cyan-50">{turn.agent.name}</div><div className="text-xs text-slate-500">{turn.agent.role}</div></div><div className="text-xs text-slate-500">Thought for {(turn.timing.totalMs / 1000).toFixed(1)}s</div></div><p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-200">{turn.body}</p></article>)}</div> : null}
    </section>
  );
}
