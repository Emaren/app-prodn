import { BrainCircuit, Radio } from "lucide-react";

export default function KingdomIntelligenceLoading() {
  return (
    <div className="mx-auto w-full max-w-[92rem] space-y-5 pb-16">
      <section className="relative min-h-[20rem] overflow-hidden rounded-[2.3rem] border border-amber-100/12 bg-[#04070c] px-7 py-10 shadow-[0_32px_120px_rgba(0,0,0,0.42)] sm:px-10 lg:px-14">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_42%,rgba(217,119,6,0.14),transparent_22%),linear-gradient(135deg,#08101c_0%,#030609_58%,#0b0805_100%)]" />
        <div className="relative z-10 flex min-h-[14rem] max-w-3xl flex-col justify-center">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl border border-amber-100/12 bg-amber-300/[0.06]">
              <BrainCircuit className="h-5 w-5 animate-pulse text-amber-100/80" />
            </span>
            <div>
              <div className="text-[9px] font-black uppercase tracking-[0.3em] text-amber-100/55">
                Kingdom Intelligence
              </div>
              <div className="mt-1 text-sm text-slate-400">
                Synchronizing the nervous system…
              </div>
            </div>
          </div>
          <div className="mt-7 h-10 w-72 max-w-full animate-pulse rounded-xl bg-white/[0.055]" />
          <div className="mt-3 h-4 w-full max-w-xl animate-pulse rounded-full bg-white/[0.035]" />
          <div className="mt-2 h-4 w-4/5 max-w-lg animate-pulse rounded-full bg-white/[0.035]" />
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-2xl border border-white/8 bg-white/[0.025]" />
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="min-h-72 rounded-[2rem] border border-cyan-200/10 bg-[#02060c] p-6">
          <div className="flex items-center gap-3 text-cyan-100/45">
            <Radio className="h-4 w-4 animate-pulse" />
            <span className="text-[9px] font-black uppercase tracking-[0.3em]">
              War Pulse acquiring signal
            </span>
          </div>
          <div className="mt-6 space-y-3">
            {Array.from({ length: 5 }, (_, index) => (
              <div key={index} className="h-10 animate-pulse rounded-xl bg-white/[0.025]" />
            ))}
          </div>
        </div>
        <div className="min-h-72 rounded-[2rem] border border-amber-100/10 bg-slate-950/80 p-6">
          <div className="h-4 w-40 animate-pulse rounded-full bg-white/[0.05]" />
          <div className="mt-6 space-y-3">
            {Array.from({ length: 5 }, (_, index) => (
              <div key={index} className="h-11 animate-pulse rounded-xl bg-white/[0.025]" />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
