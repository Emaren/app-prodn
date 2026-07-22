import Link from "next/link";

import type { ReplayDesyncIncidentView } from "@/components/game-stats/desyncIncidentView";

function formatIncidentTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time preserved in incident ledger";
  return new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function humanize(value: string) {
  return value.replaceAll("_", " ");
}

function dispositionLabel(
  disposition: ReplayDesyncIncidentView["settlementDisposition"]
) {
  if (disposition === "rematch") return "Rematch ordered";
  if (disposition === "void_refund") return "Void & Refund ordered";
  return "Commissioner resolution required";
}

export default function ConfirmedDesyncBanner({
  incident,
}: {
  incident: ReplayDesyncIncidentView;
}) {
  return (
    <section
      data-confirmed-desync-banner
      className="relative overflow-hidden rounded-[1.65rem] border border-fuchsia-200/28 bg-[radial-gradient(circle_at_12%_0%,rgba(244,63,94,0.24),transparent_34%),radial-gradient(circle_at_88%_15%,rgba(249,115,22,0.18),transparent_30%),linear-gradient(145deg,rgba(45,5,32,0.9),rgba(7,10,23,0.96))] p-5 shadow-[0_24px_75px_rgba(190,24,93,0.15)] sm:p-6"
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-rose-100/80 to-transparent" />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.34em] text-fuchsia-100/65">
            Human · Desync Confirmed
          </div>
          <h2 className="mt-2 text-3xl font-black tracking-[0.05em] text-white sm:text-4xl">
            ⚡ DESYNCED
          </h2>
          <p className="mt-2 text-sm font-semibold text-rose-100/90">
            {dispositionLabel(incident.settlementDisposition)}
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-right">
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/50">
            Incident #{incident.id}
          </div>
          <div className="mt-1 text-xs text-slate-300">
            {incident.reviewerDisplayName} · {formatIncidentTime(incident.createdAt)}
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-3">
        <TruthAxis label="Incident" value="Desync confirmed true" tone="rose" />
        <TruthAxis
          label="Competitive result"
          value={humanize(incident.competitiveResultStatus)}
          tone="slate"
        />
        <TruthAxis
          label="Settlement"
          value={humanize(incident.settlementDisposition)}
          tone="amber"
        />
      </div>

      {incident.note ? (
        <p className="mt-4 text-sm leading-6 text-slate-300">{incident.note}</p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-slate-500">
        <span className="rounded-full border border-white/[0.08] bg-black/20 px-3 py-1.5">
          Human ground truth
        </span>
        <span className="rounded-full border border-white/[0.08] bg-black/20 px-3 py-1.5">
          Machine evidence remains separate
        </span>
        {incident.scheduledMatchId ? (
          <Link
            href={`/challenge/${incident.scheduledMatchId}`}
            className="rounded-full border border-fuchsia-200/18 bg-fuchsia-300/[0.07] px-3 py-1.5 font-bold text-fuchsia-100 transition hover:border-fuchsia-200/35 hover:bg-fuchsia-300/[0.12]"
          >
            Open Match #{incident.scheduledMatchId}
          </Link>
        ) : null}
      </div>
    </section>
  );
}

function TruthAxis({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "rose" | "amber" | "slate";
}) {
  const toneClass =
    tone === "rose"
      ? "border-rose-200/18 bg-rose-300/[0.08] text-rose-50"
      : tone === "amber"
        ? "border-amber-200/16 bg-amber-300/[0.07] text-amber-50"
        : "border-white/[0.08] bg-white/[0.035] text-slate-200";

  return (
    <div className={`rounded-xl border px-3 py-3 ${toneClass}`}>
      <div className="text-[9px] font-bold uppercase tracking-[0.18em] opacity-50">
        {label}
      </div>
      <div className="mt-1 text-xs font-semibold capitalize">{value}</div>
    </div>
  );
}
