import Link from "next/link";
import type { Metadata } from "next";

import BountyAdvisor from "@/components/bounties/BountyAdvisor";
import { loadBountyBoard } from "@/lib/bounties";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "AoE2WAR Bounty Board", description: "Available opportunities, locked rewards, paid history, and full authoritative bounty memos." };

const STATUS_LABELS: Record<string, string> = { available: "Available", in_progress: "In Progress", locked: "Awaiting Payout", paid: "Paid", historical: "Legendary", rescinded: "Rescinded" };

export default async function BountiesPage() {
  const board = await loadBountyBoard(getPrisma());
  const featured = board.opportunities.filter((item) => item.featured && ["available", "in_progress"].includes(item.status));
  return <main className="space-y-7 py-7 text-white">
    <section className="overflow-hidden rounded-[2.2rem] border border-amber-100/14 bg-[radial-gradient(circle_at_14%_0%,rgba(251,191,36,0.2),transparent_33%),radial-gradient(circle_at_88%_12%,rgba(239,68,68,0.12),transparent_29%),linear-gradient(145deg,#151008,#080b12_58%)] p-7 sm:p-11"><div className="text-xs font-bold uppercase tracking-[0.42em] text-amber-100/65">The Bounty Board</div><h1 className="mt-4 max-w-4xl font-serif text-5xl leading-none sm:text-7xl">What can you do next?</h1><p className="mt-5 max-w-3xl text-base leading-7 text-slate-300">Open opportunities, locked rewards, paid legends, and the complete memo trail. An opportunity is not a payment promise. WOLO is paid only when the settlement rail shows real proof.</p><div className="mt-7 grid gap-3 sm:grid-cols-4"><Metric label="Open" value={String(board.totals.available)} /><Metric label="In progress" value={String(board.totals.inProgress)} /><Metric label="Awaiting payout" value={String(board.totals.locked)} /><Metric label="Recorded paid" value={`${Math.round(board.totals.paidWolo).toLocaleString()} WOLO`} /></div></section>

    <section className="overflow-x-auto pb-2 [scrollbar-width:thin]"><div className="flex min-w-max gap-4">{featured.map((item) => <BountyCard key={item.id} item={item} featured />)}</div></section>

    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{board.opportunities.map((item) => <BountyCard key={item.id} item={item} />)}</section>

    <BountyAdvisor />

    <section className="rounded-[1.8rem] border border-white/10 bg-slate-950/75 p-5 sm:p-7"><div className="flex flex-wrap items-end justify-between gap-4"><div><div className="text-xs uppercase tracking-[0.3em] text-amber-100/55">Authoritative Memo Ledger</div><h2 className="mt-2 text-3xl font-semibold">The full record</h2></div><div className="text-xs text-slate-500">{board.ledger.length} recent rows · generated {new Date(board.generatedAt).toLocaleString()}</div></div><div className="mt-5 space-y-3">{board.ledger.length ? board.ledger.map((entry) => <article key={entry.key} className="rounded-2xl border border-white/8 bg-white/[0.03] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${entry.status === "paid" ? "border-emerald-200/20 bg-emerald-300/10 text-emerald-100" : entry.status === "locked" ? "border-amber-200/20 bg-amber-300/10 text-amber-100" : "border-white/10 bg-white/[0.04] text-slate-300"}`}>{STATUS_LABELS[entry.status] || entry.status}</span><span className="text-sm font-semibold text-white">{entry.actor || entry.opportunity?.title || "Kingdom ledger"}</span>{entry.amountWolo !== null ? <span className="text-sm text-amber-100">{entry.amountWolo.toLocaleString()} WOLO</span> : null}</div><time className="text-xs text-slate-500">{new Date(entry.occurredAt).toLocaleString()}</time></div><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-300">{entry.memo}</p><div className="mt-3 flex flex-wrap gap-3 text-[11px] text-slate-500"><span>{entry.source}</span>{entry.txHash ? <span className="break-all">tx {entry.txHash}</span> : <span>No payout tx recorded</span>}{entry.errorState ? <span className="text-rose-300">{entry.errorState}</span> : null}</div></article>) : <div className="rounded-2xl border border-white/8 p-6 text-slate-500">No bounty ledger rows have been recorded yet.</div>}</div></section>
  </main>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-white/10 bg-black/22 p-4"><div className="text-[10px] uppercase tracking-[0.25em] text-slate-500">{label}</div><div className="mt-2 text-xl font-semibold">{value}</div></div>; }
function BountyCard({ item, featured = false }: { item: Awaited<ReturnType<typeof loadBountyBoard>>["opportunities"][number]; featured?: boolean }) { return <article className={`${featured ? "w-[min(82vw,25rem)]" : ""} flex h-full flex-col rounded-[1.6rem] border border-white/9 bg-[linear-gradient(145deg,rgba(255,255,255,0.055),rgba(255,255,255,0.018))] p-5`}><div className="flex items-center justify-between gap-3"><span className="text-[10px] font-bold uppercase tracking-[0.22em] text-amber-100/55">{item.category}</span><span className="rounded-full border border-white/10 px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-slate-300">{STATUS_LABELS[item.status] || item.status}</span></div><h3 className="mt-4 text-2xl font-semibold">{item.title}</h3><p className="mt-3 flex-1 text-sm leading-6 text-slate-400">{item.description}</p><div className="mt-4 rounded-xl border border-white/8 bg-black/20 p-3 text-xs leading-5 text-slate-400"><span className="text-slate-200">Proof:</span> {item.verification || "Operator verification required."}</div><div className="mt-4 flex items-center justify-between gap-3"><span className="text-sm font-semibold text-amber-100">{item.rewardWolo === null ? "Reward posted per campaign" : `${item.rewardWolo.toLocaleString()} WOLO`}</span><Link href={item.actionHref} className="rounded-full bg-amber-300 px-4 py-2 text-xs font-bold text-slate-950">{item.actionLabel}</Link></div></article>; }

