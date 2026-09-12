import { ArrowRight, BrainCircuit, ShieldCheck } from "lucide-react";
import Link from "next/link";

import type { WorkshopBrainSnapshot } from "@/lib/workshopBrain";

function stateTone(brain: WorkshopBrainSnapshot) {
  if (!brain.available || brain.stale) {
    return "border-slate-300/15 bg-slate-400/8 text-slate-300";
  }

  const state = brain.operatingState.toUpperCase();
  if (["HEALTHY", "PASS", "CERTIFIED"].includes(state)) {
    return "border-emerald-200/20 bg-emerald-300/10 text-emerald-100";
  }
  if (["FAILED", "BLOCKED", "UNSAFE"].includes(state)) {
    return "border-rose-200/25 bg-rose-300/10 text-rose-100";
  }
  if (["ATTENTION", "ATTENTION_REQUIRED", "WAITING", "WATCH"].includes(state)) {
    return "border-amber-200/22 bg-amber-300/10 text-amber-100";
  }
  return "border-cyan-200/18 bg-cyan-300/8 text-cyan-100";
}

function stateLabel(brain: WorkshopBrainSnapshot) {
  if (!brain.available) return "Signal unavailable";
  if (brain.stale) return "Evidence stale";
  return brain.operatingState.replace(/_/g, " ");
}

function BrainMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-white/8 bg-black/20 px-3.5 py-3">
      <div className="text-[9px] font-black uppercase tracking-[0.22em] text-slate-500">
        {label}
      </div>
      <div className="mt-1.5 truncate text-sm font-semibold text-white">{value}</div>
      <div className="mt-1 text-[11px] leading-4 text-slate-500">{detail}</div>
    </div>
  );
}

export default function WorkshopBrainPanel({
  brain,
}: {
  brain: WorkshopBrainSnapshot;
}) {
  const sourceValue = brain.sourceExact
    ? `${brain.certificationStatus} · ${brain.productionRelease ?? "exact"}`
    : brain.certificationStatus;
  const doctorValue =
    brain.doctorScore === null ? "Awaiting evidence" : `${brain.doctorScore}/100`;
  const invariantValue = brain.invariantCount
    ? `${brain.invariantPassCount}/${brain.invariantCount} pass`
    : "Awaiting evidence";

  return (
    <section
      data-workshop-brain-panel
      className="relative overflow-hidden rounded-[1.75rem] border border-cyan-100/12 bg-[radial-gradient(circle_at_8%_0%,rgba(34,211,238,0.11),transparent_30%),radial-gradient(circle_at_92%_20%,rgba(251,191,36,0.08),transparent_28%),linear-gradient(145deg,rgba(4,13,24,0.96),rgba(4,7,14,0.96))] p-5 shadow-[0_22px_70px_rgba(0,0,0,0.24)] sm:p-6"
    >
      <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-cyan-100/30 to-transparent" />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex max-w-3xl items-start gap-3">
          <div className="rounded-xl border border-cyan-100/12 bg-cyan-300/[0.07] p-2.5 text-cyan-100">
            <BrainCircuit className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[9px] font-black uppercase tracking-[0.3em] text-cyan-100/55">
              Kingdom Intelligence · The Brain
            </div>
            <h2 className="mt-1.5 font-serif text-2xl text-white sm:text-3xl">
              The Kingdom can explain itself.
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              A compact public-safe read of source authority, system health,
              invariants, and the ranked next move.
            </p>
          </div>
        </div>

        <span
          className={`rounded-full border px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.2em] ${stateTone(brain)}`}
        >
          {stateLabel(brain)}
        </span>
      </div>

      <div className="mt-5 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        <BrainMetric
          label="War Date"
          value={brain.warDate ?? "Awaiting signal"}
          detail={brain.stale ? "Latest evidence is stale" : "Deterministic UTC mapping"}
        />
        <BrainMetric
          label="Source authority"
          value={sourceValue}
          detail={brain.sourceExact ? "Local · GitHub · production exact" : "Source exactness not proven"}
        />
        <BrainMetric
          label="System Doctor"
          value={doctorValue}
          detail={`${brain.doctorStatus} · P0=${brain.p0} P1=${brain.p1}`}
        />
        <BrainMetric
          label="Invariants"
          value={invariantValue}
          detail={`${brain.activeSystemCount} active · ${brain.attentionSystemCount} attention`}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/8 pt-4">
        <div className="flex min-w-0 items-center gap-2 text-xs text-slate-400">
          <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-200/80" />
          <span className="truncate">
            {brain.directiveTitle
              ? `Next directive · ${brain.directiveTitle}`
              : "Public-safe projection only · private reasoning and operator evidence stay withheld."}
          </span>
        </div>
        <Link
          href="/kingdom-intelligence"
          className="inline-flex items-center gap-2 rounded-full border border-cyan-100/16 bg-cyan-100/[0.06] px-4 py-2 text-xs font-bold text-cyan-50 transition hover:border-cyan-100/30 hover:bg-cyan-100/[0.1]"
        >
          Open Kingdom Intelligence
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </section>
  );
}
