import Link from "next/link";
import type { PublicHistoricalMarket } from "@/lib/nonfinancialPublicMarketArchive";

type Props = {
  heading: string;
  intro: string;
  records: PublicHistoricalMarket[];
  viewAvailable: boolean;
};

export default function PublicHistoricalMarketArchive({
  heading, intro, records, viewAvailable,
}: Props) {
  return (
    <main data-public-read-model={viewAvailable ? "available" : "unavailable"}
      className="mx-auto max-w-6xl space-y-7 px-4 py-10 text-slate-100 sm:px-7">
      <section className="space-y-4 rounded-[2rem] border border-amber-200/15 bg-slate-950/80 p-7">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-100/70">
          AoE2WAR / Published Historical Record
        </p>
        <h1 className="font-serif text-4xl font-semibold sm:text-6xl">{heading}</h1>
        <p className="max-w-3xl text-slate-300">{intro}</p>
        <p role="status" className="rounded-xl border border-amber-200/25 bg-amber-300/[0.05] p-4 text-sm text-amber-100">
          Read-only historical app-published market labels. Recorded app statuses
          are NOT independent blockchain finality, solvency proof, a payout
          certificate, a live betting offer, or permission to move WOLO.
          Wagers, wallets, claims, execution, proposal submission and settlement
          remain disabled in this nonfinancial website release.
        </p>
      </section>
      {!viewAvailable ? (
        <section role="status" className="rounded-xl border border-amber-200/20 p-5 text-amber-100">
          The audited public history projection is unavailable. Records remain UNKNOWN;
          private market tables are not queried as a fallback.
        </section>
      ) : records.length === 0 ? (
        <section role="status" className="rounded-xl border border-white/15 p-5 text-slate-300">
          No publicly eligible historical market labels are currently available.
          This does not indicate that no markets or unsettled liabilities exist.
        </section>
      ) : (
        <section aria-label="Published historical market labels" className="space-y-4">
          <h2 className="text-2xl font-semibold">Published archive</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {records.map((record) => (
              <article key={record.id}
                className="rounded-2xl border border-white/10 bg-slate-950/65 p-5">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                  App record #{record.id} · {record.recordedStatus.replaceAll("_", " ")}
                </p>
                <h3 className="mt-3 text-xl font-semibold text-white">{record.title}</h3>
                <p className="mt-2 text-sm text-slate-300">{record.eventLabel}</p>
                <div className="mt-3 flex flex-wrap gap-3 text-sm text-amber-100">
                  <span>{record.leftLabel}</span><span aria-hidden="true">/</span>
                  <span>{record.rightLabel}</span>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
      <nav className="flex flex-wrap gap-4 text-sm text-cyan-300" aria-label="Public source navigation">
        <Link href="/kingdom-progress">Source-verified Kingdom progress</Link>
        <Link href="/war-engine">War Engine overview</Link>
        <Link href="/kingdom">The Kingdom</Link>
      </nav>
    </main>
  );
}
