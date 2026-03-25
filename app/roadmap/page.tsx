import Link from "next/link";

const MODULES = [
  {
    title: "Leaderboard + Lobby",
    score: 83,
    status: "Now",
    detail: "Centered nav, Steam RM first when available, Arena support, and a tighter lobby board with less dead copy.",
  },
  {
    title: "Rivalries",
    score: 71,
    status: "Now",
    detail: "Strong surface already. Next step is more heat, timelines, and tournament overlap.",
  },
  {
    title: "Player Graph",
    score: 68,
    status: "Next",
    detail: "Needs a true full-rankings destination and better player signature stats.",
  },
  {
    title: "Tournament Surface",
    score: 64,
    status: "Next",
    detail: "Good shell. Needs standings, results pulse, and stronger bracket gravity.",
  },
  {
    title: "Replay Trust",
    score: 61,
    status: "Next",
    detail: "Parser is real, but tests, fixtures, and edge-case handling still need tightening.",
  },
  {
    title: "WOLO Rail",
    score: 44,
    status: "Later",
    detail: "Visible now, but it should stay secondary until competition and trust fully dominate.",
  },
  {
    title: "Docs + Ops Truth",
    score: 49,
    status: "Later",
    detail: "Runtime truth still drifts from docs. We need one brutal architecture source of record.",
  },
] as const;

export default function RoadmapPage() {
  return (
    <main className="space-y-6 py-6 text-white">
      <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(34,197,94,0.14),_transparent_30%),linear-gradient(135deg,_#0f172a,_#111827_55%,_#020617)] p-8">
        <div className="grid gap-6 lg:grid-cols-[1.08fr_0.92fr]">
          <div className="space-y-4">
            <div className="text-sm uppercase tracking-[0.4em] text-emerald-200/70">Roadmap</div>
            <h2 className="max-w-3xl text-4xl font-semibold leading-tight text-white sm:text-5xl">
              Build order, live module score, and distance from perfect.
            </h2>
            <p className="max-w-3xl text-base leading-7 text-slate-300 sm:text-lg">
              These scores are not fluff. They are the current relative value of each AoE2HDBets
              surface compared with where it should ultimately land.
            </p>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/"
                className="rounded-full bg-emerald-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-200"
              >
                Back To Lobby
              </Link>
              <Link
                href="/about"
                className="rounded-full border border-white/15 px-5 py-3 text-sm text-white/85 transition hover:border-white/30 hover:text-white"
              >
                About
              </Link>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <MiniStat label="Top Score" value="79 / 100" />
            <MiniStat label="Best Next Move" value="/players" />
            <MiniStat label="Theme Pass" value="War Room next" />
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {MODULES.map((module) => (
          <ModuleCard key={module.title} {...module} />
        ))}
      </section>
    </main>
  );
}

function ModuleCard({
  title,
  score,
  status,
  detail,
}: {
  title: string;
  score: number;
  status: string;
  detail: string;
}) {
  return (
    <section className="rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-white/45">{status}</div>
          <h3 className="mt-2 text-2xl font-semibold text-white">{title}</h3>
        </div>
        <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-white">
          {score} / 100
        </div>
      </div>

      <div className="mt-5 h-2 rounded-full bg-white/10">
        <div
          className="h-2 rounded-full bg-[linear-gradient(90deg,#34d399,#fbbf24)]"
          style={{ width: `${score}%` }}
        />
      </div>

      <p className="mt-4 text-sm leading-6 text-slate-300">{detail}</p>
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
