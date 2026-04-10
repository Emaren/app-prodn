"use client";

import type { BetWarTapeRow } from "@/lib/bets";

function shortTxHash(value: string) {
  if (value.length <= 18) return value;
  return `${value.slice(0, 10)}…${value.slice(-8)}`;
}

function formatTapeTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Now";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function WarTape({
  rows,
  emptyLabel = "No tape rows yet. Bets, founder actions, and payouts will stamp in here.",
}: {
  rows: BetWarTapeRow[];
  emptyLabel?: string;
}) {
  return (
    <div className="mt-4 rounded-[1.3rem] border border-white/[0.06] bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.018))] px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] uppercase tracking-[0.32em] text-slate-500">War Tape</div>
        <div className="text-[11px] uppercase tracking-[0.24em] text-slate-600">
          {rows.length ? `${rows.length} rows` : "quiet"}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="mt-3 text-sm text-slate-400">{emptyLabel}</div>
      ) : (
        <div className="mt-3 space-y-2">
          {rows.map((row) => {
            const wrapperClass =
              row.kind === "tx" && row.txUrl
                ? "block rounded-2xl border border-white/[0.06] bg-white/[0.025] px-3 py-3 transition hover:border-white/12 hover:bg-white/[0.04]"
                : "rounded-2xl border border-white/[0.06] bg-white/[0.025] px-3 py-3";

            const content = (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-white">{row.label}</div>
                    <div className="mt-1 text-xs text-slate-400">
                      {[row.actor, row.amountWolo ? `${row.amountWolo.toLocaleString()} WOLO` : null, row.note]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    {row.txHash ? (
                      <div className="font-mono text-[11px] text-slate-300">
                        {shortTxHash(row.txHash)}
                      </div>
                    ) : null}
                    <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-slate-600">
                      {formatTapeTime(row.createdAt)}
                    </div>
                  </div>
                </div>
              </>
            );

            if (row.kind === "tx" && row.txUrl) {
              return (
                <a
                  key={row.id}
                  href={row.txUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={wrapperClass}
                >
                  {content}
                </a>
              );
            }

            return (
              <div key={row.id} className={wrapperClass}>
                {content}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
