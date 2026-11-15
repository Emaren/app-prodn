"use client";

import { useState } from "react";
import {
  PAPER_BLUEPRINT_RESEARCH_UNIVERSE,
  PAPER_STRATEGY_BLUEPRINTS,
  paperStrategyBlueprint,
  type PaperBlueprintId,
} from "@/lib/kingdomPaperStrategyBlueprints";

/** A read-only research desk: never fetches, provisions or controls a bot. */
export default function StrategyBlueprintWorkshop() {
  const [selected, setSelected] = useState<PaperBlueprintId>("twin-blades");
  const blueprint = paperStrategyBlueprint(selected);

  return (
    <section
      id="strategy-blueprints"
      aria-labelledby="strategy-blueprints-heading"
      className="scroll-mt-24 space-y-6 rounded-[1.75rem] border border-cyan-200/20 bg-[linear-gradient(155deg,#132137,#060c17_70%)] p-5 text-white sm:p-8"
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.23em] text-cyan-200">
            PAPER strategy laboratory
          </p>
          <h2 id="strategy-blueprints-heading" className="mt-2 text-2xl font-black sm:text-3xl">
            The blueprint room.
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-200">
            Compare two research hypotheses before a single bot is provisioned.
            Switching blueprints changes this illustration only: there are no live
            entries, configured strategies, backtests, or simulated returns.
          </p>
        </div>
        <span className="rounded-xl border border-amber-200/40 bg-amber-200/10 px-3 py-2 text-xs font-bold text-amber-100">
          Research design · Not connected
        </span>
      </header>

      <div className="flex flex-wrap gap-3" role="group" aria-label="Select a PAPER strategy blueprint">
        {PAPER_STRATEGY_BLUEPRINTS.map((option) => (
          <button
            type="button"
            key={option.id}
            onClick={() => setSelected(option.id)}
            aria-pressed={selected === option.id}
            aria-controls="strategy-blueprint-details"
            className={
              "rounded-xl border px-5 py-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200 " +
              (selected === option.id
                ? "border-cyan-200/60 bg-cyan-200/15 text-cyan-50"
                : "border-white/20 bg-slate-950/60 text-slate-200 hover:border-cyan-200/40")
            }
          >
            <span className="block text-sm font-bold">{option.name}</span>
            <span className="mt-1 block text-xs text-slate-200">{option.tagline}</span>
          </button>
        ))}
      </div>

      <div id="strategy-blueprint-details" className="space-y-5" aria-live="polite">
        <div className="rounded-2xl border border-white/15 bg-black/25 p-5 sm:p-6">
          <p className="text-xs font-bold uppercase tracking-[.2em] text-cyan-200">
            Selected research hypothesis
          </p>
          <h3 className="mt-2 text-2xl font-black">{blueprint.name}</h3>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-200">{blueprint.premise}</p>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {blueprint.legs.map((leg, index) => (
              <div key={leg.name} className="rounded-xl border border-cyan-200/20 bg-slate-950/80 p-4">
                <p className="text-xs font-bold uppercase tracking-[.16em] text-cyan-200">
                  Research leg 0{index + 1}
                </p>
                <h4 className="mt-2 text-lg font-bold text-white">{leg.name}</h4>
                <p className="mt-2 text-sm leading-6 text-slate-200">{leg.role}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-2xl border border-white/15 bg-slate-950/75 p-5">
            <h4 className="text-base font-bold">Questions the PAPER experiment must answer</h4>
            <ul className="mt-4 list-disc space-y-3 pl-5 text-sm leading-6 text-slate-200">
              {blueprint.questions.map((question) => <li key={question}>{question}</li>)}
            </ul>
          </article>
          <article className="rounded-2xl border border-white/15 bg-slate-950/75 p-5">
            <h4 className="text-base font-bold">A future test sequence</h4>
            <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm leading-6 text-slate-200">
              {blueprint.studyPlan.map((step) => <li key={step}>{step}</li>)}
            </ol>
          </article>
        </div>
      </div>

      <div className="grid gap-3 rounded-2xl border border-white/15 bg-slate-950/80 p-5 sm:grid-cols-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-cyan-200">Base assets for future study</p>
          <p className="mt-2 text-sm text-white">{PAPER_BLUEPRINT_RESEARCH_UNIVERSE.bases.join(" · ")}</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-cyan-200">Reference quote assets</p>
          <p className="mt-2 text-sm text-white">{PAPER_BLUEPRINT_RESEARCH_UNIVERSE.referenceQuotes.join(" · ")}</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-cyan-200">Proposed exchange research</p>
          <p className="mt-2 text-sm text-white">{PAPER_BLUEPRINT_RESEARCH_UNIVERSE.proposedVenues.join(" · ")}</p>
        </div>
      </div>

      <p className="text-xs leading-6 text-amber-100">
        No Kraken or Coinbase connection is established. These labels are a research
        scope, not supported trading venues. Real-money, wallet, leverage, order,
        custody and execution controls remain unavailable; PAPER-only engine
        integration requires independent technical and release acceptance.
      </p>
    </section>
  );
}
