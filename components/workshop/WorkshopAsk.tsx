"use client";

import { FormEvent, useState } from "react";
import { Hammer, Send } from "lucide-react";

type WorkshopAnswer = {
  speaker: string;
  answer: string;
  boundary: string;
  sources: Array<{ title: string; publicId: string }>;
};

const SUGGESTIONS = [
  "What is Emaren working on?",
  "What changed today?",
  "Why are you rebuilding the parser?",
  "What is WoloChain?",
  "What feature is next?",
];

export default function WorkshopAsk() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<WorkshopAnswer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function ask(event?: FormEvent) {
    event?.preventDefault();
    if (!question.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/workshop/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const payload = (await response.json()) as WorkshopAnswer & { detail?: string };
      if (!response.ok) throw new Error(payload.detail || "The Scribe could not answer.");
      setAnswer(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The Scribe could not answer.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-[1.8rem] border border-cyan-100/12 bg-[radial-gradient(circle_at_0%_0%,rgba(34,211,238,0.12),transparent_34%),linear-gradient(145deg,rgba(7,24,35,0.96),rgba(4,8,15,0.96))] p-6 sm:p-8">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-cyan-100/15 bg-cyan-300/8 text-cyan-100">
          <Hammer className="h-5 w-5" />
        </div>
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.3em] text-cyan-100/60">Ask the Workshop</div>
          <h2 className="mt-2 text-3xl font-semibold">Question the public build record.</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Answers are grounded only in published Workshop records and public architecture boundaries. Unpublished notes and private AI sessions are not available here.</p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {SUGGESTIONS.map((suggestion) => (
          <button key={suggestion} type="button" onClick={() => setQuestion(suggestion)} className="rounded-full border border-white/10 bg-white/[0.035] px-3 py-2 text-xs text-slate-300 transition hover:border-cyan-100/25 hover:text-cyan-50">
            {suggestion}
          </button>
        ))}
      </div>

      <form onSubmit={ask} className="mt-4 flex flex-col gap-3 sm:flex-row">
        <input value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={280} placeholder="What is on the anvil?" className="min-h-12 flex-1 rounded-2xl border border-white/10 bg-black/25 px-4 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-100/30" />
        <button type="submit" disabled={busy || !question.trim()} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-cyan-200 px-5 text-sm font-bold text-slate-950 transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-45">
          <Send className="h-4 w-4" /> {busy ? "Reading…" : "Ask"}
        </button>
      </form>

      {error ? <div className="mt-4 text-sm text-rose-200">{error}</div> : null}
      {answer ? (
        <article className="mt-5 rounded-2xl border border-cyan-100/12 bg-cyan-300/[0.045] p-5">
          <div className="text-[10px] font-bold uppercase tracking-[0.28em] text-cyan-100/65">{answer.speaker}</div>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-200">{answer.answer}</p>
          <div className="mt-4 text-[10px] leading-5 text-slate-500">{answer.boundary}</div>
        </article>
      ) : null}
    </section>
  );
}
