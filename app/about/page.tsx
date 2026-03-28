import Link from "next/link";

const SIGNALS = [
  { label: "Mode", value: "Builder" },
  { label: "Truth", value: "Final replays" },
  { label: "Priority", value: "Steam RM first" },
  { label: "Rail", value: "WOLO ready" },
] as const;

const SURFACES = [
  {
    href: "/lobby",
    title: "Lobby",
    note: "Board, bracket, crowd.",
  },
  {
    href: "/players",
    title: "Players",
    note: "Identity, ladder, proof.",
  },
  {
    href: "/rivalries",
    title: "Rivalries",
    note: "Heat, scorelines, rematches.",
  },
  {
    href: "/live-games",
    title: "Live Games",
    note: "The rail that lights first.",
  },
] as const;

const PILLARS = ["AoE2HD only", "Replay-backed", "Rivalry-first", "Tournament pull"] as const;

export default function AboutPage() {
  return (
    <main className="space-y-6 py-6 text-white">
      <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.18),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(251,191,36,0.12),_transparent_28%),linear-gradient(135deg,_#0f172a,_#111827_56%,_#020617)] p-8 shadow-[0_30px_90px_rgba(2,6,23,0.35)]">
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-5">
            <div className="text-sm uppercase tracking-[0.4em] text-sky-200/70">About</div>
            <h1 className="sr-only">About AoE2HDBets</h1>

            <div className="flex flex-wrap gap-2">
              {PILLARS.map((pillar) => (
                <span
                  key={pillar}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200"
                >
                  {pillar}
                </span>
              ))}
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/lobby"
                className="rounded-full bg-sky-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-200"
              >
                Open Lobby
              </Link>
              <Link
                href="/roadmap"
                className="rounded-full border border-white/15 px-5 py-3 text-sm text-white/85 transition hover:border-white/30 hover:text-white"
              >
                Roadmap
              </Link>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {SIGNALS.map((signal) => (
              <SignalCard key={signal.label} label={signal.label} value={signal.value} />
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {SURFACES.map((surface) => (
          <Link
            key={surface.href}
            href={surface.href}
            className="rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-6 transition hover:border-sky-300/30 hover:bg-white/[0.06]"
          >
            <div className="text-[11px] uppercase tracking-[0.32em] text-white/45">Surface</div>
            <div className="mt-3 text-3xl font-semibold text-white">{surface.title}</div>
            <div className="mt-3 text-sm leading-6 text-slate-300">{surface.note}</div>
          </Link>
        ))}
      </section>
    </main>
  );
}

function SignalCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.4rem] border border-white/10 bg-white/5 px-4 py-4">
      <div className="text-xs uppercase tracking-[0.25em] text-slate-400">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
    </div>
  );
}
