import Link from "next/link";
import { ArrowUpRight, BookOpenText, History, ShieldCheck } from "lucide-react";
import {
  CHRONICLE_API_SOURCE,
  CHRONICLE_AUDITED_IDS,
  CHRONICLE_AUDIT_SEAL,
  CHRONICLE_AUDIT_URL,
  CHRONICLE_CASES,
  CHRONICLE_MILESTONES,
  CHRONICLE_RESEARCH_SEAL,
  CHRONICLE_SOURCE_URL,
  type ChronicleStatus,
} from "@/lib/phoenixResearchChronicle";

const statusCopy: Record<ChronicleStatus, string> = {
  retired: "Retired · same evidence exhausted",
  blocked: "Blocked · new evidence required",
  control: "Decoder control · not unknown debt",
};

const statusColor: Record<ChronicleStatus, string> = {
  retired: "border-stone-500/25 bg-stone-500/10 text-stone-300",
  blocked: "border-amber-400/25 bg-amber-900/15 text-amber-200",
  control: "border-sky-400/25 bg-sky-900/15 text-sky-200",
};

/**
 * Public, frozen, hand-reviewed historical presentation. No archive scan,
 * database query, user input, result mutation, or network fetch.
 */
export default function PhoenixResearchChronicle() {
  return (
    <section
      className="replay-panel p-5 sm:p-7"
      aria-labelledby="phoenix-chronicle-heading"
      data-phoenix-research-chronicle="bounded-v1"
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="replay-section-number"><History size={17} aria-hidden /></span>
          <div>
            <h2 id="phoenix-chronicle-heading" className="text-xl font-semibold tracking-tight text-stone-100">
              Phoenix Research Chronicle
            </h2>
            <p className="mt-1 text-xs leading-5 text-stone-400">
              What we tried · what failed · what we learned · what would change the answer
            </p>
          </div>
        </div>
        <span className="phoenix-snapshot-label">HISTORICAL / OCT 15 · NOT LIVE TELEMETRY</span>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-lg border border-white/10 bg-black/20 p-3">
          <p className="text-[10px] uppercase tracking-wider text-stone-400">Indexed hypotheses</p>
          <strong className="mt-2 block font-mono text-2xl text-stone-100">13</strong>
          <span className="text-[10px] text-stone-400">Bounded memory, not all-time attempts</span>
        </div>
        <div className="rounded-lg border border-white/10 bg-black/20 p-3">
          <p className="text-[10px] uppercase tracking-wider text-stone-400">Audited originals</p>
          <strong className="mt-2 block font-mono text-2xl text-stone-100">25</strong>
          <span className="text-[10px] text-stone-400">SHA-bound, exact EOF in separate audit</span>
        </div>
        <div className="rounded-lg border border-amber-500/20 bg-amber-900/10 p-3">
          <p className="text-[10px] uppercase tracking-wider text-amber-200/75">Recovered winners</p>
          <strong className="mt-2 block font-mono text-2xl text-amber-100">0</strong>
          <span className="text-[10px] text-amber-100/70">Measured 25-case audit only</span>
        </div>
        <div className="rounded-lg border border-white/10 bg-black/20 p-3">
          <p className="text-[10px] uppercase tracking-wider text-stone-400">All-time attempt count</p>
          <strong className="mt-2 block font-mono text-2xl text-stone-100">—</strong>
          <span className="text-[10px] text-stone-400">Not independently measured</span>
        </div>
      </div>

      <p className="mb-6 rounded-lg border border-sky-400/20 bg-sky-900/10 p-4 text-xs leading-6 text-sky-100/90">
        The month was not zero learning. We proved a known replay can be loaded by the native HD engine,
        built bounded byte and negative-evidence controls, and retired repeat experiments.
        <strong className="text-sky-100"> None of those milestones verifies a new winner.</strong>
        This is a <em>bounded historical excerpt</em>, not a complete inventory of every Codex run or
        a current-production result census.
      </p>

      <details className="group mb-3 rounded-lg border border-white/10 bg-black/20 p-4" open>
        <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-stone-100">
          <BookOpenText size={16} aria-hidden /> Campaign milestones
          <span className="ml-auto text-[11px] font-normal text-stone-400">Five dated checkpoints · expand / collapse</span>
        </summary>
        <ol className="mt-5 space-y-4 border-l border-amber-300/25 pl-5">
          {CHRONICLE_MILESTONES.map(milestone => (
            <li key={milestone.title} className="relative text-xs leading-6">
              <span className="absolute -left-[25px] top-2 h-2 w-2 rounded-full bg-amber-300" aria-hidden />
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[10px] tracking-wider text-amber-200">{milestone.period}</span>
                <strong className="text-sm text-stone-100">{milestone.title}</strong>
                <Link href={`/game-stats/${milestone.id}`} className="text-sky-200 hover:underline">
                  Control #{milestone.id} <ArrowUpRight size={11} className="inline" aria-hidden />
                </Link>
              </div>
              <p className="mt-1 text-stone-300">{milestone.observation}</p>
              <p className="mt-1 text-stone-400"><strong className="text-amber-100/90">Learned:</strong> {milestone.lesson}</p>
            </li>
          ))}
        </ol>
      </details>

      <details className="group mb-3 rounded-lg border border-white/10 bg-black/20 p-4">
        <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-stone-100">
          <ShieldCheck size={16} aria-hidden /> Research memory · specific games and outcomes
          <span className="ml-auto text-[11px] font-normal text-stone-400">13 records · expand</span>
        </summary>
        <p className="mt-4 text-xs leading-6 text-stone-400">
          Each row is a source-bound experiment record, not a successful parse or game result.
          Retired methods cannot be repeated on unchanged bytes merely under a new name.
          #13017 is a representative ID for a multi-target initial-clock experiment.
        </p>
        <div className="mt-4 space-y-3">
          {CHRONICLE_CASES.map(item => (
            <article key={item.experiment} className="rounded-lg border border-white/10 bg-[#060b0f]/70 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link href={`/game-stats/${item.id}`} className="font-mono text-sm font-semibold text-amber-100 hover:underline">
                  Game #{item.id} <ArrowUpRight size={12} className="inline" aria-hidden />
                </Link>
                <span className={`rounded border px-2 py-1 text-[10px] ${statusColor[item.status]}`}>{statusCopy[item.status]}</span>
              </div>
              <p className="mt-2 text-xs font-semibold text-stone-200">{item.method}</p>
              <p className="mt-2 text-xs leading-5 text-stone-400"><strong className="text-stone-200">Observed: </strong>{item.observed}</p>
              <p className="mt-2 text-xs leading-5 text-stone-400"><strong className="text-amber-200">Reopen only with: </strong>{item.nextProof}</p>
              <p className="mt-2 break-all font-mono text-[9px] text-stone-500">Research ID: {item.experiment}</p>
            </article>
          ))}
        </div>
      </details>

      <details className="group rounded-lg border border-white/10 bg-black/20 p-4">
        <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-stone-100">
          Exact original audit · all 25 IDs
          <span className="ml-auto text-[11px] font-normal text-stone-400">2 full summaries · 23 fallbacks · expand</span>
        </summary>
        <p className="mt-4 text-xs leading-6 text-stone-400">
          The first two had existing full-summary parses; 23 had only header fallback.
          All 25 byte streams reached exact EOF, but none gained a verified winner.
          Overlapping entries in Research Memory are <strong>not</strong> additional attempts.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {CHRONICLE_AUDITED_IDS.map((id, index) => (
            <Link
              key={id}
              href={`/game-stats/${id}`}
              className="rounded-md border border-amber-400/20 bg-amber-400/5 px-2.5 py-1.5 font-mono text-[11px] text-amber-100 hover:bg-amber-400/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300"
              title={index < 2 ? "Existing full summary · no decisive terminal proof" : "Header fallback · disconnect veto"}
            >
              #{id} <span className="text-[10px] text-stone-400">{index < 2 ? "Full" : "Fallback"}</span>
            </Link>
          ))}
        </div>
      </details>

      <div className="mt-5 flex flex-wrap gap-4 border-t border-white/10 pt-4 text-xs text-stone-400">
        <span>Research sealed: <time dateTime={CHRONICLE_RESEARCH_SEAL}>{CHRONICLE_RESEARCH_SEAL.slice(0, 10)}</time></span>
        <span>Audit frozen: <time dateTime={CHRONICLE_AUDIT_SEAL}>{CHRONICLE_AUDIT_SEAL.slice(0, 10)}</time></span>
        <span className="break-all font-mono">API source: {CHRONICLE_API_SOURCE.slice(0, 12)}</span>
        <a href={CHRONICLE_SOURCE_URL} target="_blank" rel="noopener noreferrer" className="text-sky-200 underline-offset-2 hover:underline">
          Draft research PR <ArrowUpRight size={11} className="inline" aria-hidden />
        </a>
        <a href={CHRONICLE_AUDIT_URL} target="_blank" rel="noopener noreferrer" className="text-sky-200 underline-offset-2 hover:underline">
          25-case evidence report <ArrowUpRight size={11} className="inline" aria-hidden />
        </a>
      </div>
      <p className="mt-2 text-[10px] text-stone-500">
        Candidate-only historical presentation. No page-time native execution, parser run, database access,
        result promotion, wager, settlement, wallet or Wolo operation. The source API PR is draft.
      </p>
    </section>
  );
}
