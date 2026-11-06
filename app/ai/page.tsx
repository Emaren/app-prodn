import type { Metadata } from "next";

import AiCouncilClient from "@/components/ai/AiCouncilClient";
import { loadPublicAiCouncil } from "@/lib/aiAgents";
import { loadNonfinancialPublicAiDirectory } from "@/lib/nonfinancialPublicAiDirectory";
import { getPrisma } from "@/lib/prisma";
import { usesNonfinancialProductionAuth } from "@/lib/productionAuth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "AoE2WAR Council Chamber",
  description: "Meet the AoE2WAR AI council and ask grounded questions about the surviving Age of Empires II HD kingdom.",
};

function formatSpeed(value: number | null) {
  if (value === null) return "Awaiting telemetry";
  return value < 1000 ? `${value}ms median` : `${(value / 1000).toFixed(1)}s median`;
}

export default async function AiCouncilPage() {
  // Restricted production queries only the five published display fields.
  // Private agent prompts, runtime configuration and traces stay invisible.
  const restricted = usesNonfinancialProductionAuth();
  let projectionAvailable = !restricted;
  let agents: Array<{ slug: string; name: string; description: string; role: string;
    specialty: string; telemetry: { medianMs: number | null; requests: number } }> = [];
  if (restricted) {
    try {
      agents = await loadNonfinancialPublicAiDirectory(getPrisma());
      projectionAvailable = true;
    } catch {
      // Fail closed if the view is absent or unauthorized; never fall back
      // to private ai_agents. Do not echo database errors to public visitors.
      console.error("PUBLIC_AI_DIRECTORY_RESTRICTED_PROJECTION_UNAVAILABLE");
    }
  } else {
    agents = await loadPublicAiCouncil(getPrisma());
  }
  return (
    <main className="space-y-7 py-7 text-white">
      <section className="relative overflow-hidden rounded-[2.2rem] border border-cyan-100/12 bg-[radial-gradient(circle_at_16%_0%,rgba(34,211,238,0.15),transparent_31%),radial-gradient(circle_at_84%_16%,rgba(251,191,36,0.14),transparent_28%),linear-gradient(145deg,#081421,#05070e)] p-7 sm:p-11">
        <div className="text-xs font-bold uppercase tracking-[0.4em] text-cyan-100/60">AoE2WAR Council Chamber</div>
        <h1 className="mt-4 max-w-4xl font-serif text-5xl leading-none sm:text-7xl">The house voices know the war record.</h1>
        <p className="mt-5 max-w-3xl text-base leading-7 text-slate-300">Ask about replay truth, rivalries, player form, kingdom systems, or the next battle. Their answers are explanations over supplied evidence, never replacements for parser, adjudication, or chain truth.</p>
      </section>

      {restricted ? (
        <p role="status" data-public-read-model={projectionAvailable ? "available" : "unavailable"} className="rounded-2xl border border-amber-200/25 bg-slate-950/80 p-5 text-sm text-amber-100">
          {projectionAvailable
            ? "Published Council directory only. Live agent questions and timings are unavailable in this nonfinancial release; private configurations remain protected."
            : "Council directory is temporarily unavailable pending the audited public read model. Private agent configurations remain protected."}
        </p>
      ) : null}
      <section className="grid gap-4 md:grid-cols-3">
        {agents.map((agent) => (
          <article key={agent.slug} className="rounded-[1.7rem] border border-white/9 bg-slate-950/72 p-6">
            <div className="flex items-center justify-between gap-3"><div className="text-xs uppercase tracking-[0.25em] text-amber-100/55">{agent.role}</div><span aria-label={restricted ? "Published entry; runtime unverified" : "Enabled council voice"} className={restricted ? "h-2.5 w-2.5 rounded-full bg-slate-400" : "h-2.5 w-2.5 rounded-full bg-emerald-300 shadow-[0_0_16px_rgba(110,231,183,0.55)]"} /></div>
            <h2 className="mt-4 text-2xl font-semibold">{agent.name}</h2>
            <p className="mt-3 min-h-20 text-sm leading-6 text-slate-400">{agent.description}</p>
            <div className="mt-4 rounded-xl border border-white/8 bg-white/[0.03] p-3 text-sm text-slate-300">{agent.specialty}</div>
            <div className="mt-4 flex items-center justify-between text-xs text-slate-500">{restricted ? <><span>Runtime unverified</span><span>Traces withheld</span></> : <><span>{formatSpeed(agent.telemetry.medianMs)}</span><span>{agent.telemetry.requests ? `${agent.telemetry.requests} sampled` : "New rail"}</span></>}</div>
          </article>
        ))}
      </section>

      {!restricted ? <AiCouncilClient agents={agents.map((agent) => ({ slug: agent.slug, name: agent.name, role: agent.role, specialty: agent.specialty }))} /> : null}
    </main>
  );
}

