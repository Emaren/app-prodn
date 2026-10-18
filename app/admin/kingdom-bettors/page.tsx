import Link from "next/link";
import BettingBotControlPanel from "@/components/admin/ai/BettingBotControlPanel";
import NominationInbox from "@/components/kingdom-bettors/NominationInbox";
import ProvisionKingdomPersonas from "@/components/kingdom-bettors/ProvisionKingdomPersonas";
export const dynamic="force-dynamic";
export default function KingdomBettorsAdmin(){
  return <main className="mx-auto max-w-[94rem] px-4 py-8 text-white sm:px-8">
    <div className="mb-6 flex flex-wrap items-end justify-between gap-5 rounded-3xl border border-amber-200/20 bg-slate-950 p-7">
      <div><p className="text-[10px] font-bold uppercase tracking-[.3em] text-amber-200/70">COMMAND / HOUSE POLICY</p>
      <h1 className="mt-2 font-serif text-4xl">Kingdom Bettors Command</h1>
      <p className="mt-3 max-w-xl text-sm text-slate-400">Four house personas. Deterministic opposite-side policy. No live counter-wager executor in this release.</p></div>
      <Link href="/kingdom-bettors" className="rounded-xl border border-white/20 px-5 py-3 text-sm text-amber-100 hover:bg-white/10">Visit public arena ↗</Link>
    </div>
    <NominationInbox/>
    <ProvisionKingdomPersonas/>
    <BettingBotControlPanel/>
  </main>;
}
