"use client";

import { useState } from "react";
import {
  PAPER_FLEET_DESIGN_SLOTS,
  PAPER_FLEET_PAGE_COUNT,
  PAPER_FLEET_PAGE_SIZE,
  paperFleetDesignPage,
} from "@/lib/kingdomPaperFleetPreview";

type FleetView = "cards" | "terminal";

/**
 * Fully disconnected PAPER interface: no exchange, engine, account, balance,
 * activity feed, live bot, private PAPER URL or execution path is ever accessed.
 */
export default function PaperFleetPreview() {
  const [page, setPage] = useState(1);
  const [view, setView] = useState<FleetView>("cards");
  const slots = paperFleetDesignPage(page);

  return (
    <section
      id="fleet-preview"
      aria-labelledby="fleet-preview-heading"
      className="scroll-mt-24 rounded-[1.65rem] border border-sky-200/15 bg-slate-950/80 p-5 sm:p-8"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-sky-200/70">
            PAPER fleet interface
          </p>
          <h2 id="fleet-preview-heading" className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">
            A place for every strategy.
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
            Browse {PAPER_FLEET_DESIGN_SLOTS} proposed interface slots, {PAPER_FLEET_PAGE_SIZE} per page.
            These are empty design positions, not running bots, reserved funds, or simulated trades.
          </p>
        </div>
        <span className="rounded-full border border-amber-200/30 bg-amber-200/10 px-3 py-1.5 text-xs font-bold text-amber-100">
          No telemetry connected
        </span>
      </div>

      <div className="mt-7 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2" role="group" aria-label="Fleet display mode">
          <button
            type="button"
            aria-pressed={view === "cards"}
            onClick={() => setView("cards")}
            className={"rounded-lg border px-4 py-2 text-sm font-semibold transition " +
              (view === "cards"
                ? "border-sky-200/50 bg-sky-200/15 text-sky-50"
                : "border-white/20 text-slate-300 hover:border-sky-200/40")}
          >
            Cards
          </button>
          <button
            type="button"
            aria-pressed={view === "terminal"}
            onClick={() => setView("terminal")}
            className={"rounded-lg border px-4 py-2 text-sm font-semibold transition " +
              (view === "terminal"
                ? "border-sky-200/50 bg-sky-200/15 text-sky-50"
                : "border-white/20 text-slate-300 hover:border-sky-200/40")}
          >
            Terminal
          </button>
        </div>
        <p className="text-xs text-slate-400">
          View-only display modes · no command terminal or trading connection
        </p>
      </div>

      <div
        className="mt-5 flex flex-wrap items-center justify-between gap-3"
        role="group"
        aria-label="Paper fleet preview pages"
      >
        <p className="text-sm font-medium text-slate-200" aria-live="polite">
          Page {page} of {PAPER_FLEET_PAGE_COUNT} · Slots {slots[0]}–{slots[slots.length - 1]}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="paper-fleet-page" className="text-xs font-medium text-slate-400">
            Jump to page
          </label>
          <select
            id="paper-fleet-page"
            aria-label="Jump to paper fleet page"
            value={page}
            onChange={(event) => setPage(Number(event.target.value))}
            className="rounded-lg border border-white/20 bg-slate-900 px-3 py-2 text-sm text-white"
          >
            {Array.from({ length: PAPER_FLEET_PAGE_COUNT }, (_, index) => index + 1).map((target) => (
              <option key={target} value={target}>Page {target}</option>
            ))}
          </select>
          <button
            type="button"
            disabled={page === 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            className="rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-white transition hover:border-sky-200/60 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Previous
          </button>
          <button
            type="button"
            disabled={page === PAPER_FLEET_PAGE_COUNT}
            onClick={() => setPage((current) => Math.min(PAPER_FLEET_PAGE_COUNT, current + 1))}
            className="rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-white transition hover:border-sky-200/60 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>

      {view === "cards" ? (
        <ol className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5" aria-label="Unprovisioned PAPER bot design slots">
          {slots.map((number) => (
            <li key={number} className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
              <p className="text-xs font-bold uppercase tracking-widest text-sky-200/70">
                Slot {String(number).padStart(3, "0")}
              </p>
              <p className="mt-2 text-sm font-semibold text-white">Not provisioned</p>
              <p className="mt-1 text-xs leading-5 text-slate-400">No strategy or session attached</p>
            </li>
          ))}
        </ol>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-sky-200/15 bg-[#040d12]">
          <table className="w-full min-w-[640px] border-collapse text-left font-mono text-xs" aria-label="Read-only PAPER fleet terminal">
            <caption className="sr-only">
              Empty proposed PAPER fleet slots; no bot orders, telemetry or account state
            </caption>
            <thead className="border-b border-sky-200/15 bg-sky-200/[0.06] text-sky-100">
              <tr>
                <th scope="col" className="p-3">SLOT</th>
                <th scope="col" className="p-3">PROVISIONING</th>
                <th scope="col" className="p-3">STRATEGY</th>
                <th scope="col" className="p-3">PAPER SESSION</th>
                <th scope="col" className="p-3">TELEMETRY</th>
              </tr>
            </thead>
            <tbody>
              {slots.map((number) => (
                <tr key={number} className="border-b border-white/10 last:border-0">
                  <th scope="row" className="p-3 font-semibold text-sky-200">
                    {String(number).padStart(3, "0")}
                  </th>
                  <td className="p-3 text-amber-100">Not provisioned</td>
                  <td className="p-3 text-slate-400">None assigned</td>
                  <td className="p-3 text-slate-400">No session</td>
                  <td className="p-3 text-slate-400">Not connected</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-5 text-xs leading-5 text-slate-400">
        Preview only. Both Cards and Terminal are local display options, not commands.
        This page never queries private PAPER services or represents account,
        bot, exchange, execution, or PnL state.
      </p>
    </section>
  );
}
