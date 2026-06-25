import Image from "next/image";

const railStats = [
  ["Cap", "100M", "fixed"],
  ["Books", "$2", "settled fee"],
  ["Split", "50/50", "stakers · treasury"],
] as const;

export default function WoloSettlementRailTile() {
  return (
    <section className="relative overflow-hidden rounded-[1.45rem] border border-white/10 bg-[linear-gradient(180deg,rgba(7,11,21,0.96),rgba(4,7,15,0.99))] p-4 shadow-[0_22px_58px_rgba(2,6,23,0.34)]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/10" />
      <div className="pointer-events-none absolute -right-12 -top-16 h-52 w-52 rounded-full bg-cyan-300/[0.045] blur-3xl" />

      <div className="relative z-10 flex items-start gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[1.15rem] border border-amber-200/16 bg-black/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
          <Image
            src="/legacy/wolo-logo-transparent.png"
            alt="WOLO"
            width={46}
            height={46}
            className="h-[46px] w-[46px] object-contain"
          />
        </div>

        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.34em] text-white/45">
            Settlement rail
          </div>
          <h3 className="mt-1 text-xl font-semibold tracking-[-0.04em] text-white">
            Built for books, payouts, and proof.
          </h3>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">
            WOLO is the settlement layer under AoE2WAR: fixed supply, live balances, clean transfers, and fee logic players can inspect.
          </p>
        </div>
      </div>

      <div className="relative z-10 mt-4 grid gap-2 sm:grid-cols-3">
        {railStats.map(([label, value, detail]) => (
          <div
            key={label}
            className="rounded-[1rem] border border-white/[0.075] bg-white/[0.026] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
          >
            <div className="text-[10px] uppercase tracking-[0.28em] text-white/35">{label}</div>
            <div className="mt-2 text-2xl font-semibold tracking-[-0.055em] text-white">{value}</div>
            <div className="mt-1 text-[11px] text-slate-500">{detail}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
