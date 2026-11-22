import {getDatedM1Placement} from "@/lib/storageM1PlacementDated";

const bytes=(n:number|null)=>n===null?"UNKNOWN":
  new Intl.NumberFormat("en-CA",{maximumFractionDigits:2}).format(n/1e9)+" GB";
const tag=(s:string)=>s.replaceAll("_"," ");

/** Render only after the existing M1 Atlas page has called requireServerAdmin. */
export default function StorageM1PlacementBoard(){
  const ledger=getDatedM1Placement();
  const gap=ledger.minimumScratchTargetBytes-ledger.apfsContainerAvailableBytes;
  return (
    <section aria-label="M1 source-backed placement" className="bg-slate-950 px-4 py-8 text-slate-100 sm:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-cyan-300">
            Private Storage OS · M1 Placement
          </p>
          <h1 className="text-3xl font-bold tracking-tight">Keep, cold-store or review</h1>
          <p className="max-w-4xl text-sm leading-6 text-slate-300">
            Dated owner-native read-only evidence, not a live disk scan or an
            approved cleanup queue. Only known, individually scoped classes appear.
            Unscanned bytes, shared APFS clone extents and snapshot overhead remain
            UNKNOWN. No transfer or retirement is authorized here.
          </p>
        </header>
        <section aria-label="M1 physical capacity" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
            <p className="text-xs text-slate-400">APFS total · physical container</p>
            <p className="mt-1 text-xl font-semibold">{bytes(ledger.apfsContainerTotalBytes)}</p>
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
            <p className="text-xs text-slate-400">APFS ordinary free at dated read</p>
            <p className="mt-1 text-xl font-semibold">{bytes(ledger.apfsContainerAvailableBytes)}</p>
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
            <p className="text-xs text-slate-400">Additional free for 25 GiB scratch</p>
            <p className="mt-1 text-xl font-semibold">{bytes(gap)}</p>
          </div>
        </section>
        <div className="rounded-xl border border-amber-300/30 bg-amber-400/5 px-4 py-3 text-sm text-amber-100">
          <strong>PARTIAL COVERAGE · NOT SIGNED · NOT A DELETION PERMIT</strong>
          <p className="mt-1">
            Owner APFS observed {ledger.capacityObservedAt}; classification checked
            {ledger.observedAt}. Existing Factory ZIP full-content proofs were
            reused; 16/16 original ZIP identities and allocated metadata were
            rechecked without 16 content rehashes. Expected unique APFS recovery
            is UNKNOWN for every row. Current physical reclaim from this review: 0 B.
          </p>
        </div>
        <section className="space-y-3" aria-label="Per-class placement decisions">
          <h2 className="text-xl font-semibold">Source-backed placement review</h2>
          <p className="text-sm text-slate-400">
            Some classes overlap with their parent trees. Never sum these rows
            as a complete APFS decomposition; `INTEL COLD` is proposed destination,
            not proof that a transfer happened; `SAFE TO RECREATE` remains
            conditional on an exact owner decision.
          </p>
          <div className="overflow-x-auto rounded-xl border border-slate-700">
            <table className="min-w-[1160px] w-full border-collapse text-left text-sm">
              <thead className="bg-slate-900 text-xs uppercase tracking-wide text-slate-300">
                <tr>
                  <th scope="col" className="px-3 py-3">Class / source</th>
                  <th scope="col" className="px-3 py-3">Disposition</th>
                  <th scope="col" className="px-3 py-3">Gross allocated</th>
                  <th scope="col" className="px-3 py-3">Expected unique reclaim</th>
                  <th scope="col" className="px-3 py-3">Recoverability / dependency</th>
                  <th scope="col" className="px-3 py-3">Destination / approval</th>
                  <th scope="col" className="px-3 py-3">Last verification / coverage</th>
                </tr>
              </thead>
              <tbody>
                {ledger.rows.map(r=>(
                  <tr key={r.opaqueId} className="border-t border-slate-800 align-top odd:bg-slate-950 even:bg-slate-900/60">
                    <td className="max-w-[220px] px-3 py-3">
                      <span className="block font-medium">{r.label}</span>
                      <span className="font-mono text-xs text-slate-500">{r.opaqueId}</span>
                    </td>
                    <td className="px-3 py-3 font-semibold text-cyan-200">{tag(r.disposition)}</td>
                    <td className="px-3 py-3 tabular-nums">{bytes(r.allocatedGrossBytes)}</td>
                    <td className="px-3 py-3 text-amber-200">UNKNOWN · not certified</td>
                    <td className="max-w-[230px] px-3 py-3">
                      <span className="block font-medium">{tag(r.recovery)}</span>
                      <span className="mt-1 block text-xs text-slate-400">{r.dependencies}</span>
                    </td>
                    <td className="max-w-[230px] px-3 py-3">
                      <span className="block">{r.proposedDestination}</span>
                      <span className="mt-1 block text-xs text-amber-200">{tag(r.approvalLevel)} · NOT AUTHORIZED</span>
                    </td>
                    <td className="max-w-[180px] px-3 py-3 text-xs text-slate-300">
                      <span className="block">{r.lastVerifiedAt}</span>
                      <span className="block text-amber-200">PARTIAL / BOUNDED</span>
                      <span className="mt-1 block text-slate-500">{tag(r.source)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <footer className="space-y-2 text-sm text-slate-400">
          <p>Read-only source lineage: owner UID501 bounded APFS observations and existing
          WE4 sixteen-ZIP inventory. No owner-private absolute file paths, key
          material or protected receipts are exposed by this view.</p>
          <p>Intel requires separately admitted COPY, durable ACK, independent
          restoration and a distinct source-bound original-retirement permit.
          No browser button can provide those approvals.</p>
        </footer>
      </div>
    </section>
  );
}
