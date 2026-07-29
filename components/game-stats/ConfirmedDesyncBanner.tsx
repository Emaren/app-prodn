import Link from "next/link";

import type {
  ReplayDesyncIncidentView,
} from "@/components/game-stats/desyncIncidentView";
import TimeDisplayText from "@/components/time/TimeDisplayText";

function dispositionLabel(
  disposition:
    ReplayDesyncIncidentView[
      "settlementDisposition"
    ]
) {
  if (
    disposition ===
    "rematch"
  ) {
    return "Rematch ordered";
  }

  if (
    disposition ===
    "void_refund"
  ) {
    return "Void & Refund ordered";
  }

  return "Commissioner resolution required";
}

export default function ConfirmedDesyncBanner({
  incident,
}: {
  incident:
    ReplayDesyncIncidentView;
}) {
  return (
    <section
      data-confirmed-desync-banner
      title={
        incident.note ||
        undefined
      }
      className="relative overflow-hidden rounded-2xl border border-amber-300/20 bg-[radial-gradient(circle_at_10%_0%,rgba(127,29,29,0.34),transparent_34%),radial-gradient(circle_at_92%_50%,rgba(161,98,7,0.10),transparent_28%),linear-gradient(100deg,rgba(34,7,12,0.98),rgba(7,17,35,0.99)_58%,rgba(32,23,8,0.97))] px-4 py-3 shadow-[0_16px_45px_rgba(0,0,0,0.30)]"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/55 to-transparent"
      />

      <div className="flex items-center gap-3 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <span className="shrink-0 text-sm font-black uppercase tracking-[0.11em] text-amber-100">
          ⚡ DESYNCED
        </span>

        <span
          aria-hidden="true"
          className="h-4 w-px shrink-0 bg-amber-300/25"
        />

        <span className="shrink-0 text-xs font-semibold text-slate-200">
          {dispositionLabel(
            incident.settlementDisposition
          )}
        </span>

        <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
          Result ·{" "}
          {incident.competitiveResultStatus.replaceAll(
            "_",
            " "
          )}
        </span>

        <span className="ml-auto shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-100/55">
          Incident #
          {incident.id}
          {" · "}
          {incident.reviewerDisplayName}
          {" · "}
          <TimeDisplayText value={incident.createdAt} includeYear />
        </span>

        {incident.scheduledMatchId ? (
          <Link
            href={`/challenge/${incident.scheduledMatchId}`}
            className="shrink-0 rounded-full border border-amber-300/20 bg-amber-300/[0.06] px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-amber-100 transition hover:border-amber-200/40 hover:bg-amber-300/[0.10]"
          >
            Match #
            {incident.scheduledMatchId}
          </Link>
        ) : null}
      </div>
    </section>
  );
}
