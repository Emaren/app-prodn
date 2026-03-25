import Link from "next/link";
import type { ReactNode } from "react";

const PILLARS = [
  {
    title: "Replay Truth",
    body: "Final replays drive match history, rivalry records, and the trust layer behind who actually won.",
  },
  {
    title: "Steam RM First",
    body: "When an HD replay carries ladder ratings, that official Steam RM gets the top billing. AoE2HDBets Arena Elo stays underneath as the site-native signal.",
  },
  {
    title: "Rivalries",
    body: "Every repeat matchup should feel like a story: who won, who is climbing, and who deserves the rematch click.",
  },
  {
    title: "Tournament Gravity",
    body: "The lobby exists to point players toward the next event, the next bracket, and the next proof-backed result.",
  },
] as const;

export default function AboutPage() {
  return (
    <main className="space-y-6 py-6 text-white">
      <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.16),_transparent_30%),linear-gradient(135deg,_#0f172a,_#111827_56%,_#020617)] p-8">
        <div className="grid gap-6 lg:grid-cols-[1.08fr_0.92fr]">
          <div className="space-y-4">
            <div className="text-sm uppercase tracking-[0.4em] text-sky-200/70">About</div>
            <h2 className="max-w-3xl text-4xl font-semibold leading-tight text-white sm:text-5xl">
              Replay-backed AoE2HD competition, built to feel alive.
            </h2>
            <p className="max-w-3xl text-base leading-7 text-slate-300 sm:text-lg">
              AoE2HDBets is the public surface for parsed games, honest rankings, rivalry heat,
              tournament pull, and the next layer of trust around reported results.
            </p>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/"
                className="rounded-full bg-sky-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-200"
              >
                Open Lobby
              </Link>
              <Link
                href="/roadmap"
                className="rounded-full border border-white/15 px-5 py-3 text-sm text-white/85 transition hover:border-white/30 hover:text-white"
              >
                View Roadmap
              </Link>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <MiniStat label="Mode" value="Builder" />
            <MiniStat label="Ranking" value="Steam RM first" />
            <MiniStat label="Source" value="Final replays" />
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {PILLARS.map((pillar) => (
          <Panel key={pillar.title} title={pillar.title}>
            <p className="text-sm leading-6 text-slate-300">{pillar.body}</p>
          </Panel>
        ))}
      </section>
    </main>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-6">
      <h3 className="text-2xl font-semibold text-white">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.4rem] border border-white/10 bg-white/5 px-4 py-4">
      <div className="text-xs uppercase tracking-[0.25em] text-slate-400">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
    </div>
  );
}
