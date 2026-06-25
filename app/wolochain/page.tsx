import WoloHeroTile from "@/components/wolo/WoloHeroTile";
import WoloChainLiveTransparency from "@/components/wolo/WoloChainLiveTransparency";

const rules = [
  {
    title: "Scarcity",
    body: "100,000,000 max. No silent minting. No weird supply creep.",
  },
  {
    title: "Settlement",
    body: "Balances, transfers, payout truth. The rail is the rail.",
  },
  {
    title: "Arena",
    body: "Made for AoE2HD betting, not generic chain cosplay.",
  },
] as const;

const validatorSteps = [
  {
    step: "01",
    title: "Get stake",
    body: "Hold enough WOLO to matter. Serious operators only.",
  },
  {
    step: "02",
    title: "Sync a node",
    body: "Run the chain clean. Full sync. Stable box. Real uptime.",
  },
  {
    step: "03",
    title: "Create validator",
    body: "Publish moniker, commission, public identity, and sign honestly.",
  },
  {
    step: "04",
    title: "Stay sharp",
    body: "No double-signing. No sloppy keys. No falling asleep at the wheel.",
  },
] as const;

export default function WoloChainExplainerPage() {
  return (
    <main className="space-y-6 py-3 text-white sm:space-y-7 sm:py-4">
      <WoloHeroTile />

      <WoloChainLiveTransparency />

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.75fr)]">
        <div className="rounded-[1.9rem] border border-white/10 bg-slate-950/70 p-6 shadow-[0_28px_80px_rgba(2,6,23,0.24)] sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-[0.34em] text-white/45">
                Why it exists
              </div>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.035em] text-white sm:text-3xl">
                Three rules. That&apos;s the whole vibe.
              </h2>
            </div>

            <div className="rounded-full border border-amber-300/20 bg-amber-300/8 px-3 py-1.5 text-xs font-semibold text-amber-100">
              Minimal by design
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {rules.map((rule) => (
              <article
                key={rule.title}
                className="rounded-[1.25rem] border border-white/10 bg-white/[0.035] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
              >
                <h3 className="text-xl font-semibold tracking-[-0.03em] text-white">
                  {rule.title}
                </h3>
                <p className="mt-3 text-sm leading-6 text-slate-300">{rule.body}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="rounded-[1.9rem] border border-white/10 bg-slate-950/70 p-6 shadow-[0_28px_80px_rgba(2,6,23,0.24)] sm:p-7">
          <div className="text-[11px] uppercase tracking-[0.34em] text-white/45">
            Current validator set
          </div>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.035em] text-white sm:text-3xl">
            1 validator live right now
          </h2>
          <p className="mt-4 text-sm leading-6 text-slate-300">
            That keeps the rail alive, but it is not the end state. WoloChain wants more real
            operators. Not fake decentralization theater. Real boxes. Real uptime. Real keys.
          </p>

          <div className="mt-5 rounded-[1.35rem] border border-cyan-300/16 bg-cyan-400/8 p-5">
            <div className="text-[11px] uppercase tracking-[0.3em] text-cyan-100/65">
              Why it matters
            </div>
            <div className="mt-2 text-xl font-semibold tracking-[-0.03em] text-white">
              More operators. Better chain.
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              Validator count is not a cosmetic number. More serious operators means better uptime,
              better resilience, and a stronger trust story when real money is moving.
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-[1.9rem] border border-white/10 bg-slate-950/70 p-6 shadow-[0_28px_80px_rgba(2,6,23,0.24)] sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.34em] text-white/45">
                Validator lane
              </div>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.035em] text-white">
                How to join the set
              </h2>
            </div>

            <div className="rounded-full border border-cyan-300/18 bg-cyan-400/8 px-3 py-1.5 text-xs font-semibold text-cyan-100">
              Operator grade
            </div>
          </div>

          <div className="mt-5 grid gap-3">
            {validatorSteps.map((step) => (
              <article
                key={step.step}
                className="grid gap-4 rounded-[1.15rem] border border-white/[0.075] bg-white/[0.03] p-4 sm:grid-cols-[3rem_minmax(0,1fr)]"
              >
                <div className="font-mono text-sm text-cyan-100/70">{step.step}</div>
                <div>
                  <div className="font-semibold tracking-[-0.02em] text-white">{step.title}</div>
                  <p className="mt-1 text-sm leading-6 text-slate-400">{step.body}</p>
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="rounded-[1.9rem] border border-white/10 bg-slate-950/70 p-6 shadow-[0_28px_80px_rgba(2,6,23,0.24)] sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.34em] text-white/45">
                Revenue read
              </div>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.035em] text-white">
                Where the money goes
              </h2>
            </div>

            <div className="rounded-full border border-emerald-300/18 bg-emerald-400/8 px-3 py-1.5 text-xs font-semibold text-emerald-100">
              One glance
            </div>
          </div>

          <div className="mt-5 space-y-3">
            <article className="rounded-[1.15rem] border border-white/[0.075] bg-white/[0.03] p-4">
              <div className="text-lg font-semibold tracking-[-0.03em] text-white">
                Betting fees
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                $2 per settled book. 50% to stakers and 50% to Community Treasury.
              </p>
            </article>

            <article className="rounded-[1.15rem] border border-white/[0.075] bg-white/[0.03] p-4">
              <div className="text-lg font-semibold tracking-[-0.03em] text-white">
                Chain fees
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Chain transaction fees follow validator economics. More validators means a stronger
                stake-led rail.
              </p>
            </article>

            <article className="rounded-[1.15rem] border border-white/[0.075] bg-white/[0.03] p-4">
              <div className="text-lg font-semibold tracking-[-0.03em] text-white">
                Market depth
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                WOLO / USDC liquidity is surfaced from the Osmosis pool so the network page feels
                alive, not decorative.
              </p>
            </article>
          </div>
        </div>
      </section>
    </main>
  );
}
