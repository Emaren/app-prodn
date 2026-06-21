const mechanics = [
  {
    eyebrow: "Stream",
    title: "Every streamed match gets a book.",
    body: "If a game is streamed to AoE2WAR, it enters the WOLO rail. No dead matches. No empty board.",
  },
  {
    eyebrow: "AI Liquidity",
    title: "Tony or Phil opens action.",
    body: "One AI betting agent places a small 1 WOLO liquidity bet. Random pick. Simple spark. Real book.",
  },
  {
    eyebrow: "One-sided Bets",
    title: "Your action can clear.",
    body: "If a human bets one side, an AI agent can take the other side so the wager settles cleanly.",
  },
  {
    eyebrow: "Founder Bonus",
    title: "Players always get added to the economy.",
    body: "Every streamed match gets a Founder Bonus, split across the players and surfaced through pending wallet notifications.",
  },
] as const;

const founderBonusRows = [
  { match: "1v1 / 2 players", bonus: "4 WOLO", split: "2 WOLO each" },
  { match: "2v2 / 4 players", bonus: "4 WOLO", split: "1 WOLO each" },
  { match: "3v3 / 6 players", bonus: "6 WOLO", split: "1 WOLO each" },
  { match: "4v4 / 8 players", bonus: "8 WOLO", split: "1 WOLO each" },
] as const;

const outcomes = [
  ["Both sides bet", "Wagers settle normally."],
  ["One human bets", "Tony or Phil can take the other side."],
  ["Two humans match", "Human action takes priority."],
  ["Pure PvP wanted", "AI Bettor Off / Directed Bet is the clean path."],
  ["Void or refund", "Shown as refund. Never dressed up as a win."],
  ["Decimal split", "Allowed. WOLO is precise."],
] as const;

export default function BettingMechanicsPage() {
  return (
    <main className="min-h-screen bg-[#07111f] text-slate-100">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-5 py-10 sm:px-8 lg:px-10">
        <div className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-6 shadow-2xl shadow-black/30 sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-[0.45em] text-amber-300/80">
                Betting Mechanics
              </div>
              <h1 className="mt-3 max-w-3xl text-4xl font-black tracking-tight text-white sm:text-5xl">
                Every streamed game has action.
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
                AI liquidity keeps books moving until human bettors take the other side.
                Founder Bonuses keep players connected to the WOLO economy.
              </p>
            </div>

            <div className="rounded-2xl border border-amber-300/25 bg-amber-300/10 px-5 py-4 text-right">
              <div className="text-[10px] uppercase tracking-[0.35em] text-amber-200/80">
                Default Rail
              </div>
              <div className="mt-1 text-2xl font-black text-white">Stream → Book → Settle</div>
            </div>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {mechanics.map((item) => (
              <article
                key={item.title}
                className="rounded-2xl border border-white/10 bg-slate-950/45 p-4"
              >
                <div className="text-[10px] uppercase tracking-[0.35em] text-amber-300/70">
                  {item.eyebrow}
                </div>
                <h2 className="mt-2 text-base font-black text-white">{item.title}</h2>
                <p className="mt-2 text-sm leading-5 text-slate-400">{item.body}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1fr_0.9fr]">
          <section className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-5">
            <div className="text-[11px] uppercase tracking-[0.4em] text-slate-500">
              How it works
            </div>
            <h2 className="mt-2 text-2xl font-black text-white">Wager. Guarantee. Play.</h2>

            <div className="mt-5 grid gap-3">
              {outcomes.map(([label, value]) => (
                <div
                  key={label}
                  className="flex flex-col gap-1 rounded-2xl border border-white/10 bg-slate-950/45 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="text-sm font-bold text-white">{label}</div>
                  <div className="text-sm text-slate-400 sm:text-right">{value}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[1.5rem] border border-emerald-300/15 bg-emerald-300/[0.04] p-5">
            <div className="text-[11px] uppercase tracking-[0.4em] text-emerald-200/70">
              Founder Bonus
            </div>
            <h2 className="mt-2 text-2xl font-black text-white">Every match pays the players.</h2>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              Bonuses split across the players. If the split needs decimals, good.
              WOLO was built for precise rails.
            </p>

            <div className="mt-5 overflow-hidden rounded-2xl border border-white/10">
              {founderBonusRows.map((row) => (
                <div
                  key={row.match}
                  className="grid grid-cols-[1fr_auto] gap-3 border-b border-white/10 bg-slate-950/45 px-4 py-3 last:border-b-0"
                >
                  <div>
                    <div className="text-sm font-bold text-white">{row.match}</div>
                    <div className="mt-1 text-xs text-slate-500">{row.split}</div>
                  </div>
                  <div className="self-center rounded-full border border-emerald-200/25 bg-emerald-200/10 px-3 py-1 text-sm font-black text-emerald-100">
                    {row.bonus}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <section className="rounded-[1.5rem] border border-sky-300/15 bg-sky-300/[0.04] p-5">
          <div className="text-[11px] uppercase tracking-[0.4em] text-sky-200/70">
            Coming Rail
          </div>
          <h2 className="mt-2 text-2xl font-black text-white">Human-directed betting.</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
            Post your action for another human to take, or turn AI assistance off for a pure
            player-vs-player book. Until then, Tony and Phil keep the market alive.
          </p>
        </section>
      </section>
    </main>
  );
}
