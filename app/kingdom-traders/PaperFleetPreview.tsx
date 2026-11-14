"use client";

import { useState } from "react";
import {
  PAPER_FLEET_DESIGN_SLOTS,
  PAPER_FLEET_PAGE_COUNT,
  PAPER_FLEET_PAGE_SIZE,
  paperFleetDesignPage,
} from "@/lib/kingdomPaperFleetPreview";

/** A fully disconnected interface sketch; never interpret slots as created bots. */
export default function PaperFleetPreview() {
  const [page, setPage] = useState(1);
  const slots = paperFleetDesignPage(page);

  return (
    <section id="fleet-preview" aria-labelledby="fleet-preview-heading" className="scroll-mt-24 rounded-[1.65rem] border border-sky-200/15 bg-slate-950/80 p-5 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-sky-200/70">PAPER fleet interface</p>
          <h2 id="fleet-preview-heading" className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">A place for every strategy.</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
            Browse {PAPER_FLEET_DESIGN_SLOTS} proposed interface slots, {PAPER_FLEET_PAGE_SIZE} per page. These are empty design positions, not running bots, reserved funds, or simulated trades.
          </p>
        </div>
        <span className="rounded-full border border-amber-200/30 bg-amber-200/10 px-3 py-1.5 text-xs font-bold text-amber-100">No telemetry connected</span>
      </div>

      <div className="mt-7 flex flex-wrap items-center justify-between gap-3" role="group" aria-label="Paper fleet preview pages">
        <p className="text-sm font-medium text-slate-200" aria-live="polite">Page {page} of {PAPER_FLEET_PAGE_COUNT} · Slots {slots[0]}–{slots[slots.length - 1]}</p>
        <div className="flex items-center gap-2">
          <button type="button" disabled={page === 1} onClick={() => setPage((current) => Math.max(1, current - 1))} className="rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-white transition hover:border-sky-200/60 disabled:cursor-not-allowed disabled:opacity-40">Previous</button>
          <button type="button" disabled={page === PAPER_FLEET_PAGE_COUNT} onClick={() => setPage((current) => Math.min(PAPER_FLEET_PAGE_COUNT, current + 1))} className="rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-white transition hover:border-sky-200/60 disabled:cursor-not-allowed disabled:opacity-40">Next</button>
        </div>
      </div>

      <ol className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5" aria-label="Unprovisioned PAPER bot design slots">
        {slots.map((number) => (
          <li key={number} className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
            <p className="text-xs font-bold uppercase tracking-widest text-sky-200/70">Slot {String(number).padStart(3, "0")}</p>
            <p className="mt-2 text-sm font-semibold text-white">Not provisioned</p>
            <p className="mt-1 text-xs leading-5 text-slate-400">No strategy or session attached</p>
          </li>
        ))}
      </ol>
      <p className="mt-5 text-xs leading-5 text-slate-400">Preview only. This page never queries private PAPER services or represents account, bot, exchange, execution, or PnL state.</p>
    </section>
  );
}
