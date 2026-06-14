"use client";

import { ExternalLink, Shield, Swords } from "lucide-react";

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

function actorInitials(value: string | null) {
  if (!value) return "?";
  return value
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function sideLabel(side: BetWarTapeRow["side"]) {
  if (side === "left") return "Left side";
  if (side === "right") return "Right side";
  return null;
}

function rowTone(row: BetWarTapeRow) {
  const label = `${row.label} ${row.note || ""}`.toLowerCase();
  if (row.kind === "tx") {
    return "border-emerald-300/18 bg-emerald-400/[0.055]";
  }
  if (label.includes("failed") || label.includes("blocked") || label.includes("reserve")) {
    return "border-amber-300/18 bg-amber-400/[0.06]";
  }
  if (label.includes("bonus") || label.includes("founder")) {
    return "border-amber-300/16 bg-amber-400/[0.045]";
  }
  return "border-white/[0.06] bg-white/[0.025]";
}

function friendlyTapeNote(value: string | null) {
  if (!value) return null;
  const normalized = value.toLowerCase();
  if (
    normalized.includes("payout_reserve_floor_hit") ||
    normalized.includes("reserve floor") ||
    normalized.includes("payout signer balance")
  ) {
    return "Settlement rail waiting for operator top-up.";
  }
  if (normalized.includes("settlement_health") || normalized.includes("settlement service")) {
    return "Settlement status unavailable.";
  }
  if (normalized.includes("auth failed") || normalized.includes("auth_required")) {
    return "Settlement rail waiting for operator auth.";
  }
  return value;
}

export default function WarTape({
  rows,
  emptyLabel = "No tape rows yet. Bets, founder actions, and payouts will stamp in here.",
}: {
  rows: BetWarTapeRow[];
  emptyLabel?: string;
}) {
  return (
    <div className="mt-4 min-w-0 rounded-[1.3rem] border border-white/[0.06] bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.018))] px-3 py-4 sm:px-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.32em] text-slate-500">
          <Swords className="h-4 w-4 text-amber-100/70" />
          War Tape
        </div>
        <div className="text-[11px] uppercase tracking-[0.24em] text-slate-600">
          {rows.length ? `${rows.length} rows` : "quiet"}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="mt-3 text-sm text-slate-400">{emptyLabel}</div>
      ) : (
        <div className="mt-3 space-y-2">
          {rows.map((row) => {
            const note = friendlyTapeNote(row.note);
            const side = sideLabel(row.side);
            const wrapperClass =
              row.kind === "tx" && row.txUrl
                ? `block min-w-0 rounded-2xl border px-3 py-3 transition hover:border-white/16 hover:bg-white/[0.055] ${rowTone(row)}`
                : `min-w-0 rounded-2xl border px-3 py-3 ${rowTone(row)}`;

            const content = (
              <div className="grid min-w-0 gap-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
                <div className="flex items-start gap-3 sm:contents">
                  <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-[radial-gradient(circle_at_30%_20%,rgba(251,191,36,0.24),transparent_34%),linear-gradient(135deg,rgba(15,23,42,0.95),rgba(3,7,18,0.95))] text-xs font-semibold text-amber-100">
                    {row.kind === "tx" ? <Shield className="h-5 w-5" /> : actorInitials(row.actor)}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <div className="min-w-0 break-words text-sm font-semibold text-white">
                        {row.label}
                      </div>
                      {side ? (
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] ${
                            row.side === "left"
                              ? "border-amber-200/18 bg-amber-300/10 text-amber-100"
                              : "border-sky-200/18 bg-sky-300/10 text-sky-100"
                          }`}
                        >
                          {side}
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-1 flex min-w-0 flex-wrap gap-2 text-xs">
                      {row.actor ? (
                        <span className="max-w-full truncate text-slate-300">{row.actor}</span>
                      ) : null}
                      {row.amountWolo ? (
                        <span className="rounded-full border border-amber-200/12 bg-black/20 px-2 py-0.5 text-amber-100">
                          {row.amountWolo.toLocaleString()} WOLO
                        </span>
                      ) : null}
                      {note ? (
                        <span className="min-w-0 max-w-full break-words text-slate-400">{note}</span>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="flex min-w-0 flex-wrap items-center gap-2 sm:justify-end">
                  {row.txHash ? (
                    <span className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-full border border-emerald-300/16 bg-emerald-400/10 px-2.5 py-1 font-mono text-[11px] text-emerald-100">
                      <span className="truncate">{shortTxHash(row.txHash)}</span>
                      {row.txUrl ? <ExternalLink className="h-3 w-3 shrink-0" /> : null}
                    </span>
                  ) : null}
                  <span className="rounded-full border border-white/8 bg-black/20 px-2.5 py-1 text-[11px] uppercase tracking-[0.14em] text-slate-500">
                    {formatTapeTime(row.createdAt)}
                  </span>
                </div>
              </div>
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
