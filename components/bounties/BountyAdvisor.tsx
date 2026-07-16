"use client";

import { FormEvent, useEffect, useState } from "react";

export default function BountyAdvisor() {
  const [message, setMessage] = useState("");
  const [reply, setReply] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pending || startedAt === null) return;
    const update = () => setSeconds(Math.floor((Date.now() - startedAt) / 1000));
    update();
    const interval = window.setInterval(update, 250);
    return () => window.clearInterval(interval);
  }, [pending, startedAt]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!message.trim() || pending) return;
    setPending(true); setReply(null); setError(null); setStartedAt(Date.now()); setSeconds(0);
    try {
      const response = await fetch("/api/bounties/advisor", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: message.trim() }) });
      const payload = (await response.json().catch(() => ({}))) as { detail?: string; body?: string };
      if (!response.ok) throw new Error(payload.detail || "The Bounty Scribe could not answer.");
      setReply(payload.body || "No answer returned.");
    } catch (submitError) { setError(submitError instanceof Error ? submitError.message : "The Bounty Scribe could not answer."); }
    finally { setPending(false); setStartedAt(null); }
  }

  return <section className="rounded-[1.8rem] border border-cyan-200/12 bg-[radial-gradient(circle_at_0%_0%,rgba(34,211,238,0.12),transparent_34%),rgba(2,6,23,0.82)] p-6 sm:p-8"><div className="text-xs uppercase tracking-[0.3em] text-cyan-100/55">Bounty Scribe</div><h2 className="mt-2 text-3xl font-semibold">Ask what you can earn next</h2><p className="mt-3 text-sm leading-6 text-slate-400">Answers are grounded in the live opportunity definitions, claim rail, championship payouts, and indexed WOLO memos.</p><form onSubmit={(event) => void submit(event)} className="mt-5 flex flex-col gap-3 sm:flex-row"><input value={message} onChange={(event) => setMessage(event.target.value.slice(0, 1000))} disabled={pending} placeholder="Which available bounty can I complete today?" className="min-w-0 flex-1 rounded-full border border-white/10 bg-black/25 px-5 py-3 text-white outline-none focus:border-cyan-200/35" /><button disabled={pending || !message.trim()} className="rounded-full bg-cyan-200 px-5 py-3 text-sm font-bold text-slate-950 disabled:opacity-45">{pending ? `Scribe thinking · ${seconds}s` : "Ask the Scribe"}</button></form>{error ? <div className="mt-4 rounded-xl border border-rose-300/20 bg-rose-500/10 p-4 text-sm text-rose-100">{error}</div> : null}{reply ? <div className="mt-4 rounded-xl border border-white/9 bg-white/[0.04] p-5 text-sm leading-7 text-slate-200">{reply}</div> : null}</section>;
}

