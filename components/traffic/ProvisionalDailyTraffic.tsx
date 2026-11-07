import type { PublicProvisionalObservedActivity } from "@/lib/publicObservedTraffic";

type Props = {
  data: PublicProvisionalObservedActivity | null;
  lastPublishedDay: string | null;
};

function compact(value: number): string {
  return value.toLocaleString("en-CA");
}

export default function ProvisionalDailyTraffic({ data, lastPublishedDay }: Props) {
  const usable = data !== null && lastPublishedDay !== null &&
    data.lastCertifiedDay === lastPublishedDay;
  const points = usable ? data.points.slice(-16) : [];
  const peakIps = Math.max(1, ...points.map((p) => p.observedQualifyingIps));
  const peakGets = Math.max(1, ...points.map((p) => p.observedGetEvents));
  const last = points.at(-1) ?? null;

  return (
    <section aria-labelledby="observed-daily-heading"
      className="mt-6 rounded-[1.7rem] border border-amber-300/20 bg-[#101416] px-4 py-6 shadow-[0_12px_50px_rgba(0,0,0,0.2)] sm:px-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="observed-daily-heading" className="font-mono text-sm font-bold tracking-[0.14em] text-amber-200">
            OBSERVED / UNVERIFIED — DAILY PROJECT ACTIVITY
          </h2>
          <p className="mt-2 max-w-[75ch] text-sm leading-relaxed text-slate-300">
            Fresh filtered page GETs and qualifying IP addresses. These are <strong>not people,
            unique visitors, page sessions or confirmed humans</strong>. They never extend the
            certified Traffic history.
          </p>
        </div>
        <div className="rounded-lg border border-amber-300/25 px-3 py-2 font-mono text-xs text-amber-200">
          {last ? "LATEST OBSERVED UTC DAY: " + last.date + (last.utcDayComplete ? "" : " · PARTIAL") :
            "OBSERVED ACTIVITY UNAVAILABLE"}
        </div>
      </div>

      {!usable || !last ? (
        <div role="status" className="rounded-xl border border-white/10 bg-white/[0.035] px-4 py-6 text-sm text-slate-300">
          {data !== null && lastPublishedDay !== null && data.lastCertifiedDay !== lastPublishedDay ?
            "The observed and certified archive boundaries disagree. Activity is withheld until the sources are reconciled." :
            "Recent provisional activity is temporarily unavailable; certified history remains unchanged."}
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-white/[0.05] p-3">
              <p className="text-xs text-slate-400">Latest observed qualifying IPs</p>
              <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-amber-100">
                {compact(last.observedQualifyingIps)}
              </p>
            </div>
            <div className="rounded-xl bg-white/[0.05] p-3">
              <p className="text-xs text-slate-400">Latest observed filtered GETs</p>
              <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-sky-200">
                {compact(last.observedGetEvents)}
              </p>
            </div>
            <div className="rounded-xl bg-white/[0.05] p-3">
              <p className="text-xs text-slate-400">Calendar UTC day</p>
              <p className="mt-1 font-mono text-xl text-white">
                {last.utcDayComplete ? "Finished · unverified" : "In progress · partial"}
              </p>
            </div>
          </div>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[600px] border-collapse text-left text-xs">
              <thead className="border-b border-white/15 text-slate-300">
                <tr>
                  <th scope="col" className="pb-3 pr-3 font-medium">UTC day</th>
                  <th scope="col" className="pb-3 pr-3 font-medium">Qualifying IPs · not people</th>
                  <th scope="col" className="pb-3 font-medium">Filtered page GETs · not sessions</th>
                </tr>
              </thead>
              <tbody>
                {points.map((p) => (
                  <tr key={p.date} className="border-b border-white/[0.06]">
                    <th scope="row" className="whitespace-nowrap py-2 pr-3 font-mono font-normal text-slate-200">
                      {p.date} {p.utcDayComplete ? "" : "· partial"}
                    </th>
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-2">
                        <span className="w-[58px] shrink-0 text-right font-mono tabular-nums text-amber-100">
                          {compact(p.observedQualifyingIps)}
                        </span>
                        <div aria-hidden="true" className="h-2 min-w-0 flex-1 rounded-full bg-white/[0.06]">
                          <div className="h-2 rounded-full bg-amber-400/75"
                            style={{width:String(p.observedQualifyingIps / peakIps * 100) + "%"}} />
                        </div>
                      </div>
                    </td>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <span className="w-[70px] shrink-0 text-right font-mono tabular-nums text-sky-100">
                          {compact(p.observedGetEvents)}
                        </span>
                        <div aria-hidden="true" className="h-2 min-w-0 flex-1 rounded-full bg-white/[0.06]">
                          <div className="h-2 rounded-full bg-sky-400/75"
                            style={{width:String(p.observedGetEvents / peakGets * 100) + "%"}} />
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 font-mono text-[10px] leading-relaxed text-slate-400">
            {points.length} observed UTC days shown · Published certified boundary: {data.lastCertifiedDay} ·
            Observation generated: {data.generatedAt} · No classification or human-certification claims.
          </p>
        </>
      )}
    </section>
  );
}
