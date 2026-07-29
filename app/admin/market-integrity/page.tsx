import Link from "next/link";

import TimeDisplayText from "@/components/time/TimeDisplayText";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function formatWolo(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function tone(status: string) {
  if (["resolved", "corrective_refund_paid", "overpayment_recorded"].includes(status)) {
    return "border-emerald-300/20 bg-emerald-400/[0.08] text-emerald-100";
  }
  if (["open", "under_review", "corrective_refund_pending"].includes(status)) {
    return "border-amber-300/20 bg-amber-400/[0.08] text-amber-100";
  }
  return "border-white/10 bg-white/[0.04] text-slate-300";
}

export default async function MarketIntegrityPage() {
  const prisma = getPrisma();
  const [incidents, reviewMarkets, pendingAliases] = await Promise.all([
    prisma.betMarketIntegrityIncident.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 50,
      include: {
        market: {
          select: {
            id: true,
            title: true,
            status: true,
            integrityStatus: true,
            linkedGameStatsId: true,
          },
        },
        adjustments: {
          orderBy: { id: "asc" },
        },
      },
    }),
    prisma.betMarket.findMany({
      where: {
        OR: [{ status: "under_review" }, { integrityStatus: "under_review" }],
      },
      orderBy: [{ underReviewAt: "desc" }, { updatedAt: "desc" }],
      take: 50,
      include: {
        _count: { select: { wagers: true, integrityIncidents: true } },
      },
    }),
    prisma.playerIdentityAlias.findMany({
      where: { status: "pending" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 50,
    }),
  ]);

  const totalUnderpayment = incidents.reduce(
    (sum, incident) => sum + incident.adjustments.reduce(
      (subtotal, adjustment) => subtotal + adjustment.amountStillOwedWolo,
      0
    ),
    0
  );
  const totalOverpayment = incidents.reduce(
    (sum, incident) => sum + incident.overpaymentWolo,
    0
  );

  return (
    <main className="min-h-screen bg-[#060d19] px-5 py-8 text-slate-100 sm:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-[2rem] border border-white/10 bg-slate-950/75 p-6 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.35em] text-amber-200/70">
                Operator cockpit
              </div>
              <h1 className="mt-2 text-3xl font-semibold">Market Integrity</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
                Frozen propositions, replay-team conflicts, void corrections, and identity evidence. No row here authorizes an automatic clawback.
              </p>
            </div>
            <Link href="/admin" className="rounded-full border border-white/12 px-4 py-2 text-sm text-slate-200 hover:bg-white/[0.06]">
              Back to Admin
            </Link>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-4">
            {[
              ["Under review", reviewMarkets.length],
              ["Integrity incidents", incidents.length],
              ["Correction owed", `${formatWolo(totalUnderpayment)} WOLO`],
              ["Overpayment recorded", `${formatWolo(totalOverpayment)} WOLO`],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-white/8 bg-white/[0.035] p-4">
                <div className="text-[10px] uppercase tracking-[0.24em] text-slate-500">{label}</div>
                <div className="mt-2 text-xl font-semibold text-white">{value}</div>
              </div>
            ))}
          </div>
        </header>

        <section className="rounded-[2rem] border border-white/10 bg-slate-950/65 p-6">
          <h2 className="text-xl font-semibold">Incident ledger</h2>
          <div className="mt-4 space-y-4">
            {incidents.length ? incidents.map((incident) => (
              <article key={incident.id} className="rounded-2xl border border-white/8 bg-white/[0.025] p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <Link href={`/bets/${incident.market.id}`} className="font-semibold text-white hover:text-sky-200">
                      Market #{incident.market.id} · {incident.market.title}
                    </Link>
                    <p className="mt-2 text-sm text-slate-300">{incident.publicSummary}</p>
                  </div>
                  <span className={`rounded-full border px-3 py-1 text-xs ${tone(incident.status)}`}>
                    {incident.status.replaceAll("_", " ")}
                  </span>
                </div>
                <div className="mt-4 grid gap-3 text-xs text-slate-400 md:grid-cols-4">
                  <div>Original payout <strong className="block text-slate-100">{formatWolo(incident.originalPayoutWolo)} WOLO</strong></div>
                  <div>Void entitlement <strong className="block text-slate-100">{formatWolo(incident.voidEntitlementWolo)} WOLO</strong></div>
                  <div>Underpayment <strong className="block text-amber-100">{formatWolo(incident.underpaymentWolo)} WOLO</strong></div>
                  <div>Overpayment <strong className="block text-sky-100">{formatWolo(incident.overpaymentWolo)} WOLO</strong></div>
                </div>
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full text-left text-xs">
                    <thead className="text-slate-500"><tr><th className="pb-2">Wager</th><th className="pb-2">Stake</th><th className="pb-2">Paid</th><th className="pb-2">Owed</th><th className="pb-2">State</th><th className="pb-2">Correction tx</th></tr></thead>
                    <tbody>
                      {incident.adjustments.map((adjustment) => (
                        <tr key={adjustment.id} className="border-t border-white/6 text-slate-300">
                          <td className="py-2">#{adjustment.wagerId}</td>
                          <td>{formatWolo(adjustment.originalStakeWolo)}</td>
                          <td>{formatWolo(adjustment.amountAlreadyPaidWolo)}</td>
                          <td>{formatWolo(adjustment.amountStillOwedWolo)}</td>
                          <td><span className={`rounded-full border px-2 py-1 ${tone(adjustment.adjustmentStatus)}`}>{adjustment.adjustmentStatus.replaceAll("_", " ")}</span></td>
                          <td className="font-mono">{adjustment.correctiveTxHash ? `${adjustment.correctiveTxHash.slice(0, 10)}…` : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 text-[11px] text-slate-500">
                  Opened <TimeDisplayText value={incident.createdAt} includeYear /> · resolved{" "}
                  <TimeDisplayText value={incident.resolvedAt} includeYear emptyValue="Pending" />
                </div>
              </article>
            )) : <p className="text-sm text-slate-500">No integrity incidents recorded.</p>}
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-[2rem] border border-white/10 bg-slate-950/65 p-6">
            <h2 className="text-xl font-semibold">Markets under review</h2>
            <div className="mt-4 space-y-3">
              {reviewMarkets.length ? reviewMarkets.map((market) => (
                <Link key={market.id} href={`/bets/${market.id}`} className="block rounded-2xl border border-amber-300/12 bg-amber-400/[0.04] p-4 hover:bg-amber-400/[0.07]">
                  <div className="font-semibold text-white">#{market.id} · {market.title}</div>
                  <div className="mt-1 text-xs text-slate-400">{market.integrityReason || "Manual review requested"} · {market._count.wagers} wagers · {market._count.integrityIncidents} incidents</div>
                </Link>
              )) : <p className="text-sm text-slate-500">No markets waiting for review.</p>}
            </div>
          </div>
          <div className="rounded-[2rem] border border-white/10 bg-slate-950/65 p-6">
            <h2 className="text-xl font-semibold">Identity aliases pending</h2>
            <p className="mt-2 text-xs leading-5 text-slate-500">Aliases support identity review only. They never invent replay team membership.</p>
            <div className="mt-4 space-y-3">
              {pendingAliases.length ? pendingAliases.map((alias) => (
                <div key={alias.id} className="rounded-2xl border border-white/8 bg-white/[0.025] p-4">
                  <div className="font-semibold text-white">{alias.observedName} → {alias.canonicalDisplayName}</div>
                  <div className="mt-1 text-xs text-slate-500">{alias.steamId || alias.canonicalStablePlayerKey}</div>
                </div>
              )) : <p className="text-sm text-slate-500">No aliases awaiting review.</p>}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
