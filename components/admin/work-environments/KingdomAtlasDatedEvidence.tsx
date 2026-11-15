import { KINGDOM_ATLAS_HISTORY as history } from "@/lib/kingdomAtlasDatedObservations";

function exactCount(value: number) {
  return new Intl.NumberFormat("en-CA").format(value);
}

/**
 * Founder-visible, read-only attribution for the separately owned Atlas.
 * Does not query native receipt files, scan a host, schedule a job or assert
 * that an independent signed/HMAC producer is already on the website.
 */
export function KingdomAtlasDatedEvidence() {
  return (
    <section aria-labelledby="kingdom-atlas-owner-handoff-heading"
      className="rounded-3xl border border-amber-300/25 bg-[#0b1423] p-5 text-slate-50 sm:p-7">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.2em] text-amber-200">
            Independent Storage OS · Dated owner handoff
          </p>
          <h2 id="kingdom-atlas-owner-handoff-heading" className="mt-2 text-2xl font-extrabold">
            Kingdom Atlas &amp; estate evidence
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-200">
            An attributed historical reading from the other session, not a fresh
            signed website feed. The Atlas counts describe Git checkout instances,
            not all files across the kingdom or unique logical source files.
          </p>
        </div>
        <span className="rounded-xl border border-amber-200/40 bg-amber-200/10 px-3 py-2 text-xs font-bold text-amber-100">
          Current native evidence: UNKNOWN
        </span>
      </header>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Tracked checkout paths", history.mac.trackedPaths],
          ["Readable UTF-8 files", history.mac.readableUtf8Files],
          ["Source-code lines", history.mac.sourceLines],
          ["Static import strings", history.mac.staticImportStrings],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-white/15 bg-slate-950/75 p-4">
            <p className="text-xs leading-5 text-slate-200">{label}</p>
            <p className="mt-2 font-mono text-2xl font-bold tracking-tight text-white">
              {exactCount(value as number)}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <article className="rounded-2xl border border-white/15 bg-slate-950/75 p-5">
          <h3 className="text-lg font-bold text-white">Mac daily Atlas</h3>
          <p className="mt-2 text-sm font-semibold text-cyan-100">
            ADOPTED · First startup passed
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-200">
            The existing daily Mac Storage Pulse invoked the Atlas after source
            adoption. As of this handoff, both naturally scheduled daily
            executions were still pending; no completed two-day cadence is claimed.
            One known dirty Git index entry is not an intrusion verdict.
          </p>
          <p className="mt-3 font-mono text-xs text-slate-300">
            Reported Mac observation: {history.macObservedAt}
          </p>
        </article>
        <article className="rounded-2xl border border-white/15 bg-slate-950/75 p-5">
          <h3 className="text-lg font-bold text-white">HEL1 estate &amp; storage</h3>
          <p className="mt-2 text-sm font-semibold text-amber-100">
            Estate observer: HOLD · Root deployment stage reserve: HOLD
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-200">
            Four-host Level-1 scan completed in {history.hel1.boundedFourHostScanSec.toFixed(2)}s.
            Reported HEL1 volume effective usage was {history.hel1.volumeEffectivePercent.toFixed(2)}%,
            below its {history.hel1.volumeCeilingPercent}% ceiling.
            The dedicated HEL1 observer, private authenticated publisher,
            and next-release root staging reserve were not admitted.
          </p>
          <p className="mt-3 font-mono text-xs text-slate-300">
            Reported four-host scan: {history.estateObservedAt}
          </p>
        </article>
      </div>

      <div className="mt-5 flex flex-wrap gap-4 text-sm">
        <a href={history.sourceComment} target="_blank" rel="noopener noreferrer"
          className="text-cyan-200 underline underline-offset-4">Independent owner handoff</a>
        <a href={history.atlasComment} target="_blank" rel="noopener noreferrer"
          className="text-cyan-200 underline underline-offset-4">Atlas first-start evidence</a>
        <a href={history.storageSource} target="_blank" rel="noopener noreferrer"
          className="text-cyan-200 underline underline-offset-4">Canonical Storage OS detail</a>
      </div>
      <p className="mt-4 text-xs leading-6 text-amber-100">
        The values above remain permanently dated; they do not refresh themselves.
        No unattended HEL1 estate adoption, HMAC receiver, threat-free certification,
        additional scanner, financial authority or live agent heartbeat is implied.
      </p>
    </section>
  );
}
